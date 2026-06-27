import { describe, it, expect } from "vitest";
import {
  FlowRun,
  type Executors,
  type RunContext,
} from "../../src/lib/flow/run/run.svelte";
import { toRegistry } from "../../src/lib/flow/channels";
import type {
  ChannelDefinition,
  FlowDefinition,
} from "../../src/lib/flow/types";

// Inert executors: nested-flow execution is deterministic and needs no shell/agent.
const noExec: Executors = {
  runShell: async () => ({ exit: 0, text: "" }),
  runAgent: async () => "",
};

// A sub-flow: an inbound service channel takes input, an action drafts an
// update into `draft`, and an outbound channel returns. This is the README use
// case: take input from a channel, output a draft update.
const subFlow: FlowDefinition = {
  id: "draft-sub",
  title: "Draft update",
  nodes: [
    {
      id: "s-in",
      kind: "channel",
      channelId: "ch-sub-in",
      label: "Sub intake",
      position: { x: 0, y: 0 },
    },
    {
      id: "s-draft",
      kind: "action",
      op: "set",
      label: "Draft update",
      assignments: [{ var: "draft", expr: "national_id" }],
      position: { x: 200, y: 0 },
    },
    {
      id: "s-out",
      kind: "channel",
      channelId: "ch-sub-in",
      label: "Return draft",
      outcome: "issued",
      position: { x: 400, y: 0 },
    },
  ],
  edges: [
    { id: "se-1", from: "s-in", to: "s-draft" },
    { id: "se-2", from: "s-draft", to: "s-out" },
  ],
};

// A parent flow: an inbound UI channel, then a channel bound to the sub-flow,
// then an outbound channel.
const parentFlow: FlowDefinition = {
  id: "parent",
  title: "Parent",
  nodes: [
    {
      id: "p-in",
      kind: "channel",
      channelId: "ch-parent-in",
      label: "Parent intake",
      position: { x: 0, y: 0 },
    },
    {
      id: "p-nested",
      kind: "channel",
      channelId: "ch-nested",
      label: "Run sub-flow",
      position: { x: 200, y: 0 },
    },
    {
      id: "p-out",
      kind: "channel",
      channelId: "ch-parent-in",
      label: "Done",
      outcome: "issued",
      position: { x: 400, y: 0 },
    },
  ],
  edges: [
    { id: "pe-1", from: "p-in", to: "p-nested" },
    { id: "pe-2", from: "p-nested", to: "p-out" },
  ],
};

const channels: ChannelDefinition[] = [
  {
    id: "ch-parent-in",
    title: "Parent app",
    direction: "both",
    binding: { kind: "ui" },
    accepts: [],
    returns: [
      { name: "submit", fields: [{ name: "national_id", type: "string" }] },
    ],
  },
  {
    id: "ch-sub-in",
    title: "Sub service",
    direction: "both",
    binding: { kind: "service", scope: "internal" },
    accepts: [],
    returns: [
      { name: "submit", fields: [{ name: "national_id", type: "string" }] },
    ],
  },
  {
    id: "ch-nested",
    title: "Nested flow channel",
    direction: "both",
    binding: { kind: "flow", flowId: "draft-sub" },
    accepts: [],
    returns: [],
  },
];

function context(): RunContext {
  return {
    channels: toRegistry(channels),
    resolveFlow: (id) => (id === subFlow.id ? subFlow : null),
  };
}

describe("nested flow execution", () => {
  it("runs the referenced sub-flow and merges its result vars back", async () => {
    const run = new FlowRun(parentFlow, noExec, context());
    run.stepDelay = 0;
    await run.start("p-in", { national_id: "28456193" });
    expect(run.status).toBe("done");
    // The sub-flow's drafted variable is visible in the parent run.
    expect(run.vars.draft).toBe("28456193");
    // The parent trace records the nested run.
    expect(
      run.trace.some((t) => t.detail.includes('nested flow "Draft update"')),
    ).toBe(true);
  });

  it("runs without nesting when no RunContext is provided", async () => {
    // Same parent flow, but no context: the nested channel is treated as a
    // plain channel node (no recursion), so the run still completes.
    const run = new FlowRun(parentFlow, noExec);
    run.stepDelay = 0;
    await run.start("p-in", { national_id: "28456193" });
    expect(run.status).toBe("done");
    expect(run.vars.draft).toBeUndefined();
  });
});
