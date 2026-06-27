<script lang="ts">
  import type { FlowEditor } from "../editor.svelte";
  import type { FlowNode } from "../types";
  import { isEntryChannel } from "../types";
  import { onMount } from "svelte";
  import { Viewport, type Point, type Size } from "../viewport.svelte";
  import {
    nodesBounds,
    portPosition,
    groupPortPosition,
    groupCardHeight,
    NODE_W,
    NODE_H,
    HEADER_H,
    GROUP_PAD,
    GROUP_EMPTY_H,
  } from "../geometry";
  import { nodeColorClasses } from "../node-color";
  import FlowNodeCard from "./FlowNodeCard.svelte";
  import FlowChannelCard from "./FlowChannelCard.svelte";
  import FlowGroupCard from "./FlowGroupCard.svelte";
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
    /** Bump this to frame the whole flow (eased) -- e.g. after a run adds nodes,
     *  so the audience sees the new flow appear in context, not zoomed in. */
    fitToken?: number;
  }

  let {
    editor,
    onnodeactivate,
    activeNodeId = null,
    activeEdgeId = null,
    fitToken = 0,
  }: Props = $props();

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
    const box = nodesBounds(editor.flow.nodes, channelGroups, nodeGroups);
    if (box) viewport.fitTo(box, viewSize());
  }

  // Fit-on-open so the fixture flow frames nicely. One rAF lets layout settle so
  // the canvas has a real measured size before we compute the fit.
  onMount(() => {
    requestAnimationFrame(fitView);
  });

  // Ids of all `group` container nodes, for membership resolution.
  const groupNodeIds = $derived(
    new Set(editor.flow.nodes.filter((n) => n.kind === "group").map((n) => n.id)),
  );

  // --- Node groups: nodes whose groupId points at a `group` container ---
  // Members render stacked inside that group's card (in flow order).
  const nodeGroups = $derived.by(() => {
    const groups = new Map<string, FlowNode[]>();
    for (const n of editor.flow.nodes) {
      if (n.kind === "group" || !n.groupId || !groupNodeIds.has(n.groupId)) continue;
      let list = groups.get(n.groupId);
      if (!list) groups.set(n.groupId, (list = []));
      list.push(n);
    }
    return groups;
  });

  // --- Channel groups: nodes with the same channelId render as one card ---
  // Non-channel nodes, and channels that appear only once, render as regular cards.
  // Channel grouping is independent of group membership: a channel card keeps its
  // multi-slot form even when stacked inside a `group` container.
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

  // --- group container layout -----------------------------------------------
  // A `group` is a free-form frame drawn behind its member cards: members keep
  // their own positions (so any arrangement -- a vertical stack OR a compact
  // grid -- is preserved), and the frame wraps their bounding box. Dragging the
  // group moves the whole arrangement together.

  /** Frame size of a group: wraps its members' actual bounding box, so members
   *  laid out in any arrangement (a vertical stack OR a grid) are framed
   *  correctly. The frame's top-left is the group node's position; we measure to
   *  the far edge of the furthest member and pad. */
  function groupFrameSize(group: FlowNode): Size {
    const members = nodeGroups.get(group.id) ?? [];
    if (members.length === 0) {
      return { width: NODE_W + 2 * GROUP_PAD, height: HEADER_H + 2 * GROUP_PAD + GROUP_EMPTY_H };
    }
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const m of members) {
      const h =
        m.kind === "channel" && m.channelId
          ? groupCardHeight((channelGroups.get(m.channelId) ?? [m]).length)
          : NODE_H;
      maxX = Math.max(maxX, m.position.x + NODE_W);
      maxY = Math.max(maxY, m.position.y + h);
    }
    return {
      width: maxX - group.position.x + GROUP_PAD,
      height: maxY - group.position.y + GROUP_PAD,
    };
  }

  /** Move a group to `newPos`, shifting every member by the same delta so the
   *  members' arrangement (grid or stack) is preserved. */
  function groupTranslateUpdates(group: FlowNode, newPos: Point): { id: string; position: Point }[] {
    const dx = newPos.x - group.position.x;
    const dy = newPos.y - group.position.y;
    const updates = [{ id: group.id, position: newPos }];
    for (const m of nodeGroups.get(group.id) ?? [])
      updates.push({ id: m.id, position: { x: m.position.x + dx, y: m.position.y + dy } });
    return updates;
  }

  /** All renderables. Group frames render first (behind); members render as their
   *  normal cards on top, positioned by the stack layout into the frame. */
  type RenderItem =
    | { kind: "channel-group"; primary: FlowNode; siblings: FlowNode[] }
    | { kind: "group-frame"; group: FlowNode }
    | { kind: "standalone"; node: FlowNode };

  const renderItems = $derived.by((): RenderItem[] => {
    const consumed = new Set<string>();
    const frames: RenderItem[] = [];
    const cards: RenderItem[] = [];

    // Group frames sit behind their members (drawn first).
    for (const g of editor.flow.nodes) {
      if (g.kind !== "group") continue;
      frames.push({ kind: "group-frame", group: g });
      consumed.add(g.id);
    }

    for (const [, members] of channelGroups) {
      if (members.length < 2) continue;
      // Use the entry node (or first) as the primary position anchor.
      const entry = members.find((m) => isEntryChannel(m, editor.channels, editor.flow.edges)) ?? members[0];
      const siblings = members.filter((m) => m.id !== entry.id);
      cards.push({ kind: "channel-group", primary: entry, siblings });
      for (const m of members) consumed.add(m.id);
    }

    for (const n of editor.flow.nodes) {
      if (!consumed.has(n.id)) {
        cards.push({ kind: "standalone", node: n });
      }
    }
    return [...frames, ...cards];
  });

  // Pointer-interaction state machine. Window listeners are attached only while
  // a gesture is active (see startGesture) and torn down on pointer-up.
  type Interaction =
    | { kind: "idle" }
    | { kind: "panning"; originScreen: Point; originPan: Point }
    | { kind: "draggingNode"; nodeId: string; grabOffsetWorld: Point }
    | { kind: "connecting"; fromNodeId: string; cursorWorld: Point };

  let interaction = $state<Interaction>({ kind: "idle" });

  // Live-run camera: when a node starts executing, smoothly pan/zoom to centre
  // it so the diagram (not a modal) tells the story. Idle (no active node)
  // leaves the viewport where the author left it; manual gestures suppress the
  // follow so panning stays crisp.
  $effect(() => {
    const id = activeNodeId;
    if (!id || interaction.kind !== "idle") return;
    const node = editor.flow.nodes.find((n) => n.id === id);
    if (!node) return;
    const centre = { x: node.position.x + NODE_W / 2, y: node.position.y + NODE_H / 2 };
    viewport.centerOn(centre, viewSize(), Math.max(viewport.zoom, 1));
  });

  // Fit-to-view on demand (eased): when fitToken changes, frame the whole flow
  // so a just-added sub-flow is visible appearing in context. The easing flag is
  // raised first, then the fit runs next frame so the transform animates.
  let fitting = $state(false);
  $effect(() => {
    if (!fitToken || interaction.kind !== "idle") return;
    fitting = true;
    requestAnimationFrame(fitView);
    const t = setTimeout(() => (fitting = false), 1100);
    return () => clearTimeout(t);
  });

  // Ease the transform while following a run or fitting, so manual pan is instant.
  const cameraEasing = $derived(
    fitting || (activeNodeId != null && interaction.kind === "idle"),
  );

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
    return { from: outPortPos(from), to: i.cursorWorld };
  });

  /** World position of a node's output port (channel-group aware). */
  function outPortPos(node: FlowNode): Point {
    const group = channelGroups.get(node.channelId ?? "");
    return group && group.length > 1
      ? groupPortPosition(node, "out", group)
      : portPosition(node, "out");
  }

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

  /** The `group` node whose frame contains world point `p` (excluding `excludeId`). */
  function groupAt(p: Point, excludeId: string): FlowNode | null {
    for (const g of editor.flow.nodes) {
      if (g.kind !== "group" || g.id === excludeId) continue;
      const { width, height } = groupFrameSize(g);
      if (
        p.x >= g.position.x &&
        p.x <= g.position.x + width &&
        p.y >= g.position.y &&
        p.y <= g.position.y + height
      ) {
        return g;
      }
    }
    return null;
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
    // Don't capture the pointer for connection drags: capture would deliver the
    // final pointerup to the source output port, so the destination input port's
    // onpointerup (which completes the edge) would never fire. Panning and node
    // drags still capture so the gesture survives the cursor leaving the element.
    if (interaction.kind !== "connecting") {
      (e.target as Element).setPointerCapture?.(e.pointerId);
    }
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
      const nodeId = interaction.nodeId;
      const node = editor.flow.nodes.find((n) => n.id === nodeId);
      const pos = {
        x: toWorld(e).x - interaction.grabOffsetWorld.x,
        y: toWorld(e).y - interaction.grabOffsetWorld.y,
      };
      if (node?.kind === "group") {
        // Dragging a group header moves the frame and every member by the same
        // delta (preserving their arrangement), in one coalesced history step.
        editor.setPositions(groupTranslateUpdates(node, pos), `drag:${node.id}`);
      } else {
        editor.moveNode(nodeId, pos);
      }
    } else if (interaction.kind === "connecting") {
      interaction = { ...interaction, cursorWorld: toWorld(e) };
    }
  }

  function onWindowUp(e: PointerEvent) {
    // Membership is decided on drop: a card dropped on a group frame joins it; a
    // member dropped outside its frame leaves. A multi-slot channel card moves as
    // a whole (all its slots together) so siblings are never orphaned.
    if (interaction.kind === "draggingNode") {
      const nodeId = interaction.nodeId;
      const node = editor.flow.nodes.find((n) => n.id === nodeId);
      if (node && node.kind !== "group") {
        const prev = node.groupId ?? null;
        const target = groupAt(toWorld(e), node.id);
        const chMembers = node.channelId ? channelGroups.get(node.channelId) : undefined;
        const members = chMembers && chMembers.length > 1 ? chMembers : [node];

        // Membership changes on drop; the card keeps wherever it was dragged to
        // (the frame wraps it), so a group stays a free-form container.
        if (target && target.id !== prev) {
          for (const m of members) editor.setNodeGroup(m.id, target.id);
        } else if (!target && prev) {
          for (const m of members) editor.setNodeGroup(m.id, null);
        }
      }
    }
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
    style="transform: translate({viewport.pan.x}px, {viewport.pan.y}px) scale({viewport.zoom}); transition: {cameraEasing ? 'transform 900ms cubic-bezier(0.33, 0, 0.2, 1)' : 'none'};"
  >
    <FlowEdges
      flow={editor.flow}
      {pending}
      {activeEdgeId}
      {channelGroups}
    />

    {#each renderItems as item}
      {#if item.kind === "group-frame"}
        {@const size = groupFrameSize(item.group)}
        <FlowGroupCard
          node={item.group}
          width={size.width}
          height={size.height}
          empty={(nodeGroups.get(item.group.id)?.length ?? 0) === 0}
          selected={editor.selectedNodeId === item.group.id}
          colors={nodeColorClasses(item.group, editor.channels)}
          onbodydown={handleBodyDown}
          onbodydblclick={handleBodyDblClick}
        />
      {:else if item.kind === "channel-group"}
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
