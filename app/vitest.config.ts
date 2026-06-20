import { defineConfig } from "vitest/config";

// Unit tests only. Scoped to tests/unit so the Bun-based e2e (tests/e2e, which
// uses webdriverio + tauri-driver) is never picked up by Vitest.
export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
  },
});
