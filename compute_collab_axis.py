#!/usr/bin/env python3
"""
Compute a CONTINUOUS "collaboration coordinate" per actor, replacing the
discrete cluster_id -> fixed Y row approach that kept collapsing into 2-3
bands.

WHY: a discrete cluster_id lookup is brittle — if community detection finds
one giant cluster and a few tiny ones, every actor in the giant cluster gets
IDENTICAL y, and you get exactly the flat-line / 2-band collapse we saw.

INSTEAD: this computes the Fiedler vector (the eigenvector of the graph
Laplacian's second-smallest eigenvalue) of the co-star graph. This is the
classic, principled way to turn "who worked with whom" into a single real
number per actor where strongly-connected people land close together and
weakly-connected people spread apart — continuously, not in buckets.

HANDLING DISCONNECTED ACTORS: the Fiedler vector is only defined within a
single connected component. Movie-industry graphs almost always have one
giant connected component (everyone reachable through prolific character
actors) plus scattered small components/isolates. This script:
  1. Computes the real Fiedler-vector coordinate for the giant component.
  2. For everyone else (smaller components / true isolates), assigns a
     best-guess coordinate = the coordinate of giant-component actors who
     debuted in the same era, so they land near their peers instead of
     collapsing to one point — with small deterministic spread so they
     don't stack exactly on top of each other either.

ALSO PRODUCES: precomputed "anchor" snapped versions (K-means in 1D, pure
numpy, no sklearn needed) at a few K values, mirroring Keralam's "Cluster
Anchors: 36/55/85/120" slider — so the frontend can offer a discrete-band
toggle without ever computing k-means live in the browser.

Run from the same folder as data/actors.json, data/movies.json,
data/costar_edges.json (after collect_telugu_movies.py / enrich_dataset.py):
    pip install networkx scipy
    python compute_collab_axis.py
"""

import json
import statistics
from pathlib import Path
from collections import defaultdict

import numpy as np
import networkx as nx
from networkx.linalg.algebraicconnectivity import fiedler_vector

DATA_DIR = Path("data")
ANCHOR_KS = [36, 55, 85, 120]


def load():
    actors = json.loads((DATA_DIR / "actors.json").read_text(encoding="utf-8"))
    movies = json.loads((DATA_DIR / "movies.json").read_text(encoding="utf-8"))
    edges = json.loads((DATA_DIR / "costar_edges.json").read_text(encoding="utf-8"))
    return actors, movies, edges


def actor_debut_year(actor, fallback):
    years = [m["year"] for m in actor.get("movies", []) if m.get("year")]
    return min(years) if years else fallback


def kmeans_1d(values, k, iters=100, seed=42):
    """Minimal Lloyd's-algorithm k-means in 1D, pure numpy (no sklearn dep)."""
    rng = np.random.default_rng(seed)
    values = np.asarray(values, dtype=float)
    k = min(k, len(np.unique(values)))
    if k <= 1:
        return np.zeros(len(values), dtype=int), np.array([values.mean()])
    # init centers at evenly spaced percentiles for stable, deterministic start
    centers = np.percentile(values, np.linspace(0, 100, k))
    for _ in range(iters):
        dist = np.abs(values[:, None] - centers[None, :])
        assign = dist.argmin(axis=1)
        new_centers = np.array(
            [values[assign == i].mean() if np.any(assign == i) else centers[i] for i in range(k)]
        )
        if np.allclose(new_centers, centers, atol=1e-6):
            centers = new_centers
            break
        centers = new_centers
    dist = np.abs(values[:, None] - centers[None, :])
    assign = dist.argmin(axis=1)
    # relabel clusters in order of center value, so anchor ids sort meaningfully
    order = np.argsort(centers)
    relabel = {old: new for new, old in enumerate(order)}
    assign = np.array([relabel[a] for a in assign])
    sorted_centers = centers[order]
    return assign, sorted_centers


