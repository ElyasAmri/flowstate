<script lang="ts">
  import Sidebar from "./lib/components/Sidebar.svelte";
  import FlowsList from "./lib/views/FlowsList.svelte";
  import FlowEditor from "./lib/views/FlowEditor.svelte";

  // Manual, state-driven routing: a typed Route union held in $state. The flow
  // selector is the default view; opening a flow threads its id into the editor
  // route. Top-level navigation is the in-app Sidebar; opening/closing a specific
  // flow is handled by the selector (onopen) and the editor's back button.
  type Route =
    | { name: "flows" }
    | { name: "flow"; id: string };

  let route = $state<Route>({ name: "flows" });

  // The sidebar's active item. The editor route belongs to the "flows" section.
  type NavName = "flows";
  const current = $derived<NavName>("flows");

  // The editor is a focused, full-screen mode (its own palette/canvas/inspector
  // 3-pane layout + back button); the sidebar is hidden there to give the canvas
  // maximum width.
  const showSidebar = $derived(route.name !== "flow");
</script>

<div class="flex h-full">
  {#if showSidebar}
    <Sidebar {current} onnavigate={(name) => (route = { name })} />
  {/if}

  <main class="min-h-0 flex-1 overflow-auto {route.name === 'flow' ? '' : 'p-6'}">
    {#if route.name === "flows"}
      <FlowsList onopen={(id) => (route = { name: "flow", id })} />
    {:else}
      {#key route.id}
        <FlowEditor flowId={route.id} onback={() => (route = { name: "flows" })} />
      {/key}
    {/if}
  </main>
</div>
