// Editor state for the flow authoring tool.
//
// Holds the flow being edited and the current selection as Svelte 5 runes
// ($state), and exposes pure mutation helpers. Persistence is intentionally a
// seam: `serialize()` returns the plain `FlowDefinition` so a later Tauri save
// command can write it to the Flow Configuration without touching the views.

import type { FlowDefinition, FlowEdge, FlowNode, NodeKind, Position } from "./types";

/** Monotonic id helper so added nodes/edges get unique, readable ids. */
function makeId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Default label for a freshly-added node of a given kind. */
function defaultLabel(kind: NodeKind): string {
  return `New ${kind}`;
}

export class FlowEditor {
  flow = $state<FlowDefinition>(undefined as unknown as FlowDefinition);
  selectedNodeId = $state<string | null>(null);

  constructor(initial: FlowDefinition) {
    this.flow = initial;
  }

  /** The currently selected node, or null. */
  get selectedNode(): FlowNode | null {
    if (this.selectedNodeId === null) return null;
    return this.flow.nodes.find((n) => n.id === this.selectedNodeId) ?? null;
  }

  /** Edges leaving the given node. */
  outgoingEdges(nodeId: string): FlowEdge[] {
    return this.flow.edges.filter((e) => e.from === nodeId);
  }

  select(nodeId: string | null): void {
    this.selectedNodeId = nodeId;
  }

  /** Add a node at a position; returns its new id and selects it. */
  addNode(kind: NodeKind, position: Position): string {
    const id = makeId("n");
    const node: FlowNode = { id, kind, label: defaultLabel(kind), position };
    this.flow.nodes.push(node);
    this.selectedNodeId = id;
    return id;
  }

  /** Patch fields on a node by id. */
  updateNode(id: string, patch: Partial<Omit<FlowNode, "id">>): void {
    const node = this.flow.nodes.find((n) => n.id === id);
    if (!node) return;
    Object.assign(node, patch);
  }

  moveNode(id: string, position: Position): void {
    this.updateNode(id, { position });
  }

  /** Delete a node and any edges touching it. */
  deleteNode(id: string): void {
    this.flow.nodes = this.flow.nodes.filter((n) => n.id !== id);
    this.flow.edges = this.flow.edges.filter((e) => e.from !== id && e.to !== id);
    if (this.selectedNodeId === id) this.selectedNodeId = null;
    // Keep startNodeId valid if the start node was removed.
    if (this.flow.startNodeId === id) {
      this.flow.startNodeId = this.flow.nodes[0]?.id ?? "";
    }
  }

  /** Connect two nodes; ignores self-loops and exact duplicates. */
  addEdge(from: string, to: string): string | null {
    if (from === to) return null;
    const exists = this.flow.edges.some((e) => e.from === from && e.to === to);
    if (exists) return null;
    const id = makeId("e");
    this.flow.edges.push({ id, from, to });
    return id;
  }

  updateEdge(id: string, patch: Partial<Omit<FlowEdge, "id" | "from" | "to">>): void {
    const edge = this.flow.edges.find((e) => e.id === id);
    if (!edge) return;
    Object.assign(edge, patch);
  }

  deleteEdge(id: string): void {
    this.flow.edges = this.flow.edges.filter((e) => e.id !== id);
  }

  /** Plain, serializable snapshot for persistence. */
  serialize(): FlowDefinition {
    return $state.snapshot(this.flow);
  }
}
