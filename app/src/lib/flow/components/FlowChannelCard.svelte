<script lang="ts">
  import type { ChannelRegistry, FlowNode } from "../types";
  import { isEntryChannel } from "../types";
  import { nodeColorClasses, iconKeyForNode } from "../node-color";
  import { kindIconPath } from "../kind-icon";
  import { NODE_W } from "../geometry";

  interface Props {
    /** The channel's canonical card — its first/entry node in the group. */
    node: FlowNode;
    /** Sibling nodes that share the same channelId (terminal outcomes). */
    siblings: FlowNode[];
    channels: ChannelRegistry;
    selected: boolean;
    isEntry: boolean;
    /** The id of the node currently running in this group, or null. */
    activeNodeId?: string | null;
    onbodydown: (node: FlowNode, e: PointerEvent) => void;
    onbodydblclick: (node: FlowNode, e: MouseEvent) => void;
    onportdown: (node: FlowNode, e: PointerEvent) => void;
    onportup: (node: FlowNode, e: PointerEvent) => void;
  }

  let {
    node,
    siblings,
    channels,
    selected,
    isEntry,
    activeNodeId = null,
    onbodydown,
    onbodydblclick,
    onportdown,
    onportup,
  }: Props = $props();

  const channel = $derived(channels[node.channelId ?? ""]);
  const colors = $derived(nodeColorClasses(node, channels));
  const iconKey = $derived(iconKeyForNode(node, channels));
  const allSlots = $derived([node, ...siblings]);
  const anyActive = $derived(activeNodeId !== null && [node, ...siblings].some((s) => s.id === activeNodeId));

  /** Height grows with the number of sibling outcomes. */
  const SLOT_H = 36;
  const HEADER_H = 40;
  const GROUP_H = $derived(HEADER_H + allSlots.length * SLOT_H);

  function slotPortY(index: number, side: "in" | "out"): number {
    return HEADER_H + index * SLOT_H + SLOT_H / 2;
  }

  function handleSlotDown(slotNode: FlowNode, e: PointerEvent) {
    e.stopPropagation();
    onbodydown(slotNode, e);
  }

  function handleSlotDblClick(slotNode: FlowNode, e: MouseEvent) {
    e.stopPropagation();
    onbodydblclick(slotNode, e);
  }

  function handleSlotPortDown(slotNode: FlowNode, e: PointerEvent) {
    e.stopPropagation();
    onportdown(slotNode, e);
  }

  function handleSlotPortUp(slotNode: FlowNode, e: PointerEvent) {
    e.stopPropagation();
    onportup(slotNode, e);
  }

  function outcomeBadgeClass(outcome: string | undefined): string {
    switch (outcome) {
      case "issued":
        return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300";
      case "approved":
        return "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300";
      case "rejected":
        return "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300";
      default:
        return "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400";
    }
  }
</script>

<div
  class="group absolute select-none overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm transition-[box-shadow,transform] duration-150 dark:border-zinc-700 dark:bg-zinc-800
    {selected
      ? 'ring-2 ring-zinc-900 dark:ring-zinc-100'
      : anyActive
        ? 'animate-pulse-ring ring-2 ring-emerald-500'
        : 'hover:-translate-y-0.5 hover:shadow-lg'}"
  style="left: {node.position.x}px; top: {node.position.y}px; width: {NODE_W}px; height: {GROUP_H}px;"
>
  <!-- Channel header bar -->
  <div
    role="button"
    tabindex="-1"
    class="flex h-10 items-center gap-2 border-b border-black/5 px-3 dark:border-white/10"
    style="background: {colors.accent}; color: {colors.icon};"
    onpointerdown={(e) => onbodydown(node, e)}
    ondblclick={(e) => onbodydblclick(node, e)}
  >
    <svg class="h-4 w-4 shrink-0" viewBox="0 0 16 16" fill="none">
      <path d={kindIconPath[iconKey]} fill="currentColor" />
    </svg>
    <span class="min-w-0 truncate text-sm font-medium">
      {channel?.title ?? node.label}
    </span>
    {#if isEntry}
      <span class="ml-auto shrink-0 rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-medium uppercase">inbound</span>
    {/if}
  </div>

  <!-- Slot list -->
  <div class="divide-y divide-black/5 dark:divide-white/5">
    {#each allSlots as slot, i (slot.id)}
      <div
        role="button"
        tabindex="-1"
        class="flex h-9 items-center gap-2 px-3 text-sm transition-colors hover:bg-black/5 dark:hover:bg-white/5"
        class:active-slot={slot.id === activeNodeId}
        onpointerdown={(e) => handleSlotDown(slot, e)}
        ondblclick={(e) => handleSlotDblClick(slot, e)}
      >
        <!-- Input port (always visible — groups receive connections) -->
        <button
          type="button"
          aria-label="input port"
          class="z-10 h-3 w-3 shrink-0 rounded-full border-2 border-white bg-zinc-400 shadow-sm hover:bg-emerald-500"
          onpointerdown={(e) => handleSlotPortDown(slot, e)}
          onpointerup={(e) => handleSlotPortUp(slot, e)}
        ></button>

        <span class="min-w-0 flex-1 truncate">{slot.label}</span>

        {#if slot.outcome}
          <span
            class="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase {outcomeBadgeClass(slot.outcome)}"
          >
            {slot.outcome}
          </span>
        {/if}

        <!-- Output port (only for non-terminal) -->
        <button
          type="button"
          aria-label="output port"
          class="z-10 h-3 w-3 shrink-0 rounded-full border-2 border-white bg-zinc-400 shadow-sm hover:bg-emerald-500"
          class:invisible={!!slot.outcome}
          onpointerdown={(e) => handleSlotPortDown(slot, e)}
          onpointerup={(e) => handleSlotPortUp(slot, e)}
        ></button>
      </div>
    {/each}
  </div>
</div>

<style>
  .active-slot {
    background: rgba(16, 185, 129, 0.08);
  }
</style>
