#!/usr/bin/env python3
"""
Validate the collected Telugu movies/actors dataset.

Checks two things:
  1. YEAR COVERAGE — counts movies per year, flags any year (2000+) that
     looks suspiciously thin compared to its neighbors (a sign TMDb's
     Telugu tagging or your discover query missed something for that year).
  2. ACTOR COVERAGE — checks a hand-picked list of major, unmistakably-
     famous Telugu actors against actors.json. If a big star like
     Chiranjeevi or Mahesh Babu is missing, something is wrong upstream
     (usually: their biggest films are tagged with a different
     original_language on TMDb, e.g. simultaneous multi-language shoots).

Run from the same folder as data/movies.json and data/actors.json:
    python validate_dataset.py
"""

import json
from pathlib import Path
from collections import Counter

DATA_DIR = Path("data")


def load():
    movies = json.loads((DATA_DIR / "movies.json").read_text(encoding="utf-8"))
    actors = json.loads((DATA_DIR / "actors.json").read_text(encoding="utf-8"))
    return movies, actors


# ----------------------------------------------------------------------------
# Check 1: year coverage
# ----------------------------------------------------------------------------

def check_years(movies):
    print("=" * 70)
    print("YEAR COVERAGE (2000–2026)")
    print("=" * 70)

    counts = Counter(m["year"] for m in movies if m.get("year"))
    years = list(range(2000, 2027))

    for y in years:
        c = counts.get(y, 0)
        bar = "#" * min(c, 80)
        flag = ""
        # crude anomaly flag: compare to average of the two neighboring years
        neighbors = [counts.get(y - 1, 0), counts.get(y + 1, 0)]
        neighbor_avg = sum(neighbors) / 2 if any(neighbors) else None
        if neighbor_avg and c < neighbor_avg * 0.3:
            flag = "  <-- LOW vs neighboring years, check this year"
        print(f"{y}: {c:4d}  {bar}{flag}")

    missing_years = [y for y in years if counts.get(y, 0) == 0]
    if missing_years:
        print(f"\n⚠ Years with ZERO movies found: {missing_years}")
    else:
        print("\n✓ Every year from 2000–2026 has at least one movie.")

    total_2000plus = sum(c for y, c in counts.items() if y and y >= 2000)
    print(f"Total movies 2000+: {total_2000plus}")
    print("\nNote: 2025/2026 counts will legitimately look thin — TMDb entries")
    print("for very recent or upcoming releases are still being added by its")
    print("community, and this run only reflects whatever was on TMDb the day")
    print("you fetched. Re-run --discover/--fetch periodically to catch new titles.")


# ----------------------------------------------------------------------------
# Check 2: major actor coverage
# ----------------------------------------------------------------------------

