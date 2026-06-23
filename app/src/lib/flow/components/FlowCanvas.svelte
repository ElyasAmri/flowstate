<script lang="ts">
  import type { FlowEditor } from "../editor.svelte";
  import type { FlowNode } from "../types";
  import { isEntryChannel } from "../types";
  import { onMount } from "svelte";
  import { Viewport, type Point, type Size } from "../viewport.svelte";
  import { nodesBounds, portPosition, groupPortPosition } from "../geometry";
  import FlowNodeCard from "./FlowNodeCard.svelte";
  import FlowChannelCard from "./FlowChannelCard.svelte";
  import FlowEdges from "./FlowEdges.svelte";
  import CanvasControls from "./CanvasControls.svelte";

  interface Props {
    editor: FlowEditor;
    /** Double-click (activate) on a node body -- e.g. submit to an entry door. */
    onnodeactivate?: (node: FlowNode) => void;
    /** Live-run highlight: node currently executing. */
    activeNodeId?: string | null;
    /** Live-run highlight: edge currently being traversed. */
    activeEdgeId?: string | null;
  }

  let { editor, onnodeactivate, activeNodeId = null, activeEdgeId = null }: Props = $props();

  const viewport = new Viewport();

  // The canvas element, used to translate clientX/Y into canvas-relative
  // screen coordinates before converting to world space.
  let canvasEl = $state<HTMLDivElement | null>(null);

  /** Current canvas pixel size, for fit/zoom-to-centre math. */
  function viewSize(): Size {
    const rect = canvasEl?.getBoundingClientRect();
    return { width: rect?.width ?? 0, height: rect?.height ?? 0 };
  }

  /** Frame all nodes within the viewport (the n8n "fit view"). */
  function fitView() {
    const box = nodesBounds(editor.flow.nodes, channelGroups);
    if (box) viewport.fitTo(box, viewSize());
  }

  // Fit-on-open so the fixture flow frames nicely. One rAF lets layout settle so
  // the canvas has a real measured size before we compute the fit.
  onMount(() => {
    requestAnimationFrame(fitView);
  });

  // --- Channel groups: nodes with the same channelId render as one card ---
  // Non-channel nodes, and channels that appear only once, render as regular cards.
  const channelGroups = $derived.by(() => {
    const groups = new Map<string, FlowNode[]>();
    for (const n of editor.flow.nodes) {
      if (n.kind !== "channel" || !n.channelId) continue;
      let list = groups.get(n.channelId);
      if (!list) groups.set(n.channelId, (list = []));
      list.push(n);
    }
    return groups;
  });

  /** True when a node is part of a multi-node channel group. */
  function isGrouped(node: FlowNode): boolean {
    const g = channelGroups.get(node.channelId ?? "");
    return !!g && g.length > 1;
  }

  /** All renderables: grouped channel cards + standalone nodes. */
  type RenderItem =
    | { kind: "channel-group"; primary: FlowNode; siblings: FlowNode[] }
    | { kind: "standalone"; node: FlowNode };

  const renderItems = $derived.by((): RenderItem[] => {
    const groupedIds = new Set<string>();
    const items: RenderItem[] = [];

    for (const [chId, members] of channelGroups) {
      if (members.length < 2) continue;
      // Use the entry node (or first) as the primary position anchor.
      const entry = members.find((m) => isEntryChannel(m, editor.channels, editor.flow.edges)) ?? members[0];
      const siblings = members.filter((m) => m.id !== entry.id);
      items.push({ kind: "channel-group", primary: entry, siblings });
      for (const m of members) groupedIds.add(m.id);
    }

    for (const n of editor.flow.nodes) {
      if (!groupedIds.has(n.id)) {
        items.push({ kind: "standalone", node: n });
      }
    }
    return items;
  });

  // Pointer-interaction state machine. Window listeners are attached only while
  // a gesture is active (see startGesture) and torn down on pointer-up.
  type Interaction =
    | { kind: "idle" }
    | { kind: "panning"; originScreen: Point; originPan: Point }
    | { kind: "draggingNode"; nodeId: string; grabOffsetWorld: Point }
    | { kind: "connecting"; fromNodeId: string; cursorWorld: Point };

  let interaction = $state<Interaction>({ kind: "idle" });

  /** clientX/Y -> screen coords relative to the canvas element. */
  function toScreen(e: PointerEvent): Point {
    const rect = canvasEl!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function toWorld(e: PointerEvent): Point {
    return viewport.screenToWorld(toScreen(e));
  }

  // --- live preview of a connection drag, in world coords (for FlowEdges) ---
  const pending = $derived.by(() => {
    const i = interaction;
    if (i.kind !== "connecting") return null;
    const from = editor.flow.nodes.find((n) => n.id === i.fromNodeId);
    if (!from) return null;
    const group = channelGroups.get(from.channelId ?? "");
    const fp = group && group.length > 1
      ? groupPortPosition(from, "out", group)
      : portPosition(from, "out");
    return { from: fp, to: i.cursorWorld };
  });

  // --- node body: select + begin drag ---
  function handleBodyDown(node: FlowNode, e: PointerEvent) {
    e.stopPropagation();
    editor.select(node.id);
    const world = toWorld(e);
    interaction = {
      kind: "draggingNode",
      nodeId: node.id,
      grabOffsetWorld: { x: world.x - node.position.x, y: world.y - node.position.y },
    };
    startGesture(e);
  }

  // --- node body: double-click to activate (select handled on pointer-down) ---
  function handleBodyDblClick(node: FlowNode, e: MouseEvent) {
    e.stopPropagation();
    onnodeactivate?.(node);
  }

  // --- output port: begin connection ---
  function handlePortDown(node: FlowNode, e: PointerEvent) {
    e.stopPropagation();
    interaction = { kind: "connecting", fromNodeId: node.id, cursorWorld: toWorld(e) };
    startGesture(e);
  }

  // --- input port: complete connection ---
  function handlePortUp(node: FlowNode, e: PointerEvent) {
    if (interaction.kind === "connecting") {
      e.stopPropagation();
      editor.addEdge(interaction.fromNodeId, node.id);
      // pointerup window handler will reset to idle.
    }
  }

  // --- empty canvas: begin pan + clear selection ---
  function handleCanvasDown(e: PointerEvent) {
    editor.select(null);
    interaction = {
      kind: "panning",
      originScreen: toScreen(e),
      originPan: { ...viewport.pan },
    };
    startGesture(e);
  }

  // --- wheel: zoom toward cursor ---
  function handleWheel(e: WheelEvent) {
    e.preventDefault();
    const rect = canvasEl!.getBoundingClientRect();
    const focus = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    // Smooth exponential zoom; up = zoom in.
    const factor = Math.exp(-e.deltaY * 0.0015);
    viewport.zoomAt(focus, factor);
  }

  function startGesture(e: PointerEvent) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    window.addEventListener("pointermove", onWindowMove);
    window.addEventListener("pointerup", onWindowUp);
  }

  function endGesture() {
    window.removeEventListener("pointermove", onWindowMove);
    window.removeEventListener("pointerup", onWindowUp);
    // A finished node drag is one undo step; tell the editor to stop coalescing
    // so the next drag starts a fresh history entry.
    if (interaction.kind === "draggingNode") editor.endDrag();
    interaction = { kind: "idle" };
  }

  function onWindowMove(e: PointerEvent) {
    if (interaction.kind === "panning") {
      const s = toScreen(e);
      viewport.pan = {
        x: interaction.originPan.x + (s.x - interaction.originScreen.x),
        y: interaction.originPan.y + (s.y - interaction.originScreen.y),
      };
    } else if (interaction.kind === "draggingNode") {
      const world = toWorld(e);
      editor.moveNode(interaction.nodeId, {
        x: world.x - interaction.grabOffsetWorld.x,
        y: world.y - interaction.grabOffsetWorld.y,
      });
    } else if (interaction.kind === "connecting") {
      interaction = { ...interaction, cursorWorld: toWorld(e) };
    }
  }

  function onWindowUp() {
    endGesture();
  }
