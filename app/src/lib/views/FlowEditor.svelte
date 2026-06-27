<script lang="ts">
  import { onMount } from "svelte";
  import { FlowEditor, slugifyFlowName, type SaveState } from "../flow/editor.svelte";
  import {
    blankFlow,
    draftDecisionLetter,
    exampleChannels,
    loopDemo,
    loopDemoSpine,
    loopDemoUpdate,
    residenceCertificateRunnable,
  } from "../flow/fixtures";
  import { loadRegistry, toRegistry } from "../flow/channels";
  import type { FlowNode, NodeKind } from "../flow/types";
  import { isEntryChannel } from "../flow/types";
  import type { BoundingBox } from "../flow/viewport.svelte";
  import FlowCanvas from "../flow/components/FlowCanvas.svelte";
  import NodePalette from "../flow/components/NodePalette.svelte";
  import NodeInspector from "../flow/components/NodeInspector.svelte";
  import RunPanel from "../flow/components/RunPanel.svelte";
  // Self-import so a nested-flow window can host another editor (the modern
  // replacement for the deprecated `<svelte:self>`).
  import Self from "./FlowEditor.svelte";

  interface Props {
    /** Which flow to open (a bare flow id from the selector). */
    flowId: string;
    /** Return to the flow selector. */
    onback: () => void;
  }

  let { flowId, onback }: Props = $props();

  // Seed the editor with the right template for this id, then try to replace it
  // with the saved copy from the backend library. The fixture id seeds the
  // worked example; any other id seeds a blank flow. Structured-clone so editing
  // never mutates the shared fixture module. `flowId` is captured once: App.svelte
  // wraps this view in {#key route.id}, so a different flow remounts it fresh.
  // svelte-ignore state_referenced_locally
  const initialId = flowId;
  const bundled = [loopDemo, residenceCertificateRunnable, draftDecisionLetter];
  const fixture = bundled.find((f) => f.id === initialId);
  const seed = fixture ? structuredClone(fixture) : blankFlow(initialId);
  const editor = new FlowEditor(seed);

  // On mount, prefer a previously-saved copy of this flow from the backend
  // library; otherwise persist the seed so there's always a file on disk to
  // round-trip against. No-op (load returns false) outside Tauri.
  onMount(() => {
    void (async () => {
      const loaded = await editor.load(initialId);
      if (!loaded) await editor.save();
      // Load the channel registry for color/icon derivation. Off-Tauri the
      // backend yields an empty registry, so fall back to the bundled example
      // channels (which the worked-example flow references) so colors resolve.
      const registry = await loadRegistry();
      editor.setChannels(
        Object.keys(registry).length ? registry : toRegistry(exampleChannels),
      );
    })();

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  });

  /** True when the keystroke targets a text field (let the browser handle it). */
  function isTyping(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el) return false;
    const tag = el.tagName;
    return (
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      tag === "SELECT" ||
      el.isContentEditable
    );
  }

  // Ctrl/Cmd+Z = undo; Ctrl/Cmd+Shift+Z and Ctrl/Cmd+Y = redo. Ignored while
  // typing in a field so the browser's own text undo still works there.
  function handleKeydown(e: KeyboardEvent) {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    if (isTyping(e.target)) return;
    const key = e.key.toLowerCase();
    if (key === "z" && !e.shiftKey) {
      if (editor.undo()) e.preventDefault();
    } else if ((key === "z" && e.shiftKey) || key === "y") {
      if (editor.redo()) e.preventDefault();
    }
  }

  // Compile-to-maestro errors. Only surfaced as a dismissable bar when compiling
  // fails; a successful auto-compile clears it silently.
  let compileResult = $state<{ lines: string[] } | null>(null);

  // Persist the flow, then (if it's runnable) compile it to a maestro flow. Both
  // happen automatically on every edit -- there is no manual Save/Compile button.
  // Persist the flow, then (if it's runnable) compile it to a maestro flow. Both
  // happen automatically on every edit -- there is no manual Save/Compile button.
  // We only surface genuine validation errors; the off-Tauri "nowhere to write"
  // outcome (dev/browser) isn't user-actionable, so it's silenced.
  async function persistAndCompile() {
    await editor.save();
    const r = await editor.compileToMaestro();
    if (r.ok || r.errors.some((e) => e.includes("Not running under Tauri"))) {
      compileResult = null;
      return;
    }
    compileResult = { lines: r.errors };
  }

  // Debounced auto save + compile: whenever the flow changes, persist and compile
  // ~400ms later. We read the flow fields the effect should depend on, then
  // schedule the work.
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let firstRun = true;
  $effect(() => {
    // Establish reactive dependencies on the document being edited.
    JSON.stringify(editor.flow);
    // Skip the initial run; mount handles the first persist/load deliberately.
    if (firstRun) {
      firstRun = false;
      return;
    }
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void persistAndCompile(), 400);
    // On teardown (flow switch via {#key} remount, or unmount) flush a pending
    // write instead of dropping it: editing then immediately switching/leaving
    // would otherwise lose the last <400ms of edits. `save()` is a no-op when
    // clean, so an already-saved flow flushes nothing.
    return () => {
      clearTimeout(saveTimer);
      void editor.save();
    };
  });

  /** Persist any pending edits, then return to the flow selector. */
  function handleBack() {
    clearTimeout(saveTimer);
    void editor.save();
    onback();
  }

  // Human-readable save indicator.
  const saveLabel: Record<SaveState, string> = {
    idle: "",
    saving: "Saving…",
    saved: "Saved",
    error: "Save failed",
  };

  // Where the next palette-added node lands (cascaded so they don't stack).
  let dropX = $state(360);
  let dropY = $state(80);

  function handleAdd(kind: NodeKind) {
    editor.addNode(kind, { x: dropX, y: dropY });
    dropY += 24;
    dropX += 24;
  }

  // Double-clicking an inbound channel node ("door") on the canvas triggers a
  // run. A flow can have several doors. `submitTarget` holds the chosen entry
  // node id while its submission panel is open.
  let submitTarget = $state<string | null>(null);

  // Live-run diagram highlights: while a run is active, FlowCanvas shows the
  // current node and edge so the user can follow the execution visually.
  let activeNodeId = $state<string | null>(null);
  let activeEdgeId = $state<string | null>(null);
  // The world box to frame before a completed run adds its sub-flow (loop demo),
  // so the new nodes appear against a settled scene rather than during the pan.
  let fitBox = $state<BoundingBox | null>(null);

  function handleRunActive(nodeId: string | null, edgeId: string | null) {
    activeNodeId = nodeId;
    activeEdgeId = edgeId;
  }

  function handleRunClose() {
    activeNodeId = null;
    activeEdgeId = null;
    fitBox = null;
    submitTarget = null;
  }

  /** World bounding box of `nodes` (approx node size), for framing. */
  function boxOf(nodes: FlowNode[]): BoundingBox {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
      if (n.position.y < -5000) continue; // skip off-canvas sentinels
      minX = Math.min(minX, n.position.x);
      minY = Math.min(minY, n.position.y);
      maxX = Math.max(maxX, n.position.x + 300);
      maxY = Math.max(maxY, n.position.y + 96);
    }
    return { minX, minY, maxX, maxY };
  }

  // Loop-demo only: a completed meta-flow run grows the main flow on the canvas,
  // so the causal loop is visible -- the init flow drafts the routine procedure
  // into existence, and the periodic-update flow adds a step to it.
  function handleRunComplete(entryId: string) {
    if (editor.flow.id !== "loop-demo") return;
    // Settle the camera on the final framing first, then add the sub-flow a beat
    // later, so the audience sees it appear against a static scene (not mid-pan).
    if (entryId === "svc-mining") {
      fitBox = boxOf([...editor.flow.nodes, ...loopDemoSpine.nodes]);
      setTimeout(() => {
        editor.addSubgraph(loopDemoSpine.nodes, loopDemoSpine.edges);
        editor.select("n-input");
      }, 1200);
    } else if (entryId === "svc-exceptions") {
      fitBox = boxOf([...editor.flow.nodes, ...loopDemoUpdate.nodes]);
      setTimeout(() => {
        editor.addSubgraph(loopDemoUpdate.nodes, loopDemoUpdate.edges);
        editor.select("n-fasttrack");
      }, 1200);
    }
  }

  function openSubmit(nodeId: string) {
    submitTarget = nodeId;
  }

  // Double-clicking an entry "door" opens its submission modal. Double-clicking
  // a channel node bound to another flow opens that nested flow in its own
  // window (layered over this editor). Any other node double-click is a no-op.
  function handleNodeActivate(node: FlowNode) {
    const ch = node.channelId ? editor.channels[node.channelId] : undefined;
    if (ch?.binding.kind === "flow") {
      openNested(ch.binding.flowId);
      return;
    }
    if (isEntryChannel(node, editor.channels, editor.flow.edges)) openSubmit(node.id);
  }

  // The nested flow currently opened in its own window (layered over this
  // editor), or null when none. A nested editor can itself open further nests,
  // so this supports arbitrary drill-in depth.
  let openNestedId = $state<string | null>(null);
  function openNested(flowId: string) {
    openNestedId = flowId;
  }
  function closeNested() {
    openNestedId = null;
  }

  // Dev-only probe: expose the node-activate handler so automated UI checks can
  // drive a node double-click reliably (synthetic pointer gestures don't trigger
  // canvas selection). Stripped from production builds.
  $effect(() => {
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__activateNode = (id: string) => {
        const n = editor.flow.nodes.find((x) => x.id === id);
        if (n) handleNodeActivate(n);
      };
      (window as unknown as Record<string, unknown>).__selectNode = (id: string) => {
        editor.select(id);
      };
    }
  });

  // Inline rename of the flow (title + file name). `renaming` holds the draft
  // title while the input is open; committing slugs it to the file name too.
  let renaming = $state<string | null>(null);
  let renameError = $state<string | null>(null);

  function startRename() {
    renameError = null;
    renaming = editor.flow.title;
  }

  async function commitRename() {
    if (renaming === null) return;
    const draft = renaming;
    const r = await editor.rename(draft);
    if (r.ok) {
      renaming = null;
      renameError = null;
    } else {
      renameError = r.error;
    }
  }

  function cancelRename() {
    renaming = null;
    renameError = null;
  }

  function onRenameKey(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      void commitRename();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelRename();
    }
  }
