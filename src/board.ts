import { Doc } from './doc';
import type { CanvasEngine } from './engine/engine';
import { boxContains, boxesOverlap, strokeBox, translateStroke, unionBoxes, type Box } from './engine/geometry';
import { nodeRect, rectOfNodes } from './layout';
import {
  uid,
  type BoardNode,
  type CardNode,
  type Link,
  type NodeKind,
  type ShapeKind,
  type Stroke,
  type Template,
} from './model';
import { store, type Store } from './store';
import { storeImageFile } from './db';

export type ToolName = 'select' | 'pen' | 'highlighter' | 'eraser' | 'lasso';

export type Selection = { nodes: string[]; links: string[]; strokes: string[] };
export const EMPTY_SEL: Selection = { nodes: [], links: [], strokes: [] };

export type LinkDraft = { fromId: string; x: number; y: number; targetId: string | null } | null;

type Clip = { nodes: BoardNode[]; strokes: Stroke[]; links: Link[] };
let clipboard: Clip | null = null;

/** Default sizes for new nodes, in world units. */
const SIZES: Record<Exclude<NodeKind, 'image'>, [number, number]> = {
  card: [300, 72],
  sticky: [200, 200],
  text: [280, 48],
  shape: [180, 140],
  frame: [640, 440],
};

/**
 * Everything one open board needs: the document, view engine, selection
 * and tool state, and the editing actions shared by toolbar, context bar,
 * keyboard and gestures.
 */
export class Board {
  doc: Doc;
  engine!: CanvasEngine;
  selection: Store<Selection> = store(EMPTY_SEL);
  tool: Store<ToolName> = store<ToolName>('pen');
  linkDraft: Store<LinkDraft> = store<LinkDraft>(null);
  /** Node briefly highlighted (e.g. a search result). */
  flash: Store<string | null> = store<string | null>(null);
  /** Tag filter: cards without one of these tags are dimmed. */
  tagFilter: Store<string[]> = store<string[]>([]);
  toast: Store<string | null> = store<string | null>(null);
  /** Last insertion point, so repeated inserts cascade instead of stacking. */
  private lastInsert: { x: number; y: number; n: number } | null = null;

  constructor(doc: Doc) {
    this.doc = doc;
    // Drop selected ids that no longer exist (after undo, delete, etc).
    doc.subscribe((changed) => {
      if (changed.size === 1 && changed.has('view')) return;
      const s = this.selection.get();
      if (!s.nodes.length && !s.links.length && !s.strokes.length) return;
      const has = (c: 'nodes' | 'links' | 'strokes', id: string) => !!doc.get(c, id);
      const next = {
        nodes: s.nodes.filter((id) => has('nodes', id)),
        links: s.links.filter((id) => has('links', id)),
        strokes: s.strokes.filter((id) => has('strokes', id)),
      };
      if (next.nodes.length !== s.nodes.length || next.links.length !== s.links.length || next.strokes.length !== s.strokes.length)
        this.setSelection(next);
    });
  }

  notify(msg: string) {
    this.toast.set(msg);
    setTimeout(() => this.toast.set((t) => (t === msg ? null : t)), 2600);
  }

  // ---------- selection ----------

  setSelection(s: Selection) {
    // Like Freeform: a text box left empty disappears when it's deselected.
    const prev = this.selection.get();
    const keep = new Set(s.nodes);
    const emptyText = prev.nodes.filter((id) => {
      const n = this.doc.node(id);
      return !keep.has(id) && n?.kind === 'text' && !n.text.trim();
    });
    if (emptyText.length) setTimeout(() => this.doc.remove('nodes', emptyText));
    this.selection.set(s);
    if (this.engine) {
      this.engine.selectedStrokes = new Set(s.strokes);
      this.engine.requestLive();
    }
  }

  clearSelection() {
    const s = this.selection.get();
    if (s.nodes.length || s.links.length || s.strokes.length) this.setSelection(EMPTY_SEL);
  }

  selectNodes(ids: string[], additive = false) {
    const cur = this.selection.get();
    this.setSelection(
      additive ? { ...cur, nodes: [...new Set([...cur.nodes, ...ids])] } : { nodes: ids, links: [], strokes: [] },
    );
  }

  toggleNode(id: string) {
    const cur = this.selection.get();
    const nodes = cur.nodes.includes(id) ? cur.nodes.filter((n) => n !== id) : [...cur.nodes, id];
    this.setSelection({ ...cur, nodes });
  }

