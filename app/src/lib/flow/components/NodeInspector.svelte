<script lang="ts">
  import type { FlowEditor } from "../editor.svelte";
  import {
    NODE_KINDS,
    type ActionOp,
    type NodeKind,
    type TerminalOutcome,
    type VarAssignment,
  } from "../types";
  import { isEntryChannel } from "../types";

  interface Props {
    editor: FlowEditor;
    /** Open the submission panel for an inbound channel node (the entry door). */
    onsubmit: (nodeId: string) => void;
  }

  let { editor, onsubmit }: Props = $props();

  const node = $derived(editor.selectedNode);
  const isEntry = $derived(
    !!node && isEntryChannel(node, editor.channels, editor.flow.edges),
  );
  const edges = $derived(node ? editor.outgoingEdges(node.id) : []);
  const targets = $derived(editor.flow.nodes.filter((n) => n.id !== node?.id));
  // Channels available to assign, sorted by title for a stable picker.
  const channelList = $derived(
    Object.values(editor.channels).sort((a, b) => a.title.localeCompare(b.title)),
  );

  const outcomes: TerminalOutcome[] = ["approved", "rejected", "issued"];
  const actionOps: ActionOp[] = ["shell", "set", "log", "send"];

  // --- assignment helpers (shared by action `set` nodes and edge `set`) ------

  /** Replace a node's `set` assignment list. */
  function setNodeAssignments(id: string, next: VarAssignment[]): void {
    editor.updateNode(id, { assignments: next });
  }
  /** Replace an edge's `set` assignment list. */
  function setEdgeAssignments(id: string, next: VarAssignment[]): void {
    editor.updateEdge(id, { set: next });
  }
  /** Append a blank assignment to a list and return the new list. */
  function withAdded(list: VarAssignment[] | undefined): VarAssignment[] {
    return [...(list ?? []), { var: "", expr: "" }];
  }
  /** Patch the i-th assignment in a list and return the new list. */
  function withPatched(
    list: VarAssignment[] | undefined,
    i: number,
    patch: Partial<VarAssignment>,
  ): VarAssignment[] {
    return (list ?? []).map((a, idx) => (idx === i ? { ...a, ...patch } : a));
  }
  /** Remove the i-th assignment from a list and return the new list. */
  function withRemoved(list: VarAssignment[] | undefined, i: number): VarAssignment[] {
    return (list ?? []).filter((_, idx) => idx !== i);
  }
</script>

<aside
  class="w-72 shrink-0 space-y-4 overflow-auto border-l border-black/10 p-3 dark:border-white/10"
