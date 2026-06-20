// Per-node-kind icon path data. Inline SVG (no dependency); monochrome so the
// canvas stays calm -- icons inherit `currentColor` (a neutral zinc) and carry
// no per-kind color. Each entry is the inner markup of a 24x24 `viewBox` icon
// drawn with `stroke="currentColor"` (see KindIcon below / the card markup).
//
// Icons are stroked outlines (fill="none"), 2px, round caps/joins.

import type { NodeKind } from "./types";

/** Inner SVG markup for each kind's 24x24 stroked icon. */
export const kindIconPath: Record<NodeKind, string> = {
  // start: a play/triangle -- the entry point.
  start: '<path d="M7 5l12 7-12 7z" />',
  // collect: an inbox / tray gathering input.
  collect:
    '<path d="M4 13l3 5h10l3-5" /><path d="M4 13V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7" /><path d="M9 13h6" />',
  // check: a checkmark in motion -- automated validation.
  check: '<path d="M20 6L9 17l-5-5" />',
  // decision: a diamond -- a branch point.
  decision: '<path d="M12 3l9 9-9 9-9-9z" />',
  // action: a lightning bolt -- calls out to an external service.
  action: '<path d="M13 2L4 14h7l-1 8 9-12h-7z" />',
  // escalate: an upward arrow into a tray -- hand off to a human.
  escalate: '<path d="M12 19V5" /><path d="M6 11l6-6 6 6" />',
  // terminal: a stop/flag -- the end state.
  terminal:
    '<path d="M5 21V4h12l-2 4 2 4H5" /><line x1="5" y1="21" x2="5" y2="3" />',
};
