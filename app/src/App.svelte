<script lang="ts">
  import { listen } from "@tauri-apps/api/event";
  import { onMount } from "svelte";
  import Home from "./lib/views/Home.svelte";
  import FlowEditor from "./lib/views/FlowEditor.svelte";
  import Workflows from "./lib/views/Workflows.svelte";
  import Documents from "./lib/views/Documents.svelte";

  // Manual, state-driven routing (same pattern as maestro's desktop app):
  // a typed Route union held in $state. Now flipped by the native menubar
  // (see src-tauri/src/lib.rs) via a `navigate` event -- no router lib, no
  // in-app nav buttons.
  type Route =
    | { name: "home" }
    | { name: "flow" }
    | { name: "workflows" }
    | { name: "documents" };

  let route = $state<Route>({ name: "home" });

  onMount(() => {
    const unlisten = listen<string>("navigate", (event) => {
      route = { name: event.payload as Route["name"] };
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
    {#if route.name === "home"}
      <Home />
    {:else if route.name === "flow"}
      <FlowEditor />
    {:else if route.name === "workflows"}
      <Workflows />
    {:else}
      <Documents />
    {/if}
  </main>
</div>
