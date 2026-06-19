<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";

  // Manual, state-driven routing (same pattern as maestro's desktop app):
  // a typed Route union held in $state, flipped by nav buttons -- no router lib.
  type Route =
    | { name: "home" }
    | { name: "workflows" }
    | { name: "documents" };

  let route = $state<Route>({ name: "home" });

  // Proves the frontend <-> Rust bridge: calls the `greet` command in
  // src-tauri/src/lib.rs.
  let greeting = $state("");
  async function ping() {
    greeting = await invoke<string>("greet", { name: "Flowstate" });
  }

  const tab = "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors";
  const active = "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-black";
  const inactive =
    "text-zinc-600 hover:bg-black/5 dark:text-zinc-300 dark:hover:bg-white/10";
</script>

<div class="flex h-full flex-col">
  <header
    class="flex items-center justify-between gap-4 border-b border-black/10 px-4 py-3 dark:border-white/10"
  >
    <div class="flex items-baseline gap-2">
      <span class="text-lg font-semibold tracking-tight">Flowstate</span>
      <span class="text-xs text-zinc-500">codified bureaucracy</span>
    </div>
    <nav class="flex gap-1">
      <button
        class={`${tab} ${route.name === "home" ? active : inactive}`}
        onclick={() => (route = { name: "home" })}>Home</button
      >
      <button
        class={`${tab} ${route.name === "workflows" ? active : inactive}`}
        onclick={() => (route = { name: "workflows" })}>Workflows</button
      >
      <button
        class={`${tab} ${route.name === "documents" ? active : inactive}`}
        onclick={() => (route = { name: "documents" })}>Documents</button
      >
    </nav>
  </header>

  <main class="min-h-0 flex-1 overflow-auto p-6">
    {#if route.name === "home"}
      <div class="mx-auto max-w-2xl space-y-4">
        <h1 class="text-2xl font-semibold">Flowstate</h1>
        <p class="text-zinc-600 dark:text-zinc-300">
          Codify bureaucratic procedures as deterministic, human-in-the-loop
          workflows.
        </p>
        <button
          class="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-black"
          onclick={ping}>Check Rust bridge</button
        >
        {#if greeting}
          <p class="text-sm text-emerald-600 dark:text-emerald-400">{greeting}</p>
        {/if}
      </div>
    {:else if route.name === "workflows"}
      <p class="text-zinc-500">Workflows -- nothing here yet.</p>
    {:else}
      <p class="text-zinc-500">Documents -- nothing here yet.</p>
    {/if}
  </main>
</div>
