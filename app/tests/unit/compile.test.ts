import { describe, it, expect } from "vitest";

import { compileFlow } from "../../src/lib/flow/compile";
import {
  exampleChannels,
  residenceCertificateRunnable,
} from "../../src/lib/flow/fixtures";
import type {
  ChannelDefinition,
  ChannelRegistry,
  FlowDefinition,
  FlowNode,
  FlowEdge,
} from "../../src/lib/flow/types";

// A minimal inbound channel so a channel node can act as the flow's entry door.
// The compiler needs the registry to know which channel nodes are inbound.
const inboundChannel: ChannelDefinition = {
  id: "ch-in",
  title: "Intake",
  direction: "inbound",
  binding: { kind: "ui" },
  accepts: [],
  returns: [
    {
      name: "submit",
      fields: [
        { name: "national_id", type: "string" },
        { name: "applicant_name", type: "string" },
      ],
    },
  ],
};
const registry: ChannelRegistry = { "ch-in": inboundChannel };

/** Build a FlowDefinition from loose parts with sane defaults. */
function flow(
  parts: Partial<FlowDefinition> & { nodes: FlowNode[] },
): FlowDefinition {
  return {
    id: "test-flow",
    title: "Test Flow",
    edges: [],
    ...parts,
  };
}

function node(
  id: string,
  kind: FlowNode["kind"],
  extra: Partial<FlowNode> = {},
): FlowNode {
  return { id, kind, label: id, position: { x: 0, y: 0 }, ...extra };
}

/** An inbound channel node (entry door) bound to `ch-in`. */
function entry(id = "in", extra: Partial<FlowNode> = {}): FlowNode {
  return node(id, "channel", { channelId: "ch-in", ...extra });
}

function edge(
  from: string,
  to: string,
  extra: Partial<FlowEdge> = {},
): FlowEdge {
  return { id: `${from}-${to}`, from, to, ...extra };
}

/** The set of `key: value`-ish lines for quick membership assertions. */
function lines(yaml: string): string[] {
  return yaml.split("\n");
}

describe("compileFlow header & vars", () => {
  it("emits version, initial (the entry door), and a node", () => {
    const f = flow({
      nodes: [
        entry("in"),
        node("end", "action", { op: "log", message: "hi" }),
      ],
      edges: [edge("in", "end")],
    });
    const { yaml, errors } = compileFlow(f, registry);
    expect(errors).toEqual([]);
    expect(yaml).toContain("version: 1");
    expect(yaml).toContain("initial: in");
    expect(yaml).toContain("nodes:");
  });

  it("emits nodes without a vars section (payload-only seeding)", () => {
    const f = flow({
      nodes: [entry("in")],
    });
    const { yaml } = compileFlow(f, registry);
    expect(yaml).not.toContain("vars:");
    expect(yaml).toContain("nodes:");
  });
});

describe("node-kind mapping", () => {
  it("agent -> agent with ref and block prompt", () => {
    const f = flow({
      nodes: [
        entry("in"),
        node("a", "agent", {
          agentRef: "arabic-reasoner",
          prompt: "Assess this.\nReturn a verdict.",
        }),
      ],
      edges: [edge("in", "a")],
    });
    const { yaml, errors } = compileFlow(f, registry);
    expect(errors).toEqual([]);
    expect(yaml).toContain("    kind: agent");
    expect(yaml).toContain("    agent: arabic-reasoner");
    expect(yaml).toContain("    prompt: |");
    expect(yaml).toContain("      Assess this.");
    expect(yaml).toContain("      Return a verdict.");
  });

  it("agent without ref defaults to arabic-reasoner", () => {
    const f = flow({
      nodes: [entry("in"), node("a", "agent", { prompt: "x" })],
      edges: [edge("in", "a")],
    });
    expect(compileFlow(f, registry).yaml).toContain("    agent: arabic-reasoner");
  });

  it("action op=shell -> action: shell with block command", () => {
    const f = flow({
      nodes: [
        entry("in"),
        node("s", "action", { op: "shell", command: "echo hi\nexit 0" }),
      ],
      edges: [edge("in", "s")],
    });
    const { yaml, errors } = compileFlow(f, registry);
    expect(errors).toEqual([]);
    expect(yaml).toContain("    action: shell");
    expect(yaml).toContain("    command: |");
    expect(yaml).toContain("      echo hi");
  });

  it("action op=set -> action: set_var with a set map", () => {
    const f = flow({
      nodes: [
        entry("in"),
        node("v", "action", {
          op: "set",
          assignments: [{ var: "outcome", expr: '"issued"' }],
        }),
      ],
      edges: [edge("in", "v")],
    });
    const { yaml } = compileFlow(f, registry);
    expect(yaml).toContain("    action: set_var");
    expect(yaml).toContain("    set:");
    // A literal string expression keeps its inner quotes after YAML quoting.
    expect(yaml).toContain(`      outcome: '"issued"'`);
  });

  it("action op=send -> action: send with to + message", () => {
    const f = flow({
      nodes: [
        entry("in"),
        node("snd", "action", { op: "send", sendTo: "dev", message: "fix it" }),
        node("dev", "action", { op: "log", message: "done" }),
      ],
      edges: [edge("in", "snd"), edge("snd", "dev")],
    });
    const { yaml } = compileFlow(f, registry);
    expect(yaml).toContain("    action: send");
    expect(yaml).toContain("    to: dev");
  });

  it("decision -> pass-through log labelled Decision", () => {
    const f = flow({
      nodes: [
        entry("in"),
        node("d", "decision", { label: "Sufficient?" }),
        node("end", "action", { op: "log" }),
      ],
      edges: [edge("in", "d"), edge("d", "end")],
    });
    const { yaml } = compileFlow(f, registry);
    expect(yaml).toContain("    action: log");
    expect(yaml).toContain("    message: 'Decision: Sufficient?'");
  });
});

