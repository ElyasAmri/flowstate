#!/usr/bin/env python3
"""Deterministic receipt-claims policy for the Fanar Hackathon flowstate demo.

VERDICT = policy.verdict(fields) is a pure function with no I/O or randomness.
Every receipt goes through the same 9-step evaluation order; first match wins.
This guarantees the same fields always yield the same verdict (replayable,
appealable). See docs/receipt-claims-policy.md for the full spec.
"""
from __future__ import annotations

import os
from datetime import date, datetime, timedelta
from typing import Optional

# ── Policy parameters (source: docs/receipt-claims-policy.md §Policy parameters) ──
# 90 days is the production default; FLOWSTATE_WINDOW_DAYS overrides it so a demo
# can widen the window (e.g. to admit the 2022-dated CORU receipts) without
# editing the spec or breaking the unit-test matrix, which runs at the default.
CLAIM_WINDOW_DAYS    = int(os.environ.get("FLOWSTATE_WINDOW_DAYS", "90"))
PER_CLAIM_CAP        = 1000.0   # maximum reimbursable total, QAR
BORDERLINE_BAND      = 0.05     # ±5 % of cap triggers human review
MIN_FIELD_CONFIDENCE = 0.70     # per-field OCR/extraction confidence floor

ELIGIBLE_CATEGORIES   = {"pharmacy", "medical", "clinic", "optical"}
INELIGIBLE_CATEGORIES = {"tobacco", "alcohol", "electronics", "gift_card", "luxury"}

# Illustrative vendor registry — in production this is a live DB lookup.
# Strings are stored lowercase; lookups normalise with .lower().
KNOWN_MERCHANTS: set[str] = {
    "al-dawaa pharmacy", "dawaa", "pharmacy one", "aster pharmacy",
    "hamad medical", "qatar clinic", "optical center", "health plus",
    "rayyan pharmacy", "medicare", "al-ahli pharmacy",
    # sentinel used by the unit-test matrix (see __main__)
    "known_vendor",
}

# ── Verdict constants ────────────────────────────────────────────────────────
APPROVED                     = "APPROVED"
REJECTED_MISSING_FIELDS      = "REJECTED_MISSING_FIELDS"
REJECTED_OUT_OF_WINDOW       = "REJECTED_OUT_OF_WINDOW"
REJECTED_DUPLICATE           = "REJECTED_DUPLICATE"
REJECTED_INELIGIBLE_CATEGORY = "REJECTED_INELIGIBLE_CATEGORY"
REJECTED_OVER_CAP            = "REJECTED_OVER_CAP"
ESCALATE_MIXED_BASKET        = "ESCALATE_MIXED_BASKET"
ESCALATE_BORDERLINE          = "ESCALATE_BORDERLINE"
ESCALATE_DUPLICATE_SUSPECT   = "ESCALATE_DUPLICATE_SUSPECT"
ESCALATE_UNKNOWN_MERCHANT    = "ESCALATE_UNKNOWN_MERCHANT"
ESCALATE_LOW_CONFIDENCE      = "ESCALATE_LOW_CONFIDENCE"
ESCALATE_UNRECOGNIZED_FORMAT = "ESCALATE_UNRECOGNIZED_FORMAT"
APPROVED_BY_OPERATOR         = "APPROVED_BY_OPERATOR"
REJECTED_BY_OPERATOR         = "REJECTED_BY_OPERATOR"

# Useful sets for callers (e.g. score.py escalation metrics)
ESCALATE_VERDICTS = frozenset({
    ESCALATE_MIXED_BASKET, ESCALATE_BORDERLINE, ESCALATE_DUPLICATE_SUSPECT,
    ESCALATE_UNKNOWN_MERCHANT, ESCALATE_LOW_CONFIDENCE, ESCALATE_UNRECOGNIZED_FORMAT,
})
REJECTED_VERDICTS = frozenset({
    REJECTED_MISSING_FIELDS, REJECTED_OUT_OF_WINDOW, REJECTED_DUPLICATE,
    REJECTED_INELIGIBLE_CATEGORY, REJECTED_OVER_CAP,
})
ALL_VERDICTS = (
    frozenset({APPROVED, APPROVED_BY_OPERATOR, REJECTED_BY_OPERATOR})
    | ESCALATE_VERDICTS
    | REJECTED_VERDICTS
)


