import { describe, it, expect } from "vitest";

import { isEntryChannel, type ChannelRegistry, type FlowEdge, type FlowNode } from "../../src/lib/flow/types";
import { toRegistry } from "../../src/lib/flow/channels";
import { FlowEditor } from "../../src/lib/flow/editor.svelte";
import {
  exampleChannels,
  residenceCertificateRunnable,
} from "../../src/lib/flow/fixtures";

// The "submit a query" gesture is now double-clicking an entry channel ("door")
// node on the canvas. FlowEditor's handleNodeActivate routes that double-click
// to the run modal ONLY when isEntryChannel(node) is true, so these tests pin
// down exactly which nodes are doors -- i.e. which ones a double-click submits.

const registry: ChannelRegistry = toRegistry(exampleChannels);

/** A channel node referencing the given channel id, with no incoming edge. */
function channelNode(id: string, channelId: string): FlowNode {
  return { id, kind: "channel", channelId, label: id, position: { x: 0, y: 0 } };
}

describe("isEntryChannel (door detection for double-click submit)", () => {
  it("treats an inbound/both channel node with no incoming edge as a door", () => {
    // ch-intake has direction "both"; with no edge pointing at it, it's an entry.
    const node = channelNode("n-input", "ch-intake");
    expect(isEntryChannel(node, registry, [])).toBe(true);
  });

  it("is not a door when something in the flow routes to the node", () => {
    const node = channelNode("n-approved", "ch-intake");
    const edges: FlowEdge[] = [{ id: "e", from: "n-other", to: "n-approved" }];
    expect(isEntryChannel(node, registry, edges)).toBe(false);
  });

  it("is not a door for an outbound-only channel", () => {
    // ch-id-registry is direction "outbound": the flow talks out to it.
    const node = channelNode("n-registry", "ch-id-registry");
    expect(isEntryChannel(node, registry, [])).toBe(false);
  });

  it("is not a door for non-channel nodes", () => {
    const action: FlowNode = {
      id: "n-act",
      kind: "action",
      label: "do",
      position: { x: 0, y: 0 },
    };
    expect(isEntryChannel(action, registry, [])).toBe(false);
  });

  it("is not a door for a channel node with an unresolved channel id", () => {
    const node = channelNode("n-x", "ch-does-not-exist");
    expect(isEntryChannel(node, registry, [])).toBe(false);
  });
});

describe("FlowEditor.entryNodes (doors a double-click can submit to)", () => {
  it("returns exactly the fixture's single inbound door", () => {
    const editor = new FlowEditor(structuredClone(residenceCertificateRunnable));
    editor.setChannels(registry);

    const ids = editor.entryNodes.map((n) => n.id);
    // n-input is the only door: n-approved/n-rejected reference the same channel
    // but have incoming edges; n-escalate is a mid-flow "both" channel (routed
    // to); n-issue is an outbound notify channel.
    expect(ids).toEqual(["n-input"]);
  });
});
