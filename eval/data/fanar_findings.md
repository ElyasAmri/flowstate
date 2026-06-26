# Live Fanar validation (QCRI/Fanar-2-27B-Instruct)

Both eval tracks were re-run live against the real Fanar model, self-hosted on
RunPod via vLLM (OpenAI-compatible endpoint). Claude was the cross-check. The
model swap was a one-line config change (`base_url` + `model` + key), no code
change. Scripts: `eval/run_fanar.py`, `eval/_fanar_sweep.py`,
`eval/_fanar_abstain.py`, `eval/_fanar_metaflows.py`.

## Headline results

| Track | Fanar | Claude (cross-check) |
| --- | --- | --- |
| Road-traffic conformance (routine vs non-routine, 60 blind) | **100%** | 100% |
| Arabic-LJP verdict (50 blind, full facts) | **90%** | 92% |

Road-traffic conformance: Fanar matches Claude exactly (60/60).

Arabic-LJP, fair head-to-head on the SAME full facts: **Fanar 90%, Claude 92%**,
essentially on par. (Claude's earlier 86% was on the clipped facts, so the
clipped-vs-full comparison was unfair; both re-run on full facts here.) Both
share the same residual error mode (`reject -> accept`). The path to 90% is
below.

## Arabic-LJP lever sweep (50 blind cases)

| Config | Accuracy |
| --- | --- |
| terse one-line answer (reasoning suppressed) | 66% |
| brief reasoning | 74% |
| few-shot (3 exemplars) | 66% (hurt; over-anchored to accept) |
| self-consistency (n=5, majority vote) | 74% (no gain) |
| **full untruncated facts** | **90%** |
| few-shot + full + self-consistency | 90% |

**The dominant lever was not handicapping the input.** Earlier runs clipped the
Arabic facts to 1800 chars, which removed the part of the case that determines a
rejection; with full facts Fanar jumps to 90% (reject recall 12->16/20, route
7->10/10). Few-shot and self-consistency added nothing.

## Other findings

- **Fanar-2-27B is a reasoning model** (emits `<think>`). Forcing terse output
  truncates the answer before the verdict. `/no_think`, `enable_thinking=false`,
  and a "answer directly" system prompt were all tried and do NOT suppress it;
  reasoning is mandatory. The harness must budget tokens and parse the verdict
  after `</think>`.
- **Self-reported confidence is uninformative.** Asked for a confidence, Fanar
  returned `high` on all 50 cases including the wrong ones, so it cannot drive
  abstention. A real gate trigger needs logprobs / ensemble disagreement.
- **Arabic generation is strong.** When it completes, Fanar produces clean
  formal Arabic decision letters and accurate JSON extraction from Arabic facts
  (`eval/data/fanar_arabic_gen.json`).
- **Meta-flows work on Fanar.** Given token headroom (4096), Fanar mined a draft
  flow and proposed data-grounded improvements comparable to Claude
  (`eval/data/fanar_mined.md`, `eval/data/fanar_improvements.md`).

## Levers exhausted

reasoning vs terse, token scaling, `/no_think` suppression, procedural-aware
prompt, few-shot, self-consistency / majority vote, full untruncated facts,
robust verdict extraction, and self-reported + sampling-based abstention.
