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
export const SLOT_H = 48;
/** Height of the header bar inside a channel group card. */
export const HEADER_H = 40;

/** `group` container layout: inner padding, gap between stacked member cards,
 *  and the height reserved for an empty group's drop hint. */
export const GROUP_PAD = 12;
export const GROUP_GAP = 10;
export const GROUP_EMPTY_H = 30;

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

/** Corner radius for the rounded bends of a smoothstep edge. */
const EDGE_RADIUS = 16;

/** SVG path through a polyline with each interior corner rounded by `r`
 *  (clamped to half the shorter adjacent segment so short edges stay clean). */
function roundedPolyline(pts: Point[], r: number): string {
  if (pts.length < 3) {
    return pts.map((p, i) => `${i ? "L" : "M"} ${p.x} ${p.y}`).join(" ");
  }
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const p0 = pts[i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const d1 = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1;
    const d2 = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
    const rr = Math.min(r, d1 / 2, d2 / 2);
    const a = { x: p1.x + ((p0.x - p1.x) / d1) * rr, y: p1.y + ((p0.y - p1.y) / d1) * rr };
    const b = { x: p1.x + ((p2.x - p1.x) / d2) * rr, y: p1.y + ((p2.y - p1.y) / d2) * rr };
    d += ` L ${a.x} ${a.y} Q ${p1.x} ${p1.y} ${b.x} ${b.y}`;
  }
  const last = pts[pts.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
}

/**
 * Smoothstep path from an output point to an input point: horizontal out of the
 * source (right port), vertical, then horizontal into the target (left port),
 * with rounded corners. The segments adjacent to each port always run away from
 * / into the card horizontally, so an arrowhead never hides behind a node, even
 * for backward edges (target left of source).
 */
const EDGE_STUB = 24;

export function edgePath(from: Point, to: Point): string {
  const { x: sx, y: sy } = from;
  const { x: tx, y: ty } = to;
  // Same height and going forward: a clean straight line.
  if (Math.abs(ty - sy) < 1 && tx > sx) {
    return `M ${sx} ${sy} L ${tx} ${ty}`;
  }
  let pts: Point[];
  if (tx - sx >= 2 * EDGE_STUB) {
    // Enough room ahead: one vertical at the midpoint.
    const cx = (sx + tx) / 2;
    pts = [from, { x: cx, y: sy }, { x: cx, y: ty }, to];
  } else {
    // Tight or backward: stub out to the right of the source, cross at mid
    // height, then stub into the target from the left.
    const ax = sx + EDGE_STUB;
    const bx = tx - EDGE_STUB;
    const my = (sy + ty) / 2;
    pts = [from, { x: ax, y: sy }, { x: ax, y: my }, { x: bx, y: my }, { x: bx, y: ty }, to];
  }
  return roundedPolyline(pts, EDGE_RADIUS);
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

/** World-space bounding box enclosing all nodes (each node's full card).
 *  `groups` maps channelId -> channel-group members; `nodeGroups` maps a `group`
 *  node id -> its stacked members, so the group card is sized by its row count
 *  and the stacked members (placeholder positions) are skipped. */
export function nodesBounds(
  nodes: FlowNode[],
  groups?: Map<string, FlowNode[]>,
  nodeGroups?: Map<string, FlowNode[]>,
): BoundingBox | null {
  if (nodes.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    const group = groups?.get(n.channelId ?? "");
    // Skip nodes that are just slots inside a channel group (their position is
    // placeholder and may be way off-screen).
    if (group && group.length > 1 && n.id !== group[0].id) continue;
    const h = n.kind === "group" ? groupCardHeight(nodeGroups?.get(n.id)?.length ?? 0)
      : group && group.length > 1 ? groupCardHeight(group.length)
      : n.kind === "channel" ? groupCardHeight(1)
      : NODE_H;
    minX = Math.min(minX, n.position.x);
    minY = Math.min(minY, n.position.y);
    maxX = Math.max(maxX, n.position.x + NODE_W);
    maxY = Math.max(maxY, n.position.y + h);
  }
  return { minX, minY, maxX, maxY };
}
