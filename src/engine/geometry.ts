import { MAX_ZOOM, MIN_ZOOM, type Point, type Stroke, type View } from '../model';

export type Box = { minX: number; minY: number; maxX: number; maxY: number };

export const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

export const toWorld = (v: View, sx: number, sy: number): [number, number] => [
  (sx - v.x) / v.zoom,
  (sy - v.y) / v.zoom,
];

/** Zoom to `zoom` while keeping the world point under screen (sx, sy) fixed. */
export function zoomAt(v: View, zoom: number, sx: number, sy: number): View {
  const z = clampZoom(zoom);
  const [wx, wy] = toWorld(v, sx, sy);
  return { x: sx - wx * z, y: sy - wy * z, zoom: z };
}

/**
 * Two-finger gesture: the world point that was under the starting midpoint
 * follows the current midpoint, and zoom scales with finger spread.
 */
export function pinchView(
  start: View,
  startMid: [number, number],
  startDist: number,
  mid: [number, number],
  dist: number,
): View {
  const z = clampZoom(start.zoom * (startDist > 0 ? dist / startDist : 1));
  const [wx, wy] = toWorld(start, startMid[0], startMid[1]);
  return { x: mid[0] - wx * z, y: mid[1] - wy * z, zoom: z };
}

const boxCache = new WeakMap<Stroke, Box>();

/** Bounding box including half the stroke width. Strokes are immutable once committed. */
export function strokeBox(s: Stroke): Box {
  let b = boxCache.get(s);
  if (b) return b;
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const [x, y] of s.points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  const pad = s.size / 2 + 1;
  b = { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
  boxCache.set(s, b);
  return b;
}

export const boxesOverlap = (a: Box, b: Box) =>
  a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;

function distToSegmentSq(px: number, py: number, a: Point, b: Point): number {
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const len = dx * dx + dy * dy;
  let t = len ? ((px - a[0]) * dx + (py - a[1]) * dy) / len : 0;
  t = Math.max(0, Math.min(1, t));
  const ex = a[0] + t * dx - px,
    ey = a[1] + t * dy - py;
  return ex * ex + ey * ey;
}

/** True if a circle of radius r at (x, y) touches the stroke. */
export function strokeHit(s: Stroke, x: number, y: number, r: number): boolean {
  const b = strokeBox(s);
  if (x < b.minX - r || x > b.maxX + r || y < b.minY - r || y > b.maxY + r) return false;
  const reach = r + s.size / 2;
  const reachSq = reach * reach;
  const pts = s.points;
  if (pts.length === 1) {
    const dx = pts[0][0] - x,
      dy = pts[0][1] - y;
    return dx * dx + dy * dy <= reachSq;
  }
  for (let i = 1; i < pts.length; i++) {
    if (distToSegmentSq(x, y, pts[i - 1], pts[i]) <= reachSq) return true;
  }
  return false;
}

/**
 * Points along the segment from a to b, spaced at most `step` apart, so a
 * fast eraser swipe cannot skip over a thin stroke.
 */
export function sampleSegment(
  a: [number, number],
  b: [number, number],
  step: number,
): [number, number][] {
  const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.max(1, Math.ceil(d / step));
  const out: [number, number][] = [];
  for (let i = 1; i <= n; i++) out.push([a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n]);
  return out;
}

export const round = (v: number, places: number) => {
  const f = 10 ** places;
  return Math.round(v * f) / f;
};
