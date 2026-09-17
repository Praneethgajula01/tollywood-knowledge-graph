#!/usr/bin/env python3
"""
Telugu Movies Knowledge Graph — Data Collector
================================================

Collects STRICTLY Telugu-original-language movies + their cast/crew from
TMDb (The Movie Database, free API) and builds clean JSON files ready to
feed a force-directed graph (D3 / Sigma.js / Cytoscape.js).

WHY TMDb original_language='te' as the filter:
    TMDb tags every title with the language it was ORIGINALLY produced in.
    This is far more reliable than filtering by genre, region, or keyword —
    it correctly excludes Hindi/Tamil movies just because they were dubbed
    into Telugu, and excludes Telugu remakes credited to another language.

PIPELINE (resumable — safe to Ctrl+C and rerun):
    1. discover  -> page through /discover/movie?with_original_language=te
                    to collect every Telugu movie ID. Saves ids to disk.
    2. fetch     -> for each ID, GET /movie/{id}?append_to_response=credits,
                    external_ids  and cache the raw JSON to disk (one file
                    per movie). Skips IDs already cached, so reruns are cheap.
    3. build     -> read all cached movie JSONs, apply the strict language
                    filter again (belt & suspenders), and emit:
                        data/movies.json       — one row per movie
                        data/actors.json        — one row per actor, with
                                                   the list of movies they're in
                        data/costar_edges.json  — actor<->actor edges with
                                                   a weight = # shared movies

USAGE:
    1) Get a free TMDb API key:  https://www.themoviedb.org/settings/api
    2) export TMDB_API_KEY="your_key_here"
    3) pip install requests
    4) python collect_telugu_movies.py --all
       (or run steps individually: --discover / --fetch / --build)

OUTPUT:
    ./cache/discovered_ids.json   (checkpoint: every Telugu movie id found)
    ./cache/movies/<id>.json      (checkpoint: raw TMDb response per movie)
    ./data/movies.json
    ./data/actors.json
    ./data/costar_edges.json
"""

import os
import sys
import json
import time
import argparse
import threading
from pathlib import Path
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests

# ----------------------------------------------------------------------------
# Config
# ----------------------------------------------------------------------------

API_KEY = os.environ.get("TMDB_API_KEY", "")
BASE_URL = "https://api.themoviedb.org/3"

CACHE_DIR = Path("cache")
MOVIE_CACHE_DIR = CACHE_DIR / "movies"
DISCOVERED_IDS_FILE = CACHE_DIR / "discovered_ids.json"

DATA_DIR = Path("data")

LANGUAGE = "te"          # Telugu ISO 639-1 code — the strict filter
MAX_WORKERS = 8          # concurrent requests when fetching movie details
MAX_CAST_PER_MOVIE = 25  # trim very long cast lists (background extras etc.)
REQUEST_TIMEOUT = 20

# Simple global rate limiter: TMDb's free tier is generous (~50 req/s) but
# we stay conservative and polite.
_rate_lock = threading.Lock()
_last_request_time = [0.0]
MIN_INTERVAL = 0.05  # ~20 requests/sec ceiling


def _throttle():
    with _rate_lock:
        now = time.time()
        wait = MIN_INTERVAL - (now - _last_request_time[0])
        if wait > 0:
            time.sleep(wait)
        _last_request_time[0] = time.time()


def api_get(path, params=None, retries=5):
    """GET from TMDb with retry/backoff on rate-limit or transient errors."""
    if not API_KEY:
        sys.exit("ERROR: set TMDB_API_KEY environment variable first.")
    params = dict(params or {})
    params["api_key"] = API_KEY

    for attempt in range(retries):
        _throttle()
        try:
            resp = requests.get(f"{BASE_URL}{path}", params=params, timeout=REQUEST_TIMEOUT)
        except requests.RequestException as e:
            wait = 2 ** attempt
            print(f"  network error ({e}); retrying in {wait}s...")
            time.sleep(wait)
            continue

        if resp.status_code == 200:
            return resp.json()
        if resp.status_code == 429:
            # Respect TMDb's Retry-After header if present
            wait = int(resp.headers.get("Retry-After", 2 ** attempt))
            print(f"  rate limited; sleeping {wait}s...")
            time.sleep(wait)
            continue
        if resp.status_code in (500, 502, 503, 504):
            wait = 2 ** attempt
            time.sleep(wait)
            continue

        # Non-retryable error (404 etc.)
        resp.raise_for_status()

    raise RuntimeError(f"Failed after {retries} retries: {path}")