def main():
    actors, movies, edges = load()
    actors_by_id = {a["id"]: a for a in actors}
    all_years = [m["year"] for m in movies if m.get("year")]
    median_year = int(statistics.median(all_years)) if all_years else 2010

    G = nx.Graph()
    G.add_nodes_from(actors_by_id.keys())
    for e in edges:
        if e["weight"] > 0:
            G.add_edge(e["a"], e["b"], weight=e["weight"])

    components = sorted(nx.connected_components(G), key=len, reverse=True)
    print(f"Co-star graph: {G.number_of_nodes()} actors, {G.number_of_edges()} edges")
    print(f"{len(components)} connected components. Top 5 sizes: {[len(c) for c in components[:5]]}")

    giant = components[0]
    giant_frac = len(giant) / G.number_of_nodes()
    print(f"Giant component: {len(giant)} actors ({giant_frac:.1%} of all actors)")
    if giant_frac < 0.5:
        print("WARNING: giant component covers less than half of all actors.")
        print("The era-based fallback below will place most actors approximately,")
        print("not from real collaboration structure. Consider lowering any")
        print("co-star edge weight threshold if you filtered edges upstream.")

    # -------------------------------------------------------------------
    # Fiedler vector on the giant component -> continuous collab coordinate
    # -------------------------------------------------------------------
    subG = G.subgraph(giant)
    print("Computing Fiedler vector (this can take a few seconds for large graphs)...")
    fvec = fiedler_vector(subG, weight="weight", method="lanczos", seed=42)
    giant_ids = list(subG.nodes())
    raw_coord = dict(zip(giant_ids, fvec))

    # normalize giant-component coordinates to a friendly 0-1000 range
    vals = np.array(list(raw_coord.values()))
    lo, hi = vals.min(), vals.max()
    span = (hi - lo) or 1.0
    collab_y = {aid: (v - lo) / span * 1000 for aid, v in raw_coord.items()}

    # -------------------------------------------------------------------
    # Fallback for everyone NOT in the giant component: place near
    # giant-component peers of the same debut era, with small deterministic
    # spread so they don't stack exactly on top of each other.
    # -------------------------------------------------------------------
    giant_year_to_coords = defaultdict(list)
    for aid in giant_ids:
        y = actor_debut_year(actors_by_id[aid], median_year)
        decade = (y // 10) * 10
        giant_year_to_coords[decade].append(collab_y[aid])

    decade_fallback_median = {}
    all_giant_coords = list(collab_y.values())
    global_median_coord = statistics.median(all_giant_coords) if all_giant_coords else 500.0
    for decade, coords in giant_year_to_coords.items():
        decade_fallback_median[decade] = statistics.median(coords)

    non_giant_ids = [aid for aid in actors_by_id.keys() if aid not in collab_y]
    print(f"Placing {len(non_giant_ids)} non-giant-component actors via era fallback...")

    # deterministic small spread: hash-based offset in [-40, 40], stable across runs
    for aid in non_giant_ids:
        y = actor_debut_year(actors_by_id[aid], median_year)
        decade = (y // 10) * 10
        base = decade_fallback_median.get(decade, global_median_coord)
        offset = ((aid * 2654435761) % 8000 / 8000 - 0.5) * 80  # deterministic pseudo-random, +-40
        collab_y[aid] = base + offset

    # -------------------------------------------------------------------
    # Precomputed discrete "anchor" snapped versions (1D k-means), for an
    # optional Cluster-Anchors-style toggle in the frontend.
    # -------------------------------------------------------------------
    all_ids = list(actors_by_id.keys())
    all_coords = np.array([collab_y[aid] for aid in all_ids])
    anchor_fields = {}
    for k in ANCHOR_KS:
        assign, centers = kmeans_1d(all_coords, k)
        anchor_fields[k] = dict(zip(all_ids, (centers[a] for a in assign)))
        print(f"  anchor_{k}: snapped into {len(np.unique(assign))} bands")

    # -------------------------------------------------------------------
    # Write back to actors.json
    # -------------------------------------------------------------------
    for a in actors:
        aid = a["id"]
        a["collab_y"] = round(collab_y[aid], 3)
        for k in ANCHOR_KS:
            a[f"collab_y_anchor_{k}"] = round(anchor_fields[k][aid], 3)

    # -------------------------------------------------------------------
    # Movies: collab_y = mean of cast's collab_y (falls back to global
    # median if a movie's cast doesn't resolve to any known actor id)
    # -------------------------------------------------------------------
    unresolved = 0
    for m in movies:
        cast_ids = [c["id"] for c in m.get("cast", []) if c["id"] in collab_y]
        if cast_ids:
            y = statistics.mean(collab_y[i] for i in cast_ids)
        else:
            y = global_median_coord
            unresolved += 1
        m["collab_y"] = round(y, 3)
        for k in ANCHOR_KS:
            if cast_ids:
                ay = statistics.mean(anchor_fields[k][i] for i in cast_ids)
            else:
                ay = global_median_coord
            m[f"collab_y_anchor_{k}"] = round(ay, 3)

    if unresolved:
        print(f"{unresolved} movies had no resolvable cast for collab_y — used global median")

    (DATA_DIR / "actors.json").write_text(json.dumps(actors, ensure_ascii=False), encoding="utf-8")
    (DATA_DIR / "movies.json").write_text(json.dumps(movies, ensure_ascii=False), encoding="utf-8")

    coord_summary = {
        "giant_component_size": len(giant),
        "giant_component_fraction": round(giant_frac, 4),
        "collab_y_range": [round(min(collab_y.values()), 2), round(max(collab_y.values()), 2)],
        "anchor_ks": ANCHOR_KS,
    }
    (DATA_DIR / "collab_axis_meta.json").write_text(json.dumps(coord_summary, indent=2), encoding="utf-8")

    print("\nWrote data/actors.json, data/movies.json (added collab_y + collab_y_anchor_* fields)")
    print("Wrote data/collab_axis_meta.json (summary for reference)")
    print(f"\ncollab_y range: {coord_summary['collab_y_range']}")


if __name__ == "__main__":
    main()
