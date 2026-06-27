#!/usr/bin/env python3
"""policy_infer.py — bridge from extracted receipt fields (base64 JSON) to a
deterministic verdict.

The in-app runtime extracts a receipt's fields with a Fanar/Oryx agent and
passes them to this script as ``argv[1] = base64(UTF-8 JSON)``. We decode, then
derive the two inputs the policy cannot read off a single receipt:

  * the prior-claim duplicate result   — from data/ledger.json
  * the known-merchant registry        — from data/merchants.json

…and hand everything to :func:`policy.verdict`, which owns the verdict
precedence. The precedence is the contract and is NOT reimplemented here — this
script only prepares inputs and prints the resulting verdict string.

Usage
-----
  python eval/policy_infer.py <base64-json>
  FLOWSTATE_TODAY=2026-06-27 python eval/policy_infer.py <base64-json>   # fixed "today"

The date window check uses today's date by default; set ``FLOWSTATE_TODAY`` to a
``YYYY-MM-DD`` string for reproducible / demoable runs.
"""
from __future__ import annotations

import base64
import json
import os
import sys
from datetime import date, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
sys.path.insert(0, HERE)

import policy  # single source of truth for the verdict precedence  # noqa: E402


def _today() -> date:
    """Submission date for the window check: ``FLOWSTATE_TODAY`` or real today."""
    raw = os.environ.get("FLOWSTATE_TODAY", "").strip()
    return datetime.fromisoformat(raw).date() if raw else date.today()


def _load_json(name: str, default):
    """Read a JSON file from data/, returning *default* if absent or malformed."""
    try:
        with open(os.path.join(DATA, name), encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return default


def _norm(s) -> str:
    return str(s if s is not None else "").strip().lower()


def _register_merchants() -> None:
    """Union the data/merchants.json registry into policy's known-merchant set.

    policy.verdict reads the module-level KNOWN_MERCHANTS at call time, so this
    makes merchants.json the effective registry while leaving the precedence in
    policy.py untouched. Names accepted as a JSON array or ``{"merchants": [..]}``.
    """
    raw = _load_json("merchants.json", [])
    if isinstance(raw, dict):
        names = raw.get("merchants", [])
    elif isinstance(raw, list):
        names = raw
    else:
        names = []
    policy.KNOWN_MERCHANTS |= {_norm(n) for n in names if str(n).strip()}


def _dup_result(fields: dict):
    """Duplicate check against the prior-claim ledger (data/ledger.json).

    Returns the value policy.verdict expects for its ``dup`` field:
      "exact" — same receipt_no, OR same merchant+date+total, as a prior claim.
      "fuzzy" — same merchant+date as a prior claim but a different total.
      None    — no prior match.
    """
    ledger = _load_json("ledger.json", [])
    if not isinstance(ledger, list):
        return None
    rno, merch, dt = _norm(fields.get("receipt_no")), _norm(fields.get("merchant")), _norm(fields.get("date"))
    total = fields.get("total")
    for entry in ledger:
        if not isinstance(entry, dict):
            continue
        if rno and rno == _norm(entry.get("receipt_no")):
            return "exact"
        if merch and dt and merch == _norm(entry.get("merchant")) and dt == _norm(entry.get("date")):
            e_total = entry.get("total")
            if total is not None and e_total is not None and float(total) == float(e_total):
                return "exact"
            return "fuzzy"
    return None


def infer(fields: dict, today: date) -> str:
    """Prepare the derived inputs and return policy.verdict's string."""
    # The agent's field is named `unrecognized`; policy reads `unparseable`.
    if "unparseable" not in fields and "unrecognized" in fields:
        fields["unparseable"] = bool(fields.get("unrecognized"))
    _register_merchants()
    fields["dup"] = _dup_result(fields)
    return policy.verdict(fields, submission_date=today)


def main(argv: list[str]) -> int:
    if len(argv) < 2 or not argv[1].strip():
        # No payload to judge — same outcome as an unreadable layout.
        print(policy.ESCALATE_UNRECOGNIZED_FORMAT)
        return 0
    try:
        fields = json.loads(base64.b64decode(argv[1]).decode("utf-8"))
        if not isinstance(fields, dict):
            raise ValueError("payload is not a JSON object")
    except Exception:
        # Undecodable base64 / non-JSON payload: treat as an unparseable layout.
        print(policy.ESCALATE_UNRECOGNIZED_FORMAT)
        return 0
    print(infer(fields, _today()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
