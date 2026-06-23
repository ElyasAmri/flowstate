<script lang="ts">
  import type { FlowDefinition, FlowNode } from "../types";
  import type { Point } from "../viewport.svelte";
  import { edgeMidpoint, edgePath, portPosition, groupPortPosition, HEADER_H, SLOT_H } from "../geometry";

  interface Props {
    flow: FlowDefinition;
    /** Live connection preview while dragging from an output port, else null. */
    pending: { from: Point; to: Point } | null;
    /** Edge id to highlight as the active (just-traversed) transition. */
    activeEdgeId?: string | null;
    /** Map of channelId → member nodes, for grouped port positioning. */
    channelGroups?: Map<string, FlowNode[]>;
    /** Delete an edge (click its line or the × badge that appears on hover). */
    ondelete: (edgeId: string) => void;
  }

  let { flow, pending, activeEdgeId = null, channelGroups, ondelete }: Props = $props();

  // The edge the cursor is over, for the n8n-style highlight + delete badge.
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
     clipped. pointer-events none so nodes underneath stay grabbable; individual
     edge hit-paths and badges re-enable events on themselves. -->
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
        role="button"
        tabindex="-1"
        class="pointer-events-auto cursor-pointer"
        onpointerenter={() => (hoveredId = edge.id)}
        onpointerleave={() => (hoveredId = null)}
        onpointerdown={(e) => {
          // Don't let the canvas start a pan; delete on primary click.
          e.stopPropagation();
          if (e.button === 0) ondelete(edge.id);
        }}
      >
        <!-- Wide invisible hit area for an easy click target. -->
        <path d={d} fill="none" stroke="transparent" stroke-width="16" />
        <path
          {d}
          fill="none"
          class={hovered
            ? "stroke-rose-400"
            : activeEdgeId === edge.id
              ? "stroke-emerald-500 animated-edge"
              : "stroke-zinc-400 dark:stroke-zinc-500"}
          stroke-width={hovered ? 3 : activeEdgeId === edge.id ? 3 : 2}
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

      {#if hovered}
        <!-- Delete badge at the edge midpoint. -->
        <g
          transform="translate({mid.x}, {mid.y})"
          role="button"
          tabindex="-1"
          aria-label="Delete connection"
          class="pointer-events-auto cursor-pointer"
          onpointerenter={() => (hoveredId = edge.id)}
          onpointerdown={(e) => {
            e.stopPropagation();
            ondelete(edge.id);
          }}
        >
          <circle r="9" class="fill-rose-500" />
          <path
            d="M -3.5 -3.5 L 3.5 3.5 M 3.5 -3.5 L -3.5 3.5"
            class="stroke-white"
            stroke-width="1.6"
            stroke-linecap="round"
          />
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