</script>

<div
  bind:this={canvasEl}
  class="relative h-full w-full overflow-hidden bg-zinc-50 dark:bg-zinc-900/40"
  style="
    background-image: radial-gradient(circle, rgb(0 0 0 / 0.08) 1px, transparent 1px);
    background-size: {24 * viewport.zoom}px {24 * viewport.zoom}px;
    background-position: {viewport.pan.x}px {viewport.pan.y}px;
    cursor: {interaction.kind === 'panning' ? 'grabbing' : 'default'};
  "
  role="presentation"
  onpointerdown={handleCanvasDown}
  onwheel={handleWheel}
>
  <!-- World layer: single transform keeps nodes and edges aligned at any zoom. -->
  <div
    class="absolute left-0 top-0 origin-top-left"
    style="transform: translate({viewport.pan.x}px, {viewport.pan.y}px) scale({viewport.zoom});"
  >
    <FlowEdges
      flow={editor.flow}
      {pending}
      {activeEdgeId}
      {channelGroups}
      ondelete={(id) => editor.deleteEdge(id)}
    />

    {#each renderItems as item}
      {#if item.kind === "channel-group"}
        <FlowChannelCard
          node={item.primary}
          siblings={item.siblings}
          channels={editor.channels}
          selected={editor.selectedNodeId === item.primary.id}
          isEntry={isEntryChannel(item.primary, editor.channels, editor.flow.edges)}
          activeNodeId={activeNodeId}
          onbodydown={handleBodyDown}
          onbodydblclick={handleBodyDblClick}
          onportdown={handlePortDown}
          onportup={handlePortUp}
        />
      {:else if item.node.kind === "channel"}
        <!-- Standalone channel with a single node – render as a 1-slot group -->
        <FlowChannelCard
          node={item.node}
          siblings={[]}
          channels={editor.channels}
          selected={editor.selectedNodeId === item.node.id}
          isEntry={isEntryChannel(item.node, editor.channels, editor.flow.edges)}
          activeNodeId={activeNodeId}
          onbodydown={handleBodyDown}
          onbodydblclick={handleBodyDblClick}
          onportdown={handlePortDown}
          onportup={handlePortUp}
        />
      {:else}
        <FlowNodeCard
          node={item.node}
          active={item.node.id === activeNodeId}
          selected={item.node.id === editor.selectedNodeId}
          isEntry={false}
          channels={editor.channels}
          onbodydown={handleBodyDown}
          onbodydblclick={handleBodyDblClick}
          onportdown={handlePortDown}
          onportup={handlePortUp}
        />
      {/if}
    {/each}
  </div>

  <CanvasControls
    zoom={viewport.zoom}
    onfit={fitView}
    onreset={() => viewport.reset()}
    onzoomin={() => viewport.zoomStep(1.2, viewSize())}
    onzoomout={() => viewport.zoomStep(1 / 1.2, viewSize())}
  />
</div>
