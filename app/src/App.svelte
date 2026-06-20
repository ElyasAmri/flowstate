<script lang="ts">
  import { listen } from "@tauri-apps/api/event";
  import { onMount } from "svelte";
  import FlowsList from "./lib/views/FlowsList.svelte";
  import FlowEditor from "./lib/views/FlowEditor.svelte";
  import Workflows from "./lib/views/Workflows.svelte";
  import Documents from "./lib/views/Documents.svelte";

  // Manual, state-driven routing (same pattern as maestro's desktop app):
  // a typed Route union held in $state. The flow selector is the default view;
  // opening a flow threads its id into the editor route. In-app navigation is
  // done by local handlers (onopen/onback); the native menubar (see
  // src-tauri/src/lib.rs) emits id-free `navigate` events for the top-level
  // views only -- it never opens a specific flow (that's the selector's job).
  type Route =
    | { name: "flows" }
    | { name: "flow"; id: string }
    | { name: "workflows" }
    | { name: "documents" };

  let route = $state<Route>({ name: "flows" });

  // Route names the menubar may emit (it cannot carry a flow id).
  type MenuRoute = "flows" | "workflows" | "documents";
  const isMenuRoute = (n: string): n is MenuRoute =>
    n === "flows" || n === "workflows" || n === "documents";

  onMount(() => {
    const unlisten = listen<string>("navigate", (event) => {
      if (isMenuRoute(event.payload)) route = { name: event.payload };
    });
    return () => {
      unlisten.then((off) => off());
    };
  });
</script>

<div class="flex h-full flex-col">
  <header
    class="flex items-center justify-between gap-4 border-b border-black/10 px-4 py-3 dark:border-white/10"
  >
    <div class="flex items-baseline gap-2">
      <span class="text-lg font-semibold tracking-tight">Flowstate</span>
      <span class="text-xs text-zinc-500">codified bureaucracy</span>
    </div>
  </header>

  <main class="min-h-0 flex-1 overflow-auto {route.name === 'flow' ? '' : 'p-6'}">
    {#if route.name === "flows"}
      <FlowsList onopen={(id) => (route = { name: "flow", id })} />
    {:else if route.name === "flow"}
      {#key route.id}
        <FlowEditor flowId={route.id} onback={() => (route = { name: "flows" })} />
      {/key}
    {:else if route.name === "workflows"}
      <Workflows />
    {:else}
      <Documents />
    {/if}
  </main>
</div>
