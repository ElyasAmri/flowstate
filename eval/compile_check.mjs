// Run the REAL Flowstate compiler (app/src/lib/flow/compile.ts) over the
// example flows, proving they compile to valid maestro YAML with no errors.
//
// Usage (from repo root):
//   node_modules/.bin/esbuild eval/compile_check.mjs --bundle --platform=node \
//     --format=esm --loader:.ts=ts --outfile=/tmp/cc.mjs && node /tmp/cc.mjs
// or simply:  bash demo/run_demo.sh   (which wraps this)
import { compileFlow } from "../app/src/lib/flow/compile.ts";
import fs from "node:fs";
import path from "node:path";

// Resolve from the repo root (the demo runner cd's here before bundling, so
// the bundled output's own path can't be relied on). Allow an override arg.
const root = process.argv[2] || process.cwd();
const base = path.join(root, "examples", "flows");

const registry = {};
for (const f of fs.readdirSync(path.join(base, "channels"))) {
  const c = JSON.parse(fs.readFileSync(path.join(base, "channels", f)));
  registry[c.id] = c;
}

let bad = 0;
for (const f of fs.readdirSync(base)) {
  if (!f.endsWith(".json")) continue;
  const flow = JSON.parse(fs.readFileSync(path.join(base, f)));
  const { yaml, errors } = compileFlow(flow, registry);
  const lines = (yaml || "").split("\n").length;
  console.log(`${errors.length ? "FAIL" : "ok  "}  ${flow.id.padEnd(26)} ` +
    `${flow.nodes.length} nodes -> ${lines} yaml lines` +
    (errors.length ? `  errors: ${errors.length}` : ""));
  for (const e of errors) { console.log("       - " + e); bad++; }
}
console.log(bad ? `\nCOMPILE ERRORS: ${bad}` : "\nALL FLOWS COMPILE CLEAN");
process.exit(bad ? 1 : 0);
