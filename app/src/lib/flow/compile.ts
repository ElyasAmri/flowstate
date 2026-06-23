// Compiler: an authored FlowDefinition -> an executable maestro flow (YAML).
//
// This closes the gap between the editor (which authors the conceptual
// channel/agent/action/decision graph) and the harness (which runs maestro's
// node kinds: agent / action / user). The output is a `.maestro/flows/<id>.yaml`
// the harness loads with `/flow <id>` and validates before running.
//
// Node-kind mapping:
//   agent                       -> agent  (agent: <ref>, prompt: |...)
//   action op=shell             -> action: shell   (command)
//   action op=set               -> action: set_var (set: {...})
//   action op=log               -> action: log     (message)
//   action op=send              -> action: send    (to, message)
//   decision                    -> action: log     (pass-through; out-edge guards branch)
//   channel inbound (entry)     -> action: log     (receipt; the entry node)
//   channel outbound ui, gating -> user            (approval: true) -- a human step
//   channel outbound, terminal  -> action: log + terminal: success  (returns a result)
//   channel outbound service    -> action: log     (service stub; swap to op=shell to wire)
//
// The flow has no global start: it is triggered by submitting a payload to an
// inbound channel node (a "door"). The compiler picks the first inbound channel
// node as the maestro `initial`. Edge guards become `when:` and edge assignments
// become `set:`. Determinism lives in the graph, exactly as the harness expects.

import type {
  ChannelRegistry,
  FlowDefinition,
  FlowEdge,
  FlowNode,
  VarAssignment,
} from "./types";
import { isEntryChannel } from "./types";

/** The result of a compile: the YAML text plus any blocking problems. */
export interface CompileResult {
  /** The emitted maestro flow YAML (best-effort even when `errors` is non-empty). */
  yaml: string;
  /** Problems that would make the flow invalid or unrunnable. Empty = clean. */
  errors: string[];
}

// --- YAML emission helpers --------------------------------------------------

