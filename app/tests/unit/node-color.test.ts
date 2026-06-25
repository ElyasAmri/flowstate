import { describe, it, expect } from "vitest";
import {
  colorForBinding,
  iconKeyForNode,
  nodeColor,
} from "../../src/lib/flow/node-color";
import type { ChannelDefinition, ChannelRegistry, FlowNode } from "../../src/lib/flow/types";

function ch(id: string, binding: ChannelDefinition["binding"]): ChannelDefinition {
  return {
    id,
    title: id,
    direction: "both",
    binding,
    accepts: [],
    returns: [],
  };
}

const registry: ChannelRegistry = {
  "ch-ui": ch("ch-ui", { kind: "ui" }),
  "ch-flow": ch("ch-flow", { kind: "flow", flowId: "flow-x" }),
  "ch-svc": ch("ch-svc", { kind: "service", scope: "external" }),
};

function node(kind: FlowNode["kind"], channelId?: string): FlowNode {
  return { id: "n", kind, label: "n", position: { x: 0, y: 0 }, channelId };
}

describe("colorForBinding", () => {
  it("maps each binding kind to a distinct color (ui yellow, service green, flow purple)", () => {
    expect(colorForBinding("ui")).toBe("yellow");
    expect(colorForBinding("flow")).toBe("purple");
    expect(colorForBinding("service")).toBe("green");
  });
});

describe("nodeColor", () => {
  it("derives a channel node's color from its binding", () => {
    expect(nodeColor(node("channel", "ch-ui"), registry)).toBe("yellow");
    expect(nodeColor(node("channel", "ch-flow"), registry)).toBe("purple");
    expect(nodeColor(node("channel", "ch-svc"), registry)).toBe("green");
  });

  it("falls back to gray-light for an unresolved channel reference", () => {
    expect(nodeColor(node("channel", "missing"), registry)).toBe("gray-light");
    expect(nodeColor(node("channel"), registry)).toBe("gray-light");
  });

  it("colors agent cyan, action gray-light, and decision gray-dark", () => {
    expect(nodeColor(node("agent"), registry)).toBe("cyan");
    expect(nodeColor(node("action"), registry)).toBe("gray-light");
    expect(nodeColor(node("decision"), registry)).toBe("gray-dark");
  });
});

describe("iconKeyForNode", () => {
  it("picks a binding-specific icon for a resolved channel node", () => {
    expect(iconKeyForNode(node("channel", "ch-ui"), registry)).toBe("channel-ui");
    expect(iconKeyForNode(node("channel", "ch-flow"), registry)).toBe("channel-flow");
    expect(iconKeyForNode(node("channel", "ch-svc"), registry)).toBe("channel-service");
  });

  it("uses the generic channel icon when unresolved", () => {
    expect(iconKeyForNode(node("channel", "missing"), registry)).toBe("channel");
  });

  it("uses the kind as the icon key for non-channel nodes", () => {
    expect(iconKeyForNode(node("agent"), registry)).toBe("agent");
    expect(iconKeyForNode(node("action"), registry)).toBe("action");
    expect(iconKeyForNode(node("decision"), registry)).toBe("decision");
  });
});