describe("channel mapping", () => {
  it("inbound entry channel -> entry log node", () => {
    const f = flow({
      nodes: [
        entry("in", { label: "Application received" }),
        node("end", "action", { op: "log" }),
      ],
      edges: [edge("in", "end")],
    });
    const { yaml } = compileFlow(f, registry);
    const idx = lines(yaml).findIndex((l) => l.trim() === "in:");
    expect(lines(yaml)[idx + 1]).toBe("    kind: action");
  });

  it("non-entry gating channel -> user approval", () => {
    const f = flow({
      nodes: [
        entry("in", { label: "received" }),
        node("gate", "channel", {
          label: "Bureaucrat",
          description: "Review the case.",
        }),
        node("yes", "action", { op: "log" }),
        node("no", "action", { op: "log" }),
      ],
      edges: [
        edge("in", "gate"),
        edge("gate", "yes", { guard: 'outcome.verdict == "approve"' }),
        edge("gate", "no"),
      ],
    });
    const { yaml } = compileFlow(f, registry);
    expect(yaml).toContain("    kind: user");
    expect(yaml).toContain("    approval: true");
    expect(yaml).toContain("      Review the case.");
  });

  it("terminal channel (no out-edges) -> log + terminal: success", () => {
    const f = flow({
      nodes: [
        entry("in", { label: "received" }),
        node("done", "channel", { label: "Issued", outcome: "issued" }),
      ],
      edges: [edge("in", "done")],
    });
    const { yaml } = compileFlow(f, registry);
    expect(yaml).toContain("    terminal: success");
  });
});

describe("transitions", () => {
  it("orders guarded edges before the unconditional fall-through", () => {
    const f = flow({
      nodes: [
        entry("in"),
        node("s", "action", { op: "log" }),
        node("a", "action", { op: "log" }),
        node("b", "action", { op: "log" }),
      ],
      edges: [
        edge("in", "s"),
        edge("s", "a", { guard: "outcome.exit == 0" }),
        edge("s", "b"), // unconditional
      ],
    });
    const ls = lines(compileFlow(f, registry).yaml);
    const whenIdx = ls.findIndex((l) => l.includes("when: outcome.exit == 0"));
    const fallIdx = ls.findIndex((l) => l.trim() === "- to: b");
    expect(whenIdx).toBeGreaterThan(-1);
    expect(fallIdx).toBeGreaterThan(whenIdx);
  });

  it("emits edge set assignments under the transition", () => {
    const f = flow({
      nodes: [
        entry("in"),
        node("s", "action", { op: "log" }),
        node("t", "action", { op: "log" }),
      ],
      edges: [
        edge("in", "s"),
        edge("s", "t", {
          set: [
            { var: "outcome", expr: '"rejected"' },
            { var: "note", expr: "outcome.text" },
          ],
        }),
      ],
    });
    const { yaml } = compileFlow(f, registry);
    expect(yaml).toContain("        set:");
    expect(yaml).toContain(`          outcome: '"rejected"'`);
    expect(yaml).toContain("          note: outcome.text");
  });
});

describe("bundled runnable fixture", () => {
  it("compiles the residence runnable example with no errors", () => {
    // The fixture references the bundled channels; build a registry from them.
    const channels: ChannelRegistry = {};
    for (const ch of exampleChannels) channels[ch.id] = ch;
    const { yaml, errors } = compileFlow(residenceCertificateRunnable, channels);
    expect(errors).toEqual([]);
    // Spot-check the mappings that matter for a real run.
    expect(yaml).toContain("initial: n-input"); // the inbound channel door
    expect(yaml).not.toContain("national_id:"); // no vars section – payload only
    expect(yaml).toContain("    agent: arabic-reasoner"); // Fanar reasoning node
    expect(yaml).toContain("    kind: user"); // bureaucrat escalation gate
    expect(yaml).toContain("    action: shell"); // deterministic ID validation
    expect(yaml).toContain("    terminal: success"); // the leaf outcomes
    expect(yaml).toContain(`addr_verdict == "sufficient"`); // verdict carried via a var
  });
});

describe("validation errors", () => {
  it("flags a flow with no inbound channel node", () => {
    const f = flow({
      nodes: [node("s", "action", { op: "log" })],
    });
    expect(compileFlow(f, registry).errors.join(" ")).toContain(
      "no inbound channel node",
    );
  });

  it("flags an unreachable node", () => {
    const f = flow({
      nodes: [
        entry("in"),
        node("orphan", "action", { op: "log" }),
      ],
    });
    expect(compileFlow(f, registry).errors.join(" ")).toContain("unreachable");
  });

  it("flags an agent with no prompt", () => {
    const f = flow({
      nodes: [entry("in"), node("a", "agent", {})],
      edges: [edge("in", "a")],
    });
    expect(compileFlow(f, registry).errors.join(" ")).toContain("no prompt");
  });

  it("flags an action with no op", () => {
    const f = flow({
      nodes: [entry("in"), node("a", "action", {})],
      edges: [edge("in", "a")],
    });
    expect(compileFlow(f, registry).errors.join(" ")).toContain("no op");
  });

  it("flags more than one unconditional transition", () => {
    const f = flow({
      nodes: [
        entry("in"),
        node("s", "action", { op: "log" }),
        node("a", "action", { op: "log" }),
        node("b", "action", { op: "log" }),
      ],
      edges: [edge("in", "s"), edge("s", "a"), edge("s", "b")],
    });
    expect(compileFlow(f, registry).errors.join(" ")).toContain("unconditional");
  });
});
