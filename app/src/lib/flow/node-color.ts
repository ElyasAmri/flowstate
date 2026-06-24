// Pure node color derivation for the 4-color scheme (see channel-model.md).
//
// Color encodes WHAT is across the boundary (or that there is none). A `channel`
// node's color comes from its channel's binding; the internal kinds map directly:
//   - channel + ui      -> yellow (a person via an app)
//   - channel + flow    -> purple (a nested flow)
//   - channel + service -> yellow (a service)
//   - agent             -> cyan       (AI, non-deterministic)
//   - action            -> gray-light (deterministic internal logic)
//   - decision          -> gray-dark  (deterministic branch point)
//
// This module is pure (no runes, no DOM): it returns a semantic NodeColor and a
// small palette of muted Tailwind class fragments so the card stays calm -- color
// is an accent (icon tint + thin bottom border), not a full fill.

import type {
  ChannelBindingKind,
  ChannelRegistry,
  FlowNode,
  NodeKind,
} from "./types";

/** Semantic color of a node, independent of any specific CSS framework. */
export type NodeColor =
  | "purple"
  | "yellow"
  | "cyan"
  | "gray-light"
  | "gray-dark";

/** Map a channel binding kind to its node color. Channels are yellow; a
 *  nested-flow channel is the one exception (purple) so nesting stands out. */
export function colorForBinding(binding: ChannelBindingKind): NodeColor {
  switch (binding) {
    case "ui":
      return "yellow";
    case "flow":
      return "purple";
    case "service":
      return "yellow";
  }
}

/**
 * Derive a node's color. `channel` nodes look up their binding in the registry;
 * an unresolved channel (missing id / not in registry) falls back to gray-light
 * so the canvas never throws on a dangling reference.
 */
export function nodeColor(
  node: FlowNode,
  registry: ChannelRegistry,
): NodeColor {
  switch (node.kind) {
    case "channel": {
      const ch = node.channelId ? registry[node.channelId] : undefined;
      return ch ? colorForBinding(ch.binding.kind) : "gray-light";
    }
    case "agent":
      return "cyan";
    case "action":
      return "gray-light";
    case "decision":
      return "gray-dark";
  }
}

/** Tailwind class fragments for one color: the icon tint and the left accent. */
export interface ColorClasses {
  /** Text color for the kind icon. */
  icon: string;
  /** Bottom accent bar color (a thin colored strip on the card's bottom edge). */
  accent: string;
  /** A small swatch background (used by the palette legend). */
  swatch: string;
}

/** The muted palette. Kept soft so a busy canvas does not turn into a rainbow. */
export const COLOR_CLASSES: Record<NodeColor, ColorClasses> = {
  purple: {
    icon: "text-violet-600 dark:text-violet-400",
    accent: "bg-violet-500",
    swatch: "bg-violet-500",
  },
  yellow: {
    icon: "text-amber-600 dark:text-amber-400",
    accent: "bg-amber-500",
    swatch: "bg-amber-500",
  },
  cyan: {
    icon: "text-cyan-600 dark:text-cyan-400",
    accent: "bg-cyan-500",
    swatch: "bg-cyan-500",
  },
  "gray-light": {
    icon: "text-zinc-500 dark:text-zinc-400",
    accent: "bg-zinc-300 dark:bg-zinc-600",
    swatch: "bg-zinc-300 dark:bg-zinc-600",
  },
  "gray-dark": {
    icon: "text-zinc-700 dark:text-zinc-200",
    accent: "bg-zinc-600 dark:bg-zinc-400",
    swatch: "bg-zinc-600 dark:bg-zinc-400",
  },
};

/** Convenience: the class set for a node (derives the color first). */
export function nodeColorClasses(
  node: FlowNode,
  registry: ChannelRegistry,
): ColorClasses {
  return COLOR_CLASSES[nodeColor(node, registry)];
}

/**
 * Icon key for a node. `channel` nodes pick a binding-specific icon so a person,
 * a nested flow, and a service read differently at a glance; everything else uses
 * its kind. Returns a key into `kindIconPath` in kind-icon.ts.
 */
export type IconKey =
  | NodeKind
  | "channel-ui"
  | "channel-flow"
  | "channel-service";

export function iconKeyForNode(
  node: FlowNode,
  registry: ChannelRegistry,
): IconKey {
  if (node.kind === "channel") {
    const ch = node.channelId ? registry[node.channelId] : undefined;
    if (ch) return `channel-${ch.binding.kind}` as IconKey;
    return "channel";
  }
  return node.kind;
}