def verdict(fields: dict, *, submission_date: Optional[date] = None) -> str:
    """Return the policy verdict for a receipt claim.

    Evaluation order is strict (first match wins) and is the contract.
    See docs/receipt-claims-policy.md §Evaluation order.

    Parameters
    ----------
    fields : dict
        Expected keys:
          unparseable : bool         — layout could not be structured at all (step 1)
          merchant    : str | None   — vendor name (required field)
          date        : str | date   — ISO-8601 transaction date (required)
          receipt_no  : str | None   — receipt number (used for exact-dup detection)
          items       : list[dict]   — each item has at least a 'category' str (required: ≥1)
          total       : float | None — claimed amount in QAR (required)
          confidence  : float        — minimum per-field extraction confidence, 0..1
          dup         : str | None   — "exact" | "fuzzy" | None (from prior-receipt store)
    submission_date : date, optional
        Date the claim was submitted. Defaults to today.
    """
    today = submission_date or date.today()

    # Step 1 — unparseable layout
    if fields.get("unparseable", False):
        return ESCALATE_UNRECOGNIZED_FORMAT

    # Step 2 — any required field below the confidence floor
    conf = float(fields.get("confidence", 1.0))
    if conf < MIN_FIELD_CONFIDENCE:
        return ESCALATE_LOW_CONFIDENCE

    # Step 3 — missing required fields: merchant, date, total, ≥1 item
    merchant     = fields.get("merchant")
    txn_date_raw = fields.get("date")
    total        = fields.get("total")
    items        = fields.get("items") or []
    if not merchant or not txn_date_raw or total is None or len(items) == 0:
        return REJECTED_MISSING_FIELDS

    # Step 4 — date out of window or in the future
    if isinstance(txn_date_raw, str):
        txn_date = datetime.fromisoformat(txn_date_raw).date()
    else:
        txn_date = txn_date_raw
    delta_days = (today - txn_date).days          # negative = future
    if delta_days < 0 or delta_days > CLAIM_WINDOW_DAYS:
        return REJECTED_OUT_OF_WINDOW

    # Step 5 — duplicate checks (exact then fuzzy)
    dup = fields.get("dup")
    if dup == "exact":
        return REJECTED_DUPLICATE
    if dup == "fuzzy":
        return ESCALATE_DUPLICATE_SUSPECT

    # Step 6 — category eligibility
    cats          = {str(it.get("category", "")).lower() for it in items}
    has_ineligible = bool(cats & INELIGIBLE_CATEGORIES)
    has_eligible   = bool(cats & ELIGIBLE_CATEGORIES)
    all_ineligible = all(
        str(it.get("category", "")).lower() in INELIGIBLE_CATEGORIES for it in items
    )
    if has_ineligible and has_eligible:
        return ESCALATE_MIXED_BASKET
    if all_ineligible:
        return REJECTED_INELIGIBLE_CATEGORY

    # Step 7 — total vs cap (borderline band checked before hard reject)
    total_f  = float(total)
    cap_low  = PER_CLAIM_CAP * (1.0 - BORDERLINE_BAND)   # 950.0
    cap_high = PER_CLAIM_CAP * (1.0 + BORDERLINE_BAND)   # 1050.0
    if cap_low <= total_f <= cap_high:
        return ESCALATE_BORDERLINE
    if total_f > PER_CLAIM_CAP:
        return REJECTED_OVER_CAP

    # Step 8 — unknown merchant
    if str(merchant).lower() not in KNOWN_MERCHANTS:
        return ESCALATE_UNKNOWN_MERCHANT

    # Step 9 — all checks passed
    return APPROVED


