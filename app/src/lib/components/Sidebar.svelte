<script lang="ts">
  // In-app navigation rail. Replaces the former native window menubar: clicking
  // an item sets the route directly via `onnavigate` (no Tauri event round-trip).
  type NavName = "flows" | "workflows" | "documents";

  interface Props {
    /** The active top-level route, for highlighting. */
    current: NavName;
    /** Switch to a top-level route. */
    onnavigate: (name: NavName) => void;
  }

  let { current, onnavigate }: Props = $props();

  const items: { name: NavName; label: string }[] = [
    { name: "flows", label: "Flows" },
    { name: "workflows", label: "Workflows" },
    { name: "documents", label: "Documents" },
  ];
</script>

<nav
  class="flex w-52 shrink-0 flex-col gap-1 border-r border-black/10 bg-zinc-50 p-3 dark:border-white/10 dark:bg-zinc-900/40"
  data-testid="sidebar"
>
  <div class="mb-3 px-2 py-1">
    <span class="text-lg font-semibold tracking-tight">Flowstate</span>
  </div>

  {#each items as item (item.name)}
    <button
      type="button"
      class="rounded-lg px-3 py-2 text-left text-sm font-medium transition
        {current === item.name
        ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-black'
        : 'text-zinc-600 hover:bg-black/5 dark:text-zinc-300 dark:hover:bg-white/10'}"
      data-nav={item.name}
      aria-current={current === item.name ? "page" : undefined}
      onclick={() => onnavigate(item.name)}
    >
      {item.label}
    </button>
  {/each}
</nav>
