#!/usr/bin/env bash
# End-to-end Flowstate evaluation demo. Runs the whole loop from raw datasets
# to scored results and verified flows. Safe to re-run; writes only under eval/
# and examples/.
#
#   bash demo/run_demo.sh            # full pipeline
#   bash demo/run_demo.sh --load DIR # also copy the example flows into
#                                     # DIR/.flowstate so the app can open them
set -euo pipefail
cd "$(dirname "$0")/.."   # repo root

say() { printf '\n\033[1m== %s\033[0m\n' "$1"; }

say "1/6  Parse datasets (Road-Traffic Fines + Arabic-LJP) into blind samples"
python3 eval/parse_rtf.py >/dev/null
python3 eval/parse_ljp.py >/dev/null
echo "   stats: $(python3 -c "import json;s=json.load(open('eval/data/stats.json'));print(f\"{s['total_cases']} cases, {s['routine_pct']}% routine / {s['non_routine_pct']}% exceptions\")")"

say "2/6  Build + validate the three loop flows (examples/flows)"
python3 eval/build_flows.py

say "3/6  Compile the flows with the REAL Flowstate compiler"
node_modules/.bin/esbuild eval/compile_check.mjs --bundle --platform=node \
  --format=esm --loader:.ts=ts --outfile=".cc.tmp.mjs" --log-level=error
node ".cc.tmp.mjs"; rm -f ".cc.tmp.mjs"

say "4/6  Aggregate the accumulated exceptions (feeds the flow-update flow)"
python3 eval/aggregate_exceptions.py || true

say "5/6  Run the meta-flows END-TO-END through the real interpreter"
node_modules/.bin/esbuild eval/run_meta_flows.mjs --bundle --platform=node \
  --format=esm --loader:.ts=ts \
  --banner:js="globalThis.\$state=(v)=>v;globalThis.\$state.snapshot=(v)=>v;globalThis.\$derived=(v)=>v;globalThis.\$derived.by=(f)=>f();globalThis.\$effect=()=>{};globalThis.\$effect.root=(f)=>f();" \
  --outfile=".mf.tmp.mjs" --log-level=error
node ".mf.tmp.mjs"; rm -f ".mf.tmp.mjs"

say "6/6  Score the model-in-the-loop classifications against the held-out keys"
# Re-uses the committed agent outputs (eval/data/*_out.json). To regenerate
# them live, drive the agents per eval/README.md, then re-run this step.
python3 eval/score.py

if [ "${1:-}" = "--load" ] && [ -n "${2:-}" ]; then
  dest="$2/.flowstate"
  say "Loading example flows into $dest"
  mkdir -p "$dest/flows" "$dest/channels"
  cp examples/flows/*.json "$dest/flows/"
  cp examples/flows/channels/*.json "$dest/channels/"
  echo "   copied 3 flows + 9 channels; open the app against $2 to edit/run them"
fi

say "Demo complete"