# Hand-picked list of unmistakably major Telugu film actors across eras.
# If any of these are missing, it's a strong signal of an upstream gap.
# Each entry is (label, [name variants to try]) since TMDb's official
# credited name sometimes differs from the popular nickname — e.g. TMDb
# credits Jr NTR as "N. T. Rama Rao Jr." with "Jr NTR" only as an alias.
KNOWN_MAJOR_ACTORS = [
    ("Chiranjeevi", ["Chiranjeevi"]),
    ("Nagarjuna", ["Nagarjuna", "Nagarjuna Akkineni", "Akkineni Nagarjuna"]),
    ("Venkatesh", ["Venkatesh", "Venkatesh Daggubati"]),
    ("Balakrishna", ["Balakrishna", "Nandamuri Balakrishna"]),
    ("Mohan Babu", ["Mohan Babu", "Manchu Mohan Babu"]),
    ("Mahesh Babu", ["Mahesh Babu"]),
    ("Pawan Kalyan", ["Pawan Kalyan"]),
    ("Jr NTR", ["Jr NTR", "N. T. Rama Rao Jr.", "N.T. Rama Rao Jr.", "N T Rama Rao Jr", "NTR Jr"]),
    ("Ram Charan", ["Ram Charan", "Ram Charan Teja"]),
    ("Prabhas", ["Prabhas"]),
    ("Allu Arjun", ["Allu Arjun"]),
    ("Nani", ["Nani"]),
    ("Vijay Deverakonda", ["Vijay Deverakonda"]),
    ("Ravi Teja", ["Ravi Teja"]),
    ("Naga Chaitanya", ["Naga Chaitanya", "Akkineni Naga Chaitanya"]),
    ("Rana Daggubati", ["Rana Daggubati"]),
    ("Nithiin", ["Nithiin", "Nithin"]),
    ("Sharwanand", ["Sharwanand"]),
    ("Adivi Sesh", ["Adivi Sesh"]),
    ("Sudheer Babu", ["Sudheer Babu"]),
    ("Sai Dharam Tej", ["Sai Dharam Tej"]),
    ("Varun Tej", ["Varun Tej"]),
    ("Akhil Akkineni", ["Akhil Akkineni"]),
    ("Nikhil Siddhartha", ["Nikhil Siddhartha", "Nikhil"]),
    ("Samantha Ruth Prabhu", ["Samantha Ruth Prabhu", "Samantha"]),
    ("Rashmika Mandanna", ["Rashmika Mandanna"]),
    ("Kajal Aggarwal", ["Kajal Aggarwal"]),
    ("Anushka Shetty", ["Anushka Shetty"]),
    ("Pooja Hegde", ["Pooja Hegde"]),
    ("Keerthy Suresh", ["Keerthy Suresh"]),
    ("Sai Pallavi", ["Sai Pallavi"]),
    ("Tamannaah", ["Tamannaah", "Tamannaah Bhatia", "Tamannaah Bhatia "]),
    ("Trisha", ["Trisha", "Trisha Krishnan"]),
    ("Nayanthara", ["Nayanthara"]),
    ("Ileana D'Cruz", ["Ileana D'Cruz", "Ileana"]),
    ("Shruti Haasan", ["Shruti Haasan"]),
    ("Jayasudha", ["Jayasudha"]),
    ("Vijayashanti", ["Vijayashanti"]),
    ("Soundarya", ["Soundarya"]),
    ("Nagma", ["Nagma"]),
    ("Meena", ["Meena"]),
    ("Akkineni Nageswara Rao", ["Akkineni Nageswara Rao", "ANR", "Nageswara Rao"]),
    ("N. T. Rama Rao (Sr.)", ["N. T. Rama Rao", "NT Rama Rao"]),
    ("Krishna", ["Krishna", "Superstar Krishna", "Ghattamaneni Krishna"]),
    ("Sobhan Babu", ["Sobhan Babu"]),
    ("Rajendra Prasad", ["Rajendra Prasad"]),
    ("Brahmanandam", ["Brahmanandam"]),
    ("Sunil", ["Sunil", "Sunil Varma"]),
    ("Ali", ["Ali"]),
    ("Posani Krishna Murali", ["Posani Krishna Murali"]),
]


def normalize(name):
    return name.lower().replace(".", "").replace("  ", " ").strip()


def check_actors(actors):
    print("\n" + "=" * 70)
    print("MAJOR ACTOR COVERAGE CHECK")
    print("=" * 70)

    actor_names = {normalize(a["name"]): a for a in actors}

    found, missing = [], []
    for label, variants in KNOWN_MAJOR_ACTORS:
        candidates = []
        for name in variants:
            norm = normalize(name)
            m = actor_names.get(norm)
            if m:
                candidates.append(m)
        # dedupe by actor id, then take the one with the most movies —
        # avoids surfacing a tiny leftover duplicate profile just because
        # its exact name happened to be checked first
        best_by_id = {c["id"]: c for c in candidates}
        match = max(best_by_id.values(), key=lambda c: c["movie_count"]) if best_by_id else None
        if match:
            found.append((label, match["name"], match["movie_count"]))
        else:
            missing.append(label)

    print(f"\n✓ Found {len(found)}/{len(KNOWN_MAJOR_ACTORS)} known major actors:\n")
    for wanted, actual, count in sorted(found, key=lambda x: -x[2]):
        marker = f" (matched as '{actual}')" if normalize(actual) != normalize(wanted) else ""
        print(f"  {actual:30s} {count:4d} movies{marker}")

    if missing:
        print(f"\n⚠ MISSING ({len(missing)}) — investigate these:")
        for name in missing:
            print(f"  - {name}")
        print("\nIf a big star is missing, the likely cause: their films are")
        print("tagged on TMDb with a different original_language (common for")
        print("simultaneous multi-language shoots, e.g. tagged 'hi' or 'ta'")
        print("instead of 'te'). Search TMDb.org for the actor manually and")
        print("check what original_language their known films carry.")
    else:
        print("\n✓ All known major actors present. Good sign of solid coverage.")

    print(f"\nTotal actors in dataset: {len(actors)}")
    print("Top 20 by movie count:")
    for a in actors[:20]:
        print(f"  {a['name']:30s} {a['movie_count']:4d} movies")


def main():
    movies, actors = load()
    check_years(movies)
    check_actors(actors)


if __name__ == "__main__":
    main()
