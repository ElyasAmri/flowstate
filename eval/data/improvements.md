# Closing the loop: non-routine (appealed) fine cases

All figures computed directly over `eval/data/cases.jsonl` (150,370 cases total;
4,567 labelled `non_routine`).

## Data summary

- **Volume:** 4,567 appeals = ~3.0% of all fines.
- **Appeal path (sub-paths):**
  - 4,141 (90.7%) file *Send Appeal to Prefecture* — the prefecture is the entry point for nearly every appeal.
  - 999 receive a *Receive Result Appeal from Prefecture*; of those only **170 (17.0%) escalate to Appeal to Judge**, while **829 stop at the prefecture**.
  - 555 total reach *Appeal to Judge* (12.2% of appeals).
  - 156 appeals (3.4%) never got an *Insert Fine Notification* / *Add penalty* before being contested.
- **Outcome signals (derived from activities):**
  - 779 appeals (17.1%) end with a *Payment* (offender ultimately pays — appeal effectively unsuccessful or conceded), including 254 that paid *after* reaching the judge.
  - 415 (9.1%) go to *Send for Credit Collection* (unpaid).
  - 896 (19.6%) get *Notify Result Appeal to Offender*.
- **Who appeals (attrs):**
  - Articles: **157 (1,589), 7 (1,003), 158 (959), 142 (583)** dominate by raw count, but appeal *rate* climbs steeply for niche articles: 142 = **10.1%**, 146 = **20.9%**, 23 = **24.5%**, 191 = **29.4%** vs ~2.3% for 157/7.
  - Amount: appealed median 36.0 / mean 69.6 vs overall median 35.0 / mean 44.7. Appeal rate rises with amount: ≤€35 = **2.16%**, €36–100 = 3.31%, €101–300 = **11.0%**, >€300 = **11.9%**.
  - Points: 86% of appeals have 0 points, but appeal *rate* by points is far higher when points exist: 0 pts = 2.68%, 2 pts = **16.2%**, 5 pts = **19.5%**, 6 pts = **27.3%**.
  - Dismissal flag is effectively unused (4,562 of 4,567 = NIL).

**Read:** appeals are driven less by the high-volume small fines and more by *high-amount, points-bearing, and specific-article* fines. The prefecture already absorbs 83% of appeals without judge escalation, so the leverage is (a) pre-empting predictable appeals and (b) routing the small minority that will escalate.

## Proposed flow updates

### 1. Pre-appeal validation agent on the notification path
156 appeals (3.4%) reach contest with **no Insert Fine Notification / Add penalty** recorded — a process gap offenders exploit. Add an agent node after *Send Fine* that verifies notification + penalty were correctly inserted before the fine becomes contestable.
**Expected effect:** removes the procedural-defect basis for ~3.4% of appeals (~156/yr), and cleans the data feeding every downstream guard.

### 2. Decision guard: high-amount / points fines get a documentation channel
Appeal rate jumps from 2.16% (≤€35) to **11.0–11.9%** above €100, and from 2.68% (0 pts) to **16–27%** when points are attached. Add a guard `amount > 100 OR points > 0` that routes the fine through an evidence-attachment channel (photo/sensor proof bundled at issue time).
**Expected effect:** targets the ~834 appeals (708 over €100 + points cases) where appeals concentrate; pre-loaded evidence is expected to deflect a meaningful share at the prefecture stage where 83% already resolve.

### 3. Article-specific triage node for high-rate articles
Articles 142/146/23/191/20 carry **10–29% appeal rates** vs ~2.3% baseline. Route these article codes to a dedicated review agent that checks issuance correctness before sending.
**Expected effect:** article 142 alone is 583 appeals at 10.1%; correcting issuance on these high-rate articles addresses ~766 appeals (142+146+23+191+20) concentrated in <2% of fine volume.

### 4. Prefecture-resolution fast-track (threshold tweak)
Only **17.0%** of prefecture results escalate to the judge; 829 cases stop at the prefecture. Add an auto-resolve guard: when the prefecture result is returned and `amount ≤ 35 AND points = 0`, auto-close/notify without holding a judge slot.
**Expected effect:** ~1,872 of appeals sit in the ≤€35 bucket (2.16% rate, lowest escalation propensity); auto-closing these frees judge capacity for the 170 cases that truly escalate.

### 5. Outcome feedback loop to the routine flow
779 appeals (17.1%) end in *Payment* (appeal unsuccessful/conceded) and 415 (9.1%) in *Credit Collection*. Wire *Receive/Notify Result Appeal* outcomes back as a labelled signal so the routine flow learns which (article, amount, points) combinations produce appeals that the offender ultimately loses.
**Expected effect:** lets guards #2/#3 be tuned on realized outcomes rather than appeal counts, converging the authored flow on the ~17% of contests that were never going to succeed.
