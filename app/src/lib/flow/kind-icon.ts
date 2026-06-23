// Per-node icon path data. Inline SVG (no dependency); icons are stroked
// outlines (fill="none"), 2px, round caps/joins, drawn in a 24x24 viewBox. The
// stroke is `currentColor` so the card can tint it per the 4-color scheme.
//
// Keys are `IconKey`s (see node-color.ts): the four node kinds plus three
// binding-specific channel icons so a person, a nested flow, and a service read
// differently at a glance. A generic "channel" key is the fallback for an
// unresolved channel reference.

import type { IconKey } from "./node-color";

/** Inner SVG markup for each icon key's 24x24 stroked icon. */
export const kindIconPath: Record<IconKey, string> = {
  // agent: a spark / star -- an AI doing non-deterministic work.
  agent:
    '<path d="M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4z" /><path d="M18 14l.9 2.3L21 17l-2.1.7L18 20l-.9-2.3L15 17l2.1-.7z" />',
  // action: a lightning bolt -- deterministic internal computation.
  action: '<path d="M13 2L4 14h7l-1 8 9-12h-7z" />',
  // decision: a diamond -- a branch point.
  decision: '<path d="M12 3l9 9-9 9-9-9z" />',
  // channel (generic / unresolved): two arrows crossing a boundary.
  channel:
    '<path d="M12 3v18" stroke-dasharray="3 3" /><path d="M3 9h6l-2-2m2 2-2 2" /><path d="M21 15h-6l2-2m-2 2 2 2" />',
  // channel-ui: a person -- bound to a human-operated app.
  "channel-ui":
    '<circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" />',
  // channel-flow: nested nodes -- bound to another flow.
  "channel-flow":
    '<rect x="3" y="4" width="7" height="6" rx="1.5" /><rect x="14" y="14" width="7" height="6" rx="1.5" /><path d="M10 7h3a2 2 0 0 1 2 2v5" />',
  // channel-service: a server stack -- bound to a service.
  "channel-service":
    '<rect x="4" y="4" width="16" height="7" rx="1.5" /><rect x="4" y="13" width="16" height="7" rx="1.5" /><path d="M8 7.5h.01M8 16.5h.01" />',
};
