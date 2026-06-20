# Desktop UI views

The desktop frontend (`app/`) is a Svelte 5 + Tailwind 4 Tauri app. Its main
content area uses manual, state-driven routing: a typed `Route` union held in
`$state` in `app/src/App.svelte`. The **flow selector is the default view**;
top-level navigation is an in-app **sidebar** (`Sidebar.svelte`), and
opening/closing a specific flow is handled by the selector and the editor's back
button. There is no native window menubar.

## Layout & navigation

`App.svelte` is a horizontal flex of a left **sidebar** and a content `<main>`.
`Sidebar.svelte` (`app/src/lib/components/Sidebar.svelte`) holds the
**Flowstate** wordmark in its header and three nav items — Flows / Workflows /
Documents (`data-nav="…"`, active item highlighted, `data-testid="sidebar"`).
Clicking an item sets the route directly via an `onnavigate` callback (no Tauri
event). There is no top header/brand bar; the wordmark lives only in the sidebar.

The **flow editor is a focused, full-screen mode**: when `route.name === "flow"`
the sidebar is hidden so the canvas gets maximum width (the editor already has
its own palette/canvas/inspector 3-pane layout and a **← Flows** back button).
The sidebar shows for `flows`/`workflows`/`documents`; the editor route
highlights the "Flows" section.

## View components

Each route renders a dedicated view component under `app/src/lib/views/`.
`App.svelte` imports them and switches on `route.name`:

| Route name  | Component            | File                                  |
| ----------- | -------------------- | ------------------------------------- |
| `flows`     | `FlowsList.svelte`   | `app/src/lib/views/FlowsList.svelte`  |
| `flow`      | `FlowEditor.svelte`  | `app/src/lib/views/FlowEditor.svelte` |
| `workflows` | `Workflows.svelte`   | `app/src/lib/views/Workflows.svelte`  |
| `documents` | `Documents.svelte`   | `app/src/lib/views/Documents.svelte`  |

The `Route` union is `{ name: "flows" } | { name: "flow"; id } | { name:
"workflows" } | { name: "documents" }` — the `flow` route carries the **id of
the flow to open**, threaded from the selector. `App.svelte` wraps the editor in
`{#key route.id}` so opening a different flow remounts a fresh editor.

### Flow selector

`FlowsList.svelte` is the **default landing view**. It lists the saved flows from
the backend `list_flows` command (`FlowMeta[]`: `id`, `title`, `node_count`) as a
grid of cards; clicking a card opens that flow in the editor
(`onopen(id)` → `route = { name: "flow", id }`). A **New flow** action
(`data-testid="new-flow"`) creates a fresh blank flow (`blankFlow(id)` from
`fixtures.ts`), persists it via `write_flow`, and opens the editor on it. Outside
Tauri (`list_flows` returns `null`) it gracefully shows the bundled
**Residence Certificate Request** fixture as a single seed card, so there is
always a way into the editor. Cards carry `data-testid="flow-card"` +
`data-flow-id={id}`; the container is `data-testid="flows-list"`.

### Flow editor

`FlowEditor.svelte` is the **Policy Maker's flow authoring tool**: an n8n-style
visual editor for the deterministic state machine the harness later executes. It
takes a `flowId` prop (the flow to open) and an `onback` callback (a **← Flows**
header button, `data-testid="back"`, returns to the selector). It seeds from the
fixture when `flowId` is the fixture id, else from a blank template, then
`editor.load(flowId)` replaces that with the saved copy if one exists. It uses a
three-pane layout — a **palette** (`NodePalette.svelte`) for adding typed
nodes, an interactive **canvas** (`FlowCanvas.svelte`), and an **inspector**
(`NodeInspector.svelte`) for editing the selected node and its outgoing
transitions (label + guard condition).

The canvas supports n8n-style direct manipulation:

- **Drag nodes** to move them; edges re-route live. Nodes lift on hover and
  show a ring when selected; ports highlight on node hover.
