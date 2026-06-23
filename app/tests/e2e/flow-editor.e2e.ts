// tauri-driver e2e: the visual flow editor, end to end through the REAL binary.
//
// Drives the built Tauri app (WebView2) via tauri-driver + msedgedriver, exercising
// the full native command surface with no mocks:
//   project_dir -> read_flow (load on mount) -> autosave: write_flow
//   -> (disk proof) -> read_flow round-trip, plus the canvas palette.
//
// Standalone webdriverio (no @wdio/cli): we spawn tauri-driver ourselves and own
// setup/teardown, which is the most robust shape on Windows. Runs under Bun:
//   npm --prefix app run test:e2e        (-> bun tests/e2e/flow-editor.e2e.ts)
// Not picked up by svelte-check (tsconfig = src/**).
// Prereqs (staged out-of-tree, see tests/e2e/README.md):
//   - tauri-driver on PATH (cargo install tauri-driver) or TAURI_DRIVER_PATH
//   - a msedgedriver whose MAJOR matches the installed WebView2 runtime
//     (MSEDGEDRIVER_PATH must point at it -- no bundled default)
//   - a built binary: npm run tauri build -- --debug --no-bundle
// Windows/Linux only (macOS WKWebView has no WebDriver).

import { remote } from "webdriverio";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, rmSync, readFileSync, readdirSync } from "node:fs";
import { strict as assert } from "node:assert";
import { fileURLToPath } from "node:url";
import path from "node:path";
import net from "node:net";
import os from "node:os";

type Browser = Awaited<ReturnType<typeof remote>>;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// tests/e2e -> app -> repo root.
const repoRoot = path.resolve(__dirname, "../../..");
const isWin = os.platform() === "win32";
const exe = (p: string) => (isWin ? `${p}.exe` : p);

// The debug binary is named after the Cargo package: "flowstate".
const APP =
  process.env.FLOWSTATE_APP_BINARY ||
  path.join(repoRoot, "app/src-tauri/target/debug", exe("flowstate"));
// No bundled default: the host supplies the staged msedgedriver path.
const EDGEDRIVER = process.env.MSEDGEDRIVER_PATH || "";
const TAURI_DRIVER =
  process.env.TAURI_DRIVER_PATH || path.join(os.homedir(), ".cargo/bin", exe("tauri-driver"));
const SANDBOX = process.env.FLOWSTATE_PROJECT_DIR || path.join(repoRoot, ".local/e2e-sandbox");
const PORT = 4444;

// The fixture the editor opens on; persisted as flows/<id>.json.
const FLOW_ID = "residence-certificate-runnable";

