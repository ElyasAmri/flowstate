<script lang="ts">
  import { onMount } from "svelte";
  import { FlowEditor, type SaveState } from "../flow/editor.svelte";
  import { residenceCertificateFlow } from "../flow/fixtures";
  import type { NodeKind } from "../flow/types";
  import FlowCanvas from "../flow/components/FlowCanvas.svelte";
  import NodePalette from "../flow/components/NodePalette.svelte";
  import NodeInspector from "../flow/components/NodeInspector.svelte";

  // Open the editor on the worked example. Structured-clone so editing does not
  // mutate the shared fixture module.
  const editor = new FlowEditor(structuredClone(residenceCertificateFlow));

  // On mount, prefer a previously-saved copy of this flow from the backend
  // library; otherwise seed the library with the fixture so there's always a
  // file on disk to round-trip against. No-op (returns false) outside Tauri.
  onMount(() => {
    void (async () => {
      const loaded = await editor.load(editor.name);
      if (!loaded) await editor.save();
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

  // Debounced autosave: whenever the flow changes, persist ~400ms later. We read
  // the flow fields the effect should depend on, then schedule the write.
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
    saveTimer = setTimeout(() => void editor.save(), 400);
    return () => clearTimeout(saveTimer);
  });

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
</script>

<div class="flex h-full flex-col">
  <header class="flex items-baseline justify-between border-b border-black/10 px-4 py-2 dark:border-white/10">
    <div class="flex items-baseline gap-2">
      <h1 class="text-base font-semibold">{editor.flow.title}</h1>
      <span class="text-xs text-zinc-500">flow editor</span>
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

  <div class="flex min-h-0 flex-1">
    <NodePalette onadd={handleAdd} />
    <div class="min-h-0 flex-1">
      <FlowCanvas {editor} />
    </div>
    <NodeInspector {editor} />
  </div>
</div>