/** True when `s` cannot be emitted as a bare YAML plain scalar. */
function needsQuote(s: string): boolean {
  if (s === "") return true;
  if (/^\s|\s$/.test(s)) return true; // leading/trailing space
  if (/^[-?:,[\]{}#&*!|>'"%@`]/.test(s)) return true; // indicator at start
  if (/:\s|\s#/.test(s)) return true; // `: ` or ` #` mid-string
  if (/[:]$/.test(s)) return true; // trailing colon
  if (/^(true|false|yes|no|on|off|null|~)$/i.test(s)) return true; // YAML keyword
  if (/^[+-]?\d/.test(s)) return true; // numeric-looking -> keep it a string
  return false;
}

/** Emit `s` as a YAML scalar: bare when safe, else single-quoted (with '' escaping). */
function scalar(s: string): string {
  return needsQuote(s) ? `'${s.replace(/'/g, "''")}'` : s;
}

/** Emit a (possibly multi-line) string as a block scalar `|` indented under `pad`. */
function block(s: string, pad: string): string {
  const body = s.replace(/\n+$/, "").split("\n");
  return ["|", ...body.map((l) => (l ? pad + l : ""))].join("\n");
}

/** A scalar key (node id, var name) -- quoted only if it needs it. */
function key(s: string): string {
  return needsQuote(s) ? `'${s.replace(/'/g, "''")}'` : s;
}

// --- compile ----------------------------------------------------------------

/** Compile an authored flow to maestro YAML. Always returns text; check `errors`.
 *  `registry` lets the compiler resolve which channel nodes are inbound entry
 *  doors; pass `{}` when channels are unavailable (the first node is used). */
export function compileFlow(
  flow: FlowDefinition,
  registry: ChannelRegistry = {},
): CompileResult {
  const errors: string[] = [];
  const byId = new Map(flow.nodes.map((n) => [n.id, n]));
  const outgoing = (id: string): FlowEdge[] =>
    flow.edges.filter((e) => e.from === id);

  // The flow is triggered by submitting to an inbound channel node. The compiler
  // takes the first such "door" as maestro's `initial`; if none resolves (no
  // registry, or no inbound channel), it falls back to the first node so the
  // emitted YAML still has an entry, and reachability is reported below.
  const entryNodes = flow.nodes.filter((n) =>
    isEntryChannel(n, registry, flow.edges),
  );
  const initialId = entryNodes[0]?.id ?? flow.nodes[0]?.id ?? "";

  // --- structural checks ---
  if (!flow.nodes.length) errors.push("flow has no nodes");
  if (!entryNodes.length) {
    errors.push(
      "flow has no inbound channel node to trigger it (add a channel bound to an inbound channel)",
    );
  }
  for (const e of flow.edges) {
    if (!byId.has(e.from))
      errors.push(
        `edge ${e.id}: source ${JSON.stringify(e.from)} does not exist`,
      );
    if (!byId.has(e.to))
      errors.push(
        `edge ${e.id}: target ${JSON.stringify(e.to)} does not exist`,
      );
  }
  // Reachability: every entry door is a valid starting point, so seed the search
  // from all of them (maestro takes one `initial`, but the others are still
  // legitimate entries a consumer can submit to).
  const reached = new Set<string>();
  const stack = entryNodes.length
    ? entryNodes.map((n) => n.id)
    : initialId
      ? [initialId]
      : [];
  while (stack.length) {
    const id = stack.pop()!;
    if (reached.has(id) || !byId.has(id)) continue;
    reached.add(id);
    for (const e of outgoing(id)) stack.push(e.to);
  }
  for (const n of flow.nodes) {
    if (!reached.has(n.id))
      errors.push(
        `node ${n.id} (${n.label}) is unreachable from any entry node`,
      );
  }

  // --- emit ---
  const lines: string[] = [];
  lines.push(
    "# Generated from the flow editor by compile.ts -- do not edit by hand.",
  );
  lines.push(`# Source flow: ${flow.title} (${flow.id})`);
  lines.push("version: 1");
  lines.push(`initial: ${scalar(initialId)}`);

  lines.push("nodes:");
  for (const node of flow.nodes) {
    const edges = orderedEdges(node, outgoing(node.id), errors);
    const terminal = isTerminal(node, edges);
    lines.push(`  ${key(node.id)}:`);
    emitNodeBody(lines, node, errors, entryNodes, edges);
    if (terminal) lines.push("    terminal: success");
    emitTransitions(lines, edges, terminal, errors, node);
  }

  return { yaml: lines.join("\n") + "\n", errors };
}

/**
 * Order a node's out-edges so guarded branches come first and the single
 * unconditional fall-through (if any) is last -- the order the harness validator
 * requires. More than one unguarded edge is an authoring error.
 */
function orderedEdges(
  node: FlowNode,
  edges: FlowEdge[],
  errors: string[],
): FlowEdge[] {
  const guarded = edges.filter((e) => e.guard && e.guard.trim());
  const open = edges.filter((e) => !(e.guard && e.guard.trim()));
  if (open.length > 1) {
    errors.push(
      `node ${node.id} (${node.label}): ${open.length} unconditional transitions; at most one is allowed`,
    );
  }
  return [...guarded, ...open];
}

/** A node is terminal when it has no outgoing edges (a leaf resolves the case). */
function isTerminal(node: FlowNode, edges: FlowEdge[]): boolean {
  return edges.length === 0;
}

/** Emit the kind-specific body of a node (everything but `terminal:` and `on:`). */
function emitNodeBody(
  lines: string[],
  node: FlowNode,
  errors: string[],
  entryNodes: FlowNode[],
  edges: FlowEdge[],
): void {
  switch (node.kind) {
    case "agent": {
      const ref = node.agentRef?.trim() || "arabic-reasoner";
      lines.push("    kind: agent");
      lines.push(`    agent: ${scalar(ref)}`);
      if (!node.prompt?.trim())
        errors.push(`node ${node.id} (${node.label}): agent has no prompt`);
      lines.push(`    prompt: ${block(node.prompt ?? "", "      ")}`);
      return;
    }
    case "action": {
      emitAction(lines, node, errors);
      return;
    }
    case "decision": {
      // A decision is a deterministic branch point: a pass-through whose
      // out-edge guards do the branching.
      lines.push("    kind: action");
      lines.push("    action: log");
      lines.push(`    message: ${scalar("Decision: " + node.label)}`);
      return;
    }
    case "channel": {
      emitChannel(lines, node, errors, entryNodes, edges);
      return;
    }
  }
}

/** Emit an `action` node by its op. */
function emitAction(lines: string[], node: FlowNode, errors: string[]): void {
  lines.push("    kind: action");
  switch (node.op) {
    case "shell":
      if (!node.command?.trim())
        errors.push(
          `node ${node.id} (${node.label}): shell action has no command`,
        );
      lines.push("    action: shell");
      lines.push(`    command: ${block(node.command ?? "", "      ")}`);
      return;
    case "set":
      lines.push("    action: set_var");
      emitSetMap(lines, node.assignments ?? [], "    ", node, errors);
      return;
    case "send":
      if (!node.sendTo?.trim())
        errors.push(
          `node ${node.id} (${node.label}): send action has no target`,
        );
      lines.push("    action: send");
      lines.push(`    to: ${scalar(node.sendTo ?? "")}`);
      lines.push(`    message: ${block(node.message ?? "", "      ")}`);
      return;
    case "log":
      lines.push("    action: log");
      lines.push(`    message: ${block(node.message ?? node.label, "      ")}`);
      return;
    default:
      errors.push(
        `node ${node.id} (${node.label}): action has no op (shell/set/log/send)`,
      );
      lines.push("    action: log");
      lines.push(`    message: ${scalar(node.label)}`);
  }
}

/** Emit a `channel` node, mapped to a maestro node by direction/binding. */
function emitChannel(
  lines: string[],
  node: FlowNode,
  errors: string[],
  entryNodes: FlowNode[],
  edges: FlowEdge[],
): void {
  const isEntry = entryNodes.some((n) => n.id === node.id);
  const isHumanGate =
    node.kind === "channel" &&
    !node.outcome &&
    !isEntry &&
    hasGuardedSplit(edges);
  if (isEntry) {
    // Entry door: the application arrives. A receipt log is the entry node.
    lines.push("    kind: action");
    lines.push("    action: log");
    lines.push(`    message: ${scalar(node.label)}`);
    return;
  }
  if (isHumanGate) {
    // A bureaucrat / human desk: a real decision point for a person.
    lines.push("    kind: user");
    lines.push("    approval: true");
    lines.push(
      `    prompt: ${block(node.description?.trim() || node.label, "      ")}`,
    );
    return;
  }
  // Otherwise a service call or a result returned to the consumer: a log step
  // (terminal handling is added by the caller when it has no out-edges).
  lines.push("    kind: action");
  lines.push("    action: log");
  lines.push(`    message: ${scalar(node.label)}`);
}

/** True when these out-edges branch -- >1 edge with at least one guard (a gate). */
function hasGuardedSplit(edges: FlowEdge[]): boolean {
  return edges.length > 1 && edges.some((e) => e.guard && e.guard.trim());
}

/** Emit a `set:` block map under the given pad from a list of assignments. */
function emitSetMap(
  lines: string[],
  set: VarAssignment[],
  pad: string,
  node: FlowNode,
  errors: string[],
): void {
  if (!set.length) {
    errors.push(
      `node ${node.id} (${node.label}): set action has no assignments`,
    );
    return;
  }
  lines.push(`${pad}set:`);
  for (const a of set) lines.push(`${pad}  ${key(a.var)}: ${scalar(a.expr)}`);
}

/** Emit the `on:` transition list (or none, for a terminal node). */
function emitTransitions(
  lines: string[],
  edges: FlowEdge[],
  terminal: boolean,
  errors: string[],
  node: FlowNode,
): void {
  if (terminal) return;
  lines.push("    on:");
  for (const e of edges) {
    const head = `      - `;
    if (e.guard && e.guard.trim()) {
      lines.push(`${head}when: ${scalar(e.guard.trim())}`);
      lines.push(`        to: ${scalar(e.to)}`);
    } else {
      lines.push(`${head}to: ${scalar(e.to)}`);
    }
    if (e.set && e.set.length) {
      lines.push("        set:");
      for (const a of e.set)
        lines.push(`          ${key(a.var)}: ${scalar(a.expr)}`);
    }
  }
}
