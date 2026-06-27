// In-app flow runner: a faithful interpreter of an authored FlowDefinition.
//
// The harness has no headless run mode (only the MAP WebSocket server), so to
// run a flow inside the desktop app we walk the authored graph here, using the
// same branch semantics as the compiler/harness (see ./expr.ts). Side effects
// are injected (`Executors`) so the deterministic core is testable without a
// backend: shell actions and Fanar agent calls are the only impure steps; the
// human-approval gate pauses the run for the operator.

import type {
  ChannelRegistry,
  FlowDefinition,
  FlowEdge,
  FlowNode,
} from "../types";
import { isEntryChannel } from "../types";
import { evalExpr, evalGuard, type EvalContext, type Value } from "./expr";
export type { Value };

/**
 * Context a run needs to resolve nested flows: the channel registry (to read a
 * channel node's binding) and a resolver from a flow id to its definition. When
 * a channel node is bound to `{ kind: "flow" }`, the runner runs that referenced
 * sub-flow inline. Optional so a plain run (no nesting) needs no extra wiring.
 */
export interface RunContext {
  channels: ChannelRegistry;
  /** Resolve a flow id to its definition, or `null` if it cannot be found. */
  resolveFlow(flowId: string): FlowDefinition | null;
}

export type RunStatus = "idle" | "running" | "awaiting" | "done" | "error";

/** One executed step, for the run trace shown in the UI. */
export interface TraceEntry {
  nodeId: string;
  label: string;
  kind: string;
  /** Short human-readable result of running the node. */
  detail: string;
}

/** The impure operations the runner delegates (shell, Fanar). Injected so the
 *  core is testable and so the UI wires them to Tauri commands. */
export interface Executors {
  runShell(command: string): Promise<{ exit: number; text: string }>;
  runAgent(prompt: string, agentRef?: string): Promise<string>;
}

/** Outcome of the immediately-executed node (what guards/sets read). */
type Outcome = Record<string, Value>;

/** Pull a `VERDICT: <word>` line from agent text (lowercased), else "". */
function parseVerdict(text: string): string {
  const m = text.match(/VERDICT:\s*([A-Za-z_]+)/);
  return m ? m[1].toLowerCase() : "";
}

export class FlowRun {
  vars = $state<Record<string, Value>>({});
  status = $state<RunStatus>("idle");
  currentId = $state<string | null>(null);
  /** The edge being traversed (from the just-executed node to the next). */
  activeEdgeId = $state<string | null>(null);
  trace = $state<TraceEntry[]>([]);
  /** Set while `status === "awaiting"`: the human gate the operator must answer. */
  pending = $state<{ nodeId: string; label: string; prompt: string } | null>(
    null,
  );
  /** The citizen-facing result once done (the last drafted message, if any). */
  result = $state<string>("");
  error = $state<string>("");

  /** Per-step delay (ms) so the visual flow on the diagram is visible. Tuned so
   *  each step outlasts the canvas's camera-follow easing, giving a deliberate,
   *  readable pace as the run walks the diagram. */
  stepDelay = $state(750);

  private byId: Map<string, FlowNode>;
  /** The entry channel node the run started from (a flow can have several). */
  private entryId: string | null = null;

  constructor(
    private flow: FlowDefinition,
    private exec: Executors,
    /** Resolves nested-flow channels; omit for flows that never nest. */
    private context: RunContext | null = null,
    /** Recursion depth, incremented for each nested sub-flow run (guards loops). */
    private depth = 0,
  ) {
    this.byId = new Map(flow.nodes.map((n) => [n.id, n]));
  }

  private outgoing(id: string): FlowEdge[] {
    return this.flow.edges.filter((e) => e.from === id);
  }

