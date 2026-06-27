// Autonomous screen recording of the REAL Flowstate app (no human at the
// keyboard). Playwright drives the running dev server and records the whole
// session to webm. It opens the "Government services loop" -- the full
// self-improving loop on one canvas -- and runs each region in turn; the app's
// live-run camera pans/zooms to follow whichever region is executing, and the
// run panel is a side drawer so the diagram stays visible the whole time.
//
//   1. Initial drafting (top-left):  event log -> mine -> draft -> library.
//   2. Running procedure (bottom):   intake -> validate -> agent -> HUMAN GATE
//                                    -> approve -> issued.
//   3. Periodic update (middle-top): exceptions -> aggregate -> policy lookup ->
//                                    propose -> POLICY-MAKER GATE -> approve.
//
// Prereq: dev server on http://localhost:1420 (npm run dev), run from repo root.
// Run:    node video/record-app.mjs
// Output: video/out/raw/flowstate-demo.webm  and  video/out/flowstate-demo.mp4
import { chromium } from "playwright";
import ffmpeg from "ffmpeg-static";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const RAW = path.join(process.cwd(), "video/out/raw");
fs.rmSync(RAW, { recursive: true, force: true });
fs.mkdirSync(RAW, { recursive: true });

const W = 1920, H = 1080;
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: W, height: H },
  deviceScaleFactor: 2,
  recordVideo: { dir: RAW, size: { width: W, height: H } },
});
const page = await context.newPage();
const pause = (ms) => page.waitForTimeout(ms);

// Fill a payload field by its label name, with visible typing.
async function fill(name, value) {
  const input = page.locator(`label:has-text("${name}") input`).first();
  await input.click();
  await input.type(value, { delay: 22 });
  await pause(300);
}

// Run one region: open its entry door, fill the payload, submit, optionally
// clear a human gate, hold on the outcome, then close + refit for the next one.
async function runRegion({ door, fields, gate }) {
  await page.getByText(door, { exact: true }).first().dblclick();
  await page.waitForSelector('[data-testid="run-start"]');
  await pause(700);
  for (const [name, value] of fields) await fill(name, value);
  await pause(400);
  await page.locator('[data-testid="run-start"]').click();
  if (gate) {
    await page.waitForSelector('[data-testid="approval"]', { timeout: 20000 });
    await pause(2600); // hold on the escalation so it reads
    await page.locator('[data-testid="approve"]').click();
  }
  await page.waitForSelector("text=Outcome:", { timeout: 20000 });
  await pause(2600); // hold on the outcome
  await page.getByRole("button", { name: "Close" }).first().click();
  await page.getByLabel("Fit to view").click();
  await pause(1400); // let the camera settle back to the whole loop
}

try {
  await page.goto("http://localhost:1420/", { waitUntil: "networkidle" });
  await pause(1500);
  await page.getByText("Government services loop").click();
  await page.waitForSelector("text=Mine process model");
  await page.getByLabel("Fit to view").click();
  await pause(3500); // zoom out and hold on the whole loop (meta-flows)

  // 1. Initial flow drafting -- drafts the routine procedure onto the canvas.
  await runRegion({
    door: "Process-mining feed",
    fields: [
      ["activities", "Create Fine, Send Fine, Payment, Appeal, Judge"],
      ["variant_stats", "97% pay-on-time; 3% appeal"],
    ],
  });

  // 2. The running procedure (drafted above) -- ambiguous proof -> human gate.
  await runRegion({
    door: "Application intake",
    fields: [
      ["national_id", "19283746"],
      ["applicant_name", "Ahmad Al-Test"],
      ["address_proof", "Lease lists a P.O. Box, not a street address; dates unclear."],
    ],
    gate: true,
  });

  // 3. Periodic flow update -- material change -> policy-maker gate -> adds a step.
  await runRegion({
    door: "Exception queue",
    fields: [["cases", "1,284 contested fines; article 7 appeals at 38%"]],
    gate: true,
  });

  // Final bookend: zoom out and hold on the whole loop -- all three flows plus
  // the step the update just added.
  await page.getByLabel("Fit to view").click();
  await pause(4000);
} catch (e) {
  console.log("ERROR:", e.message);
  await page.screenshot({ path: path.join(RAW, "ERR.png") }).catch(() => {});
} finally {
  await context.close();
  await browser.close();
}

const file = fs.readdirSync(RAW).find((f) => f.endsWith(".webm"));
const webm = path.join(RAW, "flowstate-demo.webm");
if (file) fs.renameSync(path.join(RAW, file), webm);
console.log(`recording saved: ${webm}`);

// Transcode the webm to a web-friendly H.264 mp4 (faststart) so it drops
// straight into a slide deck / player.
const mp4 = path.join(process.cwd(), "video/out/flowstate-demo.mp4");
execFileSync(ffmpeg, [
  "-y", "-i", webm,
  "-c:v", "libx264", "-preset", "slow", "-crf", "18",
  "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4,
], { stdio: "ignore" });
console.log(`mp4 saved: ${mp4}`);