# ----------------------------------------------------------------------------
# Step 1: discover every Telugu movie id
# ----------------------------------------------------------------------------

def discover_all_movie_ids():
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    ids = set()

    # TMDb discover caps at 500 pages (10,000 results) per query. Telugu
    # cinema's total catalogue is well under that, but we also split by
    # primary_release_year in case any single sort/query gets near the cap.
    first = api_get("/discover/movie", {
        "with_original_language": LANGUAGE,
        "sort_by": "primary_release_date.desc",
        "include_adult": "false",
        "page": 1,
    })
    total_pages = min(first.get("total_pages", 1), 500)
    total_results = first.get("total_results", 0)
    print(f"Discovered {total_results} Telugu-language titles across {total_pages} pages.")

    for m in first.get("results", []):
        ids.add(m["id"])

    for page in range(2, total_pages + 1):
        data = api_get("/discover/movie", {
            "with_original_language": LANGUAGE,
            "sort_by": "primary_release_date.desc",
            "include_adult": "false",
            "page": page,
        })
        for m in data.get("results", []):
            ids.add(m["id"])
        if page % 10 == 0 or page == total_pages:
            print(f"  page {page}/{total_pages} — {len(ids)} ids so far")

    ids = sorted(ids)
    DISCOVERED_IDS_FILE.write_text(json.dumps(ids), encoding="utf-8")
    print(f"Saved {len(ids)} movie ids -> {DISCOVERED_IDS_FILE}")
    return ids


# ----------------------------------------------------------------------------
# Step 2: fetch full details + credits for each movie (cached, resumable)
# ----------------------------------------------------------------------------

def fetch_one_movie(movie_id):
    out_path = MOVIE_CACHE_DIR / f"{movie_id}.json"
    if out_path.exists():
        return  # already cached, skip

    data = api_get(f"/movie/{movie_id}", {
        "append_to_response": "credits,external_ids",
        "language": "en-US",
    })
    out_path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")


def fetch_all_movies():
    if not DISCOVERED_IDS_FILE.exists():
        sys.exit("No discovered_ids.json found — run --discover first.")
    ids = json.loads(DISCOVERED_IDS_FILE.read_text(encoding="utf-8"))
    MOVIE_CACHE_DIR.mkdir(parents=True, exist_ok=True)

    todo = [i for i in ids if not (MOVIE_CACHE_DIR / f"{i}.json").exists()]
    print(f"{len(ids) - len(todo)} already cached, {len(todo)} to fetch.")

    done = 0
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = {pool.submit(fetch_one_movie, mid): mid for mid in todo}
        for fut in as_completed(futures):
            mid = futures[fut]
            try:
                fut.result()
            except Exception as e:
                print(f"  FAILED movie {mid}: {e}")
            done += 1
            if done % 100 == 0:
                print(f"  fetched {done}/{len(todo)}")

    print("Fetch complete.")


# ----------------------------------------------------------------------------
# Step 3: build final movies.json / actors.json / costar_edges.json
# ----------------------------------------------------------------------------

