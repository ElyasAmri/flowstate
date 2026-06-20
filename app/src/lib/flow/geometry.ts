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

export type PortSide = "in" | "out";

/** World position of a node's input (left) or output (right) port. */
export function portPosition(node: FlowNode, side: PortSide): Point {
  return {
    x: node.position.x + (side === "out" ? NODE_W : 0),
    y: node.position.y + NODE_H / 2,
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

/** World-space bounding box enclosing all nodes (each node's full card). */
export function nodesBounds(nodes: FlowNode[]): BoundingBox | null {
  if (nodes.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.position.x);
    minY = Math.min(minY, n.position.y);
    maxX = Math.max(maxX, n.position.x + NODE_W);
    maxY = Math.max(maxY, n.position.y + NODE_H);
  }
  return { minX, minY, maxX, maxY };
}
