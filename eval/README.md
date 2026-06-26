# Evaluation harness

Scripts and artifacts behind section 5 of the [README](../README.md). The agent
node is driven live by Claude as a stand-in for Fanar (one OpenAI-compatible
config entry; swapping in Fanar is a config change, not code). Scoring is done
by script against a held-out key, never by the model.

## Scripts

| Script | Role |
| --- | --- |
| `parse_rtf.py` | Road-Traffic Fines XES → per-case traces, routine/non-routine ground truth, blind sample |
| `parse_ljp.py` | Arabic-LJP parquet → verdict labels (accept/reject/route), Arabic blind sample |
| `build_flows.py` | author + validate the three loop flows into `examples/` |
| `compile_check.mjs` | run the real `compileFlow` over the example flows (asserts 0 errors) |
| `aggregate_exceptions.py` | appeal-rate aggregates over the exceptions (input to `flow-update`) |
| `score.py` | score the model classifications vs. the held-out keys |

Run everything with `bash demo/run_demo.sh`.

## Data (`eval/data/`)

`*_blind.json` are model inputs (no labels); `*_key.json` are the held-out
answer keys; `*_out.json` are the model's committed predictions; `scores.json`
is the computed metrics. `mined_flow.md` and `improvements.md` are the flow-
mining and improvement-proposal outputs. `cases.jsonl` (42 MB, gitignored) is
the full per-case derived log.

## Regenerating the model outputs live

The committed `classify_out.json`, `ljp_out.json`, `mined_flow.md`, and
`improvements.md` were produced by Claude subagents acting as the agent node.
To regenerate, give a model the corresponding blind input + the task prompt:

- **classify** — `sample_blind.json` + the conformance spec (routine spine incl.
  credit collection; appeals are exceptions) → `{id, decision, reason}` per case.
- **ljp** — `ljp_blind.json` + the accept/reject/route spec → one decision per case.
- **mine** — `stats.json` → a draft flow (prose + mermaid).
- **improve** — the non-routine cases → data-backed flow updates.

Then `python3 eval/score.py` re-scores against the keys.
