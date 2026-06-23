<script lang="ts">
  import type { ChannelRegistry, FlowDefinition } from "../types";
  import { entryPayloadFields } from "../types";
  import { tryInvoke } from "../tauri";
  import { FlowRun, type Executors, type Value } from "../run/run.svelte";

  interface Props {
    /** The flow to run (the editor's current in-memory flow). */
    flow: FlowDefinition;
    /** The channel registry, for resolving the entry node's payload contract. */
    channels: ChannelRegistry;
    /** The inbound channel node the consumer submits to (the flow's entry door). */
    entryNodeId: string;
    onclose: () => void;
  }

  let { flow, channels, entryNodeId, onclose }: Props = $props();

  // The entry node and its channel. A flow is triggered by submitting a payload
  // across an inbound channel node -- there is no global Run button. The panel is
  // remounted per submission target ({#key}), so capturing these once is fine.
  // svelte-ignore state_referenced_locally
  const entryNode = flow.nodes.find((n) => n.id === entryNodeId);
  // svelte-ignore state_referenced_locally
  const channel = entryNode?.channelId ? channels[entryNode.channelId] : undefined;

  // The payload fields the consumer submits: the channel's inbound (`returns`)
  // message contract. Each field seeds a flow variable of the same name.
  const payloadFields = channel ? entryPayloadFields(channel) : [];

  // Editable payload, seeded from the flow's declared var defaults so the demo
  // submission starts populated.
  // svelte-ignore state_referenced_locally
  let values = $state<Record<string, string>>(
    Object.fromEntries(
      payloadFields.map((f) => {
        const declared = (flow.vars ?? []).find((v) => v.name === f.name);
        return [f.name, declared?.value ?? ""];
      }),
    ),
  );

  let run = $state<FlowRun | null>(null);
  let starting = $state(false);

  /** Wire the runner's side effects to the Tauri backend (stubbed off-Tauri). */
  async function executors(): Promise<Executors> {
    const dir = await tryInvoke<string>("project_dir");
    if (dir === null) {
      return {
        runShell: async () => ({ exit: 0, text: "(dev: shell stub)" }),
        runAgent: async (p) =>
          p.includes("VERDICT") ? "Reasoning...\nVERDICT: sufficient" : "رسالة تجريبية للمواطن.",
      };
    }
    return {
      runShell: async (command) =>
        (await tryInvoke<{ exit: number; text: string }>("run_shell", { dir, command })) ?? {
          exit: -1,
          text: "shell unavailable",
        },
      runAgent: async (prompt) => (await tryInvoke<string>("run_agent", { dir, prompt })) ?? "",
    };
  }

  /** The submitted payload as a name -> value map seeding the run's variables. */
  function payload(): Record<string, Value> {
    const out: Record<string, Value> = {};
    for (const f of payloadFields) out[f.name] = values[f.name] ?? "";
    return out;
  }

  async function submit() {
    if (!entryNode) return;
    starting = true;
    try {
      const r = new FlowRun(structuredClone(flow), await executors());
      run = r;
      await r.start(entryNode.id, payload());
    } finally {
      starting = false;
    }
  }

  const statusLabel: Record<string, string> = {
    idle: "Ready",
    running: "Running…",
    awaiting: "Waiting for you",
    done: "Done",
    error: "Error",
  };
</script>

<div
  class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
  role="dialog"
  aria-modal="true"
  data-testid="run-panel"
