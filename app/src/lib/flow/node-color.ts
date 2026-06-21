// Pure node color derivation for the 4-color scheme (see channel-model.md).
//
// Color encodes WHAT is across the boundary (or that there is none). A `channel`
// node's color comes from its channel's binding; the gray kinds map directly:
//   - channel + ui      -> green  (a person via an app)
//   - channel + flow    -> purple (a nested flow)
//   - channel + service -> yellow (a service)
//   - agent             -> gray-dark  (AI, non-deterministic)
//   - action / decision -> gray-light (deterministic internal logic)
//
// This module is pure (no runes, no DOM): it returns a semantic NodeColor and a
// small palette of muted Tailwind class fragments so the card stays calm -- color
// is an accent (icon tint + thin top border), not a full fill.

import type {
  ChannelBindingKind,
  ChannelRegistry,
  FlowNode,
  NodeKind,
} from "./types";

/** Semantic color of a node, independent of any specific CSS framework. */
export type NodeColor =
  | "green"
  | "purple"
  | "yellow"
  | "gray-static"
  | "gray-agent"
  | "blue"; // the manual-input trigger -- the flow's entry point

/** Map a channel binding kind to its node color. */
export function colorForBinding(binding: ChannelBindingKind): NodeColor {
  switch (binding) {
    case "ui":
      return "green";
    case "flow":
      return "purple";
    case "service":
      return "yellow";
  }
}

/**
 * Derive a node's color. `channel` nodes look up their binding in the registry;
 * an unresolved channel (missing id / not in registry) falls back to gray-static
 * so the canvas never throws on a dangling reference.
 */
export function nodeColor(
  node: FlowNode,
  registry: ChannelRegistry,
): NodeColor {
  switch (node.kind) {
    case "input":
      return "blue";
    case "channel": {
      const ch = node.channelId ? registry[node.channelId] : undefined;
      return ch ? colorForBinding(ch.binding.kind) : "gray-static";
    }
    case "agent":
      return "gray-agent";
    case "action":
    case "decision":
      return "gray-static";
  }
}

/** Tailwind class fragments for one color: the icon tint and the left accent. */
export interface ColorClasses {
  /** Text color for the kind icon. */
  icon: string;
  /** Top accent bar color (a thin colored strip on the card's top edge). */
  accent: string;
  /** A small swatch background (used by the palette legend). */
  swatch: string;
}

/** The muted palette. Kept soft so a busy canvas does not turn into a rainbow. */
export const COLOR_CLASSES: Record<NodeColor, ColorClasses> = {
  green: {
    icon: "text-emerald-600 dark:text-emerald-400",
    accent: "bg-emerald-500",
    swatch: "bg-emerald-500",
  },
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
  "gray-static": {
    icon: "text-zinc-500 dark:text-zinc-400",
    accent: "bg-zinc-300 dark:bg-zinc-600",
    swatch: "bg-zinc-300 dark:bg-zinc-600",
  },
  "gray-agent": {
    icon: "text-zinc-700 dark:text-zinc-200",
    accent: "bg-zinc-700 dark:bg-zinc-300",
    swatch: "bg-zinc-700 dark:bg-zinc-300",
  },
  blue: {
    icon: "text-sky-600 dark:text-sky-400",
    accent: "bg-sky-500",
    swatch: "bg-sky-500",
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
