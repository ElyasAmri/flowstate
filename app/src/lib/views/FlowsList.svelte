<script lang="ts">
  import { onMount } from "svelte";
  import { tryInvoke } from "../flow/tauri";
  import {
    blankFlow,
    draftDecisionLetter,
    exampleChannels,
    residenceCertificateRunnable,
  } from "../flow/fixtures";
  import { seedChannelsIfEmpty } from "../flow/channels";

  interface Props {
    /** Open the editor on the given flow id. */
    onopen: (id: string) => void;
  }

  let { onopen }: Props = $props();

  /** Matches the Rust `FlowMeta` (snake_case, no rename). */
  interface FlowMeta {
    id: string;
    title: string;
    node_count: number;
  }

  // unavailable = not running under Tauri (list_flows returned null). In that
  // case we still show the fixture as a single seed card so dev/in-browser use
  // always has a way into the editor.
  type Status = "loading" | "ready" | "unavailable";
  let status = $state<Status>("loading");
  let flows = $state<FlowMeta[]>([]);
  let creating = $state(false);

  // Bundled flows seeded into the library: the runnable Residence Certificate
  // flow (always shown in the selector) and the nested "Draft decision letter"
  // sub-flow it references via a flow-bound channel (seeded so it resolves when
  // opened/run, even though it's a building block rather than a top-level flow).
  const bundled = [residenceCertificateRunnable, draftDecisionLetter];

  async function refresh() {
    const dir = await tryInvoke<string>("project_dir");
    if (dir === null) {
      // Off-Tauri: surface the fixtures so the selector is never a dead end.
      flows = bundled.map((f) => ({ id: f.id, title: f.title, node_count: f.nodes.length }));
      status = "unavailable";
      return;
    }
    const list = await tryInvoke<FlowMeta[]>("list_flows", { dir });
    let flowList = list ?? [];
    // Seed the channels the worked example references on a fresh library so
    // its channel nodes resolve to the right colors when the editor opens.
    if (flowList.length === 0) await seedChannelsIfEmpty(exampleChannels);
    // Ensure the bundled example exists in the library (fresh project OR an
    // existing one that predates it), then re-list so the cards reflect on-disk
    // truth.
    let changed = false;
    for (const fx of bundled) {
      if (!flowList.some((f) => f.id === fx.id)) {
        await tryInvoke<void>("write_flow", { dir, name: fx.id, flow: fx });
        changed = true;
      }
    }
    if (changed) {
      const seeded = await tryInvoke<FlowMeta[]>("list_flows", { dir });
      flowList = seeded ?? flowList;
    }
    flows = flowList;
    status = "ready";
  }

  onMount(refresh);

  // Create a fresh blank flow, persist it, then open the editor on it.
  async function newFlow() {
    creating = true;
    try {
      const id = `flow-${Math.random().toString(36).slice(2, 8)}`;
      const dir = await tryInvoke<string>("project_dir");
      if (dir !== null) {
        await tryInvoke<void>("write_flow", { dir, name: id, flow: blankFlow(id) });
      }
      onopen(id);
    } finally {
      creating = false;
    }
  }
</script>

<div class="mx-auto max-w-4xl space-y-6" data-testid="flows-list">
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-2xl font-semibold">Flows</h1>
      <p class="text-sm text-zinc-500 dark:text-zinc-400">
        Choose a flow to edit, or create a new one.
      </p>
    </div>
    <button
      type="button"
      class="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-black"
      data-testid="new-flow"
      disabled={creating}
      onclick={newFlow}>{creating ? "Creating…" : "New flow"}</button
    >
  </div>

  {#if status === "loading"}
    <p class="text-sm text-zinc-500">Loading flows…</p>
  {:else if flows.length === 0}
    <div
      class="rounded-xl border border-dashed border-black/15 p-10 text-center dark:border-white/15"
    >
      <p class="text-sm text-zinc-500 dark:text-zinc-400">
        No flows yet. Click <span class="font-medium">New flow</span> to start.
      </p>
    </div>
  {:else}
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {#each flows as flow (flow.id)}
        <button
          type="button"
          class="flex flex-col items-start gap-2 rounded-xl border border-black/10 p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md dark:border-white/10"
          data-testid="flow-card"
          data-flow-id={flow.id}
          onclick={() => onopen(flow.id)}
        >
          <span class="text-base font-medium text-zinc-900 dark:text-zinc-100">
            {flow.title}
          </span>
          <span class="font-mono text-[11px] text-zinc-400">{flow.id}</span>
          <span
            class="mt-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
          >
            {flow.node_count} nodes
          </span>
        </button>
      {/each}
    </div>
    {#if status === "unavailable"}
      <p class="text-xs text-zinc-400">
        Backend unavailable (running outside the desktop app) — showing the bundled
        example flow.
      </p>
    {/if}
  {/if}
</div>