>
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
          rows="2"
          class="w-full rounded-md border border-black/10 bg-transparent px-2 py-1.5 dark:border-white/10"
          value={node.description ?? ""}
          oninput={(e) => editor.updateNode(node.id, { description: e.currentTarget.value })}
        ></textarea>
      </label>

      <!-- agent: which agent runs + the prompt it receives -->
      {#if node.kind === "agent"}
        <label class="block space-y-1 text-sm">
          <span class="text-zinc-500">Agent</span>
          <input
            placeholder="arabic-reasoner"
            class="w-full rounded-md border border-black/10 bg-transparent px-2 py-1.5 font-mono text-xs dark:border-white/10"
            value={node.agentRef ?? ""}
            oninput={(e) => editor.updateNode(node.id, { agentRef: e.currentTarget.value })}
          />
        </label>
        <label class="block space-y-1 text-sm">
          <span class="text-zinc-500">Prompt</span>
          <textarea
            rows="5"
            placeholder="What should the agent do? End with a VERDICT: line if the next step branches on it."
            class="w-full rounded-md border border-black/10 bg-transparent px-2 py-1.5 text-xs dark:border-white/10"
            value={node.prompt ?? ""}
            oninput={(e) => editor.updateNode(node.id, { prompt: e.currentTarget.value })}
          ></textarea>
        </label>
      {/if}

      <!-- action: a deterministic operation + its parameters -->
      {#if node.kind === "action"}
        <label class="block space-y-1 text-sm">
          <span class="text-zinc-500">Operation</span>
          <select
            class="w-full rounded-md border border-black/10 bg-transparent px-2 py-1.5 dark:border-white/10"
            value={node.op ?? ""}
            onchange={(e) =>
              editor.updateNode(node.id, { op: (e.currentTarget.value || undefined) as ActionOp })}
          >
            <option value="">Choose…</option>
            {#each actionOps as op (op)}
              <option value={op}>{op}</option>
            {/each}
          </select>
        </label>

        {#if node.op === "shell"}
          <label class="block space-y-1 text-sm">
            <span class="text-zinc-500">Command</span>
            <textarea
              rows="4"
              class="w-full rounded-md border border-black/10 bg-transparent px-2 py-1.5 font-mono text-xs dark:border-white/10"
              value={node.command ?? ""}
              oninput={(e) => editor.updateNode(node.id, { command: e.currentTarget.value })}
            ></textarea>
          </label>
        {:else if node.op === "log"}
          <label class="block space-y-1 text-sm">
            <span class="text-zinc-500">Message</span>
            <textarea
              rows="3"
              class="w-full rounded-md border border-black/10 bg-transparent px-2 py-1.5 text-xs dark:border-white/10"
              value={node.message ?? ""}
              oninput={(e) => editor.updateNode(node.id, { message: e.currentTarget.value })}
            ></textarea>
          </label>
        {:else if node.op === "send"}
          <label class="block space-y-1 text-sm">
            <span class="text-zinc-500">Send to</span>
            <select
              class="w-full rounded-md border border-black/10 bg-transparent px-2 py-1.5 dark:border-white/10"
              value={node.sendTo ?? ""}
              onchange={(e) => editor.updateNode(node.id, { sendTo: e.currentTarget.value || undefined })}
            >
              <option value="">Choose target…</option>
              {#each targets as t (t.id)}
                <option value={t.id}>{t.label}</option>
              {/each}
            </select>
          </label>
          <label class="block space-y-1 text-sm">
            <span class="text-zinc-500">Message</span>
            <textarea
              rows="3"
              class="w-full rounded-md border border-black/10 bg-transparent px-2 py-1.5 text-xs dark:border-white/10"
              value={node.message ?? ""}
              oninput={(e) => editor.updateNode(node.id, { message: e.currentTarget.value })}
            ></textarea>
          </label>
        {:else if node.op === "set"}
          <div class="space-y-1 text-sm">
            <span class="text-zinc-500">Assignments</span>
            {#each node.assignments ?? [] as a, i (i)}
              <div class="flex items-center gap-1">
                <input
                  placeholder="var"
                  class="w-1/3 rounded border border-black/10 bg-transparent px-1.5 py-1 font-mono text-xs dark:border-white/10"
                  value={a.var}
                  oninput={(e) =>
                    setNodeAssignments(node.id, withPatched(node.assignments, i, { var: e.currentTarget.value }))}
                />
                <input
                  placeholder={'expr (e.g. "issued" or outcome.text)'}
                  class="flex-1 rounded border border-black/10 bg-transparent px-1.5 py-1 font-mono text-xs dark:border-white/10"
                  value={a.expr}
                  oninput={(e) =>
                    setNodeAssignments(node.id, withPatched(node.assignments, i, { expr: e.currentTarget.value }))}
                />
                <button
                  type="button"
                  class="text-rose-500 hover:text-rose-700"
                  title="Remove"
                  onclick={() => setNodeAssignments(node.id, withRemoved(node.assignments, i))}>✕</button
                >
              </div>
            {/each}
            <button
              type="button"
              class="text-[11px] text-zinc-500 underline hover:text-zinc-800 dark:hover:text-zinc-200"
              onclick={() => setNodeAssignments(node.id, withAdded(node.assignments))}
            >
              + add assignment
            </button>
          </div>
        {/if}
      {/if}

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
            <span class="block text-[11px] text-zinc-400"> No channels in the registry yet. </span>
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

      {#if isEntry}
        <div class="space-y-1 rounded-md border border-emerald-300 bg-emerald-50 p-2 dark:border-emerald-900 dark:bg-emerald-950/30">
          <p class="text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
            Entry door — an inbound channel. A consumer submits a query here to
            trigger the flow.
          </p>
          <button
            type="button"
            class="rounded bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700"
            data-testid="inspector-submit"
            onclick={() => node && onsubmit(node.id)}>Submit a query ▸</button
          >
        </div>
      {/if}
    </div>

    <div class="space-y-2">
      <h2 class="text-xs font-semibold uppercase tracking-wide text-zinc-500">Transitions</h2>
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
            placeholder="guard (e.g. outcome.verdict == &quot;approve&quot;)"
            class="w-full rounded border border-black/10 bg-transparent px-1.5 py-1 font-mono text-xs dark:border-white/10"
            value={edge.guard ?? ""}
            oninput={(e) => editor.updateEdge(edge.id, { guard: e.currentTarget.value })}
          />
          <!-- per-branch variable assignments (compiled to `set:`) -->
          {#each edge.set ?? [] as a, i (i)}
            <div class="flex items-center gap-1">
              <input
                placeholder="var"
                class="w-1/3 rounded border border-black/10 bg-transparent px-1.5 py-1 font-mono text-[11px] dark:border-white/10"
                value={a.var}
                oninput={(e) =>
                  setEdgeAssignments(edge.id, withPatched(edge.set, i, { var: e.currentTarget.value }))}
              />
              <input
                placeholder="expr"
                class="flex-1 rounded border border-black/10 bg-transparent px-1.5 py-1 font-mono text-[11px] dark:border-white/10"
                value={a.expr}
                oninput={(e) =>
                  setEdgeAssignments(edge.id, withPatched(edge.set, i, { expr: e.currentTarget.value }))}
              />
              <button
                type="button"
                class="text-rose-500 hover:text-rose-700"
                title="Remove"
                onclick={() => setEdgeAssignments(edge.id, withRemoved(edge.set, i))}>✕</button
              >
            </div>
          {/each}
          <button
            type="button"
            class="text-[11px] text-zinc-500 underline hover:text-zinc-800 dark:hover:text-zinc-200"
            onclick={() => setEdgeAssignments(edge.id, withAdded(edge.set))}
          >
            + set variable
          </button>
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
    <p class="pt-2 text-sm text-zinc-500">Select a node to edit it.</p>
  {/if}
</aside>
