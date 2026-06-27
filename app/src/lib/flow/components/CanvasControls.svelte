<script lang="ts">
  interface Props {
    zoom: number;
    onfit: () => void;
    onreset: () => void;
    onzoomin: () => void;
    onzoomout: () => void;
  }

  let { zoom, onfit, onreset, onzoomin, onzoomout }: Props = $props();

  // Stop pointerdown from reaching the canvas (which would start a pan).
  function swallow(e: PointerEvent) {
    e.stopPropagation();
  }

  const btn =
    "flex h-8 w-8 items-center justify-center rounded-md text-zinc-600 transition " +
    "hover:bg-black/5 dark:text-zinc-300 dark:hover:bg-white/10";
</script>

<div
  class="absolute bottom-3 left-3 flex items-center gap-1 rounded-lg border border-black/10
    bg-white/90 p-1 shadow-sm backdrop-blur dark:border-white/10 dark:bg-zinc-800/90"
  onpointerdown={swallow}
  role="toolbar"
  tabindex="-1"
  aria-label="Canvas controls"
>
  <button type="button" class={btn} title="Zoom out" aria-label="Zoom out" onclick={onzoomout}>
    <span class="text-lg leading-none">−</span>
  </button>
  <button
    type="button"
    class="w-12 text-center text-xs tabular-nums text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
    title="Reset zoom to 100%"
    onclick={onreset}
  >
    {Math.round(zoom * 100)}%
  </button>
  <button type="button" class={btn} title="Zoom in" aria-label="Zoom in" onclick={onzoomin}>
    <span class="text-lg leading-none">+</span>
  </button>
  <div class="mx-0.5 h-5 w-px bg-black/10 dark:bg-white/10"></div>
  <button type="button" class={btn} title="Fit flow to view" aria-label="Fit to view" onclick={onfit}>
    <!-- Frame / fit icon. -->
    <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M4 8 V4 H8 M16 4 H20 V8 M20 16 V20 H16 M8 20 H4 V16" />
    </svg>
  </button>
</div>