  selectAll() {
    const p = this.doc.p;
    this.setSelection({ nodes: p.nodes.map((n) => n.id), links: [], strokes: p.strokes.map((s) => s.id) });
  }

  selectedNodes(): BoardNode[] {
    const ids = new Set(this.selection.get().nodes);
    return this.doc.p.nodes.filter((n) => ids.has(n.id));
  }

  /** Bounds of everything selected (nodes and ink), in world units. */
  selectionBox(): Box | null {
    const s = this.selection.get();
    const boxes: Box[] = [];
    const nb = rectOfNodes(this.selectedNodes());
    if (nb) boxes.push(nb);
    const ids = new Set(s.strokes);
    for (const st of this.doc.p.strokes) if (ids.has(st.id)) boxes.push(strokeBox(st));
    return unionBoxes(boxes);
  }

  // ---------- creating ----------

  /** A free spot near the centre of the screen for a new node of size w×h. */
  insertPoint(w: number, h: number): { x: number; y: number } {
    const vp = this.engine.worldViewport();
    let x = (vp.minX + vp.maxX) / 2 - w / 2;
    let y = (vp.minY + vp.maxY) / 2 - h / 2;
    const li = this.lastInsert;
    if (li && Math.abs(li.x - x) < 4 && Math.abs(li.y - y) < 4) {
      li.n++;
      return { x: Math.round(x + li.n * 28), y: Math.round(y + li.n * 28) };
    }
    this.lastInsert = { x, y, n: 0 };
    return { x: Math.round(x), y: Math.round(y) };
  }

  private addNode(n: BoardNode, select = true): BoardNode {
    this.doc.transact(() => {
      if (n.kind === 'frame') {
        // Frames sit beneath everything else.
        this.doc.put('nodes', n, 0);
      } else this.doc.put('nodes', n);
    }, 'Add');
    if (select) this.selectNodes([n.id]);
    return n;
  }

  addCard(t: Template, at?: { x: number; y: number }): CardNode {
    const [w, h] = SIZES.card;
    const pos = at ?? this.insertPoint(w, 260);
    return this.addNode({
      id: uid(),
      kind: 'card',
      templateId: t.id,
      ...pos,
      w: t.fields.length ? w : 280,
      h: t.fields.length ? h : 220,
      collapsed: false,
      color: t.color,
      tags: [],
      fields: {},
      ink: [],
    }) as CardNode;
  }

  addSticky(color = 'yellow', at?: { x: number; y: number }) {
    const [w, h] = SIZES.sticky;
    return this.addNode({ id: uid(), kind: 'sticky', ...(at ?? this.insertPoint(w, h)), w, h, color, text: '', ink: [] });
  }

  addText(at?: { x: number; y: number }) {
    const [w, h] = SIZES.text;
    return this.addNode({ id: uid(), kind: 'text', ...(at ?? this.insertPoint(w, h)), w, h, text: '', size: 'm', color: 'white' });
  }

  addShape(shape: ShapeKind, at?: { x: number; y: number }) {
    let [w, h] = SIZES.shape;
    if (shape === 'ellipse' || shape === 'star' || shape === 'diamond') w = h = 160;
    return this.addNode({ id: uid(), kind: 'shape', ...(at ?? this.insertPoint(w, h)), w, h, shape, color: 'blue', text: '' });
  }

  addFrame() {
    const [w, h] = SIZES.frame;
    return this.addNode({ id: uid(), kind: 'frame', ...this.insertPoint(w, h), w, h, label: 'Frame', color: 'gray' });
  }

  async addImageFiles(files: Iterable<File>, at?: { x: number; y: number }) {
    const ids: string[] = [];
    let i = 0;
    for (const f of files) {
      if (!f.type.startsWith('image/')) continue;
      try {
        const img = await storeImageFile(f);
        const scale = Math.min(1, 420 / Math.max(img.w, img.h));
        const w = Math.round(img.w * scale);
        const h = Math.round(img.h * scale);
        const pos = at ? { x: at.x - w / 2 + i * 24, y: at.y - h / 2 + i * 24 } : this.insertPoint(w, h);
        const n = this.addNode({ id: uid(), kind: 'image', ...pos, w, h, imageId: img.id }, false);
        ids.push(n.id);
        i++;
      } catch (e) {
        console.error(e);
        this.notify('That image could not be added.');
      }
    }
    if (ids.length) this.selectNodes(ids);
  }

