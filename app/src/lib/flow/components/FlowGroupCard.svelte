<script lang="ts">
  import type { FlowNode } from "../types";
  import type { ColorClasses } from "../node-color";
  import { kindIconPath } from "../kind-icon";

  interface Props {
    /** The `group` container node (anchors the frame's top-left). */
    node: FlowNode;
    /** Frame width / height in world units, computed by the canvas from the
     *  stacked member cards it contains. */
    width: number;
    height: number;
    /** True when the group has no members yet (show a drop hint). */
    empty: boolean;
    selected: boolean;
    /** The group's color classes (frame border + header icon tint). */
    colors: ColorClasses;
    /** Pointer-down on the header: drag the whole group (members follow). */
    onbodydown: (node: FlowNode, e: PointerEvent) => void;
    onbodydblclick: (node: FlowNode, e: MouseEvent) => void;
  }

  let { node, width, height, empty, selected, colors, onbodydown, onbodydblclick }: Props = $props();
</script>

<!-- A container frame drawn behind its member cards. The members are real cards
     positioned into a vertical stack by the canvas, so the channel card (and any
     node) appears inside the group as-is. -->
<div
  class="absolute select-none rounded-xl border border-dashed transition-shadow duration-150 {colors.border}
    {selected
      ? 'ring-2 ring-zinc-900 dark:ring-zinc-100'
      : 'hover:ring-1 hover:ring-zinc-300 dark:hover:ring-zinc-600'}"
  style="left: {node.position.x}px; top: {node.position.y}px; width: {width}px; height: {height}px;"
>
  <!-- Header: drag handle + label. -->
  <div
    role="button"
    tabindex="-1"
    class="flex h-10 cursor-grab items-center gap-2 rounded-t-xl px-3 text-zinc-600 active:cursor-grabbing dark:text-zinc-300"
    onpointerdown={(e) => onbodydown(node, e)}
    ondblclick={(e) => onbodydblclick(node, e)}
  >
    <svg
      viewBox="0 0 24 24"
      class="h-4 w-4 shrink-0 {colors.icon}"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {@html kindIconPath.group}
    </svg>
    <span class="min-w-0 truncate text-sm font-medium">{node.label}</span>
  </div>

  {#if empty}
    <div class="flex items-center justify-center px-3 pb-3 text-[11px] text-zinc-400">
      Drag nodes here to stack them
    </div>
  {/if}
</div>