  /** Replace `{{name}}` with the current value of that variable. */
  private template(s: string): string {
    return s.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (_, name) =>
      this.vars[name] === undefined ? "" : String(this.vars[name]),
    );
  }

  private log(node: FlowNode, detail: string): void {
    this.trace.push({
      nodeId: node.id,
      label: node.label,
      kind: node.kind,
      detail,
    });
  }

  /**
   * Seed variables from the submitted payload, then run from the given entry
   * channel node. The payload is the typed message a consumer submits across
   * an inbound channel -- it is what triggers the flow.
   */
  async start(entryId: string, payload: Record<string, Value> = {}): Promise<void> {
    this.vars = { ...payload };
    this.trace = [];
    this.result = "";
    this.error = "";
    this.pending = null;
    this.activeEdgeId = null;
    this.currentId = entryId;
    this.entryId = entryId;
    this.status = "running";
    // Initial delay so the entry node lights up before execution.
    await this.delay();
    await this.loop();
  }

  /** Answer a human gate; resumes the run with the operator's verdict. */
  async resolve(verdict: "approve" | "reject"): Promise<void> {
    if (this.status !== "awaiting" || !this.pending) return;
    const node = this.byId.get(this.pending.nodeId);
    this.pending = null;
    this.status = "running";
    if (!node) return;
    this.log(
      node,
      verdict === "approve" ? "Approved by operator" : "Rejected by operator",
    );
    this.advance(node, { verdict });
    await this.loop();
  }

  /** Run nodes until the flow finishes or pauses at a human gate. */
  private async loop(): Promise<void> {
    let guard = 0;
    while (this.status === "running" && this.currentId) {
      if (guard++ > 1000) {
        this.fail("flow did not terminate (over 1000 steps)");
        return;
      }
      const node = this.byId.get(this.currentId);
      if (!node) {
        this.fail(`node ${this.currentId} does not exist`);
        return;
      }
      let outcome: Outcome | null;
      try {
        outcome = await this.execute(node);
      } catch (e) {
        this.fail(String(e));
        return;
      }
      // `null` means the node suspended the run at a human gate; the UI resumes
      // it via resolve(). Any other result advances to the next node.
      if (outcome === null) return;
      // Brief pause so the highlight is visible before progressing.
      await this.delay();
      this.advance(node, outcome);
      // If there's a next node, pause so the active edge is visible.
      if (this.currentId) await this.delay();
    }
  }

  /** Execute one node and return its outcome, or `null` if it suspended the run
   *  at a human gate (the loop returns; resolve() resumes it). */
  private async execute(node: FlowNode): Promise<Outcome | null> {
    switch (node.kind) {
      case "agent": {
        const prompt = this.template(node.prompt ?? "");
        const text = await this.exec.runAgent(prompt, node.agentRef);
        const verdict = parseVerdict(text);
        this.log(
          node,
          verdict
            ? `${node.agentRef ?? "agent"} -> VERDICT: ${verdict}`
            : `${node.agentRef ?? "agent"} replied`,
        );
        return { text, verdict };
      }
      case "action":
        return this.executeAction(node);
      case "decision":
        this.log(node, "decision (branch on data)");
        return {};
      case "channel":
        return await this.executeChannel(node);
      case "group":
        // A group is a visual container with no edges; it is never traversed.
        return {};
    }
  }

  private async executeAction(node: FlowNode): Promise<Outcome> {
    switch (node.op) {
      case "shell": {
        const { exit, text } = await this.exec.runShell(
          this.template(node.command ?? ""),
        );
        this.log(node, `shell exit ${exit}`);
        return { exit, text };
      }
      case "set": {
        const ctx = this.ctx(null);
        for (const a of node.assignments ?? [])
          this.vars[a.var] = evalExpr(a.expr, ctx);
        this.log(
          node,
          `set ${(node.assignments ?? []).map((a) => a.var).join(", ")}`,
        );
        return {};
      }
      case "send":
        this.log(node, `send -> ${node.sendTo ?? "?"}`);
        return {};
      case "log":
      default: {
        const msg = this.template(node.message ?? node.label);
        this.log(node, msg);
        return { text: msg };
      }
    }
  }

  private async executeChannel(node: FlowNode): Promise<Outcome | null> {
    const isEntry = node.id === this.entryId;
    if (!isEntry && !node.outcome && this.hasGuardedSplit(node.id)) {
      // A human gate: suspend for the operator's decision (null = suspended).
      this.status = "awaiting";
      this.pending = {
        nodeId: node.id,
        label: node.label,
        prompt: this.template(node.description ?? node.label),
      };
      this.log(node, "awaiting human decision");
      return null;
    }
    // A channel bound to another flow runs that sub-flow inline: it takes the
    // parent's current variables as input and merges the sub-flow's result vars
    // back (how a nested flow "outputs a draft update" to the parent run).
    if (!isEntry) {
      const sub = this.nestedFlowFor(node);
      if (sub) return this.runNested(node, sub);
    }
    this.log(node, node.label);
    return { text: node.label };
  }

  /** If `node` is a channel bound to `{ kind: "flow" }`, resolve the referenced
   *  sub-flow definition; otherwise `null`. */
  private nestedFlowFor(node: FlowNode): FlowDefinition | null {
    if (node.kind !== "channel" || !node.channelId || !this.context) return null;
    const ch = this.context.channels[node.channelId];
    if (!ch || ch.binding.kind !== "flow") return null;
    return this.context.resolveFlow(ch.binding.flowId);
  }

  /** Run `sub` as a nested flow from this node, seeded with the parent's vars,
   *  and merge its resulting vars back into the parent. */
  private async runNested(
    node: FlowNode,
    sub: FlowDefinition,
  ): Promise<Outcome> {
    if (this.depth >= 8) {
      throw new Error(`nested flows too deep at "${node.label}" (over 8 levels)`);
    }
    const entry = firstEntry(sub, this.context!.channels);
    if (!entry) {
      throw new Error(`nested flow "${sub.id}" has no entry channel`);
    }
    const child = new FlowRun(
      sub,
      this.exec,
      this.context,
      this.depth + 1,
    );
    child.stepDelay = this.stepDelay;
    await child.start(entry.id, { ...this.vars });
    if (child.status === "error") {
      throw new Error(`nested flow "${sub.id}": ${child.error}`);
    }
    if (child.status !== "done") {
      // A nested flow that pauses (e.g. its own human gate) can't be resumed
      // through the parent yet; surface it rather than continuing with partial
      // state. Inline nested flows are expected to run to completion.
      throw new Error(
        `nested flow "${sub.id}" did not complete (status: ${child.status})`,
      );
    }
    // Merge the sub-flow's vars back so the parent can branch on / use them.
    this.vars = { ...this.vars, ...child.vars };
    this.log(node, `ran nested flow "${sub.title}"`);
    return { ...child.vars, text: child.result || node.label };
  }

  /** True when `id` branches: more than one out-edge, at least one guarded. */
  private hasGuardedSplit(id: string): boolean {
    const out = this.outgoing(id);
    return out.length > 1 && out.some((e) => e.guard && e.guard.trim());
  }

  /** Build the eval context: current vars + the just-run node's outcome. */
  private ctx(outcome: Outcome | null): EvalContext {
    return { vars: this.vars, outcome };
  }

  /** Pick the taken edge (guarded first, then the fall-through), apply its
   *  assignments, and move on -- or finish when the node is a leaf. */
  private advance(node: FlowNode, outcome: Outcome): void {
    const out = this.outgoing(node.id);
    if (out.length === 0) {
      this.finish(node);
      return;
    }
    const ctx = this.ctx(outcome);
    const guarded = out.filter((e) => e.guard && e.guard.trim());
    const open = out.filter((e) => !(e.guard && e.guard.trim()));
    const taken = [...guarded, ...open].find(
      (e) => !(e.guard && e.guard.trim()) || evalGuard(e.guard, ctx),
    );
    if (!taken) {
      this.fail(`node ${node.id}: no transition matched`);
      return;
    }
    for (const a of taken.set ?? []) this.vars[a.var] = evalExpr(a.expr, ctx);
    // If the just-run node produced a citizen-facing message, remember it.
    if (typeof outcome.text === "string" && node.kind === "agent")
      this.result = outcome.text;
    // Show the edge traversal, then move currentId so the next node lights up.
    this.activeEdgeId = taken.id;
    this.currentId = taken.to;
  }

  private async delay(): Promise<void> {
    if (this.stepDelay > 0) await new Promise((r) => setTimeout(r, this.stepDelay));
  }

  private finish(node: FlowNode): void {
    if (
      typeof this.vars.citizen_message === "string" &&
      this.vars.citizen_message
    ) {
      this.result = this.vars.citizen_message;
    }
    this.log(node, "done");
    this.activeEdgeId = null;
    this.currentId = null;
    this.status = "done";
  }

  private fail(message: string): void {
    this.error = message;
    this.activeEdgeId = null;
    this.currentId = null;
    this.status = "error";
  }
}

/** The flow's entry "door": the first inbound channel node with no incoming
 *  edge. Used to start a nested sub-flow run. Returns `null` if it has none. */
function firstEntry(
  flow: FlowDefinition,
  registry: ChannelRegistry,
): FlowNode | null {
  return (
    flow.nodes.find((n) => isEntryChannel(n, registry, flow.edges)) ?? null
  );
}