# ── Unit-test self-check (python3 eval/policy.py) ────────────────────────────
if __name__ == "__main__":
    _today = date(2024, 6, 1)   # fixed submission date for reproducibility

    def _d(delta: int) -> str:
        return (_today + timedelta(days=delta)).isoformat()

    def _pharmacy():
        return [{"name": "medicine", "price": 100.0, "qty": 1, "category": "pharmacy"}]

    def _tobacco():
        return [{"name": "cigarettes", "price": 100.0, "qty": 1, "category": "tobacco"}]

    _KNOWN   = "known_vendor"
    _UNKNOWN = "unknown_vendor"

    _MATRIX = [
        # (row_id, fields, expected_verdict)
        # ── Routine / auto-terminal ──────────────────────────────────────────
        ( 1, {"merchant": _KNOWN,   "date": _d(-10),  "total": 300,  "items": _pharmacy(),            "confidence": .95, "dup": None},    APPROVED),
        ( 2, {"merchant": _KNOWN,   "date": _d(-10),  "total": 1200, "items": _pharmacy(),            "confidence": .95, "dup": None},    REJECTED_OVER_CAP),
        ( 3, {"merchant": _KNOWN,   "date": _d(-10),  "total": 980,  "items": _pharmacy(),            "confidence": .95, "dup": None},    ESCALATE_BORDERLINE),
        ( 4, {"merchant": _KNOWN,   "date": _d(-200), "total": 300,  "items": _pharmacy(),            "confidence": .95, "dup": None},    REJECTED_OUT_OF_WINDOW),
        ( 5, {"merchant": _KNOWN,   "date": _d(3),    "total": 300,  "items": _pharmacy(),            "confidence": .95, "dup": None},    REJECTED_OUT_OF_WINDOW),
        ( 6, {"merchant": _KNOWN,   "date": _d(-10),  "total": 300,  "items": _tobacco(),             "confidence": .95, "dup": None},    REJECTED_INELIGIBLE_CATEGORY),
        ( 7, {"merchant": _KNOWN,   "date": _d(-10),  "total": 300,  "items": _pharmacy()+_tobacco(), "confidence": .95, "dup": None},    ESCALATE_MIXED_BASKET),
        ( 8, {"merchant": _KNOWN,   "date": _d(-10),  "total": 300,  "items": _pharmacy(),            "confidence": .95, "dup": "exact"}, REJECTED_DUPLICATE),
        ( 9, {"merchant": _KNOWN,   "date": _d(-10),  "total": 300,  "items": _pharmacy(),            "confidence": .95, "dup": "fuzzy"}, ESCALATE_DUPLICATE_SUSPECT),
        (10, {"merchant": _UNKNOWN, "date": _d(-10),  "total": 300,  "items": _pharmacy(),            "confidence": .95, "dup": None},    ESCALATE_UNKNOWN_MERCHANT),
        (11, {"merchant": _KNOWN,   "date": _d(-10),  "total": 300,  "items": _pharmacy(),            "confidence": .50, "dup": None},    ESCALATE_LOW_CONFIDENCE),
        (12, {"merchant": _KNOWN,   "date": _d(-10),  "total": None, "items": [],                     "confidence": .95, "dup": None},    REJECTED_MISSING_FIELDS),
        (13, {"unparseable": True,  "confidence": .20},                                                                                    ESCALATE_UNRECOGNIZED_FORMAT),
        # ── Precedence: first match wins ─────────────────────────────────────
        (14, {"merchant": _UNKNOWN, "date": _d(-200), "total": 300,  "items": _pharmacy(),            "confidence": .95, "dup": None},    REJECTED_OUT_OF_WINDOW),       # rule 4 beats 8
        (15, {"merchant": _KNOWN,   "date": _d(-10),  "total": 1200, "items": _tobacco(),             "confidence": .95, "dup": None},    REJECTED_INELIGIBLE_CATEGORY), # rule 6 beats 7
        (16, {"merchant": _KNOWN,   "date": _d(-10),  "total": 300,  "items": _pharmacy(),            "confidence": .50, "dup": "exact"}, ESCALATE_LOW_CONFIDENCE),      # rule 2 beats 5
    ]

    passed = failed = 0
    for row_id, fields, expected in _MATRIX:
        got = verdict(fields, submission_date=_today)
        if got == expected:
            passed += 1
        else:
            print(f"  FAIL row {row_id:2d}:  expected={expected}  got={got}")
            failed += 1

    print(f"{passed}/{len(_MATRIX)} passed" + (f", {failed} failed" if failed else ""))
    if failed:
        raise SystemExit(1)
    print("All unit-test matrix rows pass.")