- **Drag-to-connect**: drag from a node's right **output** port to another
  node's left **input** port to create an edge (output→input only). A dashed
  "rubber-band" curve previews the connection mid-drag.
- **Delete a connection** by clicking its line, or the × badge that appears at
  the edge midpoint on hover (the edge highlights rose).
- **Pan** by dragging the empty canvas; **zoom** with the wheel (zooms toward
  the cursor). A single CSS transform on a "world" layer keeps nodes and edges
  aligned at any zoom; a dotted grid background scrolls/scales with it.
- **Canvas controls** (`CanvasControls.svelte`, floating bottom-left):
  zoom out / zoom % (click to reset to 100%) / zoom in / **fit to view**. The
  canvas also **fits-on-open** (one `requestAnimationFrame` after mount) so the
  fixture flow frames nicely.
- **Undo / redo** — every mutation records a whole-flow snapshot. Header buttons
  (`data-testid="undo"`/`"redo"`) and keys **Ctrl/Cmd+Z** (undo),
  **Ctrl/Cmd+Shift+Z** and **Ctrl/Cmd+Y** (redo); the key handler ignores events
  while typing in an input/textarea/select/contentEditable. A whole node **drag
  coalesces** into one undo step (committed on drag end), as does a typing burst
  into one inspector field (keyed `node:<id>:<field>` / `edge:<id>:<field>`).
  Undo/redo revalidates the selection so the inspector never points at a deleted
  node, and autosave persists the result like any other edit.

The flow model lives under `app/src/lib/flow/`:

- `types.ts` — `FlowDefinition`, `FlowNode` (kinds: start, collect, check,
  decision, action, escalate, terminal), `FlowEdge` (with optional `guard`), and
  `NODE_KINDS` display metadata.
- `editor.svelte.ts` — the `FlowEditor` class: `$state`-backed flow + selection
  with pure mutation helpers (`addNode`, `updateNode`, `moveNode`, `deleteNode`,
  `addEdge`, `updateEdge`, `deleteEdge`), `undo()`/`redo()` with reactive
  `canUndo`/`canRedo`, a `serialize()` persistence seam, and `save()`/`load()`.
- `history.ts` — pure `FlowHistory<T>`: a snapshot list + cursor with
  `commit(state, coalesceKey?)`, `undo`/`redo`, `breakCoalescing`, `reset`, and a
  `MAX_HISTORY` (100) bound. Unit-tested in `tests/unit/history.test.ts`.
- `viewport.svelte.ts` — the `Viewport` class: `$state` pan + zoom with pure
  `screenToWorld` / `worldToScreen` transforms, zoom-toward-cursor math, and
  `fitTo(box, viewSize)` / `reset()` / `zoomStep()` for the controls.
- `geometry.ts` — pure node/edge geometry (`portPosition`, `edgePath`,
  `nodesBounds`) shared by the edge layer (`components/FlowEdges.svelte`) and the
  live connection preview so finished and in-progress edges look identical.
- `fixtures.ts` — a worked **Residence Certificate Request** flow the editor
  opens on (structured-cloned so edits don't touch the fixture).

Pointer interaction lives in `FlowCanvas.svelte` as a small `$state`
interaction union (`idle` / `panning` / `draggingNode` / `connecting`); window
`pointermove` / `pointerup` listeners are attached only while a gesture is
active. No canvas/graph libraries — hand-rolled SVG + CSS transform.

Unlike the other views this route is full-bleed: `App.svelte` drops the default
`p-6` padding for `route.name === "flow"`.

### Workflows

`Workflows.svelte` is a placeholder: a "Workflows" header with an empty-state
message ("Nothing here yet.").

### Documents

`Documents.svelte` is a placeholder: a "Documents" header with an empty-state
message ("Nothing here yet.").

## Style

All views follow the existing Tailwind 4 / Svelte 5 conventions: a centered
`mx-auto max-w-2xl space-y-4` container with a `text-2xl font-semibold` header.
