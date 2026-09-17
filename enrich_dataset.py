#!/usr/bin/env python3
"""
Enrich actors.json / movies.json with the fields needed for an axis-encoded
layout (year on X, collaboration-cluster on Y) instead of a free-form force
simulation:

  - cluster_id        (actors): which "collaboration group" this actor belongs
                        to, found via Louvain community detection on the
                        co-star graph. Sorted so cluster 0 = oldest cohort by
                        mean debut year, cluster N = newest — this is what
                        makes the Y-axis actually mean something instead of
                        being an arbitrary community index.
  - cluster_id        (movies): the majority cluster_id among the movie's cast.
  - importance_score  (actors + movies): precomputed so the frontend never has
                        to compute label-gating or radius at render time.
                        actors -> movie_count, movies -> vote_count.
  - year backfill: any actor/movie missing a year gets the dataset's median
                        year rather than being dropped or defaulting to 0
                        (which would wrongly anchor them at the far left edge).

Run from the same folder as data/movies.json, data/actors.json,
data/costar_edges.json:
    pip install networkx
    python enrich_dataset.py
"""

import json
import statistics
from pathlib import Path
from collections import Counter, defaultdict

import networkx as nx
from networkx.algorithms.community import louvain_communities

DATA_DIR = Path("data")

# Actors whose Louvain community has fewer than this many members are treated
# as "no real collaboration cluster" (usually true isolates or near-isolates)
# and instead bucketed by debut decade as a fallback, so the Y-axis doesn't
# end up with thousands of singleton bands.
MIN_REAL_CLUSTER_SIZE = 3


def load():
    movies = json.loads((DATA_DIR / "movies.json").read_text(encoding="utf-8"))
    actors = json.loads((DATA_DIR / "actors.json").read_text(encoding="utf-8"))
    edges = json.loads((DATA_DIR / "costar_edges.json").read_text(encoding="utf-8"))
    return movies, actors, edges


def actor_debut_year(actor, fallback):
    if actor.get("movies"):
        years = [m["year"] for m in actor["movies"] if m.get("year")]
        if years:
            return min(years)
    return fallback


