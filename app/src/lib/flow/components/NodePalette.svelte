<script lang="ts">
  import { NODE_KINDS, type NodeKind } from "../types";
  import { kindIconPath } from "../kind-icon";

  interface Props {
    onadd: (kind: NodeKind) => void;
  }

  let { onadd }: Props = $props();
</script>

<aside class="w-48 shrink-0 space-y-2 border-r border-black/10 p-3 dark:border-white/10">
  <h2 class="text-xs font-semibold uppercase tracking-wide text-zinc-500">Add node</h2>
  <div class="space-y-1.5">
    {#each NODE_KINDS as meta (meta.kind)}
      <button
        type="button"
        data-flow-kind={meta.kind}
        onclick={() => onadd(meta.kind)}
        class="flex w-full items-start gap-2 rounded-md border border-black/10 px-2.5 py-1.5 text-left text-sm
          hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
        title={meta.blurb}
      >
        <svg
          viewBox="0 0 24 24"
          class="mt-0.5 h-4 w-4 shrink-0 text-zinc-500 dark:text-zinc-400"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          {@html kindIconPath[meta.kind]}
        </svg>
        <span class="min-w-0">
          <span class="block font-medium">{meta.label}</span>
          <span class="block text-[11px] leading-tight text-zinc-500">{meta.blurb}</span>
        </span>
      </button>
    {/each}
  </div>
</aside>
