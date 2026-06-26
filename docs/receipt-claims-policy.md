# Receipt-claims policy

The deterministic decision contract for the **expense-reimbursement / subsidy
claim** procedure flowstate demonstrates on the [CORU / ReceiptSense]
receipt-understanding dataset. A citizen uploads a receipt; the flow extracts
its fields with Fanar (vision + Arabic), then this policy maps those fields to a
verdict. Most claims resolve automatically; the genuine exceptions escalate to a
human.

This document is the source of truth for the **policy layer** (the deterministic
function `verdict = policy(fields)`). It is authored, not learned — the
parameters below are illustrative of what a real ministry would set, and the
demo states them as such.

## Why a deterministic policy

A verdict is `policy(extraction(receipt))`. Only `extraction` (Fanar reading the
receipt) is uncertain and model-driven; `policy` is a pure function. That split
is deliberate:

- The uncertain part (extraction) is validated against CORU's ground-truth
  annotations (see [Validation](#validation)).
- The deterministic part (policy) is proven by unit tests, not labelled data —
  given correct fields, the verdict is correct by construction.

Determinism is what makes a decision replayable and appealable: the same fields
always yield the same verdict, and the reason is the rule that fired.

## Inputs (from CORU)

Each claim carries the fields CORU actually provides per receipt:

| Field        | Source                         | Notes                                  |
| ------------ | ------------------------------ | -------------------------------------- |
| `merchant`   | key-info detection / OCR       | vendor name                            |
| `date`       | key-info detection / OCR       | transaction date                       |
| `receipt_no` | key-info detection / OCR       | receipt number (duplicate key)         |
| `items[]`    | information extraction (CSV)   | each: `name`, `price`, `qty`, `category`, `brand` |
| `total`      | key-info detection / OCR       | claimed amount                         |
| `tax`        | OCR / QA                       | optional                               |
| `confidence` | extraction step (per field)    | model confidence, 0..1                 |
| `lang`       | dataset                        | ar (53.6%) / en / mixed                |

The Arabic item `category` is the field where Fanar is expected to beat a generic
model — mapping an Arabic product name (`حليب`, `دواء`, `بنزين`) to a policy
category is the judgement call the eval measures.

## Policy parameters

```
CLAIM_WINDOW_DAYS     = 90          # receipt date within 90d of submission, not future
PER_CLAIM_CAP         = 1000 QAR    # max reimbursable total
BORDERLINE_BAND       = 0.05        # within ±5% of cap → human review
MIN_FIELD_CONFIDENCE  = 0.70        # per-field extraction confidence floor
ELIGIBLE_CATEGORIES   = { pharmacy, medical, clinic, optical }
INELIGIBLE_CATEGORIES = { tobacco, alcohol, electronics, gift_card, luxury }
KNOWN_MERCHANTS       = <vendor registry>
```

## Verdicts

### Auto-terminal (routine, ~90%)

| Verdict                        | Meaning                                             |
| ------------------------------ | --------------------------------------------------- |
| `APPROVED`                     | all checks pass                                     |
| `REJECTED_MISSING_FIELDS`      | merchant / date / total / ≥1 item absent            |
| `REJECTED_OUT_OF_WINDOW`       | date in the future or older than the claim window   |
| `REJECTED_DUPLICATE`           | exact prior claim (same `receipt_no`, or same `merchant`+`date`+`total`) |
| `REJECTED_INELIGIBLE_CATEGORY` | **all** items in ineligible categories              |
| `REJECTED_OVER_CAP`            | total exceeds the per-claim cap                     |

### Escalate to human gate (edge ~5% + novel ~5%)

| Verdict                       | Bucket | Trigger                                            |
| ----------------------------- | ------ | -------------------------------------------------- |
| `ESCALATE_MIXED_BASKET`       | edge   | some items eligible, some ineligible               |
| `ESCALATE_BORDERLINE`         | edge   | total within ±`BORDERLINE_BAND` of cap, or currency ambiguous |
| `ESCALATE_DUPLICATE_SUSPECT`  | edge   | fuzzy match to a prior claim (different `receipt_no`) |
| `ESCALATE_UNKNOWN_MERCHANT`   | novel  | vendor not in `KNOWN_MERCHANTS`                     |
| `ESCALATE_LOW_CONFIDENCE`     | novel  | any required field below `MIN_FIELD_CONFIDENCE`    |
| `ESCALATE_UNRECOGNIZED_FORMAT`| novel  | layout unparseable → logged as a new pattern       |

### Post-gate (human resolves an escalation)

| Verdict                | Meaning                          |
| ---------------------- | -------------------------------- |
| `APPROVED_BY_OPERATOR` | human approved an escalated claim |
| `REJECTED_BY_OPERATOR` | human rejected an escalated claim |

## Evaluation order

Strict precedence; **first match wins**. The order is the contract — it is what
keeps the policy deterministic, and the precedence tests below pin it so a
refactor cannot silently reorder checks.

```
1. extraction unparseable          → ESCALATE_UNRECOGNIZED_FORMAT
2. any required field < confidence  → ESCALATE_LOW_CONFIDENCE
3. missing required field           → REJECTED_MISSING_FIELDS
4. date out of window / future      → REJECTED_OUT_OF_WINDOW
5. exact duplicate                  → REJECTED_DUPLICATE
   fuzzy duplicate                  → ESCALATE_DUPLICATE_SUSPECT
6. all items ineligible             → REJECTED_INELIGIBLE_CATEGORY
   mixed eligible / ineligible      → ESCALATE_MIXED_BASKET
7. total > cap                      → REJECTED_OVER_CAP
   total within ±band of cap        → ESCALATE_BORDERLINE
8. merchant not in registry         → ESCALATE_UNKNOWN_MERCHANT
9. otherwise                        → APPROVED
```

Required fields (rules 2–3): `merchant`, `date`, `total`, and at least one item.

## Unit-test matrix

Every branch plus the precedence pairs. Columns are the claim's fields; `date(Δ)`
is days relative to submission (negative = past); `conf` is the minimum per-field
confidence; `dup` is the duplicate-check result.

| #  | merchant | date(Δ) | total | items (category)   | conf | dup   | → expected                     |
| -- | -------- | ------- | ----- | ------------------ | ---- | ----- | ------------------------------ |
| 1  | known    | -10     | 300   | pharmacy           | .95  | no    | `APPROVED`                     |
| 2  | known    | -10     | 1200  | pharmacy           | .95  | no    | `REJECTED_OVER_CAP`            |
| 3  | known    | -10     | 980   | pharmacy           | .95  | no    | `ESCALATE_BORDERLINE`          |
| 4  | known    | -200    | 300   | pharmacy           | .95  | no    | `REJECTED_OUT_OF_WINDOW`       |
| 5  | known    | +3      | 300   | pharmacy           | .95  | no    | `REJECTED_OUT_OF_WINDOW` (future) |
| 6  | known    | -10     | 300   | tobacco            | .95  | no    | `REJECTED_INELIGIBLE_CATEGORY` |
| 7  | known    | -10     | 300   | pharmacy + tobacco | .95  | no    | `ESCALATE_MIXED_BASKET`        |
| 8  | known    | -10     | 300   | pharmacy           | .95  | exact | `REJECTED_DUPLICATE`           |
| 9  | known    | -10     | 300   | pharmacy           | .95  | fuzzy | `ESCALATE_DUPLICATE_SUSPECT`   |
| 10 | unknown  | -10     | 300   | pharmacy           | .95  | no    | `ESCALATE_UNKNOWN_MERCHANT`    |
| 11 | known    | -10     | 300   | pharmacy           | .50  | no    | `ESCALATE_LOW_CONFIDENCE`      |
| 12 | known    | -10     | —     | (missing total)    | .95  | no    | `REJECTED_MISSING_FIELDS`      |
| 13 | —        | —       | —     | garbage layout     | .20  | no    | `ESCALATE_UNRECOGNIZED_FORMAT` |
| **Precedence checks** |||||||                                                   |
| 14 | unknown  | -200    | 300   | pharmacy           | .95  | no    | `REJECTED_OUT_OF_WINDOW` (rule 4 beats 8) |
| 15 | known    | -10     | 1200  | tobacco            | .95  | no    | `REJECTED_INELIGIBLE_CATEGORY` (rule 6 beats 7) |
| 16 | known    | -10     | 300   | pharmacy           | .50  | exact | `ESCALATE_LOW_CONFIDENCE` (rule 2 beats 5) |

## Routine / edge / novel coverage

The verdict set maps onto the target case distribution:

- **Routine (~90%)** — auto approve/reject: rows 1, 2, 4, 5, 6, 8, 12.
- **Edge (~5%)** — `ESCALATE_MIXED_BASKET`, `ESCALATE_BORDERLINE`,
  `ESCALATE_DUPLICATE_SUSPECT`: rows 3, 7, 9.
- **Novel (~5%)** — `ESCALATE_UNKNOWN_MERCHANT`, `ESCALATE_LOW_CONFIDENCE`,
  `ESCALATE_UNRECOGNIZED_FORMAT`: rows 10, 11, 13. The `UNRECOGNIZED_FORMAT`
  bucket is logged as a new pattern — the "5% unidentified" path.

## Validation

The verdict decomposes into two independently verifiable parts:

1. **Extraction — against CORU ground truth.** Field accuracy
   (merchant/date/total/item/price/qty), Arabic item→category accuracy (vs CORU's
   `category` column — the Fanar-vs-baseline number), and OCR CER/WER on the
   Arabic vs English subsets. This is the only model-driven step and the source
   of any end-to-end error.

2. **Policy — by unit tests.** The matrix above covers every branch and the
   precedence pairs. Given correct fields the verdict is correct by construction;
   no labelled verdicts are required.

3. **End-to-end — a small human gold set.** ~50–100 CORU receipts hand-labelled
   with the verdict the policy *should* give (measure inter-annotator agreement
   to confirm the policy is unambiguous). Run the flow, compare, and attribute
   each miss to extraction (step 1) or a policy gap (step 2).

The metric that sells the value proposition is **escalation quality**: the
false-auto-approve rate (a bad claim wrongly auto-approved — must be ~0), the
escalation recall (every problem case reaches the gate), and the auto-approve
rate on clean claims (the efficiency story). Each operator decision at the gate
also produces a freshly labelled verdict, growing an eval set over time.

[CORU / ReceiptSense]: https://huggingface.co/datasets/abdoelsayed/CORU
</content>
