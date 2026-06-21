import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// Unit tests only. Scoped to tests/unit so the Bun-based e2e (tests/e2e, which
// uses webdriverio + tauri-driver) is never picked up by Vitest. The Svelte
// plugin is loaded so `.svelte.ts` modules using runes ($state) compile when a
// test imports them (e.g. the flow editor); it resolves the in-runtime client
// build so runes work in the Node test environment.
export default defineConfig({
  plugins: [svelte({ compilerOptions: { dev: false } })],
  resolve: {
    conditions: ["browser"],
  },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
  },
});
