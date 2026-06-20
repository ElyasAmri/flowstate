// Single source of truth for the per-node-kind accent. Cards and palette stay
// visually calm (neutral surface for every kind); the kind is conveyed only by
// a small muted colored dot, so the canvas no longer reads like a rainbow.

import type { NodeKind } from "./types";

/** Muted dot color (Tailwind bg-*) per node kind. */
export const kindDot: Record<NodeKind, string> = {
  start: "bg-emerald-500/70",
  collect: "bg-sky-500/70",
  check: "bg-violet-500/70",
  decision: "bg-amber-500/70",
  action: "bg-indigo-500/70",
  escalate: "bg-orange-500/70",
  terminal: "bg-rose-500/70",
};
