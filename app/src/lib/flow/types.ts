// Flow authoring model.
//
// A *flow* is the deterministic state machine a Policy Maker authors in this
// editor and the harness later executes. It is a graph of typed `FlowNode`s
// connected by `FlowEdge`s. Edges may carry a `guard` -- the condition under
// which the harness takes that branch. This module is the single source of
// truth for the shape the editor reads/writes; it has no UI or runtime
// behaviour of its own.

/** The kind of a node, which determines its role in the executed flow. */
export type NodeKind =
  | "start" // entry point; exactly one per flow
  | "collect" // gather information from the consumer
  | "check" // automated validation / guard against registry/eID/etc.
  | "decision" // branch on collected data (multiple guarded out-edges)
  | "action" // call an external service (payment, notification, ...)
  | "escalate" // hand the case to a bureaucrat
  | "terminal"; // end state: approve / reject / issue

/** Terminal nodes resolve the case one of these ways. */
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
  /** Only meaningful when `kind === "terminal"`. */
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
  startNodeId: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
}

/** Display metadata for each node kind, used by the palette and canvas. */
export interface NodeKindMeta {
  kind: NodeKind;
  label: string;
  blurb: string;
}

export const NODE_KINDS: NodeKindMeta[] = [
  { kind: "start", label: "Start", blurb: "Entry point of the flow." },
  { kind: "collect", label: "Collect", blurb: "Gather info from the applicant." },
  { kind: "check", label: "Check", blurb: "Automated validation or guard." },
  { kind: "decision", label: "Decision", blurb: "Branch on collected data." },
  { kind: "action", label: "Action", blurb: "Call an external service." },
  { kind: "escalate", label: "Escalate", blurb: "Hand the case to a bureaucrat." },
  { kind: "terminal", label: "Terminal", blurb: "End: approve, reject, or issue." },
];

/** Look up display metadata for a node kind. */
export function nodeKindMeta(kind: NodeKind): NodeKindMeta {
  const meta = NODE_KINDS.find((m) => m.kind === kind);
  // NODE_KINDS is exhaustive over NodeKind, so this is always defined.
  return meta!;
}
