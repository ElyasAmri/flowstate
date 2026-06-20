<script lang="ts">
  import type { FlowEditor } from "../editor.svelte";
  import type { FlowNode } from "../types";
  import { onMount } from "svelte";
  import { Viewport, type Point, type Size } from "../viewport.svelte";
  import { nodesBounds, portPosition } from "../geometry";
  import FlowNodeCard from "./FlowNodeCard.svelte";
  import FlowEdges from "./FlowEdges.svelte";
  import CanvasControls from "./CanvasControls.svelte";

  interface Props {
    editor: FlowEditor;
  }

  let { editor }: Props = $props();

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
    const box = nodesBounds(editor.flow.nodes);
    if (box) viewport.fitTo(box, viewSize());
  }

  // Fit-on-open so the fixture flow frames nicely. One rAF lets layout settle so
  // the canvas has a real measured size before we compute the fit.
  onMount(() => {
    requestAnimationFrame(fitView);
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
    return { from: portPosition(from, "out"), to: i.cursorWorld };
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
    <FlowEdges flow={editor.flow} {pending} ondelete={(id) => editor.deleteEdge(id)} />

    {#each editor.flow.nodes as node (node.id)}
      <FlowNodeCard
        {node}
        selected={node.id === editor.selectedNodeId}
        isStart={editor.flow.startNodeId === node.id}
        channels={editor.channels}
        onbodydown={handleBodyDown}
        onportdown={handlePortDown}
        onportup={handlePortUp}
      />
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
