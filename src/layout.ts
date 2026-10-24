import type { BoardNode } from './model';
import { store } from './store';
import type { Box } from './engine/geometry';

// Rendered sizes of nodes. Cards and text grow with their content, so their
// on-screen height can exceed the stored h. Links, hit-testing, selection and
// export use these measured sizes. Values are in world units.

const sizes = new Map<string, { w: number; h: number }>();
export const layoutVersion = store(0);
let bumpQueued = false;

export function reportSize(id: string, w: number, h: number) {
  const old = sizes.get(id);
  if (old && Math.abs(old.w - w) < 0.5 && Math.abs(old.h - h) < 0.5) return;
  sizes.set(id, { w, h });
  if (!bumpQueued) {
    bumpQueued = true;
    queueMicrotask(() => {
      bumpQueued = false;
      layoutVersion.set((v) => v + 1);
    });
  }
}

export function forgetSize(id: string) {
  sizes.delete(id);
}

export function nodeRect(n: BoardNode): Box {
  const s = sizes.get(n.id);
  const w = s?.w ?? n.w;
  const h = s?.h ?? n.h;
  return { minX: n.x, minY: n.y, maxX: n.x + w, maxY: n.y + h };
}

export function rectOfNodes(nodes: BoardNode[]): Box | null {
  if (!nodes.length) return null;
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const n of nodes) {
    const r = nodeRect(n);
    b.minX = Math.min(b.minX, r.minX);
    b.minY = Math.min(b.minY, r.minY);
    b.maxX = Math.max(b.maxX, r.maxX);
    b.maxY = Math.max(b.maxY, r.maxY);
  }
  return b;
}

/** Largest comfortable font that fits a sticky note's text in its box. */
export function stickyFontSize(w: number, h: number, len: number): number {
  const area = Math.max(1, (w - 36) * (h - 36));
  return Math.round(Math.max(12, Math.min(30, Math.sqrt(area / (1.7 * Math.max(len, 8))))));
}
