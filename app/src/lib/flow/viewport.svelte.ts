// Canvas viewport: pan + zoom state and screen<->world coordinate transforms.
//
// The canvas applies a single CSS transform `translate(pan) scale(zoom)` to a
// "world" layer. All node positions are stored in world coordinates; this class
// converts between the pointer's screen position (relative to the canvas
// element) and world space so dragging and connecting stay accurate at any
// zoom. Pure math, no DOM access -- callers pass in already-relative points.

export interface Point {
  x: number;
  y: number;
}

/** A viewport's pixel size. */
export interface Size {
  width: number;
  height: number;
}

/** A world-space axis-aligned bounding box. */
export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2;

export class Viewport {
  pan = $state<Point>({ x: 0, y: 0 });
  zoom = $state(1);

  /** Screen point (relative to canvas top-left) -> world coordinates. */
  screenToWorld(screen: Point): Point {
    return {
      x: (screen.x - this.pan.x) / this.zoom,
      y: (screen.y - this.pan.y) / this.zoom,
    };
  }

  /** World coordinates -> screen point (relative to canvas top-left). */
  worldToScreen(world: Point): Point {
    return {
      x: world.x * this.zoom + this.pan.x,
      y: world.y * this.zoom + this.pan.y,
    };
  }

  /** Pan by a screen-space delta (e.g. while dragging the empty canvas). */
  panBy(dx: number, dy: number): void {
    this.pan = { x: this.pan.x + dx, y: this.pan.y + dy };
  }

  /**
   * Zoom toward a focal screen point (the cursor) by a multiplicative factor,
   * keeping the world point under the cursor fixed -- the n8n "zoom where you
   * point" behaviour.
   */
  zoomAt(focusScreen: Point, factor: number): void {
    const next = clamp(this.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    if (next === this.zoom) return;
    // World point under the cursor must map back to the same screen point.
    const worldFocus = this.screenToWorld(focusScreen);
    this.zoom = next;
    this.pan = {
      x: focusScreen.x - worldFocus.x * next,
      y: focusScreen.y - worldFocus.y * next,
    };
  }

  /** Discrete zoom step toward the centre of the given viewport size. */
  zoomStep(factor: number, viewSize: Size): void {
    this.zoomAt({ x: viewSize.width / 2, y: viewSize.height / 2 }, factor);
  }

  /** Reset to 1:1 with no pan. */
  reset(): void {
    this.zoom = 1;
    this.pan = { x: 0, y: 0 };
  }

  /**
   * Frame a world-space bounding box within a viewport of `viewSize`, leaving
   * `padding` screen pixels around it and centring the content -- the n8n
   * "fit view" behaviour. No-op for an empty/degenerate box.
   */
  fitTo(box: BoundingBox, viewSize: Size, padding = 80): void {
    const w = box.maxX - box.minX;
    const h = box.maxY - box.minY;
    if (w <= 0 || h <= 0 || viewSize.width <= 0 || viewSize.height <= 0) return;
    const scale = clamp(
      Math.min(
        (viewSize.width - padding * 2) / w,
        (viewSize.height - padding * 2) / h,
      ),
      MIN_ZOOM,
      MAX_ZOOM,
    );
    this.zoom = scale;
    // Centre the box in the viewport.
    const cx = (box.minX + box.maxX) / 2;
    const cy = (box.minY + box.maxY) / 2;
    this.pan = {
      x: viewSize.width / 2 - cx * scale,
      y: viewSize.height / 2 - cy * scale,
    };
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
