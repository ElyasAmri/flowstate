# Demo

`run_demo.sh` runs the full Flowstate evaluation loop end to end and prints the
results, then optionally loads the example flows into a project so you can open
them in the app.

```bash
bash demo/run_demo.sh                  # full pipeline (parse → build → compile → score)
bash demo/run_demo.sh --load ../proj   # also copy example flows into ../proj/.flowstate
```

## What it does

1. **Parse** the two datasets (Road-Traffic Fines, Arabic-LJP) into blind
   samples + held-out keys (`eval/parse_rtf.py`, `eval/parse_ljp.py`).
2. **Build + validate** the three loop flows into `examples/`
   (`eval/build_flows.py`).
3. **Compile** them with the real Flowstate compiler and assert zero errors
   (`eval/compile_check.mjs`).
4. **Aggregate** the accumulated exceptions, the input the `flow-update` flow's
   shell node consumes (`eval/aggregate_exceptions.py`).
5. **Score** the model-in-the-loop classifications against the keys
   (`eval/score.py`).

Step 5 reuses the committed agent outputs in `eval/data/*_out.json`. To
regenerate those live (Claude standing in for Fanar), drive the agents as
described in `eval/README.md`, then re-run the script.

## Requirements

- `python3` with `pyarrow` (`pip install pyarrow`) for the Arabic parquet track.
- `node` + the repo's `node_modules` (for `esbuild`, used by the compiler check).
- The datasets under `datasets/` (gitignored; see `datasets/catalog.csv`).
