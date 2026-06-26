#!/usr/bin/env python3
"""Arabic-LJP track: Saudi commercial-court cases. The agent node reads the
Arabic case facts (`input`) and must predict the court's decision class.

Decision classes (derived from the ruling text `output`, ground truth):
  accept  - court grants the claim (الزام/بإلزام the defendant to pay/act)
  reject  - court rejects the claim (رفض / عدم قبول / صرف النظر)
  route   - court declines jurisdiction (عدم اختصاص) -> in Flowstate terms,
            the case does not belong to this flow and is escalated/routed.

Facts never contain the ruling, so predicting from facts is a fair test of
the agent's Arabic legal judgement. Emits a balanced blind sample + key.
"""
import os, json
import pyarrow.parquet as pq

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "datasets", "arabic", "Arabic-LJP", "test.parquet")
OUT = os.path.join(HERE, "data")
os.makedirs(OUT, exist_ok=True)

import re as _re
def label(o):
    o = o or ""
    # jurisdiction decline -> route. Catches عدم اختصاص / عدم الاختصاص / غير مختص.
    if _re.search(r"عدم\s+ال?اختصاص|غير\s+مختص|لا\s+تختص", o):
        return "route"
    # An obligation to pay/act means the claim was GRANTED (accept), even when
    # the ruling also rejects the *remainder* of requests ("رفض ما عدا ذلك") or
    # rejects an appeal whose underlying ruling it upholds. Accept must be
    # checked BEFORE reject, or those partial-rejection clauses mislabel a grant
    # as a rejection (this was a real bug: 4/50 cases in the eval sample).
    if "بإلزام" in o or "إلزام" in o or "الزام" in o or "بقبول" in o:
        return "accept"
    if "رفض" in o or "عدم قبول" in o or "صرف النظر" in o:
        return "reject"
    return "other"

def main():
    rows = pq.read_table(SRC).to_pylist()
    for r in rows:
        r["label"] = label(r["output"])
    by = {"accept": [], "reject": [], "route": []}
    for r in rows:
        if r["label"] in by:
            by[r["label"]].append(r)
    # deterministic balanced sample: 20 accept, 20 reject, 10 route = 50
    def stride(lst, k):
        if len(lst) <= k:
            return lst
        step = len(lst) // k
        return [lst[i * step] for i in range(k)]
    sample = stride(by["accept"], 20) + stride(by["reject"], 20) + stride(by["route"], 10)

    def clip(s, n=1800):
        s = (s or "").strip()
        return s if len(s) <= n else s[:n] + " …[مقتطع]"

    blind = [{"id": r["id"], "facts": clip(r["input"])} for r in sample]
    key = {r["id"]: r["label"] for r in sample}
    with open(os.path.join(OUT, "ljp_blind.json"), "w") as f:
        json.dump(blind, f, ensure_ascii=False, indent=2)
    with open(os.path.join(OUT, "ljp_key.json"), "w") as f:
        json.dump(key, f, ensure_ascii=False, indent=2)

    from collections import Counter
    stats = {
        "dataset": "Arabic-LJP (Saudi commercial court, judgement prediction)",
        "test_rows": len(rows),
        "label_distribution_full": dict(Counter(r["label"] for r in rows)),
        "sample_size": len(sample),
        "sample_distribution": dict(Counter(key.values())),
    }
    with open(os.path.join(OUT, "ljp_stats.json"), "w") as f:
        json.dump(stats, f, ensure_ascii=False, indent=2)
    print(json.dumps(stats, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
