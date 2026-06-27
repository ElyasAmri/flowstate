// Run the loop's flows END-TO-END through the actual Flowstate interpreter
// (app/src/lib/flow/run/run.svelte.ts), proving they execute, not just compile:
//
//   flow-drafting  (initial draft):  event-log -> agent mine -> agent draft ->
//                  capture flow_json on the edge -> write to library.
//   flow-update    (periodic update): exception batch -> REAL shell aggregate ->
//                  agent proposes -> material? -> POLICY-MAKER HUMAN GATE ->
//                  approve/reject -> write updated / no change.
//   fine-management (major flow): routine pay/collection spine + a contested
//                  appeal that escalates to the PREFECTURE HUMAN GATE.
//
// Executors are deterministic (a stubbed agent + a real shell), so the run is
// reproducible with no API keys. The point under test is that the ENGINE walks
// the graph correctly: agent outcomes, edge captures, guards, the human gate
// suspend/resume, and the outbound channel outcome.
import { FlowRun } from "../app/src/lib/flow/run/run.svelte.ts";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT = process.cwd();
const FDIR = path.join(ROOT, "examples/flows");
const load = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

const channels = {};
for (const f of fs.readdirSync(path.join(FDIR, "channels")))
  { const c = load(path.join(FDIR, "channels", f)); channels[c.id] = c; }

const flows = {};
for (const f of ["flow-drafting", "fine-management-routine", "flow-update"])
  flows[f] = load(path.join(FDIR, `${f}.json`));
const resolveFlow = (id) => flows[id] ?? null;

// Deterministic agent: pick a canned reply by what the prompt asks for.
function stubAgent(prompt, verdict) {
  if (/event log|dominant|mine/i.test(prompt))
    return "The dominant routine path is create -> notify -> pay; appeals fork out.\nVERDICT: mined";
  if (/draft a Flowstate flow/i.test(prompt))
    return JSON.stringify({ id: "fine-management-routine", nodes: ["spine", "agent", "gate"], edges: 4 });
  if (/propose concrete updates/i.test(prompt))
    return `Add a pre-appeal check on article 7 (38% appeal rate) and a >300 amount band guard.\nVERDICT: ${verdict}`;
  return "VERDICT: ok";
}
function makeExec(verdict) {
  return {
    async runShell(cmd) {
      try { return { exit: 0, text: execSync(cmd, { shell: "/bin/bash", cwd: ROOT }).toString() }; }
      catch (e) { return { exit: e.status ?? 1, text: (e.stderr || e.stdout || "").toString() }; }
    },
    async runAgent(prompt) { return stubAgent(prompt, verdict); },
  };
}

const dump = (r) => r.trace.forEach((t, i) =>
  console.log(`   ${String(i + 1).padStart(2)}. [${t.kind.padEnd(8)}] ${t.label}  ::  ${t.detail}`));

let failures = 0;
function check(name, cond, detail) {
  console.log(`   ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`);
  if (!cond) failures++;
}
const entryOf = (flow) => flow.nodes.find((n) => n.id === flow.nodes[0].id).id;

// --------------------------------------------------------------------------- //
// 1. flow-drafting: linear, runs straight to "issued".
// --------------------------------------------------------------------------- //
console.log("\n=== flow-drafting (initial draft) ===");
{
  const r = new FlowRun(flows["flow-drafting"], makeExec(), { channels, resolveFlow });
  r.stepDelay = 0;
  await r.start("fd-in", {
    activities: "Create Fine, Send Fine, Payment, Add Penalty, Appeal to Prefecture, Judge",
    variant_stats: "97% pay-on-time; 3% appeal",
  });
  dump(r);
  check("run completed", r.status === "done", `status=${r.status}`);
  check("process_model captured from agent", typeof r.vars.process_model === "string" && r.vars.process_model.length > 0);
  check("flow_json captured on edge (not undefined)", typeof r.vars.flow_json === "string", `flow_json=${JSON.stringify(r.vars.flow_json)}`);
  check("flow_id named", r.vars.flow_id === "fine-management-routine");
  check("reached the outbound library write", r.trace.some((t) => t.label === "Write draft to library"));
}

