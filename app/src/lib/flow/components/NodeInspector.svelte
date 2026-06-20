<script lang="ts">
  import type { FlowEditor } from "../editor.svelte";
  import { NODE_KINDS, type NodeKind, type TerminalOutcome } from "../types";

  interface Props {
    editor: FlowEditor;
  }

  let { editor }: Props = $props();

  const node = $derived(editor.selectedNode);
  const edges = $derived(node ? editor.outgoingEdges(node.id) : []);
  const targets = $derived(editor.flow.nodes.filter((n) => n.id !== node?.id));
  // Channels available to assign, sorted by title for a stable picker.
  const channelList = $derived(
    Object.values(editor.channels).sort((a, b) => a.title.localeCompare(b.title)),
  );

  const outcomes: TerminalOutcome[] = ["approved", "rejected", "issued"];
</script>

<aside class="w-72 shrink-0 space-y-4 overflow-auto border-l border-black/10 p-3 dark:border-white/10">
  {#if node}
    <div class="space-y-3">
      <h2 class="text-xs font-semibold uppercase tracking-wide text-zinc-500">Node</h2>

      <label class="block space-y-1 text-sm">
        <span class="text-zinc-500">Kind</span>
        <select
          class="w-full rounded-md border border-black/10 bg-transparent px-2 py-1.5 dark:border-white/10"
          value={node.kind}
          onchange={(e) =>
            editor.updateNode(node.id, { kind: e.currentTarget.value as NodeKind })}
        >
          {#each NODE_KINDS as meta (meta.kind)}
            <option value={meta.kind}>{meta.label}</option>
          {/each}
        </select>
      </label>

      <label class="block space-y-1 text-sm">
        <span class="text-zinc-500">Label</span>
        <input
          class="w-full rounded-md border border-black/10 bg-transparent px-2 py-1.5 dark:border-white/10"
          value={node.label}
          oninput={(e) => editor.updateNode(node.id, { label: e.currentTarget.value })}
        />
      </label>

      <label class="block space-y-1 text-sm">
        <span class="text-zinc-500">Description</span>
        <textarea
          rows="3"
          class="w-full rounded-md border border-black/10 bg-transparent px-2 py-1.5 dark:border-white/10"
          value={node.description ?? ""}
          oninput={(e) => editor.updateNode(node.id, { description: e.currentTarget.value })}
        ></textarea>
      </label>

      {#if node.kind === "channel"}
        <label class="block space-y-1 text-sm">
          <span class="text-zinc-500">Channel</span>
          <select
            data-testid="node-channel"
            class="w-full rounded-md border border-black/10 bg-transparent px-2 py-1.5 dark:border-white/10"
            value={node.channelId ?? ""}
            onchange={(e) =>
              editor.updateNode(node.id, {
                channelId: e.currentTarget.value || undefined,
              })}
          >
            <option value="">Unassigned…</option>
            {#each channelList as ch (ch.id)}
              <option value={ch.id}>{ch.title}</option>
            {/each}
          </select>
          {#if !channelList.length}
            <span class="block text-[11px] text-zinc-400">
              No channels in the registry yet.
            </span>
          {/if}
        </label>

        <label class="block space-y-1 text-sm">
          <span class="text-zinc-500">Outcome</span>
          <select
            class="w-full rounded-md border border-black/10 bg-transparent px-2 py-1.5 dark:border-white/10"
            value={node.outcome ?? ""}
            onchange={(e) =>
              editor.updateNode(node.id, {
                outcome: (e.currentTarget.value || undefined) as TerminalOutcome | undefined,
              })}
          >
            <option value="">None (not an ending)</option>
            {#each outcomes as o (o)}
              <option value={o}>{o}</option>
            {/each}
          </select>
        </label>
      {/if}

      {#if editor.flow.startNodeId === node.id}
        <p class="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
          This is the start node.
        </p>
      {:else}
        <button
          type="button"
          class="text-[11px] text-zinc-500 underline hover:text-zinc-800 dark:hover:text-zinc-200"
          onclick={() => (editor.flow.startNodeId = node.id)}
        >
          Make start node
        </button>
      {/if}
    </div>

    <div class="space-y-2">
      <h2 class="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Transitions
      </h2>
      {#each edges as edge (edge.id)}
        {@const target = editor.flow.nodes.find((n) => n.id === edge.to)}
        <div class="space-y-1 rounded-md border border-black/10 p-2 dark:border-white/10">
          <div class="flex items-center justify-between text-sm">
            <span class="truncate">→ {target?.label ?? edge.to}</span>
            <button
              type="button"
              class="text-rose-500 hover:text-rose-700"
              title="Delete transition"
              onclick={() => editor.deleteEdge(edge.id)}>✕</button
            >
          </div>
          <input
            placeholder="label (e.g. eligible)"
            class="w-full rounded border border-black/10 bg-transparent px-1.5 py-1 text-xs dark:border-white/10"
            value={edge.label ?? ""}
            oninput={(e) => editor.updateEdge(edge.id, { label: e.currentTarget.value })}
          />
          <input
            placeholder="guard (e.g. score >= 0.9)"
            class="w-full rounded border border-black/10 bg-transparent px-1.5 py-1 font-mono text-xs dark:border-white/10"
            value={edge.guard ?? ""}
            oninput={(e) => editor.updateEdge(edge.id, { guard: e.currentTarget.value })}
          />
        </div>
      {/each}

      {#if targets.length}
        <select
          class="w-full rounded-md border border-black/10 bg-transparent px-2 py-1.5 text-sm dark:border-white/10"
          value=""
          onchange={(e) => {
            if (e.currentTarget.value) {
              editor.addEdge(node.id, e.currentTarget.value);
              e.currentTarget.value = "";
            }
          }}
        >
          <option value="">+ Add transition to…</option>
          {#each targets as t (t.id)}
            <option value={t.id}>{t.label}</option>
          {/each}
        </select>
      {/if}
    </div>

    <button
      type="button"
      class="w-full rounded-md border border-rose-300 px-2 py-1.5 text-sm text-rose-600 hover:bg-rose-50 dark:border-rose-900 dark:hover:bg-rose-950/40"
      onclick={() => editor.deleteNode(node.id)}
    >
      Delete node
    </button>
  {:else}
    <p class="text-sm text-zinc-500">Select a node to edit it.</p>
  {/if}
</aside>