  addLink(fromId: string, toId: string): Link | null {
    if (fromId === toId) return null;
    const exists = this.doc.p.links.find(
      (l) => (l.fromId === fromId && l.toId === toId) || (l.fromId === toId && l.toId === fromId),
    );
    if (exists) return exists;
    const link: Link = { id: uid(), fromId, toId, style: 'solid' };
    this.doc.put('links', link);
    return link;
  }

  /** Dropping a connector on empty canvas creates a matching node there and links to it. */
  addLinkedNode(fromId: string, x: number, y: number) {
    const from = this.doc.node(fromId);
    if (!from) return;
    this.doc.transact(() => {
      let n: BoardNode;
      if (from.kind === 'card') {
        const t = this.doc.template(from.templateId);
        n = t ? this.addCard(t, { x: x - 150, y: y - 40 }) : this.addSticky('yellow', { x: x - 100, y: y - 100 });
      } else if (from.kind === 'shape') {
        n = this.addShape(from.shape, { x: x - from.w / 2, y: y - from.h / 2 });
        this.doc.patch('nodes', n.id, { color: from.color, w: from.w, h: from.h });
      } else {
        n = this.addSticky(from.kind === 'sticky' ? from.color : 'yellow', { x: x - 100, y: y - 100 });
      }
      this.addLink(fromId, n.id);
    }, 'Connect');
  }

  // ---------- editing ----------

  deleteSelection() {
    const s = this.selection.get();
    if (!s.nodes.length && !s.links.length && !s.strokes.length) return;
    const nodeIds = new Set(s.nodes);
    this.doc.transact(() => {
      this.doc.remove('nodes', nodeIds);
      // Links attached to deleted nodes go too.
      const linkIds = new Set(s.links);
      for (const l of this.doc.p.links) if (nodeIds.has(l.fromId) || nodeIds.has(l.toId)) linkIds.add(l.id);
      this.doc.remove('links', linkIds);
      this.doc.remove('strokes', s.strokes);
    }, 'Delete');
    this.clearSelection();
  }

  private collectSelection(): Clip {
    const s = this.selection.get();
    const nodeIds = new Set(s.nodes);
    const strokeIds = new Set(s.strokes);
    return {
      nodes: this.doc.p.nodes.filter((n) => nodeIds.has(n.id)),
      strokes: this.doc.p.strokes.filter((st) => strokeIds.has(st.id)),
      links: this.doc.p.links.filter((l) => nodeIds.has(l.fromId) && nodeIds.has(l.toId)),
    };
  }

  private pasteClip(clip: Clip, dx: number, dy: number) {
    const remap = new Map<string, string>();
    const newNodes: string[] = [];
    const newStrokes: string[] = [];
    this.doc.transact(() => {
      for (const n of clip.nodes) {
        const id = uid();
        remap.set(n.id, id);
        const copy = { ...structuredClone(n), id, x: n.x + dx, y: n.y + dy } as BoardNode;
        if (copy.kind === 'frame') this.doc.put('nodes', copy, 0);
        else this.doc.put('nodes', copy);
        newNodes.push(id);
      }
      for (const st of clip.strokes) {
        const copy = { ...translateStroke(st, dx, dy), id: uid() };
        this.doc.put('strokes', copy);
        newStrokes.push(copy.id);
      }
      for (const l of clip.links) {
        const from = remap.get(l.fromId);
        const to = remap.get(l.toId);
        if (from && to) this.doc.put('links', { ...l, id: uid(), fromId: from, toId: to });
      }
    }, 'Paste');
    this.setSelection({ nodes: newNodes, links: [], strokes: newStrokes });
  }

  duplicateSelection() {
    const clip = this.collectSelection();
    if (!clip.nodes.length && !clip.strokes.length) return;
    this.pasteClip(clip, 32, 32);
  }

  copySelection(cut = false): boolean {
    const clip = this.collectSelection();
    if (!clip.nodes.length && !clip.strokes.length) return false;
    clipboard = structuredClone(clip);
    if (cut) this.deleteSelection();
    return true;
  }

  paste(): boolean {
    if (!clipboard) return false;
    // Paste centred in the current view.
    const boxes: Box[] = [];
    const nb = rectOfNodes(clipboard.nodes);
    if (nb) boxes.push(nb);
    for (const s of clipboard.strokes) boxes.push(strokeBox(s));
    const b = unionBoxes(boxes);
    if (!b) return false;
    const vp = this.engine.worldViewport();
    const dx = (vp.minX + vp.maxX) / 2 - (b.minX + b.maxX) / 2;
    const dy = (vp.minY + vp.maxY) / 2 - (b.minY + b.maxY) / 2;
    this.pasteClip(clipboard, Math.round(dx), Math.round(dy));
    return true;
  }

