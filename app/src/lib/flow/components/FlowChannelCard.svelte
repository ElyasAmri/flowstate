<script lang="ts">
  import type { ChannelRegistry, FlowNode } from "../types";
  import { isEntryChannel } from "../types";
  import { nodeColorClasses, iconKeyForNode } from "../node-color";
  import { kindIconPath } from "../kind-icon";
  import { NODE_W, SLOT_H, HEADER_H } from "../geometry";

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

  /** Height grows with the number of sibling outcomes. Uses the shared geometry
   *  constants so the rendered rows line up with the edge port positions. */
  const GROUP_H = $derived(HEADER_H + allSlots.length * SLOT_H);

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
    // Don't stop propagation here: the gesture ends via the window pointerup
    // listener (endGesture), and swallowing the event would leave a drag stuck
    // to the cursor. onportup only completes a connection when one is in flight.
    onportup(slotNode, e);
  }
</script>

<div
  class="group absolute select-none overflow-hidden rounded-t-xl border border-zinc-200 bg-white shadow-sm transition-shadow duration-150 dark:border-zinc-700 dark:bg-zinc-800
    {selected
      ? 'ring-2 ring-zinc-900 dark:ring-zinc-100'
      : anyActive
        ? 'animate-pulse-ring ring-2 ring-emerald-500'
        : 'hover:shadow-md hover:ring-1 hover:ring-zinc-300 dark:hover:ring-zinc-600'}"
  style="left: {node.position.x}px; top: {node.position.y}px; width: {NODE_W}px; height: {GROUP_H}px;"
>
  <!-- Channel header bar (neutral; color lives in the bottom accent bar) -->
  <div
    role="button"
    tabindex="-1"
    class="flex items-center gap-2 border-b border-black/5 px-3 text-zinc-600 dark:border-white/10 dark:text-zinc-300"
    style="height: {HEADER_H}px"
    onpointerdown={(e) => onbodydown(node, e)}
    ondblclick={(e) => onbodydblclick(node, e)}
  >
    <svg class="h-4 w-4 shrink-0 {colors.icon}" viewBox="0 0 16 16" fill="none">
      <path d={kindIconPath[iconKey]} fill="currentColor" />
    </svg>
    <span class="min-w-0 truncate text-sm font-medium">
      {channel?.title ?? node.label}
    </span>
  </div>

  <!-- Slot list -->
  <div class="divide-y divide-black/5 dark:divide-white/5">
    {#each allSlots as slot (slot.id)}
      <!-- The whole slot row is a connection drop target: releasing a drag
           anywhere on it completes the edge to that slot's node. -->
      <div
        role="button"
        tabindex="-1"
        class="relative flex items-center gap-2 px-3 text-sm transition-colors hover:bg-black/5 dark:hover:bg-white/5"
        style="height: {SLOT_H}px"
        class:active-slot={slot.id === activeNodeId}
        onpointerdown={(e) => handleSlotDown(slot, e)}
        onpointerup={(e) => handleSlotPortUp(slot, e)}
        ondblclick={(e) => handleSlotDblClick(slot, e)}
      >
        <!-- Input port: a vertical rounded-rectangle bar straddling the card's
             left edge (matches groupPortPosition; spans the edge fan-out). -->
        <button
          type="button"
          aria-label="input port"
          class="absolute -left-[4px] top-1/2 z-10 h-6 w-2 -translate-y-1/2 rounded border-2 border-white bg-zinc-400 shadow-sm hover:bg-sky-500 dark:border-zinc-800"
          onpointerdown={(e) => handleSlotPortDown(slot, e)}
        ></button>

        <span class="min-w-0 flex-1 truncate">{slot.label}</span>

        <!-- Output port: bar straddling the card's right edge (non-terminal only). -->
        {#if !slot.outcome}
          <button
            type="button"
            aria-label="output port"
            class="absolute -right-[4px] top-1/2 z-10 h-6 w-2 -translate-y-1/2 rounded border-2 border-white bg-zinc-400 shadow-sm hover:bg-sky-500 dark:border-zinc-800"
            onpointerdown={(e) => handleSlotPortDown(slot, e)}
          ></button>
        {/if}
      </div>
    {/each}
  </div>

  <!-- Bottom accent bar: the channel's binding color (calm, thin, flush). -->
  <div class="absolute inset-x-0 bottom-0 h-1 {colors.accent}"></div>
</div>

<style>
  .active-slot {
    background: rgba(16, 185, 129, 0.08);
  }
</style>
