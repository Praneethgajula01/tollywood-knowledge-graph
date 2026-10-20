#!/usr/bin/env python3
"""
🎬 Tollywood Degrees of Separation (Brahmanandam Number / Pathfinder)

Find the shortest connection path between any two Tollywood actors, directors,
or movies using BFS on the tripartite knowledge graph.

Usage examples:
    python find_connection.py "Prabhas" "Chiranjeevi"
    python find_connection.py "Rajamouli" "Mahesh Babu"
    python find_connection.py "Vijay Deverakonda" --brahmi
"""

import sys
import json
import argparse
from pathlib import Path
from collections import deque

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

DATA_DIR = Path("data")


def load_dataset():
    movies_file = DATA_DIR / "movies.json"
    actors_file = DATA_DIR / "actors.json"
    directors_file = DATA_DIR / "directors.json"

    if not (movies_file.exists() and actors_file.exists()):
        print("Error: data/movies.json or data/actors.json missing.")
        sys.exit(1)

    movies = json.loads(movies_file.read_text(encoding="utf-8"))
    actors = json.loads(actors_file.read_text(encoding="utf-8"))
    directors = json.loads(directors_file.read_text(encoding="utf-8")) if directors_file.exists() else []

    return movies, actors, directors


def build_bipartite_graph(movies, actors, directors):
    """
    Build adjacency graph connecting:
      - person (actor/director) <-> movie
    """
    graph = {}  # node -> list of (neighbor, relation_info)
    name_lookup = {}  # lowercase name -> list of node_ids
    node_details = {}  # node_id -> { 'name': ..., 'type': ... }

    def add_edge(u, v, info_u_to_v, info_v_to_u):
        graph.setdefault(u, []).append((v, info_u_to_v))
        graph.setdefault(v, []).append((u, info_v_to_u))

    # Register Actors
    for a in actors:
        nid = f"actor_{a['id']}"
        name = a['name'].strip()
        node_details[nid] = {'name': name, 'type': 'actor', 'data': a}
        name_lookup.setdefault(name.lower(), []).append(nid)

    # Register Directors
    for d in directors:
        nid = f"director_{d['id']}"
        name = d['name'].strip()
        node_details[nid] = {'name': name, 'type': 'director', 'data': d}
        name_lookup.setdefault(name.lower(), []).append(nid)

    # Register Movies and connect edges
    for m in movies:
        mid = f"movie_{m['id']}"
        m_title = m.get('title', 'Unknown Title')
        m_year = m.get('year') or 'Unknown Year'
        node_details[mid] = {'name': f"{m_title} ({m_year})", 'title': m_title, 'year': m_year, 'type': 'movie', 'data': m}
        name_lookup.setdefault(m_title.lower(), []).append(mid)

        # Cast edges
        for c in m.get('cast', []):
            aid = f"actor_{c['id']}"
            if aid in node_details:
                char = c.get('character', '').strip()
                char_str = f" as '{char}'" if char else ""
                add_edge(
                    aid, mid,
                    f"acted in \"{m_title}\" ({m_year}){char_str}",
                    f"starred {node_details[aid]['name']}"
                )

        # Director edges
        for d in m.get('directors', []):
            did = f"director_{d['id']}"
            if did in node_details:
                add_edge(
                    did, mid,
                    f"directed \"{m_title}\" ({m_year})",
                    f"directed by {node_details[did]['name']}"
                )

    return graph, name_lookup, node_details


def find_entity(query, name_lookup, node_details):
    q = query.strip().lower()

    # Exact match
    if q in name_lookup:
        return name_lookup[q][0]

    # Substring / partial match
    candidates = []
    for name, nids in name_lookup.items():
        if q in name:
            for nid in nids:
                candidates.append(nid)

    if not candidates:
        return None

    # Sort candidates by popularity / movie count if available
    def candidate_score(nid):
        info = node_details.get(nid, {})
        d = info.get('data', {})
        if info.get('type') == 'actor':
            return len(d.get('movies', []))
        elif info.get('type') == 'director':
            return d.get('movie_count', 0)
        elif info.get('type') == 'movie':
            return d.get('vote_count', 0)
        return 0

    candidates.sort(key=candidate_score, reverse=True)
    return candidates[0]


def find_shortest_path(start_id, target_id, graph):
    """BFS to find the shortest path between start_id and target_id."""
    if start_id == target_id:
        return [start_id]

    queue = deque([[start_id]])
    visited = {start_id}

    while queue:
        path = queue.popleft()
        current = path[-1]

        for neighbor, _ in graph.get(current, []):
            if neighbor == target_id:
                return path + [neighbor]

            if neighbor not in visited:
                visited.add(neighbor)
                queue.append(path + [neighbor])

    return None


def main():
    parser = argparse.ArgumentParser(description="Find degrees of separation in Tollywood.")
    parser.add_argument("source", help="Name of first person or movie (e.g., Prabhas)")
    parser.add_argument("destination", nargs="?", default=None, help="Name of second person or movie (e.g., Chiranjeevi)")
    parser.add_argument("--brahmi", action="store_true", help="Find path to Brahmanandam")
    parser.add_argument("--rajamouli", action="store_true", help="Find path to S.S. Rajamouli")

    args = parser.parse_args()

    print("Loading Tollywood Knowledge Graph dataset...")
    movies, actors, directors = load_dataset()
    graph, name_lookup, node_details = build_bipartite_graph(movies, actors, directors)

    src_query = args.source
    dest_query = args.destination

    if args.brahmi:
        dest_query = "Brahmanandam"
    elif args.rajamouli:
        dest_query = "S. S. Rajamouli"

    if not dest_query:
        print("\nError: Please provide a second entity name or use --brahmi / --rajamouli.")
        parser.print_help()
        sys.exit(1)

    src_id = find_entity(src_query, name_lookup, node_details)
    dest_id = find_entity(dest_query, name_lookup, node_details)

    if not src_id:
        print(f"Could not find any actor, director, or movie matching '{src_query}'.")
        sys.exit(1)
    if not dest_id:
        print(f"Could not find any actor, director, or movie matching '{dest_query}'.")
        sys.exit(1)

    src_info = node_details[src_id]
    dest_info = node_details[dest_id]

    print(f"\n🔍 Connecting [{src_info['name']}] ({src_info['type']})")
    print(f"       to [{dest_info['name']}] ({dest_info['type']})...\n")

    path = find_shortest_path(src_id, dest_id, graph)

    if not path:
        print(f"❌ No path found between {src_info['name']} and {dest_info['name']} (disconnected clusters).")
        return

    # Extract hops
    hops = []
    for i in range(len(path) - 1):
        u = path[i]
        v = path[i + 1]
        for neighbor, edge_info in graph.get(u, []):
            if neighbor == v:
                hops.append((u, v, edge_info))
                break

    # Degree of separation is number of intermediate people or movie links
    print(f"🎉 Connection found! Total graph hops: {len(hops)}")
    print("=" * 60)

    for idx, (u, v, info) in enumerate(hops, 1):
        u_name = node_details[u]['name']
        v_name = node_details[v]['name']
        print(f"  {idx}. [{u_name}]")
        print(f"     └─► {info}")
        if idx == len(hops):
            print(f"     └─► [{v_name}]")

    print("=" * 60)
    print(f"✨ {src_info['name']} and {dest_info['name']} are separated by {len(hops)} connection steps.\n")


if __name__ == "__main__":
    main()
