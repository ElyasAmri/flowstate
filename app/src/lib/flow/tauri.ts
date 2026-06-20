// Thin guard around Tauri's `invoke`.
//
// The flow editor runs in two contexts: the real Tauri app (where the native
// backend is present) and a plain Vite dev / svelte-check / build environment
// (where it is not). This helper detects the runtime so persistence is a no-op
// outside Tauri instead of throwing.

import { invoke } from "@tauri-apps/api/core";

/** True when running inside the Tauri webview (the backend is reachable). */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Invoke a backend command, or return null when not running under Tauri. */
export async function tryInvoke<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T | null> {
  if (!isTauri()) return null;
  return invoke<T>(command, args);
}
