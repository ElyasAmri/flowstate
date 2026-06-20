# Desktop UI views

The desktop frontend (`app/`) is a Svelte 5 + Tailwind 4 Tauri app. Its main
content area uses manual, state-driven routing: a typed `Route` union held in
`$state` in `app/src/App.svelte`, flipped by the native menubar.

## View components

Each route renders a dedicated view component under `app/src/lib/views/`.
`App.svelte` imports them and switches on `route.name`:

| Route name  | Component            | File                                  |
| ----------- | -------------------- | ------------------------------------- |
| `home`      | `Home.svelte`        | `app/src/lib/views/Home.svelte`       |
| `flow`      | `FlowEditor.svelte`  | `app/src/lib/views/FlowEditor.svelte` |
| `workflows` | `Workflows.svelte`   | `app/src/lib/views/Workflows.svelte`  |
| `documents` | `Documents.svelte`   | `app/src/lib/views/Documents.svelte`  |

Previously the markup for all three routes lived inline in `App.svelte`. It has
been extracted into these separate components; `App.svelte` now only handles
routing and delegates rendering to the views.

### Home

`Home.svelte` shows the app title, a short description, and a **Check Rust
bridge** button. The button calls the `greet` Tauri command (defined in
`src-tauri/src/lib.rs`) via `invoke` and displays the returned greeting,
demonstrating the frontend ↔ Rust bridge. The `invoke` import and the `ping`
handler moved out of `App.svelte` and now live in this component.

### Flow editor

`FlowEditor.svelte` is the **Policy Maker's flow authoring tool**: an n8n-style
visual editor for the deterministic state machine the harness later executes. It
uses a three-pane layout — a **palette** (`NodePalette.svelte`) for adding typed
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

The flow model lives under `app/src/lib/flow/`:

- `types.ts` — `FlowDefinition`, `FlowNode` (kinds: start, collect, check,
  decision, action, escalate, terminal), `FlowEdge` (with optional `guard`), and
  `NODE_KINDS` display metadata.
- `editor.svelte.ts` — the `FlowEditor` class: `$state`-backed flow + selection
  with pure mutation helpers (`addNode`, `updateNode`, `moveNode`, `deleteNode`,
  `addEdge`, `updateEdge`, `deleteEdge`) and a `serialize()` persistence seam.
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
