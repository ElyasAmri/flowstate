#!/usr/bin/env python3
"""Parse the Road Traffic Fine Management XES log into per-case traces,
derive a ground-truth routine / non-routine label, and emit:

  - stats.json     aggregate counts + variant frequencies
  - cases.jsonl    one row per case (id, activities, attrs, label)
  - sample.json    a balanced test sample for the model-in-the-loop eval

Ground-truth rule (process knowledge, not the model):
A case is NON-ROUTINE if the offender contests the fine, i.e. its trace
contains any appeal activity:
  Insert Date / Send Appeal to Prefecture, Receive Result Appeal from
  Prefecture, Notify Result Appeal to Offender, Appeal to Judge.
Otherwise it is ROUTINE: created, optionally sent, then paid, closed, or
automatically forwarded to credit collection (a deterministic branch, no
human judgement needed).
"""
import gzip, json, os, sys, xml.etree.ElementTree as ET
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "datasets", "RoadTrafficFines",
                   "Road_Traffic_Fine_Management_Process.xes.gz")
OUT = os.path.join(HERE, "data")
os.makedirs(OUT, exist_ok=True)

NS = "{http://www.xes-standard.org/}"  # not used; OpenXES emits no namespace
ESCALATION = {
    "Appeal to Judge",
    "Send Appeal to Prefecture",
    "Insert Date Appeal to Prefecture",
    "Receive Result Appeal from Prefecture",
    "Notify Result Appeal to Offender",
}

def label(acts):
    return "non_routine" if any(a in ESCALATION for a in acts) else "routine"

def parse():
    cases = []
    variants = Counter()
    n_routine = n_non = 0
    # streaming parse: each <trace> is a case
    ctx = ET.iterparse(gzip.open(SRC, "rb"), events=("end",))
    for ev, el in ctx:
        if el.tag != "trace":
            continue
        cid = None
        acts = []
        attrs = {}
        for child in el:
            if child.tag in ("string", "int", "float", "date"):
                k = child.get("key"); v = child.get("value")
                if k == "concept:name":
                    cid = v
            elif child.tag == "event":
                ename = None
                eattrs = {}
                for f in child:
                    k = f.get("key"); v = f.get("value")
                    if k == "concept:name":
                        ename = v
                    else:
                        eattrs[k] = v
                if ename:
                    acts.append(ename)
                    # keep the first non-null amount / points / paymentAmount seen
                    for kk in ("amount", "points", "paymentAmount", "totalPaymentAmount",
                               "expense", "article", "vehicleClass", "dismissal"):
                        if kk in eattrs and kk not in attrs:
                            attrs[kk] = eattrs[kk]
        lab = label(acts)
        if lab == "routine":
            n_routine += 1
        else:
            n_non += 1
        variants[" -> ".join(acts)] += 1
        cases.append({"id": cid, "n_events": len(acts),
                      "activities": acts, "attrs": attrs, "label": lab})
        el.clear()
    return cases, variants, n_routine, n_non

def main():
    cases, variants, n_routine, n_non = parse()
    total = len(cases)
    stats = {
        "dataset": "Road Traffic Fine Management (BPI, Italian municipality)",
        "total_cases": total,
        "routine": n_routine,
        "non_routine": n_non,
        "routine_pct": round(100 * n_routine / total, 1),
        "non_routine_pct": round(100 * n_non / total, 1),
        "distinct_variants": len(variants),
        "top_variants": [
            {"variant": v, "count": c, "pct": round(100 * c / total, 1)}
            for v, c in variants.most_common(12)
        ],
    }
    with open(os.path.join(OUT, "stats.json"), "w") as f:
        json.dump(stats, f, indent=2)
    with open(os.path.join(OUT, "cases.jsonl"), "w") as f:
        for c in cases:
            f.write(json.dumps(c) + "\n")

    # balanced, deterministic sample for the model-in-the-loop eval:
    # take every Nth routine and every Mth non-routine to span variants.
    routine = [c for c in cases if c["label"] == "routine"]
    non = [c for c in cases if c["label"] == "non_routine"]
    def stride(lst, k):
        if len(lst) <= k:
            return lst
        step = len(lst) // k
        return [lst[i * step] for i in range(k)]
    sample = stride(routine, 30) + stride(non, 30)
    # strip the label into a held-out answer key; the model sees the full
    # case record (activities + attrs) and must judge conformance to the
    # routine flow, not peek at our label.
    blind = [{"id": c["id"], "case_history": c["activities"],
              "attrs": c["attrs"]} for c in sample]
    key = {c["id"]: c["label"] for c in sample}
    with open(os.path.join(OUT, "sample_blind.json"), "w") as f:
        json.dump(blind, f, indent=2)
    with open(os.path.join(OUT, "sample_key.json"), "w") as f:
        json.dump(key, f, indent=2)

    print(json.dumps(stats, indent=2))
    print(f"\nsample: {len(sample)} cases ({len(blind)} blind) written to {OUT}")

def prefix(c):
    """Give the model what an intake would see: the case up to (but not
    including) any escalation, i.e. the early activities + attributes.
    This simulates 'a new application arrives' rather than leaking the
    full historical trace."""
    acts = c["activities"]
    cut = len(acts)
    for i, a in enumerate(acts):
        if a in ESCALATION:
            cut = i
            break
    return acts[:cut] if cut > 0 else acts[:1]

if __name__ == "__main__":
    main()