  /** Bring to front / send to back. Frames always stay beneath other nodes. */
  arrange(where: 'front' | 'back') {
    const s = this.selection.get();
    const sel = this.selectedNodes();
    const selFrames = sel.filter((n) => n.kind === 'frame').map((n) => n.id);
    const selOthers = sel.filter((n) => n.kind !== 'frame').map((n) => n.id);
    this.doc.transact(() => {
      if (selOthers.length) this.doc.reorder('nodes', selOthers, where);
      // Sink all frames back to the bottom, with selected frames on top of (front)
      // or beneath (back) the other frames.
      const otherFrames = this.doc.p.nodes.filter((n) => n.kind === 'frame' && !selFrames.includes(n.id)).map((n) => n.id);
      const [first, second] = where === 'front' ? [selFrames, otherFrames] : [otherFrames, selFrames];
      this.doc.reorder('nodes', first, 'back');
      this.doc.reorder('nodes', second, 'back');
      if (s.strokes.length) this.doc.reorder('strokes', s.strokes, where);
    }, 'Arrange');
  }

  /** Applies a color to the selection, whatever kinds it contains. */
  setColor(color: string) {
    this.doc.transact(() => {
      for (const n of this.selectedNodes()) {
        if (n.kind === 'image') continue;
        this.doc.patch('nodes', n.id, { color } as Partial<BoardNode>);
      }
    }, 'Color');
  }

  setStrokeColor(color: string) {
    const ids = new Set(this.selection.get().strokes);
    this.doc.transact(() => {
      for (const st of this.doc.p.strokes) if (ids.has(st.id)) this.doc.put('strokes', { ...st, color });
    }, 'Color');
  }

  /** Nodes and strokes that a frame carries when it moves: everything fully inside it. */
  frameContents(frameId: string): { nodes: string[]; strokes: string[] } {
    const f = this.doc.node(frameId);
    if (!f) return { nodes: [], strokes: [] };
    const fr = nodeRect(f);
    const nodes = this.doc.p.nodes.filter((n) => n.id !== f.id && n.kind !== 'frame' && boxContains(fr, nodeRect(n))).map((n) => n.id);
    // Nested frames: smaller frames fully inside also move.
    for (const n of this.doc.p.nodes) if (n.kind === 'frame' && n.id !== f.id && boxContains(fr, nodeRect(n))) nodes.push(n.id);
    const strokes = this.doc.p.strokes.filter((s) => boxContains(fr, strokeBox(s))).map((s) => s.id);
    return { nodes, strokes };
  }

  /** Topmost node under a world point (frames only if nothing else). */
  nodeAt(x: number, y: number, filter?: (n: BoardNode) => boolean): BoardNode | null {
    const nodes = this.doc.p.nodes;
    let frame: BoardNode | null = null;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      if (filter && !filter(n)) continue;
      const r = nodeRect(n);
      if (x >= r.minX && x <= r.maxX && y >= r.minY && y <= r.maxY) {
        if (n.kind !== 'frame') return n;
        frame ??= n;
      }
    }
    return frame;
  }

  contentBox(): Box | null {
    const boxes: Box[] = this.doc.p.nodes.map(nodeRect);
    for (const s of this.doc.p.strokes) boxes.push(strokeBox(s));
    return unionBoxes(boxes);
  }

  zoomToFit() {
    this.engine.fit(this.contentBox(), 1);
  }

  zoomToSelection() {
    const b = this.selectionBox();
    if (b) this.engine.fit(b, 2);
  }

  /** Flies to a node and briefly highlights it. */
  reveal(id: string) {
    const n = this.doc.node(id);
    if (!n) return;
    const r = nodeRect(n);
    const vp = this.engine.worldViewport();
    const visible = boxesOverlap(r, vp) && r.maxX - r.minX < vp.maxX - vp.minX;
    const z = Math.max(this.engine.view.zoom, 0.8);
    if (!visible || this.engine.view.zoom < 0.6) {
      const cx = (r.minX + r.maxX) / 2,
        cy = (r.minY + r.maxY) / 2;
      this.engine.animateTo({ x: this.engine.width / 2 - cx * z, y: this.engine.height / 2 - cy * z, zoom: z });
    }
    this.selectNodes([id]);
    this.flash.set(id);
    setTimeout(() => this.flash.set((f) => (f === id ? null : f)), 1400);
  }
}
