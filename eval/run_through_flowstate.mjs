// Run a real case END-TO-END through the actual Flowstate interpreter
// (app/src/lib/flow/run/run.svelte.ts), with the agent node wired to a real
// model (DeepSeek). Proves the judgment happens INSIDE the engine: intake ->
// shell ID-check -> agent judgment -> decision branch -> human gate (suspend +
// resume) -> nested draft flow -> outcome.
import { FlowRun } from "../app/src/lib/flow/run/run.svelte.ts";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const fdir = path.join(process.cwd(), "app/src-tauri/.flowstate");
const load = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const channels = {};
for (const f of fs.readdirSync(path.join(fdir, "channels"))) {
  const c = load(path.join(fdir, "channels", f));
  channels[c.id] = c;
}
const flow = load(path.join(fdir, "flows/residence-certificate-runnable.json"));
const draft = load(path.join(fdir, "flows/draft-decision-letter.json"));
const resolveFlow = (id) => (id === "draft-decision-letter" ? draft : null);

const KEY = process.env.OPENAI_API_KEY;
async function model(prompt) {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-5.5", messages: [{ role: "user", content: prompt }],
                           max_completion_tokens: 4000 }),
  });
  return (await r.json()).choices[0].message.content;
}

const exec = {
  async runShell(cmd) {
    try { return { exit: 0, text: execSync(cmd, { shell: "/bin/bash" }).toString() }; }
    catch (e) { return { exit: e.status ?? 1, text: (e.stderr || e.stdout || "").toString() }; }
  },
  async runAgent(prompt, ref) {
    console.log(`   >> agent node [${ref || "agent"}] calls the model (live gpt-5.5)...`);
    return await model(prompt);
  },
};

function dumpTrace(run) {
  run.trace.forEach((t, i) => console.log(`   ${i + 1}. [${t.kind.padEnd(8)}] ${t.label}  ::  ${t.detail}`));
}

const run = new FlowRun(flow, exec, { channels, resolveFlow });
run.stepDelay = 0;
const entry = flow.nodes.find((n) => n.id === "n-input");
const payload = {
  national_id: "19283746",
  applicant_name: "Ahmad Al-Test",
  address_proof: "A current lease contract showing exactly the stated address, but the contract is in the applicant's father's name; the applicant lives there as a family member.",
};
console.log("=== Running residence-certificate flow through the REAL Flowstate interpreter ===");
console.log("payload:", JSON.stringify(payload));
await run.start(entry.id, payload);
console.log(`\nstatus after first leg: ${run.status}`);
dumpTrace(run);

if (run.status === "awaiting") {
  console.log(`\n-- HUMAN GATE reached: "${run.pending.label}"`);
  console.log(`   prompt: ${run.pending.prompt.slice(0, 120)}...`);
  console.log("   operator APPROVES -> resuming the run inside the engine");
  await run.resolve("approve");
  console.log(`\nstatus after resume: ${run.status}`);
  dumpTrace(run);
}
console.log(`\nfinal outcome var: ${run.vars.outcome}`);
console.log(`draft_letter var present: ${typeof run.vars.draft_letter === "string"}`);
if (typeof run.vars.draft_letter === "string")
  console.log(`draft letter (first 200): ${run.vars.draft_letter.slice(0, 200)}`);
console.log(`\nENGINE RUN ${run.status === "done" ? "COMPLETED" : "ENDED: " + run.status}`);
