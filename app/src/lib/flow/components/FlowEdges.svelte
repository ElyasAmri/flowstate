<script lang="ts">
  import type { FlowDefinition, FlowNode } from "../types";
  import type { Point } from "../viewport.svelte";
  import { edgeMidpoint, edgePath, portPosition, groupPortPosition } from "../geometry";

  interface Props {
    flow: FlowDefinition;
    /** Live connection preview while dragging from an output port, else null. */
    pending: { from: Point; to: Point } | null;
    /** Edge id to highlight as the active (just-traversed) transition. */
    activeEdgeId?: string | null;
    /** Map of channelId → member nodes, for grouped port positioning. */
    channelGroups?: Map<string, FlowNode[]>;
  }

  let { flow, pending, activeEdgeId = null, channelGroups }: Props = $props();

  // The edge the cursor is over, highlighted white so its path is easy to trace.
  let hoveredId = $state<string | null>(null);

  function nodeById(id: string) {
    return flow.nodes.find((n) => n.id === id);
  }

  /** Port position, accounting for channel-group slot offsets. */
  function portPos(node: FlowNode, side: "in" | "out"): Point {
    const group = channelGroups?.get(node.channelId ?? "");
    if (node.kind === "channel" && group) {
      return groupPortPosition(node, side, group);
    }
    return portPosition(node, side);
  }
</script>

<!-- One SVG spanning the whole world layer; overflow visible so edges aren't
     clipped. pointer-events none so nodes underneath stay grabbable; each edge's
     invisible hit-path re-enables events on itself for hover tracing. -->
<svg class="pointer-events-none absolute left-0 top-0 overflow-visible" width="1" height="1">
  <defs>
    <marker
      id="flow-arrow"
      viewBox="0 0 10 10"
      refX="9"
      refY="5"
      markerWidth="7"
      markerHeight="7"
      orient="auto-start-reverse"
    >
      <path d="M 0 0 L 10 5 L 0 10 z" class="fill-zinc-400 dark:fill-zinc-500" />
    </marker>
  </defs>

  {#each flow.edges as edge (edge.id)}
    {@const a = nodeById(edge.from)}
    {@const b = nodeById(edge.to)}
    {#if a && b}
      {@const from = portPos(a, "out")}
      {@const to = portPos(b, "in")}
      {@const mid = edgeMidpoint(from, to)}
      {@const d = edgePath(from, to)}
      {@const hovered = hoveredId === edge.id}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <g
        class="pointer-events-auto"
        onpointerenter={() => (hoveredId = edge.id)}
        onpointerleave={() => (hoveredId = null)}
      >
        <!-- Wide invisible hit area so hover is easy to land on the edge.
             pointer-events="stroke" hit-tests the stroke geometry directly, so it
             works even though the stroke is transparent — WebKit (the macOS Tauri
             webview) won't register hits on alpha-0 paint under visiblePainted. -->
        <path d={d} fill="none" stroke="transparent" stroke-width="16" pointer-events="stroke" />
        <path
          {d}
          fill="none"
          class={hovered
            ? "stroke-white"
            : activeEdgeId === edge.id
              ? "stroke-emerald-500 animated-edge"
              : "stroke-zinc-400 dark:stroke-zinc-500"}
          stroke-width={hovered || activeEdgeId === edge.id ? 3 : 2}
          marker-end="url(#flow-arrow)"
        />
      </g>

      {#if edge.label}
        <g transform="translate({mid.x}, {mid.y})" class="pointer-events-none">
          <rect
            x="-38"
            y="-11"
            width="76"
            height="18"
            rx="9"
            class="fill-zinc-50 dark:fill-zinc-800"
          />
          <text text-anchor="middle" dy="3" class="fill-zinc-500 text-[11px]">
            {edge.label}
          </text>
        </g>
      {/if}
    {/if}
  {/each}

  {#if pending}
    <path
      d={edgePath(pending.from, pending.to)}
      fill="none"
      class="stroke-sky-400"
      stroke-width="2"
      stroke-dasharray="5 4"
    />
  {/if}
</svg>
