<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";

  // Proves the frontend <-> Rust bridge: calls the `greet` command in
  // src-tauri/src/lib.rs.
  let greeting = $state("");
  async function ping() {
    greeting = await invoke<string>("greet", { name: "Flowstate" });
  }
</script>

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