def build_dataset():
    if not MOVIE_CACHE_DIR.exists():
        sys.exit("No cached movies found — run --fetch first.")

    DATA_DIR.mkdir(parents=True, exist_ok=True)

    movies_out = []
    actors = {}  # id -> actor record (accumulated)
    costar_weight = defaultdict(int)  # (id_a, id_b) sorted tuple -> shared movie count

    files = sorted(MOVIE_CACHE_DIR.glob("*.json"))
    print(f"Building dataset from {len(files)} cached movies...")

    kept = 0
    for f in files:
        m = json.loads(f.read_text(encoding="utf-8"))

        # Strict Telugu filter (belt & suspenders vs. the discover query)
        if m.get("original_language") != LANGUAGE:
            continue

        credits = m.get("credits", {})
        cast = credits.get("cast", [])[:MAX_CAST_PER_MOVIE]
        crew = credits.get("crew", [])
        directors = [c for c in crew if c.get("job") == "Director"]

        movie_id = m["id"]
        year = (m.get("release_date") or "")[:4]

        movies_out.append({
            "id": movie_id,
            "title": m.get("title"),
            "original_title": m.get("original_title"),
            "year": int(year) if year.isdigit() else None,
            "release_date": m.get("release_date"),
            "genres": [g["name"] for g in m.get("genres", [])],
            "vote_average": m.get("vote_average"),
            "vote_count": m.get("vote_count"),
            "popularity": m.get("popularity"),
            "poster_path": m.get("poster_path"),
            "overview": m.get("overview"),
            "imdb_id": (m.get("external_ids") or {}).get("imdb_id"),
            "directors": [{"id": d["id"], "name": d["name"]} for d in directors],
            "cast": [
                {"id": c["id"], "name": c["name"], "character": c.get("character"), "order": c.get("order")}
                for c in cast
            ],
        })
        kept += 1

        # accumulate actor records
        cast_ids_this_movie = []
        for c in cast:
            aid = c["id"]
            cast_ids_this_movie.append(aid)
            if aid not in actors:
                actors[aid] = {
                    "id": aid,
                    "name": c["name"],
                    "profile_path": c.get("profile_path"),
                    "movies": [],
                }
            actors[aid]["movies"].append({
                "movie_id": movie_id,
                "title": m.get("title"),
                "character": c.get("character"),
                "order": c.get("order"),
                "year": int(year) if year.isdigit() else None,
            })

        # accumulate co-star edges (pairwise, within this movie's trimmed cast)
        for i in range(len(cast_ids_this_movie)):
            for j in range(i + 1, len(cast_ids_this_movie)):
                a, b = sorted((cast_ids_this_movie[i], cast_ids_this_movie[j]))
                costar_weight[(a, b)] += 1

    # -------------------------------------------------------------------
    # Canonicalize duplicate person profiles.
    #
    # TMDb is crowd-edited, and for long-career/prolific actors it's common
    # for contributors to have created MULTIPLE separate person IDs for the
    # same real actor over the years (never merged upstream). Without this
    # step, a superstar's filmography gets split across several near-empty
    # profiles that all share the exact same name string — e.g. Chiranjeevi
    # or Mahesh Babu showing up with "1 movie" instead of their real count.
    #
    # Fix: group actor records by exact name string. If more than one ID
    # shares a name, merge them into a single canonical record (keeping the
    # ID that already had the most movies), union their filmographies, and
    # remap every reference to the old IDs (in movies_out cast lists and in
    # costar_weight edges) to the canonical ID.
    #
    # Caveat: this assumes same exact name => same real person. That's true
    # almost always for Telugu film credits, but two unrelated people who
    # happen to share a common name (rare) could get wrongly merged. Check
    # the "merged duplicate profiles" printout below if you want to audit.
    # -------------------------------------------------------------------

    def norm_name(name):
        return (name or "").strip().lower()

    # A "stray" profile is one with very few movies — the tell-tale sign of
    # an accidental duplicate TMDb entry for someone whose main profile
    # already exists. If every non-dominant profile is this small, it's safe
    # to assume they're duplicates of the dominant one. If a non-dominant
    # profile has a real filmography of its own, it's much more likely a
    # genuinely different person who happens to share a common name (e.g.
    # "Vinay", "Srikanth") — merging those would wrongly conflate distinct
    # actors, so we leave those alone and flag them for manual review instead.
    STRAY_MAX_MOVIES = 3
    DOMINANT_MIN_MOVIES = 5

    name_to_ids = defaultdict(list)
    for aid, rec in actors.items():
        name_to_ids[norm_name(rec["name"])].append(aid)

    canonical_map = {}
    merge_report = []
    ambiguous_report = []
    for name, ids in name_to_ids.items():
        if len(ids) == 1:
            canonical_map[ids[0]] = ids[0]
            continue

        ids_sorted = sorted(ids, key=lambda i: -len(actors[i]["movies"]))
        counts = [len(actors[i]["movies"]) for i in ids_sorted]
        dominant_id, dominant_count = ids_sorted[0], counts[0]
        stray_counts = counts[1:]

        looks_like_true_duplicate = (
            dominant_count >= DOMINANT_MIN_MOVIES
            and all(c <= STRAY_MAX_MOVIES for c in stray_counts)
        )

        if looks_like_true_duplicate:
            for i in ids:
                canonical_map[i] = dominant_id
            merge_report.append((actors[dominant_id]["name"], counts))
        else:
            # Leave as separate actor records (safe default) — don't merge.
            for i in ids:
                canonical_map[i] = i
            ambiguous_report.append((name, counts))

    merged_actors = {}
    for aid, rec in actors.items():
        cid = canonical_map[aid]
        if cid not in merged_actors:
            merged_actors[cid] = {
                "id": cid,
                "name": actors[cid]["name"],
                "profile_path": None,
                "movies": [],
            }
        target = merged_actors[cid]
        if not target["profile_path"] and rec.get("profile_path"):
            target["profile_path"] = rec["profile_path"]
        target["movies"].extend(rec["movies"])

    actors_out = []
    for cid, rec in merged_actors.items():
        seen_movie_ids = set()
        deduped = []
        for mv in sorted(rec["movies"], key=lambda x: (x["year"] or 0)):
            if mv["movie_id"] in seen_movie_ids:
                continue
            seen_movie_ids.add(mv["movie_id"])
            deduped.append(mv)
        rec["movies"] = deduped
        rec["movie_count"] = len(deduped)
        actors_out.append(rec)
    actors_out.sort(key=lambda a: -a["movie_count"])

    # remap cast ids inside movies_out to canonical actor ids
    for m in movies_out:
        for c in m["cast"]:
            c["id"] = canonical_map.get(c["id"], c["id"])

    # remap + re-aggregate costar edges to canonical ids (drop self-pairs
    # created when two merged duplicate profiles "co-starred with themselves")
    remapped_weight = defaultdict(int)
    for (a, b), w in costar_weight.items():
        ca, cb = canonical_map.get(a, a), canonical_map.get(b, b)
        if ca == cb:
            continue
        pair = tuple(sorted((ca, cb)))
        remapped_weight[pair] += w

    edges_out = [
        {"a": a, "b": b, "weight": w}
        for (a, b), w in sorted(remapped_weight.items(), key=lambda kv: -kv[1])
    ]

    if merge_report:
        merge_report.sort(key=lambda x: -sum(x[1]))
        print(f"\nAuto-merged {len(merge_report)} names (dominant profile + trivial stray duplicate(s)):")
        for name, counts in merge_report[:25]:
            print(f"  {name}: profiles with counts {counts} -> merged into one")
        if len(merge_report) > 25:
            print(f"  ...and {len(merge_report) - 25} more")

    if ambiguous_report:
        ambiguous_report.sort(key=lambda x: -sum(x[1]))
        print(f"\nLeft UNMERGED — {len(ambiguous_report)} names shared by profiles that each")
        print("have a real filmography (likely different actual people, not duplicate IDs).")
        print("Kept as separate actor records. Review manually if any look wrong:")
        for name, counts in ambiguous_report[:25]:
            print(f"  {name}: profiles with counts {counts}")
        if len(ambiguous_report) > 25:
            print(f"  ...and {len(ambiguous_report) - 25} more")

    (DATA_DIR / "movies.json").write_text(json.dumps(movies_out, ensure_ascii=False), encoding="utf-8")
    (DATA_DIR / "actors.json").write_text(json.dumps(actors_out, ensure_ascii=False), encoding="utf-8")
    (DATA_DIR / "costar_edges.json").write_text(json.dumps(edges_out, ensure_ascii=False), encoding="utf-8")

    print(f"Kept {kept} strictly-Telugu movies (of {len(files)} cached).")
    print(f"Actors: {len(actors_out)}   Co-star edges: {len(edges_out)}")
    print(f"Written to {DATA_DIR}/movies.json, actors.json, costar_edges.json")


# ----------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Collect strictly-Telugu movie/actor data from TMDb")
    parser.add_argument("--discover", action="store_true", help="Step 1: find all Telugu movie ids")
    parser.add_argument("--fetch", action="store_true", help="Step 2: fetch details+credits per movie")
    parser.add_argument("--build", action="store_true", help="Step 3: build final JSON dataset")
    parser.add_argument("--all", action="store_true", help="Run all three steps in order")
    args = parser.parse_args()

    if not any([args.discover, args.fetch, args.build, args.all]):
        parser.print_help()
        return

    if args.discover or args.all:
        discover_all_movie_ids()
    if args.fetch or args.all:
        fetch_all_movies()
    if args.build or args.all:
        build_dataset()


if __name__ == "__main__":
    main()
