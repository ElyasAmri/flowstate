// Pure node/edge geometry shared by the edge layer and the live "rubber-band"
// connection preview, so a finished edge and an in-progress drag look identical.
//
// Node cards have a fixed footprint; ports sit at the vertical mid-point on the
// left (input) and right (output) sides. All coordinates are in world space.

import type { FlowNode } from "./types";
import type { BoundingBox, Point } from "./viewport.svelte";

/** Node card footprint in world units. Must match FlowNodeCard's box. */
export const NODE_W = 300;
export const NODE_H = 96;
/** Height of a slot inside a channel group card. */
export const SLOT_H = 36;
/** Height of the header bar inside a channel group card. */
export const HEADER_H = 40;

export type PortSide = "in" | "out";

/**
 * Compute the port Y offset for a node inside a channel group.
 * The group card has a header row plus one slot per member node.
 * Returns the y offset relative to the group's top-left corner.
 */
export function groupSlotY(node: FlowNode, allSlots: FlowNode[]): number {
  const idx = allSlots.findIndex((n) => n.id === node.id);
  return HEADER_H + (idx >= 0 ? idx : 0) * SLOT_H + SLOT_H / 2;
}

/** World position of a node's input (left) or output (right) port. */
export function portPosition(node: FlowNode, side: PortSide): Point {
  return {
    x: node.position.x + (side === "out" ? NODE_W : 0),
    y: node.position.y + NODE_H / 2,
  };
}

/** Port position for a node that is a slot within a channel group. */
export function groupPortPosition(
  node: FlowNode,
  side: PortSide,
  allSlots: FlowNode[],
): Point {
  // Use the group origin (the primary node's position) for x, and slot
  // index for y. Sibling nodes have potentially unrelated x/y from when
  // they were individual cards.
  const origin = allSlots[0].position;
  return {
    x: origin.x + (side === "out" ? NODE_W : 0),
    y: origin.y + groupSlotY(node, allSlots),
  };
}

/**
 * Cubic-bezier path from an output point to an input point with horizontal
 * control handles -- the smooth left-to-right curve n8n draws between nodes.
 * The handle length scales with horizontal distance so short and long edges
 * both look natural.
 */
export function edgePath(from: Point, to: Point): string {
  const dx = Math.abs(to.x - from.x);
  const handle = Math.max(40, dx * 0.5);
  const c1x = from.x + handle;
  const c2x = to.x - handle;
  return `M ${from.x} ${from.y} C ${c1x} ${from.y}, ${c2x} ${to.y}, ${to.x} ${to.y}`;
}

/** Midpoint of an edge, used to place its label. */
export function edgeMidpoint(from: Point, to: Point): Point {
  return { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
}

/**
 * Compute the full height of a channel group card given its member count.
 */
export function groupCardHeight(slotCount: number): number {
  return HEADER_H + Math.max(slotCount, 1) * SLOT_H;
}

/** World-space bounding box enclosing all nodes (each node's full card). */
export function nodesBounds(
  nodes: FlowNode[],
  groups?: Map<string, FlowNode[]>,
): BoundingBox | null {
  if (nodes.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    const group = groups?.get(n.channelId ?? "");
    const h = group && group.length > 1 ? groupCardHeight(group.length) : NODE_H;
    minX = Math.min(minX, n.position.x);
    minY = Math.min(minY, n.position.y);
    maxX = Math.max(maxX, n.position.x + NODE_W);
    maxY = Math.max(maxY, n.position.y + h);
  }
  return { minX, minY, maxX, maxY };
}
