import { describe, it, expect } from "vitest";

import { compileFlow } from "../../src/lib/flow/compile";
import { residenceCertificateRunnable } from "../../src/lib/flow/fixtures";
import type {
  FlowDefinition,
  FlowNode,
  FlowEdge,
} from "../../src/lib/flow/types";

/** Build a FlowDefinition from loose parts with sane defaults. */
function flow(
  parts: Partial<FlowDefinition> & { nodes: FlowNode[] },
): FlowDefinition {
  return {
    id: "test-flow",
    title: "Test Flow",
    startNodeId: parts.nodes[0]?.id ?? "",
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
  it("emits version, initial, and a node", () => {
    const f = flow({
      nodes: [node("start", "action", { op: "log", message: "hi" })],
    });
    const { yaml, errors } = compileFlow(f);
    expect(errors).toEqual([]);
    expect(yaml).toContain("version: 1");
    expect(yaml).toContain("initial: start");
    expect(yaml).toContain("nodes:");
  });

  it("emits vars with string-preserving quoting", () => {
    const f = flow({
      vars: [
        { name: "national_id", value: "19880421" },
        { name: "outcome", value: "" },
        { name: "applicant", value: "Layla" },
      ],
      nodes: [node("start", "action", { op: "log", message: "hi" })],
    });
    const { yaml } = compileFlow(f);
    // Numeric-looking and empty values are quoted so they stay strings.
    expect(yaml).toContain("  national_id: '19880421'");
    expect(yaml).toContain("  outcome: ''");
    expect(yaml).toContain("  applicant: Layla");
  });
});

describe("node-kind mapping", () => {
  it("agent -> agent with ref and block prompt", () => {
    const f = flow({
      nodes: [
        node("a", "agent", {
          agentRef: "arabic-reasoner",
          prompt: "Assess this.\nReturn a verdict.",
        }),
      ],
    });
    const { yaml, errors } = compileFlow(f);
    expect(errors).toEqual([]);
    expect(yaml).toContain("    kind: agent");
    expect(yaml).toContain("    agent: arabic-reasoner");
    expect(yaml).toContain("    prompt: |");
    expect(yaml).toContain("      Assess this.");
    expect(yaml).toContain("      Return a verdict.");
  });

  it("agent without ref defaults to arabic-reasoner", () => {
    const f = flow({ nodes: [node("a", "agent", { prompt: "x" })] });
    expect(compileFlow(f).yaml).toContain("    agent: arabic-reasoner");
  });

  it("action op=shell -> action: shell with block command", () => {
    const f = flow({
      nodes: [node("s", "action", { op: "shell", command: "echo hi\nexit 0" })],
    });
    const { yaml, errors } = compileFlow(f);
    expect(errors).toEqual([]);
    expect(yaml).toContain("    action: shell");
    expect(yaml).toContain("    command: |");
    expect(yaml).toContain("      echo hi");
  });

  it("action op=set -> action: set_var with a set map", () => {
    const f = flow({
      nodes: [
        node("v", "action", {
          op: "set",
          assignments: [{ var: "outcome", expr: '"issued"' }],
        }),
      ],
    });
    const { yaml } = compileFlow(f);
    expect(yaml).toContain("    action: set_var");
    expect(yaml).toContain("    set:");
    // A literal string expression keeps its inner quotes after YAML quoting.
    expect(yaml).toContain(`      outcome: '"issued"'`);
  });

  it("action op=send -> action: send with to + message", () => {
    const f = flow({
      nodes: [
        node("snd", "action", { op: "send", sendTo: "dev", message: "fix it" }),
        node("dev", "action", { op: "log", message: "done" }),
      ],
      edges: [edge("snd", "dev")],
    });
    const { yaml } = compileFlow(f);
    expect(yaml).toContain("    action: send");
    expect(yaml).toContain("    to: dev");
  });

  it("decision -> pass-through log labelled Decision", () => {
    const f = flow({
      nodes: [
        node("d", "decision", { label: "Sufficient?" }),
        node("end", "action", { op: "log" }),
      ],
      edges: [edge("d", "end")],
    });
    const { yaml } = compileFlow(f);
    expect(yaml).toContain("    action: log");
    expect(yaml).toContain("    message: 'Decision: Sufficient?'");
  });
});

