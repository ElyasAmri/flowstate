# E2E tests

End-to-end test for the **flow editor**, driven through the *real* Tauri binary
via [`tauri-driver`] + WebdriverIO. This is the Tauri-official path: it exercises
the full native command surface (`project_dir`, `read_flow`, `write_flow`) with
no mocks — UI edit → write IPC → file on disk → re-read → UI reflects it.

`flow-editor.e2e.ts` is a standalone WebdriverIO script (no `@wdio/cli`): it
spawns `tauri-driver` itself and owns setup/teardown, which is the most robust
shape on Windows. It runs under [Bun]. The tests run serially — that is expected.

> **Platform:** Windows or Linux only. macOS WKWebView has no WebDriver.

## Prereqs

1. **tauri-driver** — `cargo install tauri-driver`. Resolved from
   `~/.cargo/bin` by default; override with `TAURI_DRIVER_PATH`.
2. **msedgedriver** (Windows) whose **major version matches** the installed
   WebView2 runtime. There is **no bundled default** — you must point
   `MSEDGEDRIVER_PATH` at the staged driver:

   ```pwsh
   $env:MSEDGEDRIVER_PATH = "C:\path\to\msedgedriver.exe"
   ```

   (On Linux use `WebKitWebDriver` + `xvfb` in CI; set `MSEDGEDRIVER_PATH` to it.)
3. **A built debug binary** of the app:

   ```pwsh
   npm --prefix app run tauri build -- --debug --no-bundle
   ```

   Produces `app/src-tauri/target/debug/flowstate.exe` (named after the Cargo
   package). Override the path with `FLOWSTATE_APP_BINARY`.
4. **Bun** on `PATH` (the `test:e2e` script runs `bun tests/e2e/...`).

## Run

```pwsh
$env:MSEDGEDRIVER_PATH = "C:\path\to\msedgedriver.exe"   # staged driver
npm --prefix app run test:e2e
```

The test prints `[e2e] ...` progress and ends with
`[e2e] ALL E2E ASSERTIONS PASSED` on success (non-zero exit on any failure).

## What it asserts (disk-proof loop)

1. App shell renders; navigate to the **Flow Editor** by emitting the native
   `navigate` event from page context (`window.__TAURI__.event.emit("navigate",
   "flow")`) — WebDriver can't click the native menubar. (Requires
   `app.withGlobalTauri: true`, set in `tauri.conf.json`.)
2. The fixture flow loads with **8 nodes / 9 transitions**
   (`[data-testid="flow-counts"]`).
3. On mount the editor autosaves the fixture →
   `<sandbox>/.flowstate/flows/flow-residence-certificate.json` exists and parses
   to 8 nodes with the camelCase `startNodeId` shape.
4. Add a node via the palette (`[data-flow-kind="action"]`) → count → **9 nodes**.
5. The debounced autosave fires → `[data-testid="save-state"]` shows **Saved**.
6. The on-disk JSON is re-read and now has **9 nodes** including the action node.

## Env vars

| Var                    | Purpose                          | Default                                          |
| ---------------------- | -------------------------------- | ------------------------------------------------ |
| `MSEDGEDRIVER_PATH`    | Path to the native WebDriver     | *(none — required)*                              |
| `FLOWSTATE_APP_BINARY` | Path to the built debug binary   | `app/src-tauri/target/debug/flowstate(.exe)`     |
| `TAURI_DRIVER_PATH`    | Path to `tauri-driver`           | `~/.cargo/bin/tauri-driver(.exe)`                |
| `FLOWSTATE_PROJECT_DIR`| Sandbox dir for the flow library | `<repo>/.local/e2e-sandbox` (wiped each run)     |

`FLOWSTATE_PROJECT_DIR` is the same env var the Rust backend reads
(`flows::project_dir`), so the app under test writes flows into the test sandbox.

[`tauri-driver`]: https://v2.tauri.app/develop/tests/webdriver/
[Bun]: https://bun.sh/