>
  <div
    class="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-black/10 bg-white shadow-xl dark:border-white/10 dark:bg-zinc-900"
  >
    <header class="flex items-center justify-between border-b border-black/10 px-4 py-3 dark:border-white/10">
      <div>
        <h2 class="text-sm font-semibold" data-testid="submit-title">
          Submit to {channel?.title ?? entryNode?.label ?? "channel"}
        </h2>
        <p class="text-[11px] text-zinc-500">
          Submitting a query across this inbound channel triggers the flow.
        </p>
      </div>
      <div class="flex items-center gap-2">
        {#if run}
          <span
            class="rounded-full px-2 py-0.5 text-[11px] font-medium {run.status === 'error'
              ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300'
              : run.status === 'done'
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                : 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'}"
            data-testid="run-status">{statusLabel[run.status] ?? run.status}</span
          >
        {/if}
        <button
          type="button"
          class="rounded px-2 py-1 text-xs hover:bg-black/5 dark:hover:bg-white/10"
          onclick={onclose}>Close</button
        >
      </div>
    </header>

    <div class="min-h-0 flex-1 space-y-4 overflow-auto p-4">
      <!-- The payload the consumer submits across the inbound channel -->
      <section class="space-y-2">
        <h3 class="text-xs font-semibold uppercase tracking-wide text-zinc-500">Payload</h3>
        {#if !entryNode || !channel}
          <p class="text-xs text-rose-500">
            This node is not bound to an inbound channel, so it cannot be submitted to.
          </p>
        {:else if payloadFields.length}
          {#each payloadFields as f (f.name)}
            <label class="block space-y-0.5 text-sm">
              <span class="font-mono text-[11px] text-zinc-500">
                {f.name}<span class="text-zinc-400"> · {f.type}</span>
              </span>
              <input
                class="w-full rounded-md border border-black/10 bg-transparent px-2 py-1 text-sm dark:border-white/10"
                value={values[f.name]}
                oninput={(e) => (values[f.name] = e.currentTarget.value)}
              />
            </label>
          {/each}
        {:else}
          <p class="text-xs text-zinc-400">
            This channel declares no inbound fields; submitting sends an empty payload.
          </p>
        {/if}
        <button
          type="button"
          class="rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          data-testid="run-start"
          disabled={starting || !entryNode || !channel}
          onclick={submit}>{run ? "Submit again" : "Submit ▸"}</button
        >
      </section>

      <!-- The human-escalation inbox: shown only while the run waits on a person -->
      {#if run && run.status === "awaiting" && run.pending}
        <section
          class="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30"
          data-testid="approval"
        >
          <h3 class="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
            Escalated — {run.pending.label}
          </h3>
          <p class="whitespace-pre-wrap text-sm text-amber-900 dark:text-amber-100">{run.pending.prompt}</p>
          <div class="flex gap-2">
            <button
              type="button"
              class="rounded bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700"
              data-testid="approve"
              onclick={() => run?.resolve("approve")}>Approve</button
            >
            <button
              type="button"
              class="rounded bg-rose-600 px-3 py-1 text-xs font-medium text-white hover:bg-rose-700"
              data-testid="reject"
              onclick={() => run?.resolve("reject")}>Reject</button
            >
          </div>
        </section>
      {/if}

      <!-- Final outcome -->
      {#if run && run.status === "done"}
        <section class="space-y-1 rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950/30">
          <h3 class="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
            Outcome: {run.vars.outcome || "(none)"}
          </h3>
          {#if run.result}
            <p class="whitespace-pre-wrap text-sm text-emerald-900 dark:text-emerald-100" dir="auto">{run.result}</p>
          {/if}
        </section>
      {/if}

      {#if run && run.status === "error"}
        <p class="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">
          {run.error}
        </p>
      {/if}

      <!-- Step-by-step trace -->
      {#if run && run.trace.length}
        <section class="space-y-1">
          <h3 class="text-xs font-semibold uppercase tracking-wide text-zinc-500">Trace</h3>
          <ol class="space-y-1 text-sm">
            {#each run.trace as step, i (i)}
              <li class="flex items-start gap-2">
                <span class="mt-0.5 w-5 shrink-0 text-right font-mono text-[11px] text-zinc-400">{i + 1}</span>
                <span class="min-w-0">
                  <span class="font-medium">{step.label}</span>
                  <span class="text-[11px] text-zinc-400"> · {step.kind}</span>
                  <span class="block truncate text-[12px] text-zinc-500" dir="auto">{step.detail}</span>
                </span>
              </li>
            {/each}
          </ol>
        </section>
      {/if}
    </div>
  </div>
</div>