function fail(msg: string): never {
  console.error(`[e2e] FAIL: ${msg}`);
  process.exitCode = 1;
  throw new Error(msg);
}
const log = (m: string) => console.log(`[e2e] ${m}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Resolve once tauri-driver is accepting connections on PORT.
async function waitForPort(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const ok = await new Promise<boolean>((res) => {
      const s = net.connect(port, "127.0.0.1");
      s.on("connect", () => (s.destroy(), res(true)));
      s.on("error", () => res(false));
    });
    if (ok) return;
    if (Date.now() > deadline) fail(`tauri-driver did not open port ${port} within ${timeoutMs}ms`);
    await sleep(200);
  }
}

// Poll an async predicate until it returns truthy (or time out).
async function waitFor(
  label: string,
  fn: () => Promise<unknown>,
  timeoutMs = 20000,
  every = 300,
): Promise<unknown> {
  const deadline = Date.now() + timeoutMs;
  let last: unknown;
  for (;;) {
    try {
      last = await fn();
      if (last) return last;
    } catch (e) {
      last = String(e);
    }
    if (Date.now() > deadline) fail(`timeout waiting for ${label} (last=${JSON.stringify(last)})`);
    await sleep(every);
  }
}

const bodyText = (b: Browser): Promise<string> => b.execute(() => document.body.innerText || "");

// Read the data-testid="flow-counts" text, e.g. "8 nodes · 10 transitions".
const countsText = async (b: Browser): Promise<string> =>
  (await (await b.$('[data-testid="flow-counts"]')).getText()).trim();

async function main(): Promise<void> {
  for (const [name, p] of [
    ["app binary", APP],
    ["msedgedriver", EDGEDRIVER],
    ["tauri-driver", TAURI_DRIVER],
  ] as const) {
    if (!p) fail(`${name} path is empty (set the corresponding env var)`);
    if (!existsSync(p)) fail(`${name} not found at ${p}`);
  }
  // Fresh, empty sandbox so the flow library starts known-empty.
  rmSync(SANDBOX, { recursive: true, force: true });
  mkdirSync(SANDBOX, { recursive: true });
  process.env.FLOWSTATE_PROJECT_DIR = SANDBOX; // inherited by tauri-driver -> flowstate.exe
  log(`sandbox = ${SANDBOX}`);

  log(`spawning tauri-driver (${TAURI_DRIVER}) --native-driver ${EDGEDRIVER}`);
  const driver: ChildProcess = spawn(
    TAURI_DRIVER,
    ["--port", String(PORT), "--native-driver", EDGEDRIVER],
    { stdio: ["ignore", "inherit", "inherit"], env: process.env },
  );
  driver.on("exit", (c) => log(`tauri-driver exited (code ${c})`));

  let browser: Browser | undefined;
  try {
    await waitForPort(PORT, 15000);
    log("tauri-driver is up; opening session against the app binary");
    browser = await remote({
      hostname: "127.0.0.1",
      port: PORT,
      path: "/",
      logLevel: "error",
      connectionRetryCount: 3,
      connectionRetryTimeout: 120000,
      capabilities: { "tauri:options": { application: APP } } as WebdriverIO.Capabilities,
    });

    // 1) App shell renders.
    await waitFor("app shell", async () => (await bodyText(browser!)).includes("Flowstate"));
    log("app shell rendered");

    // 2) The flow selector is the default view (no menubar anymore -- navigation
    //    is the in-app sidebar). Wait for the selector, then open the fixture
    //    flow by clicking its selector card.
    await waitFor("flow selector rendered", async () => {
      const el = await browser!.$('[data-testid="flows-list"]');
      return await el.isExisting();
    });
    log("flow selector rendered");

    await waitFor("fixture card present", async () => {
      const el = await browser!.$(`[data-flow-id="${FLOW_ID}"]`);
      return await el.isExisting();
    });
    await (await browser.$(`[data-flow-id="${FLOW_ID}"]`)).click();
    await waitFor("flow editor open (flow-counts present)", async () => {
      const el = await browser!.$('[data-testid="flow-counts"]');
      return (await el.isExisting()) && (await el.getText()).includes("nodes");
    });
    log(`flow editor open; counts = "${await countsText(browser)}"`);

    // 3) The fixture seeds 8 nodes / 10 transitions.
    await waitFor("fixture loaded (8 nodes)", async () =>
      (await countsText(browser!)).startsWith("8 nodes"),
    );
    log("fixture flow loaded with expected counts");

    // 4) On mount the editor persists the fixture (no prior file) -> write_flow.
    //    The disk file should exist and parse to 8 nodes.
    const flowsDir = path.join(SANDBOX, ".flowstate", "flows");
    const flowFile = path.join(flowsDir, `${FLOW_ID}.json`);
    await waitFor("initial autosave (flow file on disk)", async () => existsSync(flowFile));
    {
      const onDisk = existsSync(flowsDir) ? readdirSync(flowsDir) : [];
      log(`on-disk .flowstate/flows: ${JSON.stringify(onDisk)}`);
      const parsed = JSON.parse(readFileSync(flowFile, "utf8"));
      assert.equal(parsed.id, FLOW_ID, "persisted flow id should match the fixture");
      assert.equal(parsed.nodes.length, 8, "persisted flow should start with 8 nodes");
      assert.ok(!("startNodeId" in parsed), "flow should no longer carry a startNodeId");
    }
    log("initial autosave verified on disk (8 nodes, no startNodeId)");

    // 4b) Channel registry: opening the empty library seeds the example channels
    //     the worked flow references. Prove the registry is on disk with the
    //     tagged binding shape, and that the flow's entry node references one.
    const channelsDir = path.join(SANDBOX, ".flowstate", "channels");
    const intakeFile = path.join(channelsDir, "ch-intake.json");
    await waitFor("channel registry seeded (ch-intake on disk)", async () =>
      existsSync(intakeFile),
    );
    {
      const onDisk = existsSync(channelsDir) ? readdirSync(channelsDir) : [];
      log(`on-disk .flowstate/channels: ${JSON.stringify(onDisk)}`);
      const intake = JSON.parse(readFileSync(intakeFile, "utf8"));
      assert.equal(intake.id, "ch-intake", "seeded channel id should match");
      assert.equal(intake.binding.kind, "ui", "intake channel binding should be tagged ui");

      const parsedFlow = JSON.parse(readFileSync(flowFile, "utf8"));
      const start = parsedFlow.nodes.find((n: { id: string }) => n.id === "n-input");
      assert.equal(start.kind, "channel", "entry node should be a channel node");
      assert.equal(start.channelId, "ch-intake", "entry node should reference the intake channel");
      const result = parsedFlow.nodes.find((n: { id: string }) => n.id === "n-approved");
      assert.equal(result.kind, "channel", "result node should be a channel node");
      assert.equal(result.channelId, "ch-intake", "result node should reference the intake channel");
    }
    log("channel registry verified on disk (tagged binding, node references channel)");

    // 5) Canvas interaction: add a node via the palette (data-flow-kind) -> the
    //    count increments to 9 and the debounced autosave (write_flow) fires.
    await browser.execute(() => {
      const el = document.querySelector('[data-flow-kind="action"]');
      if (el) (el as HTMLElement).click();
    });
    await waitFor("node added via palette (count -> 9)", async () =>
      (await countsText(browser!)).startsWith("9 nodes"),
    );
    log(`palette add ok: "${await countsText(browser)}"`);

    // 6) Autosave indicator turns to "Saved" once write_flow resolves.
    await waitFor("autosave indicator (Saved)", async () => {
      const el = await browser!.$('[data-testid="save-state"]');
      return (await el.isExisting()) && (await el.getText()).includes("Saved");
    });
    log("autosave fired after edit (Saved indicator)");

    // 7) Disk proof: the JSON now has 9 nodes (the new action node persisted).
    await waitFor("autosave wrote 9 nodes to disk", async () => {
      const parsed = JSON.parse(readFileSync(flowFile, "utf8"));
      return parsed.nodes.length === 9;
    });
    {
      const parsed = JSON.parse(readFileSync(flowFile, "utf8"));
      assert.ok(
        parsed.nodes.some((n: { kind: string }) => n.kind === "action"),
        "persisted flow should contain an action node",
      );
    }
    log("disk round-trip verified (autosaved 9 nodes incl. action)");

    log("ALL E2E ASSERTIONS PASSED");
  } finally {
    try {
      if (browser) await browser.deleteSession();
    } catch (e) {
      log(`deleteSession warning: ${String(e).slice(0, 120)}`);
    }
    driver.kill();
    await sleep(300);
  }
}

main().catch((e) => {
  console.error(`[e2e] ERROR: ${e?.stack || e}`);
  process.exitCode = 1;
});
