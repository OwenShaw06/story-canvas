import { getStroke, type StrokeOptions } from 'perfect-freehand';
import { INK_AUTO, type Point, type Stroke } from '../model';

// Turns vector strokes (points with pressure) into filled outlines.
// Outlines are cached per stroke as Path2D in world space, so panning and
// zooming only re-fill paths and never recompute them.

export const HIGHLIGHTER_ALPHA = 0.35;

export function strokeOptions(tool: Stroke['tool'], size: number, complete: boolean): StrokeOptions {
  if (tool === 'highlighter') {
    return { size, thinning: 0, smoothing: 0.6, streamline: 0.5, simulatePressure: false, last: complete };
  }
  return {
    size,
    thinning: 0.6,
    smoothing: 0.5,
    streamline: 0.35,
    simulatePressure: false,
    easing: (t) => t,
    start: { taper: 0, cap: true },
    end: { taper: 0, cap: true },
    last: complete,
  };
}

/** Builds a smooth closed path through the outline points (midpoint quadratic curves). */
export function outlineToPath(outline: number[][]): Path2D {
  const path = new Path2D();
  const n = outline.length;
  if (n < 3) {
    if (n) {
      const [x, y] = outline[0];
      path.arc(x, y, 1, 0, Math.PI * 2);
    }
    return path;
  }
  const mid = (a: number[], b: number[]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const start = mid(outline[n - 1], outline[0]);
  path.moveTo(start[0], start[1]);
  for (let i = 0; i < n; i++) {
    const p = outline[i];
    const m = mid(p, outline[(i + 1) % n]);
    path.quadraticCurveTo(p[0], p[1], m[0], m[1]);
  }
  path.closePath();
  return path;
}

export function buildPath(tool: Stroke['tool'], size: number, points: Point[], complete: boolean): Path2D {
  return outlineToPath(getStroke(points, strokeOptions(tool, size, complete)));
}

const pathCache = new WeakMap<Stroke, Path2D>();

export function strokePath(s: Stroke): Path2D {
  let p = pathCache.get(s);
  if (!p) {
    p = buildPath(s.tool, s.size, s.points, true);
    pathCache.set(s, p);
  }
  return p;
}

export function resolveColor(color: string, autoInk: string): string {
  return color === INK_AUTO ? autoInk : color;
}

export function fillStroke(ctx: CanvasRenderingContext2D, s: Stroke, autoInk: string, path = strokePath(s)) {
  ctx.fillStyle = resolveColor(s.color, autoInk);
  ctx.globalAlpha = s.tool === 'highlighter' ? HIGHLIGHTER_ALPHA : 1;
  ctx.fill(path);
  ctx.globalAlpha = 1;
}

const svgCache = new WeakMap<Stroke, string>();

/** SVG path data for a stroke's outline (used for ink on cards and stickies). */
export function strokeSvgPath(s: Stroke): string {
  let d = svgCache.get(s);
  if (d !== undefined) return d;
  const pts = getStroke(s.points, strokeOptions(s.tool, s.size, true));
  const n = pts.length;
  if (n < 3) {
    d = n ? `M${pts[0][0]},${pts[0][1]}m-1,0a1,1 0 1,0 2,0a1,1 0 1,0 -2,0` : '';
  } else {
    const f = (v: number) => v.toFixed(2);
    const mid = (a: number[], b: number[]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const start = mid(pts[n - 1], pts[0]);
    const parts = [`M${f(start[0])},${f(start[1])}`];
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const m = mid(p, pts[(i + 1) % n]);
      parts.push(`Q${f(p[0])},${f(p[1])} ${f(m[0])},${f(m[1])}`);
    }
    d = parts.join('') + 'Z';
  }
  svgCache.set(s, d);
  return d;
}
