# Flowstate: demo & developer guide

How Flowstate works in detail, how to build and run it, and the worked demo
procedure. For the submission write-up (problem, architecture, agentic design,
Fanar use, evaluation, recommendations) see [README.md](README.md).

## Table of contents

1. [How it works](#1-how-it-works)
2. [Capabilities](#2-capabilities)
3. [Fanar integration (online and self-hosted)](#3-fanar-integration-online-and-self-hosted)
4. [Using Flowstate](#4-using-flowstate)
5. [Repository layout](#5-repository-layout)
6. [Demo procedure](#6-demo-procedure)
7. [Deliverables](#7-deliverables)

---

## 1. How it works

### 1.1 The channel model

The core design rule (see `docs/channel-model.md`): the executing engine is
sealed and deterministic, it never touches the outside world directly.
Everything outside it (a citizen's app, a government registry, a bureaucrat's
desk, even another flow) is reached only across a typed channel. That single
boundary rule is what makes a flow auditable: every external or non-deterministic
interaction is named, typed, and visible on the canvas.

A **channel** is a registered, typed interaction layer. It declares a
`direction` (`inbound` / `outbound` / `both`) and a `binding` (what implements
the far side):

| Binding   | Far side                              | Node color |
| --------- | ------------------------------------- | ---------- |
| `ui`      | a human-operated app (consumer / clerk) | yellow   |
| `flow`    | another flow (composition / nesting)  | purple     |
| `service` | a core service (`internal`/`external`)| green      |

### 1.2 The four node kinds

A flow is a graph of typed nodes joined by guarded edges. Node color encodes
what is across the boundary, or that there is none:

| Kind       | Role                                                        | Deterministic? |
| ---------- | ---------------------------------------------------------- | -------------- |
| `channel`  | crosses a boundary (color from its channel's binding)      | n/a (boundary) |
| `agent`    | an AI agent reasons / classifies / extracts / drafts (Fanar) | **No**       |
| `action`   | internal logic: `shell` / `set` / `log` / `send`           | Yes            |
| `decision` | branch point; its out-edges carry guards                   | Yes            |

There is no global Run button and no `start` node. A flow is *triggered* by
submitting a typed payload to an **entry channel node**, an inbound channel
with no incoming edge (a "door"). Each field of the submitted payload seeds a
flow variable of the same name, readable downstream as `{{name}}`. A flow *ends*
at an outbound channel node, which may carry an `outcome` (`approved` /
`rejected` / `issued`).

### 1.3 Edges, guards, and variables

Edges may carry a **guard**, the condition under which that branch is taken.
The runtime orders a node's out-edges guarded-first, takes the first guard that
evaluates true, else the single unconditional fall-through. Edges and `set`
actions assign **flow variables** from expressions (the guard language in
`run/expr.ts`). This is where determinism lives: branching is data, not model
discretion.

An agent node's reply is parsed for a `VERDICT: <word>` line (e.g.
`VERDICT: ambiguous`), lowercased into the `verdict` variable, so a downstream
`decision` node can branch on what Fanar concluded.

### 1.4 Two ways a flow runs

The same authored flow drives two execution paths:

1. **In-app runner (live demo path).** The desktop app walks the authored graph
   directly with a deterministic interpreter
   (`app/src/lib/flow/run/run.svelte.ts`). It animates each node/edge on the
   canvas, pauses at human gates for approve/reject, and shows a step-by-step
   trace. The interpreter's core is pure; its only two impure steps, shell
   actions and Fanar agent calls, are delegated to native Tauri commands
   (`run_shell`, `run_agent` in `app/src-tauri/src/commands/run.rs`).

2. **Compiled maestro flow (production path).** The editor compiles an authored
   flow to a maestro-harness YAML state machine
   (`app/src/lib/flow/compile.ts` -> `.maestro/flows/<id>.yaml`). Node kinds map
   to harness nodes (`agent` -> agent, `action` -> shell/set_var/log/send,
   human gate -> a `user` approval node). The harness then runs it headlessly
   with Fanar as its model backend. The editor's authored source is the truth;
   the compiled YAML is a build artifact.

Both paths reach Fanar the same way, through the OpenAI-compatible
chat-completions contract described below.

## 2. Capabilities

**Visual flow authoring (n8n-style).** `FlowEditor.svelte` is a three-pane
editor (palette, canvas, inspector):

- Drag nodes; drag output->input ports to connect; click an edge (or its hover
  badge) to delete it.
- Pan (drag canvas) and zoom-to-cursor (wheel); canvas controls for zoom /
  reset / fit-to-view; fit-on-open. Hand-rolled SVG + CSS transform, no graph
  library.
- **Undo/redo** of every mutation (Ctrl/Cmd+Z, Shift+Z / Ctrl+Y), with drag and
  typing bursts coalesced into single steps; 100-deep history.
- Inspector edits the selected node and its out-edges (label + **guard**), plus a
  channel picker and outcome field for channel nodes.

**Deterministic execution + verification.** Guarded edges, ordered transitions,
a 1000-step non-termination guard, and a compile-time validator that reports
unreachable nodes, dangling edges, multiple unconditional transitions, missing
prompts/commands, and missing entry doors.

**Human-in-the-loop escalation.** A non-terminal `ui` channel node with a
guarded split becomes a human gate: the run suspends, surfaces an
**Escalated** inbox with the case prompt, and resumes on approve/reject.

**Live, observable runs.** Per-step canvas highlighting, a status pill
(Ready / Running / Waiting / Done / Error), an outcome banner, the
citizen-facing drafted message (rendered with `dir="auto"` for Arabic), and a
numbered trace.

**Channel registry + flow library.** Channels and flows are first-class,
persisted as one JSON file each under the project dir, written atomically
(temp + rename) with path-traversal-guarded names. Flows autosave as you edit.

**Composition (seam in place).** A channel bound to another flow (purple node)
is how flows nest; the binding stores the target `flowId` for a future drill-in.

**Graceful off-Tauri mode.** Outside the desktop shell (plain Vite / tests) the
native commands no-op or stub, so the editor and a canned demo run work in a
browser for development.

## 3. Fanar integration (online and self-hosted)

Fanar is the only model Flowstate talks to, and it does so in exactly one
place: the `run_agent` Tauri command
(`app/src-tauri/src/commands/run.rs`). Every agent node, in the live runner and
(via the harness) in the compiled flow, routes through it.

### 3.1 The contract: OpenAI-compatible chat-completions

`run_agent` does the following, deterministically:

1. Load the backend named `"fanar"` from `<project>/.maestro/backends.json`.
2. Resolve its API key (inline -> environment variable -> `.env.local`).
3. `POST {base_url}/chat/completions` with bearer auth and this body:
   ```json
   {
     "model": "<backend.model>",
     "messages": [{ "role": "user", "content": "<the node's prompt>" }],
     "max_tokens": 1024,
     "temperature": 0
   }
   ```
4. Return `choices[0].message.content`.

`temperature: 0` keeps the agent step as reproducible as an LLM allows: the
deterministic-by-design principle extends to the one non-deterministic node.

Because the contract is the standard OpenAI chat-completions shape, the same
code path serves Fanar whether it is hosted by QCRI or by you. Online vs.
self-hosted is purely a `base_url` + `model` + key change in one config file:
no code changes, no rebuild.

### 3.2 Configuration: `.maestro/backends.json`

A JSON array of backend specs; Flowstate uses the entry named `fanar`. Only the
fields below are read:

| Field         | Meaning                                                        |
| ------------- | ------------------------------------------------------------- |
| `name`        | backend id; must be `"fanar"` for the agent runner            |
| `base_url`    | the chat-completions root (`/chat/completions` is appended)   |
| `model`       | the model id sent in the request                              |
| `api_key`     | inline key (optional)                                         |
| `api_key_env` | name of an env var / `.env.local` key to read the key from (optional) |

Key resolution order: inline `api_key` -> `api_key_env` from the process
environment -> `api_key_env` from `<project>/.env.local` (a `KEY=value` line).
Keep real keys in `.env.local` (gitignored), not in `backends.json`.

This file lives under the **project directory** the app runs against (the same
`.maestro/` the Compile step writes flows into). It is machine-local and
gitignored.

### 3.3 Option A: Fanar online (hosted API)

Point `base_url` at the Fanar API endpoint from your Fanar credentials and read
the key from the environment:

```json
[
  {
    "name": "fanar",
    "base_url": "https://api.fanar.qa/v1",
    "model": "Fanar",
    "api_key_env": "FANAR_API_KEY"
  }
]
```

Provide the key without committing it: either export it or put it in
`<project>/.maestro/.env.local`:

```powershell
# PowerShell, current session
$env:FANAR_API_KEY = "sk-..."
```

```ini
# <project>/.maestro/.env.local
FANAR_API_KEY=sk-...
```

> `base_url` and `model` above are placeholders; use the exact endpoint and
> model id from your Fanar account. The only requirement is an
> OpenAI-compatible `/chat/completions` route.

### 3.4 Option B: Fanar self-hosted (local / on-prem)

Run a Fanar model behind any OpenAI-compatible server (**vLLM**, **Ollama**,
**llama.cpp / llama-server**, **LM Studio**, or **TGI**) and point `base_url`
at it. Self-hosted servers usually need no real key (any non-empty string
satisfies the bearer header):

```json
[
  {
    "name": "fanar",
    "base_url": "http://localhost:8000/v1",
    "model": "fanar-local",
    "api_key": "not-needed"
  }
]
```

Examples of standing up that server (illustrative; use your Fanar weights and
the server you prefer):

```bash
# vLLM (OpenAI-compatible server on :8000)
python -m vllm.entrypoints.openai.api_server \
  --model /path/to/fanar-weights --served-model-name fanar-local --port 8000

# Ollama (OpenAI-compatible shim on :11434/v1) -- set base_url to http://localhost:11434/v1
ollama run fanar
```

### 3.5 Online vs. self-hosted, at a glance

| Concern              | Online (hosted)                  | Self-hosted (on-prem)                         |
| -------------------- | -------------------------------- | --------------------------------------------- |
| Setup                | a key + endpoint                 | run a server with the weights                 |
| Data residency       | leaves the machine               | never leaves your infrastructure              |
| Cost                 | per-token API billing            | your hardware                                 |
| Offline / air-gapped | no                               | yes, works with no internet                   |
| Code changes         | none                             | none, same contract                           |

Government workloads frequently demand on-prem, air-gapped, data-resident
inference. Flowstate supports that without a forked code path: the same
deterministic flow, the same agent runner, only a different `base_url`. The
hosted Fanar API gets you running in seconds; the self-hosted path keeps
sensitive citizen data inside the institution. Either is a one-file switch.

## 4. Using Flowstate

### 4.1 Prerequisites

- **Rust** (stable; MSVC toolchain on Windows, needs the Visual Studio C++
  Build Tools for the linker) and **Node.js >= 20**.
- A Fanar backend, online or self-hosted (section 3).

### 4.2 Build and run

Install once from the repo root (installs all workspaces):

```bash
npm install
```

Run the desktop app (Tauri dev server, hot reload):

```bash
npm run dev:app      # alias: npm run tauri
```

Compile-only checks:

```bash
npm run build -w app                          # frontend (vite)
cargo build --manifest-path app/src-tauri/Cargo.toml   # native shell
```

### 4.3 Author a flow

1. Launch the app; the **Flows** list is the landing view. Open the bundled
   **Residence Certificate Request** example, or create a **New flow**.
2. Add nodes from the palette (channel / agent / action / decision), drag to
   arrange, and connect output->input ports.
3. Select a node to edit it in the inspector. For an **agent** node set its
   `prompt` (use `{{var}}` to interpolate flow variables) and `agentRef`. For
   **edges**, set the **guard** that branches the flow.
4. Bind channel nodes to channels from the registry; mark the door (inbound) and
   the ending channels (with an outcome). Edits autosave.

### 4.4 Run a flow (in-app)

1. Submit a payload to an **entry channel node** (the door); this triggers the
   run; there is no global Run button.
2. Watch the canvas animate node by node. At a **human gate** the run pauses and
   shows the **Escalated** inbox; approve or reject to resume.
3. See the **Outcome**, the citizen-facing message, and the numbered **Trace**.

Agent nodes call Fanar through `run_agent` using your `.maestro/backends.json`.
(Outside Tauri the agent step is stubbed so the demo flow still runs in a
browser.)

### 4.5 Compile to the maestro harness

Compiling an authored flow emits `.maestro/flows/<id>.yaml`, the deterministic
state machine the headless harness runs in production, with Fanar as its model
backend. The authored JSON is the source of truth; the YAML is regenerated, not
hand-edited.

## 5. Repository layout

```
app/            Tauri 2 desktop client (Vite + Svelte 5 + Tailwind 4)
  src/lib/flow/        the flow model, editor, compiler, and runner
    types.ts             FlowDefinition / FlowNode / FlowEdge / channel types
    compile.ts           authored flow -> maestro YAML (+ validation)
    run/run.svelte.ts    deterministic in-app interpreter
    run/expr.ts          guard/expression language
    editor.svelte.ts     editor state, mutations, undo/redo, autosave
  src-tauri/src/commands/
    run.rs               run_shell + run_agent (the only Fanar touchpoint)
    flows.rs             flow library + compiled-YAML persistence
    channels.rs          channel registry persistence
video/          Demo video (Remotion 4 + React 19)
presentation/   Slide deck (Vite + reveal.js)
crc/            Android client (Kotlin + Jetpack Compose; standalone Gradle)
docs/           channel-model.md, ui-views.md, flow-editor-autosave.md, Diagram.canvas
datasets/       Process-mining + Arabic corpora (gitignored; see catalog.csv)
.maestro/       backends.json, compiled flows, agents (gitignored, machine-local)
```

`app/`, `video/`, and `presentation/` are npm workspaces sharing one hoisted
root `node_modules` and lockfile. `crc/` is a standalone Gradle project (build it
with its own `./gradlew`).

Other run targets:

```bash
npm run dev:slides              # presentation -> Vite dev server (reveal.js)
npm run build -w presentation   # bundle the deck to presentation/dist
npm run dev:video               # Remotion Studio (preview/scrub)
npm run render -w video         # render a composition to mp4
```

## 6. Demo procedure

The worked example is a **Residence Certificate Request**: an intake door takes
the applicant's national ID, name, and proof of address; an action node validates
the ID; a Fanar **agent** node classifies the address proof and emits a verdict;
a decision branches on it; ambiguous cases escalate to a **bureaucrat** gate;
clear cases issue the certificate and notify the consumer. See
`app/src/lib/flow/fixtures.ts` and `docs/channel-model.md`.

Arabic capability is exercised through Fanar at the agent nodes (reading Arabic
descriptions and proofs, drafting citizen-facing replies rendered
right-to-left). The online vs. self-hosted flexibility (section 3) is the
practical answer to a real government constraint: keep citizen data on-prem and
air-gapped when required, without giving up the hosted model's convenience
during development.

## 7. Deliverables

- [x] Working prototype (desktop app: author + run flows against Fanar)
- [ ] Short presentation + demonstration
- [x] GitHub repo (this)
- [x] Technical README (this document)
- [ ] Video (remotion.dev)
- [ ] Live demo
</content>
