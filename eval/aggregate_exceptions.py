#!/usr/bin/env python3
"""Shell-action helper for the `flow-update` meta-flow's "Aggregate exception
stats" node. Given a path to non-routine cases (JSONL with attrs), it prints
appeal rates by article / amount band / points so the downstream agent node can
propose grounded flow updates. Falls back to the eval cases file.
"""
import json, os, sys
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT = os.path.join(HERE, "data", "cases.jsonl")

def band(a):
    a = float(a or 0)
    return "<=35" if a <= 35 else "36-100" if a <= 100 else "101-300" if a <= 300 else ">300"

def main():
    path = sys.argv[1] if len(sys.argv) > 1 and os.path.exists(sys.argv[1]) else DEFAULT
    if not os.path.exists(path):
        print("aggregated (no case file present)"); return
    tot = Counter(); appeal = Counter()
    art_t = Counter(); art_a = Counter()
    pts_t = Counter(); pts_a = Counter()
    n = 0
    for line in open(path):
        c = json.loads(line); n += 1
        non = c.get("label") == "non_routine"
        at = c.get("attrs", {})
        b = band(at.get("amount")); tot[b] += 1; appeal[b] += non
        art = at.get("article", "?"); art_t[art] += 1; art_a[art] += non
        p = str(at.get("points", "0")); pts_t[p] += 1; pts_a[p] += non
    def rate(a, t, k): return f"{100*a[k]/t[k]:.1f}%" if t[k] else "n/a"
    print(f"cases={n} appealed={sum(appeal.values())}")
    print("appeal rate by amount band:", {k: rate(appeal, tot, k) for k in tot})
    top_art = sorted(art_t, key=lambda k: -art_a[k])[:5]
    print("appeal rate by top articles:", {k: rate(art_a, art_t, k) for k in top_art})
    print("appeal rate by points:", {k: rate(pts_a, pts_t, k) for k in sorted(pts_t)})

if __name__ == "__main__":
    main()