describe("channel mapping", () => {
  it("start channel -> entry log node", () => {
    const f = flow({
      startNodeId: "in",
      nodes: [
        node("in", "channel", { label: "Application received" }),
        node("end", "action", { op: "log" }),
      ],
      edges: [edge("in", "end")],
    });
    const { yaml } = compileFlow(f);
    const idx = lines(yaml).findIndex((l) => l.trim() === "in:");
    expect(lines(yaml)[idx + 1]).toBe("    kind: action");
  });

  it("non-start gating channel -> user approval", () => {
    const f = flow({
      startNodeId: "in",
      nodes: [
        node("in", "channel", { label: "received" }),
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
    const { yaml } = compileFlow(f);
    expect(yaml).toContain("    kind: user");
    expect(yaml).toContain("    approval: true");
    expect(yaml).toContain("      Review the case.");
  });

  it("terminal channel (no out-edges) -> log + terminal: success", () => {
    const f = flow({
      startNodeId: "in",
      nodes: [
        node("in", "channel", { label: "received" }),
        node("done", "channel", { label: "Issued", outcome: "issued" }),
      ],
      edges: [edge("in", "done")],
    });
    const { yaml } = compileFlow(f);
    expect(yaml).toContain("    terminal: success");
  });
});

describe("transitions", () => {
  it("orders guarded edges before the unconditional fall-through", () => {
    const f = flow({
      nodes: [
        node("s", "action", { op: "log" }),
        node("a", "action", { op: "log" }),
        node("b", "action", { op: "log" }),
      ],
      edges: [
        edge("s", "a", { guard: "outcome.exit == 0" }),
        edge("s", "b"), // unconditional
      ],
    });
    const ls = lines(compileFlow(f).yaml);
    const whenIdx = ls.findIndex((l) => l.includes("when: outcome.exit == 0"));
    const fallIdx = ls.findIndex((l) => l.trim() === "- to: b");
    expect(whenIdx).toBeGreaterThan(-1);
    expect(fallIdx).toBeGreaterThan(whenIdx);
  });

  it("emits edge set assignments under the transition", () => {
    const f = flow({
      nodes: [
        node("s", "action", { op: "log" }),
        node("t", "action", { op: "log" }),
      ],
      edges: [
        edge("s", "t", {
          set: [
            { var: "outcome", expr: '"rejected"' },
            { var: "note", expr: "outcome.text" },
          ],
        }),
      ],
    });
    const { yaml } = compileFlow(f);
    expect(yaml).toContain("        set:");
    expect(yaml).toContain(`          outcome: '"rejected"'`);
    expect(yaml).toContain("          note: outcome.text");
  });
});

describe("bundled runnable fixture", () => {
  it("compiles the residence runnable example with no errors", () => {
    const { yaml, errors } = compileFlow(residenceCertificateRunnable);
    expect(errors).toEqual([]);
    // Spot-check the mappings that matter for a real run.
    expect(yaml).toContain("initial: n-start");
    expect(yaml).toContain("    agent: arabic-reasoner"); // Fanar reasoning node
    expect(yaml).toContain("    kind: user"); // bureaucrat escalation gate
    expect(yaml).toContain("    action: shell"); // deterministic ID validation
    expect(yaml).toContain("    terminal: success"); // the leaf outcomes
    expect(yaml).toContain(`addr_verdict == "sufficient"`); // verdict carried via a var
  });
});

describe("validation errors", () => {
  it("flags a missing start node", () => {
    const f = flow({
      startNodeId: "ghost",
      nodes: [node("s", "action", { op: "log" })],
    });
    expect(compileFlow(f).errors.join(" ")).toContain("start node");
  });

  it("flags an unreachable node", () => {
    const f = flow({
      startNodeId: "s",
      nodes: [
        node("s", "action", { op: "log" }),
        node("orphan", "action", { op: "log" }),
      ],
    });
    expect(compileFlow(f).errors.join(" ")).toContain("unreachable");
  });

  it("flags an agent with no prompt", () => {
    const f = flow({ nodes: [node("a", "agent", {})] });
    expect(compileFlow(f).errors.join(" ")).toContain("no prompt");
  });

  it("flags an action with no op", () => {
    const f = flow({ nodes: [node("a", "action", {})] });
    expect(compileFlow(f).errors.join(" ")).toContain("no op");
  });

  it("flags more than one unconditional transition", () => {
    const f = flow({
      nodes: [
        node("s", "action", { op: "log" }),
        node("a", "action", { op: "log" }),
        node("b", "action", { op: "log" }),
      ],
      edges: [edge("s", "a"), edge("s", "b")],
    });
    expect(compileFlow(f).errors.join(" ")).toContain("unconditional");
  });
});
