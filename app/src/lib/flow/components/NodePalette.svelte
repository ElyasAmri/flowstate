<script lang="ts">
  import { NODE_KINDS, type NodeKind } from "../types";
  import { kindDot } from "../kind-accent";

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
        class="block w-full rounded-md border border-black/10 px-2.5 py-1.5 text-left text-sm
          hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
        title={meta.blurb}
      >
        <span class="flex items-center gap-1.5 font-medium">
          <span class="h-2 w-2 shrink-0 rounded-full {kindDot[meta.kind]}"></span>
          {meta.label}
        </span>
        <span class="block text-[11px] leading-tight text-zinc-500">{meta.blurb}</span>
      </button>
    {/each}
  </div>
</aside>
