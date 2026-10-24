// Layout maths for the arrange tools. Pure functions: given the selected
// objects' rectangles, return their new top-left positions.

export type Rect = { id: string; x: number; y: number; w: number; h: number };
export type Pos = { id: string; x: number; y: number };

export type Alignment = 'left' | 'hcenter' | 'right' | 'top' | 'vmiddle' | 'bottom';

function bounds(rs: Rect[]) {
  const minX = Math.min(...rs.map((r) => r.x));
  const minY = Math.min(...rs.map((r) => r.y));
  const maxX = Math.max(...rs.map((r) => r.x + r.w));
  const maxY = Math.max(...rs.map((r) => r.y + r.h));
  return { minX, minY, maxX, maxY };
}

/** Lines everything up against one edge or centre line of the group. */
export function align(rs: Rect[], how: Alignment): Pos[] {
  const b = bounds(rs);
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  return rs.map((r) => {
    switch (how) {
      case 'left':
        return { id: r.id, x: b.minX, y: r.y };
      case 'hcenter':
        return { id: r.id, x: Math.round(cx - r.w / 2), y: r.y };
      case 'right':
        return { id: r.id, x: b.maxX - r.w, y: r.y };
      case 'top':
        return { id: r.id, x: r.x, y: b.minY };
      case 'vmiddle':
        return { id: r.id, x: r.x, y: Math.round(cy - r.h / 2) };
      case 'bottom':
        return { id: r.id, x: r.x, y: b.maxY - r.h };
    }
  });
}

/** Equal gaps between objects, keeping the first and last where they are. */
export function distribute(rs: Rect[], axis: 'x' | 'y'): Pos[] {
  if (rs.length < 3) return rs.map(({ id, x, y }) => ({ id, x, y }));
  const size = axis === 'x' ? 'w' : 'h';
  const sorted = [...rs].sort((a, b) => a[axis] - b[axis]);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const span = last[axis] + last[size] - first[axis];
  const total = sorted.reduce((s, r) => s + r[size], 0);
  const gap = (span - total) / (sorted.length - 1);
  let at = first[axis];
  return sorted.map((r) => {
    const p = { id: r.id, x: r.x, y: r.y };
    p[axis] = Math.round(at);
    at += r[size] + gap;
    return p;
  });
}

/**
 * Tidies a pile into a neat grid, keeping roughly the reading order it
 * already had (top to bottom, left to right). Columns are as wide as their
 * widest item; rows as tall as their tallest.
 */
export function tidy(rs: Rect[], gap = 32, snap?: (v: number) => number): Pos[] {
  const n = rs.length;
  if (n < 2) return rs.map(({ id, x, y }) => ({ id, x, y }));
  const b = bounds(rs);
  // Prefer wider-than-tall layouts, like a desk.
  const cols = Math.max(1, Math.round(Math.sqrt(n * 1.4)));
  const rowBand = Math.max(40, Math.min(...rs.map((r) => r.h)) / 2);
  const ordered = [...rs].sort((a, c) => (Math.abs(a.y - c.y) < rowBand ? a.x - c.x : a.y - c.y));
  const rows = Math.ceil(n / cols);
  const colW = Array<number>(cols).fill(0);
  const rowH = Array<number>(rows).fill(0);
  ordered.forEach((r, i) => {
    colW[i % cols] = Math.max(colW[i % cols], r.w);
    rowH[Math.floor(i / cols)] = Math.max(rowH[Math.floor(i / cols)], r.h);
  });
  const s = snap ?? ((v: number) => Math.round(v));
  const x0 = s(b.minX);
  const y0 = s(b.minY);
  const colX = colW.map((_, c) => x0 + colW.slice(0, c).reduce((a, w) => a + w + gap, 0));
  const rowY = rowH.map((_, r) => y0 + rowH.slice(0, r).reduce((a, h) => a + h + gap, 0));
  return ordered.map((r, i) => ({ id: r.id, x: s(colX[i % cols]), y: s(rowY[Math.floor(i / cols)]) }));
}
