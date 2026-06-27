#!/usr/bin/env python3
"""CORU (abdoelsayed/CORU on HuggingFace) receipt dataset → eval artefacts.

Emits:
  eval/data/coru_blind.json  — per-receipt extracted fields, NO verdict
  eval/data/coru_key.json    — {id: gold_verdict} via policy.verdict(ground_truth)

Usage
-----
  python3 eval/parse_coru.py                 # synthetic fixture (no download needed)
  python3 eval/parse_coru.py --data PATH     # real CORU data directory

Real CORU schema (abdoelsayed/CORU, ~20 k receipts, Qatar/GCC)
---------------------------------------------------------------
The dataset is distributed as parquet files with these columns (best-guess from
the paper; confirm against the HuggingFace dataset card before production use):

  receipt_id   : int / str   unique identifier
  merchant     : str         vendor name (key-info OCR)
  date         : str         transaction date, ISO-8601 or locale format
  receipt_no   : str         printed receipt number
  items        : JSON str    list of {item_name, price, quantity, category, brand}
  total        : float       total amount (QAR or local currency)
  tax          : float|None  VAT / tax amount (optional)
  currency     : str         "QAR", "SAR", …
  lang         : str         "ar" | "en" | "mixed"
  confidence   : float       aggregate extraction confidence, 0..1 (or per-field dict)

When loading real data, map these to the policy fields:
  merchant_name → merchant,  date → date,  receipt_no → receipt_no,
  items → items (parse JSON; keep name/price/qty/category/brand per item),
  total → total,  lang → lang,  confidence → confidence (min if per-field).
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import date, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from policy import verdict as policy_verdict, KNOWN_MERCHANTS

OUT = os.path.join(HERE, "data")
os.makedirs(OUT, exist_ok=True)


# ── Synthetic fixture ─────────────────────────────────────────────────────────
# ~20 receipts covering routine / edge / novel per docs/receipt-claims-policy.md.
# Dates are relative to today so the fixture generates valid key verdicts whenever
# the script is run (no stale date window issues for non-window cases).
# `dup` is a system field (prior-receipt store lookup), not OCR-extracted; it is
# included in the blind data so downstream eval can test full-policy classification.

def _build_synthetic(today: date) -> list[dict]:
    def d(delta: int) -> str:
        return (today + timedelta(days=delta)).isoformat()

    KNOWN = "known_vendor"          # in policy.KNOWN_MERCHANTS
    UNK   = "novamed clinic"        # NOT in policy.KNOWN_MERCHANTS

    def item(name, price, qty, cat, brand=""):
        return {"name": name, "price": price, "qty": qty,
                "category": cat, "brand": brand}

    return [
        # ── Routine: auto-approve ────────────────────────────────────────────
        {"id": "SYN-001", "merchant": KNOWN, "date": d(-10), "receipt_no": "R001",
         "items": [item("Paracetamol", 25.0, 2, "pharmacy", "Panadol"),
                   item("Vitamins",    45.0, 1, "medical")],
         "total": 95.0,  "confidence": 0.96, "lang": "en",    "dup": None, "unparseable": False},

        {"id": "SYN-002", "merchant": KNOWN, "date": d(-5), "receipt_no": "R002",
         "items": [item("Eye drops", 80.0, 1, "optical")],
         "total": 80.0,  "confidence": 0.92, "lang": "en",    "dup": None, "unparseable": False},

        {"id": "SYN-003", "merchant": KNOWN, "date": d(-45), "receipt_no": "R003",
         "items": [item("دواء",     200.0, 1, "pharmacy"),
                   item("كريم طبي", 100.0, 2, "medical")],
         "total": 400.0, "confidence": 0.91, "lang": "ar",    "dup": None, "unparseable": False},

        {"id": "SYN-016", "merchant": "al-dawaa pharmacy", "date": d(-30), "receipt_no": "R016",
         "items": [item("بنزين طبي", 50.0, 3, "pharmacy"),
                   item("مرهم",     120.0, 1, "medical")],
         "total": 270.0, "confidence": 0.89, "lang": "ar",    "dup": None, "unparseable": False},

        {"id": "SYN-020", "merchant": KNOWN, "date": d(-90), "receipt_no": "R020",
         "items": [item("Optical lenses", 500.0, 1, "optical")],
         "total": 500.0, "confidence": 0.93, "lang": "en",    "dup": None, "unparseable": False},

        # ── Routine: auto-reject ─────────────────────────────────────────────
        {"id": "SYN-004", "merchant": KNOWN, "date": d(-10), "receipt_no": "R004",
         "items": [item("Cigarettes", 50.0, 4, "tobacco")],
         "total": 200.0, "confidence": 0.94, "lang": "en",    "dup": None, "unparseable": False},

        {"id": "SYN-018", "merchant": KNOWN, "date": d(-10), "receipt_no": "R018",
         "items": [item("Laptop", 800.0, 1, "electronics")],
         "total": 800.0, "confidence": 0.97, "lang": "en",    "dup": None, "unparseable": False},

        {"id": "SYN-005", "merchant": KNOWN, "date": d(-100), "receipt_no": "R005",
         "items": [item("Antibiotics", 150.0, 1, "pharmacy")],
         "total": 150.0, "confidence": 0.93, "lang": "en",    "dup": None, "unparseable": False},

        {"id": "SYN-006", "merchant": KNOWN, "date": d(2), "receipt_no": "R006",
         "items": [item("Clinic visit", 200.0, 1, "clinic")],
         "total": 200.0, "confidence": 0.95, "lang": "en",    "dup": None, "unparseable": False},

        {"id": "SYN-007", "merchant": KNOWN, "date": d(-10), "receipt_no": "R007",
         "items": [item("Medical equipment", 1200.0, 1, "medical")],
         "total": 1200.0,"confidence": 0.94, "lang": "en",    "dup": None, "unparseable": False},

        {"id": "SYN-008", "merchant": KNOWN, "date": d(-10), "receipt_no": "R008",
         "items": [], "total": None,
         "confidence": 0.90, "lang": "en",    "dup": None, "unparseable": False},

        {"id": "SYN-009", "merchant": KNOWN, "date": d(-15), "receipt_no": "R001",
         "items": [item("Paracetamol", 25.0, 2, "pharmacy")],
         "total": 95.0,  "confidence": 0.95, "lang": "en",    "dup": "exact", "unparseable": False},

        # ── Edge: escalate to human gate ─────────────────────────────────────
        {"id": "SYN-010", "merchant": KNOWN, "date": d(-10), "receipt_no": "R010",
         "items": [item("Medicine", 100.0, 1, "pharmacy"),
                   item("Alcohol",   50.0, 1, "alcohol")],
         "total": 150.0, "confidence": 0.93, "lang": "mixed", "dup": None, "unparseable": False},

        {"id": "SYN-011", "merchant": KNOWN, "date": d(-10), "receipt_no": "R011",
         "items": [item("Medical consultation", 975.0, 1, "clinic")],
         "total": 975.0, "confidence": 0.95, "lang": "en",    "dup": None, "unparseable": False},

        {"id": "SYN-017", "merchant": KNOWN, "date": d(-20), "receipt_no": "R017",
         "items": [item("Medical treatment", 1020.0, 1, "medical")],
         "total": 1020.0,"confidence": 0.95, "lang": "en",    "dup": None, "unparseable": False},

        {"id": "SYN-012", "merchant": KNOWN, "date": d(-15), "receipt_no": "R012",
         "items": [item("Paracetamol", 25.0, 2, "pharmacy")],
         "total": 95.0,  "confidence": 0.94, "lang": "en",    "dup": "fuzzy", "unparseable": False},

        # ── Novel: escalate — unknown / low-conf / unrecognised ──────────────
        {"id": "SYN-013", "merchant": UNK,  "date": d(-10), "receipt_no": "R013",
         "items": [item("Consultation", 300.0, 1, "clinic")],
         "total": 300.0, "confidence": 0.96, "lang": "en",    "dup": None, "unparseable": False},

        {"id": "SYN-019", "merchant": "صيدلية الحياة", "date": d(-5), "receipt_no": "R019",
         "items": [item("دواء", 180.0, 1, "pharmacy")],
         "total": 180.0, "confidence": 0.88, "lang": "ar",    "dup": None, "unparseable": False},

        {"id": "SYN-014", "merchant": KNOWN, "date": d(-10), "receipt_no": "R014",
         "items": [item("Medicine", 200.0, 1, "pharmacy")],
         "total": 200.0, "confidence": 0.60, "lang": "mixed", "dup": None, "unparseable": False},

        {"id": "SYN-015", "merchant": None, "date": None, "receipt_no": None,
         "items": [], "total": None,
         "confidence": 0.15, "lang": "unknown", "dup": None, "unparseable": True},
    ]


# ── Real CORU loader ──────────────────────────────────────────────────────────

def _load_real(data_dir: str) -> list[dict]:
    """Load real CORU data from *data_dir*.

    Expects parquet files (any name) in the directory.  Requires pyarrow.
    Maps CORU columns to the policy field schema; see module docstring for the
    assumed column names — verify against the dataset card and adjust if needed.
    """
    try:
        import pyarrow.parquet as pq
        import glob as _glob
    except ImportError:
        raise SystemExit("pyarrow is required to load real CORU data: pip install pyarrow")

    files = _glob.glob(os.path.join(data_dir, "**", "*.parquet"), recursive=True)
    if not files:
        raise SystemExit(f"No parquet files found under {data_dir!r}")

    rows: list[dict] = []
    for f in sorted(files):
        rows.extend(pq.read_table(f).to_pylist())

    # track seen receipt_nos for exact-dup detection
    seen_receipt_nos: set[str] = set()
    seen_merchant_date_total: set[tuple] = set()

    receipts = []
    for i, r in enumerate(rows):
        rid = str(r.get("receipt_id", i))

        # parse items (may be a JSON string or already a list)
        raw_items = r.get("items", [])
        if isinstance(raw_items, str):
            try:
                raw_items = json.loads(raw_items)
            except json.JSONDecodeError:
                raw_items = []
        items = [
            {
                "name":     it.get("item_name") or it.get("name", ""),
                "price":    float(it.get("price") or 0),
                "qty":      int(it.get("quantity") or it.get("qty") or 1),
                "category": it.get("category", ""),
                "brand":    it.get("brand", ""),
            }
            for it in (raw_items or [])
        ]

        # confidence: accept float scalar or dict (take min over required fields)
        raw_conf = r.get("confidence", 1.0)
        if isinstance(raw_conf, dict):
            conf = min(raw_conf.values()) if raw_conf else 1.0
        else:
            conf = float(raw_conf or 1.0)

        merchant  = r.get("merchant") or r.get("merchant_name")
        dt        = r.get("date") or r.get("transaction_date")
        receipt_no = str(r.get("receipt_no") or r.get("receipt_number") or "")
        total     = r.get("total") or r.get("total_amount")
        lang      = r.get("lang") or r.get("language", "")

        # system-level dup check (prior-receipt store)
        mdt_key = (str(merchant), str(dt), str(total))
        if receipt_no and receipt_no in seen_receipt_nos:
            dup = "exact"
        elif mdt_key in seen_merchant_date_total:
            dup = "fuzzy"
        else:
            dup = None

        if receipt_no:
            seen_receipt_nos.add(receipt_no)
        seen_merchant_date_total.add(mdt_key)

        receipts.append({
            "id":         rid,
            "merchant":   merchant,
            "date":       str(dt) if dt else None,
            "receipt_no": receipt_no or None,
            "items":      items,
            "total":      float(total) if total is not None else None,
            "confidence": conf,
            "lang":       lang,
            "dup":        dup,
            "unparseable": bool(r.get("unparseable", False)),
        })

    return receipts


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--data", metavar="DIR",
                        help="Directory containing real CORU parquet files. "
                             "If omitted, a built-in synthetic fixture is used.")
    args = parser.parse_args()

    today = date.today()

    if args.data:
        receipts = _load_real(args.data)
        source = f"real CORU data from {args.data!r}"
    else:
        receipts = _build_synthetic(today)
        source = "synthetic fixture (20 receipts)"

    # blind: all extracted fields (including system dup field), NO verdict
    blind = [
        {
            "id":         r["id"],
            "merchant":   r["merchant"],
            "date":       r["date"],
            "receipt_no": r["receipt_no"],
            "items":      r["items"],
            "total":      r["total"],
            "confidence": r["confidence"],
            "lang":       r["lang"],
            "dup":        r["dup"],         # system field — prior-receipt lookup result
            "unparseable": r.get("unparseable", False),
        }
        for r in receipts
    ]

    # key: gold verdict from the deterministic policy applied to ground-truth fields
    key: dict[str, str] = {}
    for r in receipts:
        key[r["id"]] = policy_verdict(r, submission_date=today)

    with open(os.path.join(OUT, "coru_blind.json"), "w", encoding="utf-8") as f:
        json.dump(blind, f, ensure_ascii=False, indent=2)
    with open(os.path.join(OUT, "coru_key.json"), "w", encoding="utf-8") as f:
        json.dump(key, f, ensure_ascii=False, indent=2)

    from collections import Counter
    dist = Counter(key.values())
    stats = {
        "source":   source,
        "n":        len(receipts),
        "verdict_distribution": dict(sorted(dist.items())),
    }
    print(json.dumps(stats, ensure_ascii=False, indent=2))
    print(f"\nwrote coru_blind.json ({len(blind)} receipts) and coru_key.json -> {OUT}")


if __name__ == "__main__":
    main()
