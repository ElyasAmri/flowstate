// Flow authoring model.
//
// A *flow* is the deterministic state machine a Policy Maker authors in this
// editor and the harness later executes. It is a graph of typed `FlowNode`s
// connected by `FlowEdge`s. Edges may carry a `guard` -- the condition under
// which the harness takes that branch. This module is the single source of
// truth for the shape the editor reads/writes; it has no UI or runtime
// behaviour of its own.
//
// The harness is deterministic and sealed: it reaches the outside world ONLY
// across a *channel* (see channel-model.md). Channels are first-class and live
// in a registry; nodes reference them by id. The four node kinds and the
// 4-color scheme follow from that boundary rule:
//   - channel  -> crosses a boundary; colored by its channel's binding
//                 (ui = green, flow = purple, service = yellow)
//   - agent    -> internal, AI does the work (gray-dark, non-deterministic)
//   - action   -> internal deterministic logic/computation (gray-static)
//   - decision -> internal deterministic branch point (gray-static)

/** The kind of a node, which determines its role in the executed flow. */
export type NodeKind =
  | "channel" // crosses a boundary; references a channel by id
  | "agent" // an AI agent reasons / classifies / extracts / drafts
  | "action" // deterministic internal logic / computation
  | "decision"; // deterministic branch on data (guarded out-edges)

/** How an ending (outbound) channel node resolves the case. */
export type TerminalOutcome = "approved" | "rejected" | "issued";

/** A 2D position on the editor canvas (pixels). */
export interface Position {
  x: number;
  y: number;
}

/** A single node in the flow graph. */
export interface FlowNode {
  id: string;
  kind: NodeKind;
  label: string;
  /** Optional author-facing note describing what this step does / why. */
  description?: string;
  position: Position;
  /**
   * The channel this node crosses. Required when `kind === "channel"`; its value
   * is a `ChannelDefinition.id` from the registry. The node's color is derived
   * from that channel's binding -- it is not stored on the node.
   */
  channelId?: string;
  /**
   * How this node resolves the case. Only meaningful on an ending (outbound)
   * `channel` node that returns a result to the consumer.
   */
  outcome?: TerminalOutcome;
}

/** A directed connection between two nodes. */
export interface FlowEdge {
  id: string;
  from: string; // source node id
  to: string; // target node id
  /** Author-facing label, e.g. "eligible" / "missing documents". */
  label?: string;
  /** The condition under which the harness takes this branch. */
  guard?: string;
}

/** A complete authored flow. */
export interface FlowDefinition {
  id: string;
  title: string;
  description?: string;
  /** Id of the entry node -- an `inbound` channel node. */
  startNodeId: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
}

// --- Channels ---------------------------------------------------------------

/** Which way messages flow across a channel relative to the harness. */
export type ChannelDirection = "inbound" | "outbound" | "both";

/**
 * What implements the far side of a channel. Exactly one variant:
 *  - `ui`      a human-operated program (consumer app, bureaucrat desktop).
 *  - `flow`    another flow, referenced by id -- how flows nest/compose.
 *  - `service` a core service, internal or external.
 */
export type ChannelBinding =
  | { kind: "ui" }
  | { kind: "flow"; flowId: string }
  | { kind: "service"; scope: "internal" | "external" };

/** Tag for a binding, used by color/icon derivation. */
export type ChannelBindingKind = ChannelBinding["kind"];

/**
 * One message in a channel's typed contract. `fields` describe its payload;
 * the editor treats them as documentation now and the harness as a schema later.
 */
export interface ChannelMessage {
  /** Stable identifier for the message, e.g. "submit_application". */
  name: string;
  /** Human-facing description of when/why this message is exchanged. */
  description?: string;
  fields: ChannelField[];
}

/** A single typed field within a channel message payload. */
export interface ChannelField {
  name: string;
  type: ChannelFieldType;
  /** Whether the field must be present. Defaults to true when omitted. */
  required?: boolean;
  description?: string;
}

/** The primitive types a channel field may carry. */
export type ChannelFieldType = "string" | "number" | "boolean" | "date" | "file";

/** A registered channel: a typed boundary the harness exchanges messages over. */
export interface ChannelDefinition {
  id: string;
  title: string;
  description?: string;
  direction: ChannelDirection;
  binding: ChannelBinding;
  /** Messages sent INTO the channel (out of the harness). */
  accepts: ChannelMessage[];
  /** Messages received BACK from the channel (into the harness). */
  returns: ChannelMessage[];
}

/** A read-only view of the channel registry keyed by id, for fast lookup. */
export type ChannelRegistry = Record<string, ChannelDefinition>;

// --- Node display metadata --------------------------------------------------

/** Display metadata for each node kind, used by the palette and canvas. */
export interface NodeKindMeta {
  kind: NodeKind;
  label: string;
  blurb: string;
}

export const NODE_KINDS: NodeKindMeta[] = [
  { kind: "channel", label: "Channel", blurb: "Cross a boundary via a registered channel." },
  { kind: "agent", label: "Agent", blurb: "An AI agent reasons, classifies, or drafts." },
  { kind: "action", label: "Action", blurb: "Deterministic internal logic." },
  { kind: "decision", label: "Decision", blurb: "Branch on data with guarded edges." },
];

/** Look up display metadata for a node kind. */
export function nodeKindMeta(kind: NodeKind): NodeKindMeta {
  const meta = NODE_KINDS.find((m) => m.kind === kind);
  // NODE_KINDS is exhaustive over NodeKind, so this is always defined.
  return meta!;
}
