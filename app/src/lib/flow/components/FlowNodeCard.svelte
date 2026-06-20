<script lang="ts">
  import type { ChannelRegistry, FlowNode } from "../types";
  import { nodeKindMeta } from "../types";
  import { NODE_W, NODE_H } from "../geometry";
  import { kindIconPath } from "../kind-icon";
  import { iconKeyForNode, nodeColorClasses } from "../node-color";

  interface Props {
    node: FlowNode;
    selected: boolean;
    isStart: boolean;
    /** Channel registry, for deriving this node's color and icon. */
    channels: ChannelRegistry;
    /** Pointer-down on the card body: begin a node drag (or selection). */
    onbodydown: (node: FlowNode, e: PointerEvent) => void;
    /** Pointer-down on the output port: begin a connection drag. */
    onportdown: (node: FlowNode, e: PointerEvent) => void;
    /** Pointer-up over the input port: complete a connection here. */
    onportup: (node: FlowNode, e: PointerEvent) => void;
  }

  let { node, selected, isStart, channels, onbodydown, onportdown, onportup }: Props = $props();

  const meta = $derived(nodeKindMeta(node.kind));
  const colors = $derived(nodeColorClasses(node, channels));
  const iconKey = $derived(iconKeyForNode(node, channels));
  // The referenced channel (when this is a channel node), for the type label.
  const channel = $derived(node.channelId ? (channels[node.channelId] ?? null) : null);
  // Type label: the channel's title for a resolved channel node, else the kind.
  const typeLabel = $derived(node.kind === "channel" && channel ? channel.title : meta.label);
  // Small subtle annotation shown by the type (not in the title).
  const annotation = $derived(isStart ? "start" : (node.outcome ?? null));

  const portClass =
    "absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full border-2 border-white bg-zinc-400 " +
    "shadow transition-all hover:scale-125 hover:bg-sky-500 group-hover:bg-sky-400 dark:border-zinc-800";
</script>

<div
  class="group absolute select-none overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm transition-[box-shadow,transform] duration-150 dark:border-zinc-700 dark:bg-zinc-800
    {selected
      ? 'ring-2 ring-zinc-900 dark:ring-zinc-100'
      : 'hover:-translate-y-0.5 hover:shadow-lg'}"
  style="left: {node.position.x}px; top: {node.position.y}px; width: {NODE_W}px; height: {NODE_H}px;"
>
  <!-- Top accent bar: the node's color in the 4-color scheme (calm, thin). -->
  <div class="absolute inset-x-0 top-0 h-1 {colors.accent}"></div>

  <!-- Card body: drag handle. Two columns: kind (icon + type) | name + desc. -->
  <div
    class="flex h-full cursor-grab items-stretch active:cursor-grabbing"
    role="button"
    tabindex="-1"
    onpointerdown={(e) => onbodydown(node, e)}
  >
    <!-- Left column: neutral kind/binding icon with the type label beneath.
         Color lives only in the top accent bar -- the icon and text stay neutral. -->
    <div
      class="flex w-20 shrink-0 flex-col items-center justify-center gap-1 pl-2 pr-1 text-zinc-500 dark:text-zinc-400"
    >
      <svg
        viewBox="0 0 24 24"
        class="h-6 w-6"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        {@html kindIconPath[iconKey]}
      </svg>
      <span class="line-clamp-2 w-full text-center text-[11px] leading-tight">{typeLabel}</span>
    </div>

    <!-- Subtle vertical divider. -->
    <div class="my-2 w-px shrink-0 bg-zinc-200 dark:bg-zinc-700"></div>

    <!-- Right column (main): node name + optional description. -->
    <div class="flex min-w-0 flex-1 flex-col justify-center px-3 py-2">
      {#if annotation}
        <span
          class="mb-0.5 inline-flex w-fit items-center rounded bg-zinc-100 px-1.5 py-px text-[10px] font-medium text-zinc-500 dark:bg-zinc-700/60 dark:text-zinc-300"
        >
          {annotation}
        </span>
      {/if}
      <span class="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
        {node.label}
      </span>
      {#if node.description}
        <span class="mt-0.5 line-clamp-2 text-[11px] leading-snug text-zinc-400 dark:text-zinc-500">
          {node.description}
        </span>
      {/if}
    </div>
  </div>

  <!-- Input port (left). Connections complete on pointer-up here. -->
  <div
    class="{portClass} -left-[7px]"
    role="button"
    tabindex="-1"
    aria-label="input"
    onpointerup={(e) => onportup(node, e)}
  ></div>

  <!-- Output port (right). Connections start on pointer-down here. -->
  <div
    class="{portClass} -right-[7px]"
    role="button"
    tabindex="-1"
    aria-label="output"
    onpointerdown={(e) => onportdown(node, e)}
  ></div>
</div>
