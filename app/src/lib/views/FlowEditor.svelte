<script lang="ts">
  import { FlowEditor } from "../flow/editor.svelte";
  import { residenceCertificateFlow } from "../flow/fixtures";
  import type { NodeKind } from "../flow/types";
  import FlowCanvas from "../flow/components/FlowCanvas.svelte";
  import NodePalette from "../flow/components/NodePalette.svelte";
  import NodeInspector from "../flow/components/NodeInspector.svelte";

  // Open the editor on the worked example. Structured-clone so editing does not
  // mutate the shared fixture module.
  const editor = new FlowEditor(structuredClone(residenceCertificateFlow));

  // Where the next palette-added node lands (cascaded so they don't stack).
  let dropX = $state(360);
  let dropY = $state(80);

  function handleAdd(kind: NodeKind) {
    editor.addNode(kind, { x: dropX, y: dropY });
    dropY += 24;
    dropX += 24;
  }
</script>

<div class="flex h-full flex-col">
  <header class="flex items-baseline justify-between border-b border-black/10 px-4 py-2 dark:border-white/10">
    <div class="flex items-baseline gap-2">
      <h1 class="text-base font-semibold">{editor.flow.title}</h1>
      <span class="text-xs text-zinc-500">flow editor</span>
    </div>
    <span class="text-xs text-zinc-500">
      {editor.flow.nodes.length} nodes · {editor.flow.edges.length} transitions
    </span>
  </header>

  <div class="flex min-h-0 flex-1">
    <NodePalette onadd={handleAdd} />
    <div class="min-h-0 flex-1">
      <FlowCanvas {editor} />
    </div>
    <NodeInspector {editor} />
  </div>
</div>