def main():
    movies, actors, edges = load()
    actors_by_id = {a["id"]: a for a in actors}

    # -------------------------------------------------------------------
    # Backfill missing years first, so every downstream calculation
    # (debut year, cluster ordering) has something sane to work with.
    # -------------------------------------------------------------------
    all_years = [m["year"] for m in movies if m.get("year")]
    median_year = int(statistics.median(all_years)) if all_years else 2010
    backfilled_movies = 0
    for m in movies:
        if not m.get("year"):
            m["year"] = median_year
            backfilled_movies += 1
    for a in actors:
        for mv in a.get("movies", []):
            if not mv.get("year"):
                mv["year"] = median_year

    # -------------------------------------------------------------------
    # Build the co-star graph and run Louvain community detection.
    # Every actor is added as a node (even with zero edges) so everyone
    # ends up with a cluster_id, not just well-connected actors.
    # -------------------------------------------------------------------
    G = nx.Graph()
    G.add_nodes_from(actors_by_id.keys())
    for e in edges:
        G.add_edge(e["a"], e["b"], weight=e["weight"])

    print(f"Graph: {G.number_of_nodes()} actors, {G.number_of_edges()} co-star edges")
    communities = louvain_communities(G, weight="weight", seed=42)
    print(f"Louvain found {len(communities)} raw communities")

    # Split into "real" communities (enough members to mean something) vs.
    # near-isolates, which get bucketed by debut decade instead.
    real_communities = [c for c in communities if len(c) >= MIN_REAL_CLUSTER_SIZE]
    isolate_actor_ids = set()
    for c in communities:
        if len(c) < MIN_REAL_CLUSTER_SIZE:
            isolate_actor_ids.update(c)

    print(f"  {len(real_communities)} real clusters (>= {MIN_REAL_CLUSTER_SIZE} members)")
    print(f"  {len(isolate_actor_ids)} actors bucketed by debut decade instead")

    # Mean debut year per real community, for sort order
    community_mean_year = []
    for c in real_communities:
        years = [actor_debut_year(actors_by_id[aid], median_year) for aid in c if aid in actors_by_id]
        mean_y = sum(years) / len(years) if years else median_year
        community_mean_year.append((c, mean_y))
    community_mean_year.sort(key=lambda x: x[1])

    actor_cluster = {}
    cluster_labels = {}  # cluster_id -> human-readable label for debugging
    next_id = 0
    for c, mean_y in community_mean_year:
        for aid in c:
            actor_cluster[aid] = next_id
        cluster_labels[next_id] = f"cluster (mean debut ~{int(mean_y)}, {len(c)} actors)"
        next_id += 1

    # Decade-bucket fallback for isolates, continuing the id sequence so
    # they still sort chronologically after/among the real clusters.
    decade_groups = defaultdict(list)
    for aid in isolate_actor_ids:
        if aid not in actors_by_id:
            continue
        debut = actor_debut_year(actors_by_id[aid], median_year)
        decade = (debut // 10) * 10
        decade_groups[decade].append(aid)

    for decade in sorted(decade_groups.keys()):
        for aid in decade_groups[decade]:
            actor_cluster[aid] = next_id
        cluster_labels[next_id] = f"decade fallback {decade}s ({len(decade_groups[decade])} actors)"
        next_id += 1

    total_clusters = next_id
    print(f"Total cluster_id range: 0..{total_clusters - 1}")

    # -------------------------------------------------------------------
    # Apply to actors: cluster_id + importance_score
    # -------------------------------------------------------------------
    for a in actors:
        a["cluster_id"] = actor_cluster.get(a["id"], total_clusters)  # spare bucket, shouldn't be hit
        a["importance_score"] = a.get("movie_count", 0)

    # -------------------------------------------------------------------
    # Apply to movies: cluster_id = majority cluster among cast, +importance_score
    # -------------------------------------------------------------------
    unresolved_movie_clusters = 0
    for m in movies:
        cast_clusters = [actor_cluster[c["id"]] for c in m.get("cast", []) if c["id"] in actor_cluster]
        if cast_clusters:
            m["cluster_id"] = Counter(cast_clusters).most_common(1)[0][0]
        else:
            # no resolvable cast — fall back to decade bucket by movie's own year
            decade = (m["year"] // 10) * 10
            # find a cluster_id that corresponds to this decade fallback if it exists,
            # else just use the middle cluster as a reasonable default
            match = next((cid for cid, label in cluster_labels.items() if f"decade fallback {decade}s" in label), None)
            m["cluster_id"] = match if match is not None else total_clusters // 2
            unresolved_movie_clusters += 1
        m["importance_score"] = m.get("vote_count", 0)

    if backfilled_movies:
        print(f"Backfilled year for {backfilled_movies} movies (median year {median_year})")
    if unresolved_movie_clusters:
        print(f"{unresolved_movie_clusters} movies had no clustered cast — used decade-fallback cluster")

    # -------------------------------------------------------------------
    # Write back out (overwrite in place — originals are still in cache/ if
    # you ever need to rebuild from scratch via collect_telugu_movies.py)
    # -------------------------------------------------------------------
    (DATA_DIR / "actors.json").write_text(json.dumps(actors, ensure_ascii=False), encoding="utf-8")
    (DATA_DIR / "movies.json").write_text(json.dumps(movies, ensure_ascii=False), encoding="utf-8")
    (DATA_DIR / "cluster_meta.json").write_text(
        json.dumps(
            {
                "total_clusters": total_clusters,
                "min_real_cluster_size": MIN_REAL_CLUSTER_SIZE,
                "labels": cluster_labels,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    print("\nWrote data/actors.json, data/movies.json (with cluster_id + importance_score)")
    print("Wrote data/cluster_meta.json (human-readable cluster summary for your reference)")


if __name__ == "__main__":
    main()
