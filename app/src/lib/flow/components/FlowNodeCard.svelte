<script lang="ts">
  import type { FlowNode } from "../types";
  import { nodeKindMeta } from "../types";
  import { NODE_W, NODE_H } from "../geometry";

  interface Props {
    node: FlowNode;
    selected: boolean;
    isStart: boolean;
    /** Pointer-down on the card body: begin a node drag (or selection). */
    onbodydown: (node: FlowNode, e: PointerEvent) => void;
    /** Pointer-down on the output port: begin a connection drag. */
    onportdown: (node: FlowNode, e: PointerEvent) => void;
    /** Pointer-up over the input port: complete a connection here. */
    onportup: (node: FlowNode, e: PointerEvent) => void;
  }

  let { node, selected, isStart, onbodydown, onportdown, onportup }: Props = $props();

  import { kindDot } from "../kind-accent";

  const meta = $derived(nodeKindMeta(node.kind));
  const portClass =
    "absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full border-2 border-white bg-zinc-400 " +
    "shadow transition-all hover:scale-125 hover:bg-sky-500 group-hover:bg-sky-400 dark:border-zinc-800";
</script>

<div
  class="group absolute select-none rounded-xl border border-zinc-200 bg-white shadow-sm transition-[box-shadow,transform] duration-150 dark:border-zinc-700 dark:bg-zinc-800
    {selected
      ? 'ring-2 ring-zinc-900 dark:ring-zinc-100'
      : 'hover:-translate-y-0.5 hover:shadow-lg'}"
  style="left: {node.position.x}px; top: {node.position.y}px; width: {NODE_W}px; height: {NODE_H}px;"
>
  <!-- Card body: drag handle. Cursor grab affords moving. -->
  <div
    class="flex h-full cursor-grab flex-col justify-center px-3 active:cursor-grabbing"
    role="button"
    tabindex="-1"
    onpointerdown={(e) => onbodydown(node, e)}
  >
    <span class="flex items-center gap-1.5 text-[11px] text-zinc-500">
      <!-- Single subtle accent: a muted dot conveys the node kind. -->
      <span class="h-2 w-2 shrink-0 rounded-full {kindDot[node.kind]}"></span>
      {meta.label}{#if isStart}&nbsp;· start{/if}{#if node.outcome}&nbsp;· {node.outcome}{/if}
    </span>
    <span class="block truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
      {node.label}
    </span>
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