// --------------------------------------------------------------------------- //
// 2. flow-update: shell aggregate -> agent -> material gate -> approve/reject.
// --------------------------------------------------------------------------- //
async function runUpdate(label, verdict, gateVerdict) {
  console.log(`\n=== flow-update (${label}) ===`);
  const r = new FlowRun(flows["flow-update"], makeExec(verdict), { channels, resolveFlow });
  r.stepDelay = 0;
  await r.start("fu-in", { cases: "eval/data/cases.jsonl" });
  console.log(`   status after first leg: ${r.status}`);
  if (r.status === "awaiting") {
    console.log(`   -- HUMAN GATE: "${r.pending.label}"  -> operator ${gateVerdict}s`);
    await r.resolve(gateVerdict);
  }
  dump(r);
  return r;
}
{
  // 2a. material change, policy maker APPROVES -> updated (must pass the gate).
  const r = await runUpdate("material -> approve", "material", "approve");
  check("reached the human gate then resumed", r.trace.some((t) => /awaiting human/.test(t.detail)), "gate fired");
  check("run completed", r.status === "done", `status=${r.status}`);
  check("outcome = updated", r.vars.outcome === "updated", `outcome=${r.vars.outcome}`);

  // 2b. material change, policy maker REJECTS -> no_change.
  const r2 = await runUpdate("material -> reject", "material", "reject");
  check("run completed", r2.status === "done", `status=${r2.status}`);
  check("outcome = no_change", r2.vars.outcome === "no_change", `outcome=${r2.vars.outcome}`);

  // 2c. minor change: never reaches the gate, routes straight to no_change.
  const r3 = await runUpdate("minor -> (no gate)", "minor", "approve");
  check("did NOT reach the gate", !r3.trace.some((t) => /awaiting human/.test(t.detail)), "no gate");
  check("run completed", r3.status === "done", `status=${r3.status}`);
  check("outcome = no_change", r3.vars.outcome === "no_change", `outcome=${r3.vars.outcome}`);
}

// --------------------------------------------------------------------------- //
// 3. fine-management (the major flow): routine spine + the appeal human gate.
// --------------------------------------------------------------------------- //
async function runFine(label, payload, gateVerdict) {
  console.log(`\n=== fine-management (${label}) ===`);
  const r = new FlowRun(flows["fine-management-routine"], makeExec(), { channels, resolveFlow });
  r.stepDelay = 0;
  await r.start("fm-door", payload);
  if (r.status === "awaiting") {
    console.log(`   -- HUMAN GATE: "${r.pending.label}"  -> bureaucrat ${gateVerdict}s`);
    await r.resolve(gateVerdict);
  }
  dump(r);
  return r;
}
{
  // 3a. routine, paid on time -> closed paid, no gate.
  const r = await runFine("routine, paid", { appeal_filed: false, paid: true }, "approve");
  check("did NOT reach the gate", !r.trace.some((t) => /awaiting human/.test(t.detail)), "no gate");
  check("outcome = paid", r.vars.outcome === "paid", `outcome=${r.vars.outcome}`);

  // 3b. routine, unpaid -> auto-forward to collection, no gate.
  const r2 = await runFine("routine, unpaid", { appeal_filed: false, paid: false }, "approve");
  check("outcome = collected", r2.vars.outcome === "collected", `outcome=${r2.vars.outcome}`);

  // 3c. contested, bureaucrat UPHOLDS the appeal -> appeal_upheld (via the gate).
  const r3 = await runFine("contested -> uphold", { appeal_filed: true, paid: false }, "approve");
  check("reached the human gate", r3.trace.some((t) => /awaiting human/.test(t.detail)), "gate fired");
  check("outcome = appeal_upheld", r3.vars.outcome === "appeal_upheld", `outcome=${r3.vars.outcome}`);

  // 3d. contested, bureaucrat REJECTS -> escalate to judge -> appeal_rejected.
  const r4 = await runFine("contested -> reject", { appeal_filed: true, paid: false }, "reject");
  check("escalated to judge", r4.trace.some((t) => t.label === "Escalate to judge"));
  check("outcome = appeal_rejected", r4.vars.outcome === "appeal_rejected", `outcome=${r4.vars.outcome}`);
}

console.log(`\n${failures === 0 ? "ALL META-FLOW RUNS PASSED" : failures + " CHECK(S) FAILED"}`);
process.exit(failures === 0 ? 0 : 1);