</script>

<div class="flex h-full flex-col">
  <header class="flex items-baseline justify-between border-b border-black/10 px-4 py-2 dark:border-white/10">
    <div class="flex items-baseline gap-2">
      <button
        type="button"
        class="self-center rounded px-2 py-1 text-xs text-zinc-600 hover:bg-black/5 dark:text-zinc-300 dark:hover:bg-white/10"
        title="Back to flows"
        aria-label="Back to flows"
        data-testid="back"
        onclick={handleBack}>←</button
      >
      {#if renaming !== null}
        <!-- svelte-ignore a11y_autofocus -->
        <input
          type="text"
          class="rounded border border-emerald-500 bg-transparent px-1.5 py-0.5 text-base font-semibold outline-none"
          autofocus
          data-testid="rename-input"
          bind:value={renaming}
          onkeydown={onRenameKey}
          onblur={commitRename}
        />
        <span class="text-xs text-zinc-400" data-testid="rename-slug">
          {slugifyFlowName(renaming) || "…"}.json
        </span>
        {#if renameError}
          <span class="text-xs text-rose-500" data-testid="rename-error">{renameError}</span>
        {/if}
      {:else}
        <h1 class="text-base font-semibold">{editor.flow.title}</h1>
        <button
          type="button"
          class="rounded px-1 py-0.5 text-xs text-zinc-500 hover:bg-black/5 dark:hover:bg-white/10"
          title="Rename flow (and its file name)"
          aria-label="Rename flow"
          data-testid="rename"
          onclick={startRename}>✎</button
        >
      {/if}
    </div>
    <div class="flex items-baseline gap-3">
      <div class="flex items-center gap-1">
        <button
          type="button"
          class="rounded px-2 py-1 text-xs text-zinc-600 enabled:hover:bg-black/5 disabled:opacity-40 dark:text-zinc-300 dark:enabled:hover:bg-white/10"
          title="Undo (Ctrl+Z)"
          aria-label="Undo"
          data-testid="undo"
          disabled={!editor.canUndo}
          onclick={() => editor.undo()}>↶ Undo</button
        >
        <button
          type="button"
          class="rounded px-2 py-1 text-xs text-zinc-600 enabled:hover:bg-black/5 disabled:opacity-40 dark:text-zinc-300 dark:enabled:hover:bg-white/10"
          title="Redo (Ctrl+Shift+Z)"
          aria-label="Redo"
          data-testid="redo"
          disabled={!editor.canRedo}
          onclick={() => editor.redo()}>↷ Redo</button
        >
      </div>
      {#if saveLabel[editor.saveState]}
        <span
          class="text-xs {editor.saveState === 'error'
            ? 'text-rose-500'
            : 'text-zinc-400'}"
          data-testid="save-state">{saveLabel[editor.saveState]}</span
        >
      {/if}
      <span class="text-xs text-zinc-500" data-testid="flow-counts">
        {editor.flow.nodes.length} nodes · {editor.flow.edges.length} transitions
      </span>
    </div>
  </header>

  {#if compileResult}
    <div
      class="flex items-start justify-between gap-3 border-b border-rose-200 bg-rose-50 px-4 py-2 text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200"
      data-testid="compile-result"
    >
      <div class="space-y-0.5">
        <p class="font-medium">Cannot compile yet</p>
        {#each compileResult.lines as line (line)}
          <p class="font-mono">{line}</p>
        {/each}
      </div>
      <button
        type="button"
        class="shrink-0 rounded px-1.5 py-0.5 hover:bg-black/5 dark:hover:bg-white/10"
        title="Dismiss"
        onclick={() => (compileResult = null)}>✕</button
      >
    </div>
  {/if}

  <div class="flex min-h-0 flex-1">
    <NodePalette onadd={handleAdd} />
    <div class="min-h-0 flex-1">
      <FlowCanvas {editor} {activeNodeId} {activeEdgeId} {fitBox} onnodeactivate={handleNodeActivate} />
    </div>
    <NodeInspector {editor} onsubmit={openSubmit} onopenflow={openNested} />
  </div>
</div>

{#if submitTarget}
  {#key submitTarget}
    <RunPanel
      flow={editor.serialize()}
      channels={editor.channels}
      entryNodeId={submitTarget}
      onactive={handleRunActive}
      oncomplete={handleRunComplete}
      onclose={handleRunClose}
    />
  {/key}
{/if}

{#if openNestedId}
  <!-- Nested flow window: a full-screen overlay hosting another editor for the
       referenced sub-flow. Keyed on the id so opening a different nest remounts
       it fresh; its own back button closes this layer (drilling back out). A
       nested editor can open further nests, so this stacks to any depth. -->
  {#key openNestedId}
    <div class="fixed inset-0 z-40 flex flex-col bg-white dark:bg-zinc-950" data-testid="nested-window">
      <div
        class="flex items-center gap-2 border-b border-purple-300 bg-purple-50 px-4 py-1.5 text-xs text-purple-700 dark:border-purple-900 dark:bg-purple-950/30 dark:text-purple-300"
      >
        <span class="font-medium">Nested flow</span>
        <span class="font-mono text-purple-600 dark:text-purple-400">{openNestedId}</span>
        <span class="text-purple-400">— opened from “{editor.flow.title}”</span>
        <button
          type="button"
          class="ml-auto rounded px-2 py-0.5 hover:bg-purple-100 dark:hover:bg-purple-900/40"
          data-testid="nested-close"
          onclick={closeNested}>Close ✕</button
        >
      </div>
      <div class="min-h-0 flex-1">
        <Self flowId={openNestedId} onback={closeNested} />
      </div>
    </div>
  {/key}
{/if}
