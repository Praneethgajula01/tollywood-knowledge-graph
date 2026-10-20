#!/usr/bin/env python3
"""
Extract and compile all directors from movies.json and cache/movies,
generating a rich data/directors.json file and copying it to app/public/data/directors.json.
"""

import json
from pathlib import Path
from collections import Counter, defaultdict

DATA_DIR = Path("data")
APP_DATA_DIR = Path("app/public/data")
CACHE_DIR = Path("cache/movies")


def main():
    movies_file = DATA_DIR / "movies.json"
    if not movies_file.exists():
        print(f"Error: {movies_file} not found.")
        return

    print("Loading movies.json...")
    movies = json.loads(movies_file.read_text(encoding="utf-8"))

    # Map director id -> director dict
    directors = {}

    for m in movies:
        m_id = m.get("id")
        m_title = m.get("title")
        m_year = m.get("year")
        m_popularity = m.get("popularity", 0.0)
        m_vote = m.get("vote_average", 0.0)
        m_poster = m.get("poster_path")
        m_genres = m.get("genres", [])
        m_cast = m.get("cast", [])
        m_directors = m.get("directors", [])

        for d in m_directors:
            did = d.get("id")
            dname = d.get("name")
            if not did or not dname:
                continue

            if did not in directors:
                directors[did] = {
                    "id": did,
                    "name": dname.strip(),
                    "profile_path": None,
                    "gender": "unknown",
                    "movies": [],
                    "_actor_counts": Counter(),
                    "_genres": Counter(),
                    "_total_popularity": 0.0,
                    "_total_votes": 0,
                }

            entry = directors[did]
            entry["movies"].append({
                "movie_id": m_id,
                "title": m_title,
                "year": m_year,
                "popularity": m_popularity,
                "vote_average": m_vote,
                "poster_path": m_poster,
            })
            entry["_total_popularity"] += (m_popularity or 0.0)
            entry["_total_votes"] += m.get("vote_count", 0)

            for g in m_genres:
                entry["_genres"][g] += 1

            # Track actor collaborations (top cast members)
            for c in m_cast[:12]:
                cid = c.get("id")
                cname = c.get("name")
                if cid and cname:
                    entry["_actor_counts"][(cid, cname)] += 1

    print(f"Found {len(directors)} unique directors across {len(movies)} movies.")

    # Check cache for profile pictures and gender
    print("Enriching director profiles from cached movie data...")
    enriched_profiles = 0
    for did, dinfo in directors.items():
        # Check cached JSON of movies directed by this person
        for mov in dinfo["movies"]:
            cache_file = CACHE_DIR / f"{mov['movie_id']}.json"
            if cache_file.exists():
                try:
                    cdata = json.loads(cache_file.read_text(encoding="utf-8"))
                    crew = cdata.get("credits", {}).get("crew", [])
                    for member in crew:
                        if member.get("id") == did and member.get("job") == "Director":
                            if member.get("profile_path") and not dinfo["profile_path"]:
                                dinfo["profile_path"] = member.get("profile_path")
                                enriched_profiles += 1
                            if member.get("gender") and dinfo["gender"] == "unknown":
                                g_code = member.get("gender")
                                dinfo["gender"] = "female" if g_code == 1 else ("male" if g_code == 2 else "unknown")
                            break
                except Exception:
                    pass
            if dinfo["profile_path"] and dinfo["gender"] != "unknown":
                break

    print(f"Enriched {enriched_profiles} directors with TMDB profile pictures.")

    # Finalize list
    director_list = []
    for did, dinfo in directors.items():
        # Sort movies descending by year / popularity
        dinfo["movies"].sort(key=lambda m: (m.get("year") or 0, m.get("popularity") or 0), reverse=True)
        valid_years = [m["year"] for m in dinfo["movies"] if m.get("year")]
        debut_year = min(valid_years) if valid_years else None
        latest_year = max(valid_years) if valid_years else None

        top_actors = [
            {"id": aid, "name": aname, "count": count}
            for (aid, aname), count in dinfo["_actor_counts"].most_common(10)
        ]
        top_genres = [g for g, _ in dinfo["_genres"].most_common(3)]

        director_list.append({
            "id": dinfo["id"],
            "name": dinfo["name"],
            "profile_path": dinfo["profile_path"],
            "gender": dinfo["gender"],
            "movie_count": len(dinfo["movies"]),
            "debut_year": debut_year,
            "latest_year": latest_year,
            "top_genres": top_genres,
            "top_actors": top_actors,
            "movies": dinfo["movies"],
            "popularity": round(dinfo["_total_popularity"], 2),
            "vote_count": dinfo["_total_votes"],
        })

    # Sort directors by movie count / popularity
    director_list.sort(key=lambda d: (d["movie_count"], d["popularity"]), reverse=True)

    # Output to data/directors.json
    out_path = DATA_DIR / "directors.json"
    out_path.write_text(json.dumps(director_list, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {len(director_list)} directors to {out_path}")

    # Output to app/public/data/directors.json as well
    if APP_DATA_DIR.exists():
        app_out_path = APP_DATA_DIR / "directors.json"
        app_out_path.write_text(json.dumps(director_list, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"Copied directors.json to {app_out_path}")


if __name__ == "__main__":
    main()
