import type { Board } from './board';
import { pinchView, pointInPolygon, round, sampleSegment, strokeBox, strokeHit, translateStroke, zoomAt, type Box } from './engine/geometry';
import type { Guide } from './engine/engine';
import { nodeRect } from './layout';
import { hasInk, INK_AUTO, uid, type BoardNode, type Point, type Stroke } from './model';
import { snapToGrid, toGrid } from './prefs';

/** Touches that start this soon after the pen lifts are treated as a palm. */
const PALM_GRACE_MS = 500;
/** Touch contacts wider than this (CSS px) are treated as a palm. */
const PALM_SIZE_PX = 140;
/** Movement (screen px) before a press becomes a drag. */
const DRAG_SLOP = { touch: 6, pen: 4, mouse: 3 };
const ERASER_RADIUS_PX = 12;
const SNAP_PX = 6;
const DOUBLE_TAP_MS = 350;

type Kind = 'touch' | 'pen' | 'mouse';
type Corner = 'nw' | 'ne' | 'sw' | 'se';

type Gesture =
  | { type: 'stroke'; id: number; hostId: string | null; field: HTMLElement | null }
  | { type: 'erase'; id: number; last: [number, number] }
  | { type: 'pan'; id: number; last: [number, number]; samples: { t: number; x: number; y: number }[] }
  | {
      type: 'press';
      id: number;
      kind: Kind;
      startClient: [number, number];
      startWorld: [number, number];
      downAt: number;
      nodeId: string | null;
      linkId: string | null;
      editable: Element | null;
      target: Element;
      /** Pressed inside the field being edited: a tap places the caret natively, a drag still moves. */
      inField: boolean;
      /** Whether the node was already selected before this press. */
      wasSelected: boolean;
      /** True once movement passed the slop and the press became a move. */
      moving: boolean;
      movers: { id: string; x: number; y: number }[];
      strokes: string[];
      onEmpty: 'pan' | 'lasso' | 'marquee' | 'none';
    }
  | { type: 'resize'; id: number; nodeId: string; corner: Corner; start: { x: number; y: number; w: number; h: number }; aspect: number }
  | { type: 'link'; id: number; fromId: string; startClient: [number, number] }
  | { type: 'lasso'; id: number }
  | { type: 'marquee'; id: number; start: [number, number] };

type Settings = { color: string; size: number };

/**
 * All pointer, keyboard, wheel, paste and drop input for a board.
 *
 * Fingers: tap selects, drag moves objects or pans the canvas (with momentum),
 * two fingers pinch-zoom; a quick two-finger tap undoes and three-finger tap
 * redoes. Fingers never draw.
 * Pencil and mouse follow the current tool: draw, erase, lasso, or select.
 * Palm rejection: touches while the pen is down or just after, very wide
 * contacts, and resting hands (3+ contacts that don't lift quickly) are ignored.
 */
export class Controller {
  private g: Gesture | null = null;
  /** When the current gesture last received an event. */
  private gAt = 0;
  private touches = new Map<number, [number, number]>();
  private touchAt = new Map<number, number>();
  private ignoredAt = new Map<number, number>();
  private ignored = new Set<number>();
  private blocked = false;
  private pinch: { startView: { x: number; y: number; zoom: number }; startMid: [number, number]; startDist: number; samples: { t: number; x: number; y: number }[] } | null = null;
  private multi: { start: number; max: number; moved: number; pinched: boolean } | null = null;
  private lastPenUp = 0;
  private spaceDown = false;
  private lastTap: { t: number; nodeId: string | null; x: number; y: number } | null = null;
  private cleanup: (() => void)[] = [];

  ink: Record<'pen' | 'highlighter', Settings> = {
    pen: { color: INK_AUTO, size: 3 },
    highlighter: { color: '#f5d90a', size: 20 },
  };

  constructor(
    private board: Board,
    private el: HTMLElement,
  ) {
    this.bind();
  }

  destroy() {
    this.cleanup.forEach((f) => f());
  }

  private get engine() {
    return this.board.engine;
  }
  private get doc() {
    return this.board.doc;
  }

  // ---------- wiring ----------

  private bind() {
    const on = (t: EventTarget, type: string, fn: (e: any) => void, opts?: AddEventListenerOptions) => {
      t.addEventListener(type, fn, opts);
      this.cleanup.push(() => t.removeEventListener(type, fn, opts));
    };
    const el = this.el;
    on(el, 'pointerdown', (e: PointerEvent) => this.down(e));
    on(el, 'pointermove', (e: PointerEvent) => this.move(e));
    on(el, 'pointerup', (e: PointerEvent) => this.up(e, false));
    on(el, 'pointercancel', (e: PointerEvent) => this.up(e, true));
    // If the system takes a pointer away from us, treat it as cancelled.
    on(el, 'lostpointercapture', (e: PointerEvent) => {
      if (this.g?.id === e.pointerId) this.up(e, true);
    });

    // iOS: the board handles every touch itself (taps, focus, buttons), so
    // Safari never starts a magnifier, text selection, scroll or page zoom.
    // The only exception is the text field being edited, where native caret
    // placement and selection are what you want.
    on(
      el,
      'touchstart',
      (e: TouchEvent) => {
        if (!insideFocusedField(e.target)) e.preventDefault();
      },
      { passive: false },
    );
    on(
      el,
      'touchmove',
      (e: TouchEvent) => {
        const dragging = this.g?.type === 'press' ? this.g.moving : !!this.g;
        if (dragging || !insideFocusedField(e.target)) e.preventDefault();
      },
      { passive: false },
    );
    // Safari's own pinch events: a fallback that zooms if pointer-based pinch didn't start.
    on(el, 'gesturestart', (e: Event) => this.gesture(e as GestureLike, 'start'), { passive: false });
    on(el, 'gesturechange', (e: Event) => this.gesture(e as GestureLike, 'change'), { passive: false });
    on(el, 'gestureend', (e: Event) => this.gesture(e as GestureLike, 'end'), { passive: false });
    // Button taps inside the board are replayed by pressEnd; drop the browser's own click so nothing fires twice.
    on(
      el,
      'click',
      (e: MouseEvent) => {
        if (e.isTrusted && (e.target as Element).closest?.('[data-btn]')) {
          e.preventDefault();
          e.stopPropagation();
        }
      },
      { capture: true },
    );
    on(el, 'contextmenu', (e: Event) => {
      if (!(e.target as Element).closest?.('[data-edit]')) e.preventDefault();
    });
    on(el, 'wheel', (e: WheelEvent) => this.wheel(e), { passive: false });
    on(el, 'dragover', (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
    });
    on(el, 'drop', (e: DragEvent) => {
      const files = e.dataTransfer?.files;
      if (!files?.length) return;
      e.preventDefault();
      const [x, y] = this.engine.clientToWorld(e.clientX, e.clientY);
      void this.board.addImageFiles(Array.from(files), { x, y });
    });
    on(window, 'keydown', (e: KeyboardEvent) => this.key(e, true));
    on(window, 'keyup', (e: KeyboardEvent) => this.key(e, false));
    on(window, 'paste', (e: ClipboardEvent) => {
      if (isEditing(e.target)) return;
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'));
      if (files.length) {
        e.preventDefault();
        void this.board.addImageFiles(files);
      }
    });
  }

  // ---------- pointer routing ----------

  private kind(e: PointerEvent): Kind {
    return e.pointerType === 'touch' ? 'touch' : e.pointerType === 'pen' ? 'pen' : 'mouse';
  }

  private down(e: PointerEvent) {
    this.engine.stopAnimation();
    const kind = this.kind(e);
    const inField = insideFocusedField(e.target);
    // Pencil or mouse in the field you're typing in belongs to the system:
    // Scribble handwriting, caret placement, text selection. iPadOS may never
    // send this touch's end to us, so we must not start a gesture for it.
    if (inField && kind !== 'touch') return;
    this.recoverStale(e);
    // Pressing anywhere that isn't a field finishes the edit.
    // (Suggestion chips keep the field focused so you can pick several.)
    if (!inField && !(e.target as Element).closest('[data-edit], [data-keep-focus]')) blurField();
    if (kind === 'touch') return this.touchDown(e);
    if (kind === 'mouse' && (e.button === 1 || (e.button === 0 && this.spaceDown))) {
      e.preventDefault();
      this.capture(e.pointerId);
      this.g = { type: 'pan', id: e.pointerId, last: [e.clientX, e.clientY], samples: [] };
      this.gAt = performance.now();
      return;
    }
    if (e.button !== 0 || this.g) return;

    // A pen landing ends any finger gesture; those touches are likely a palm.
    this.cancelTouches();

    const tool = this.board.tool.get();
    if (!inField) e.preventDefault();
    // Capture so the gesture keeps working even if the element under the
    // finger re-renders. Taps on buttons are replayed as clicks in pressEnd.
    this.capture(e.pointerId);
    this.gAt = performance.now();
    if (tool === 'pen' || tool === 'highlighter') return this.startStroke(e, tool);
    if (tool === 'eraser') return this.startErase(e);
    if (tool === 'lasso') return this.startLasso(e);
    this.startPress(e, kind);
  }

  /**
   * A gesture whose end never arrived (iPadOS can keep a touch for Scribble,
   * the keyboard or a system gesture) would otherwise block everything after
   * it: fingers get treated as a palm, the Pencil can't start a new stroke.
   * Abandon any gesture that is reusing this pointer or has gone quiet, and
   * forget touches that have been silent for a while.
   */
  private recoverStale(e: PointerEvent) {
    const now = performance.now();
    const g = this.g;
    if (g) {
      const gIsTouch = this.touches.has(g.id) || (g.type === 'press' && g.kind === 'touch') || g.type === 'pan';
      const newIsTouch = e.pointerType === 'touch';
      // There is only one Pencil and one mouse: a new press means the old one ended.
      const replaced = g.id === e.pointerId || (!newIsTouch && !gIsTouch);
      // A Pencil gesture silent for 1.5 s while a finger lands has lost its end.
      const silent = newIsTouch && !gIsTouch && now - this.gAt > 1500;
      if (replaced || silent) this.abandon();
    }
    for (const [id, t] of this.touchAt) {
      if (id === e.pointerId || now - t > 4000) {
        this.touches.delete(id);
        this.touchAt.delete(id);
        this.pinch = null;
      }
    }
    for (const [id, t] of this.ignoredAt) {
      if (id === e.pointerId || now - t > 4000) {
        this.ignored.delete(id);
        this.ignoredAt.delete(id);
      }
    }
    if (!this.touches.size && !this.ignored.size) this.blocked = false;
    if (!this.g && !this.touches.size && this.doc.inTransaction) this.doc.endAll();
  }

  /** Drops the current gesture, keeping whatever it already changed. */
  private abandon() {
    const g = this.g;
    if (!g) return;
    this.g = null;
    if (g.type === 'stroke') this.commitLive(g.hostId);
    if (g.type === 'erase') this.engine.eraserCursor = null;
    if (g.type === 'lasso') this.engine.lasso = null;
    if (g.type === 'marquee') this.engine.marquee = null;
    if (g.type === 'link') this.board.linkDraft.set(null);
    if (g.type === 'press') {
      this.engine.strokeDrag = null;
      this.board.lifted.set(new Set());
    }
    this.engine.guides = [];
    this.doc.endAll();
    this.engine.requestLive();
  }

  private move(e: PointerEvent) {
    const kind = this.kind(e);
    if (this.g?.id === e.pointerId) this.gAt = performance.now();
    if (this.ignored.has(e.pointerId)) this.ignoredAt.set(e.pointerId, performance.now());
    if (kind === 'touch' && this.touches.has(e.pointerId)) {
      this.touches.set(e.pointerId, [e.clientX, e.clientY]);
      this.touchAt.set(e.pointerId, performance.now());
      if (this.pinch && this.touches.size === 2) return this.pinchMove();
    }
    const g = this.g;
    if (!g || g.id !== e.pointerId) return;
    switch (g.type) {
      case 'stroke':
        return this.strokeMove(e);
      case 'erase':
        return this.eraseMove(e);
      case 'pan':
        return this.panMove(e, g);
      case 'press':
        return this.pressMove(e, g);
      case 'resize':
        return this.resizeMove(e, g);
      case 'link':
        return this.linkMove(e, g);
      case 'lasso':
        return this.lassoMove(e);
      case 'marquee':
        return this.marqueeMove(e, g);
    }
  }

  private up(e: PointerEvent, cancelled: boolean) {
    if (this.kind(e) === 'touch') this.touchUp(e);
    const g = this.g;
    if (!g || g.id !== e.pointerId) return;
    this.g = null;
    switch (g.type) {
      case 'stroke':
        return this.strokeEnd(e, cancelled, g);
      case 'erase':
        return this.eraseEnd();
      case 'pan':
        return this.panEnd(g, cancelled);
      case 'press':
        return this.pressEnd(e, g, cancelled);
      case 'resize':
        this.engine.guides = [];
        this.doc.end();
        return;
      case 'link':
        return this.linkEnd(e, g, cancelled);
      case 'lasso':
        return this.lassoEnd();
      case 'marquee':
        return this.marqueeEnd();
    }
  }

  private capture(id: number) {
    try {
      this.el.setPointerCapture(id);
    } catch {
      /* pointer already gone */
    }
  }

  // ---------- ink ----------

  private toPoint(e: PointerEvent): Point {
    const [wx, wy] = this.engine.clientToWorld(e.clientX, e.clientY);
    const pressure = e.pointerType === 'pen' ? Math.max(0.05, e.pressure || 0.5) : 0.5;
    return [round(wx, 2), round(wy, 2), round(pressure, 3)];
  }

  private startStroke(e: PointerEvent, tool: 'pen' | 'highlighter') {
    const onSelected = (e.target as Element).closest<HTMLElement>('[data-node-id]')?.dataset.nodeId;
    if (!onSelected || !this.board.selection.get().nodes.includes(onSelected)) this.board.clearSelection();
    const p = this.toPoint(e);
    const host = this.board.nodeAt(p[0], p[1], (n) => hasInk(n) && !(n.kind === 'card' && n.collapsed));
    const s = this.ink[tool];
    this.engine.liveStroke = {
      tool,
      color: s.color,
      size: round(s.size / this.engine.view.zoom, 3),
      points: [p],
      predicted: [],
      clip: host ? nodeRect(host) : undefined,
    };
    // A text field on a selected object: a quick Pencil tap here opens it for typing or Scribble.
    const field = (e.target as Element).closest<HTMLElement>('[data-edit]');
    const fieldNode = field?.closest<HTMLElement>('[data-node-id]')?.dataset.nodeId;
    const selected = !!fieldNode && this.board.selection.get().nodes.includes(fieldNode);
    this.g = { type: 'stroke', id: e.pointerId, hostId: host?.id ?? null, field: selected ? field : null };

    this.engine.requestLive();
  }

  private strokeMove(e: PointerEvent) {
    const s = this.engine.liveStroke;
    if (!s) return;
    const minDist = 0.5 / this.engine.view.zoom;
    for (const ce of coalesced(e)) {
      const p = this.toPoint(ce);
      const last = s.points[s.points.length - 1];
      if (Math.hypot(p[0] - last[0], p[1] - last[1]) < minDist) continue;
      s.points.push(p);
    }
    s.predicted = (e.getPredictedEvents?.() ?? []).map((pe) => this.toPoint(pe));
    this.engine.requestLive();
  }

  private strokeEnd(e: PointerEvent, cancelled: boolean, g: Extract<Gesture, { type: 'stroke' }>) {
    const s = this.engine.liveStroke;
    this.engine.liveStroke = null;
    this.lastPenUp = performance.now();
    this.engine.requestLive();
    if (!s) return;
    if (!cancelled) {
      const p = this.toPoint(e);
      const last = s.points[s.points.length - 1];
      if (p[0] !== last[0] || p[1] !== last[1]) s.points.push(p);
    }
    // A tap (not a stroke) on a selected object's text field: edit it.
    if (!cancelled && g.field && isTap(s.points, this.engine.view.zoom)) {
      focusField(g.field);
      return;
    }
    // A cancelled stroke (iOS interrupting the touch) is kept: losing ink is worse.
    this.engine.liveStroke = s;
    this.commitLive(g.hostId);
  }

  /** Saves the stroke being drawn (onto its card or sticky, or the canvas). */
  private commitLive(hostId: string | null) {
    const s = this.engine.liveStroke;
    this.engine.liveStroke = null;
    this.engine.requestLive();
    if (!s || !s.points.length) return;
    const stroke: Stroke = { id: uid(), tool: s.tool, color: s.color, size: s.size, points: s.points };
    const host = hostId ? this.doc.node(hostId) : null;
    if (host && hasInk(host)) {
      const local: Stroke = { ...stroke, points: stroke.points.map(([x, y, pr]) => [round(x - host.x, 2), round(y - host.y, 2), pr] as Point) };
      this.doc.patch('nodes', host.id, { ink: [...host.ink, local] });
    } else {
      this.doc.put('strokes', stroke);
    }
  }

  private startErase(e: PointerEvent) {
    this.board.clearSelection();
    const w = this.engine.clientToWorld(e.clientX, e.clientY);
    this.doc.begin('Erase');
    this.g = { type: 'erase', id: e.pointerId, last: w };
    this.engine.eraserRadius = ERASER_RADIUS_PX;
    this.engine.eraserCursor = this.engine.clientToLocal(e.clientX, e.clientY);
    this.eraseAt([w]);
    this.engine.requestLive();
  }

  private eraseMove(e: PointerEvent) {
    const g = this.g as Extract<Gesture, { type: 'erase' }>;
    const pts: [number, number][] = [];
    const step = ERASER_RADIUS_PX / this.engine.view.zoom;
    for (const ce of coalesced(e)) {
      const w = this.engine.clientToWorld(ce.clientX, ce.clientY);
      pts.push(...sampleSegment(g.last, w, step));
      g.last = w;
    }
    this.engine.eraserCursor = this.engine.clientToLocal(e.clientX, e.clientY);
    this.eraseAt(pts);
    this.engine.requestLive();
  }

  private eraseAt(points: [number, number][]) {
    const r = ERASER_RADIUS_PX / this.engine.view.zoom;
    const hits = new Set<string>();
    for (const s of this.doc.p.strokes) {
      for (const [x, y] of points) {
        if (strokeHit(s, x, y, r)) {
          hits.add(s.id);
          break;
        }
      }
    }
    if (hits.size) this.doc.remove('strokes', hits);
    // Ink on cards and stickies.
    for (const n of this.doc.p.nodes) {
      if (!hasInk(n) || !n.ink.length) continue;
      const rect = nodeRect(n);
      const near = points.some(([x, y]) => x >= rect.minX - r && x <= rect.maxX + r && y >= rect.minY - r && y <= rect.maxY + r);
      if (!near) continue;
      const keep = n.ink.filter((s) => !points.some(([x, y]) => strokeHit(s, x - n.x, y - n.y, r)));
      if (keep.length !== n.ink.length) this.doc.patch('nodes', n.id, { ink: keep });
    }
  }

  private eraseEnd() {
    this.engine.eraserCursor = null;
    this.lastPenUp = performance.now();
    this.doc.end();
    this.engine.requestLive();
  }

  // ---------- lasso & marquee ----------

  private startLasso(e: PointerEvent) {
    this.engine.lasso = [this.engine.clientToWorld(e.clientX, e.clientY)];
    this.g = { type: 'lasso', id: e.pointerId };
    this.engine.requestLive();
  }

  private lassoMove(e: PointerEvent) {
    const l = this.engine.lasso!;
    for (const ce of coalesced(e)) l.push(this.engine.clientToWorld(ce.clientX, ce.clientY));
    this.engine.requestLive();
  }

  private lassoEnd() {
    const poly = this.engine.lasso ?? [];
    this.engine.lasso = null;
    this.engine.requestLive();
    if (poly.length < 3) return this.board.clearSelection();
    const nodes = this.doc.p.nodes
      .filter((n) => {
        const r = nodeRect(n);
        return pointInPolygon((r.minX + r.maxX) / 2, (r.minY + r.maxY) / 2, poly);
      })
      .map((n) => n.id);
    const strokes = this.doc.p.strokes
      .filter((s) => {
        const pts = s.points;
        const step = Math.max(1, Math.floor(pts.length / 12));
        let inside = 0,
          total = 0;
        for (let i = 0; i < pts.length; i += step) {
          total++;
          if (pointInPolygon(pts[i][0], pts[i][1], poly)) inside++;
        }
        return inside / total >= 0.6;
      })
      .map((s) => s.id);
    this.board.setSelection({ nodes, links: [], strokes });
    if (this.board.tool.get() === 'lasso' && (nodes.length || strokes.length)) this.board.tool.set('select');
  }

  private marqueeMove(e: PointerEvent, g: Extract<Gesture, { type: 'marquee' }>) {
    const [x, y] = this.engine.clientToWorld(e.clientX, e.clientY);
    this.engine.marquee = {
      minX: Math.min(g.start[0], x),
      minY: Math.min(g.start[1], y),
      maxX: Math.max(g.start[0], x),
      maxY: Math.max(g.start[1], y),
    };
    this.engine.requestLive();
  }

  private marqueeEnd() {
    const m = this.engine.marquee;
    this.engine.marquee = null;
    this.engine.requestLive();
    if (!m) return;
    const inside = (b: Box) => b.minX >= m.minX && b.maxX <= m.maxX && b.minY >= m.minY && b.maxY <= m.maxY;
    this.board.setSelection({
      nodes: this.doc.p.nodes.filter((n) => inside(nodeRect(n))).map((n) => n.id),
      links: [],
      strokes: this.doc.p.strokes.filter((s) => inside(strokeBox(s))).map((s) => s.id),
    });
  }

  // ---------- press: select, move, tap ----------

  private startPress(e: PointerEvent, kind: Kind) {
    const t = e.target as Element;
    const handle = t.closest<HTMLElement>('[data-handle]');
    if (handle) {
      this.capture(e.pointerId);
      return this.startHandle(e, handle);
    }

    const nodeEl = t.closest<HTMLElement>('[data-node-id]');
    const linkEl = t.closest<HTMLElement>('[data-link-id]');
    const nodeId = nodeEl?.dataset.nodeId ?? null;
    const linkId = !nodeId ? (linkEl?.dataset.linkId ?? null) : null;
    const editable = t.closest('[data-edit]');
    const w = this.engine.clientToWorld(e.clientX, e.clientY);

    const sel = this.board.selection.get();
    const wasSelected = !!nodeId && sel.nodes.includes(nodeId);
    // Pencil and mouse select on press for instant feedback. A finger waits for
    // a tap or a drag, so starting a pinch on a card doesn't select it.
    if (kind !== 'touch') this.selectPressed(nodeId, linkId, e.shiftKey || e.metaKey);

    // Pressing inside the selected ink's bounds drags the selection.
    let onSelection = false;
    if (!nodeId && !linkId && sel.strokes.length) {
      const b = this.board.selectionBox();
      onSelection = !!b && w[0] >= b.minX && w[0] <= b.maxX && w[1] >= b.minY && w[1] <= b.maxY;
    }

    const onEmpty: 'pan' | 'lasso' | 'marquee' | 'none' =
      nodeId || linkId || onSelection ? 'none' : kind === 'touch' ? 'pan' : kind === 'pen' ? 'lasso' : 'marquee';

    this.g = {
      type: 'press',
      id: e.pointerId,
      kind,
      startClient: [e.clientX, e.clientY],
      startWorld: w,
      downAt: performance.now(),
      nodeId,
      linkId,
      editable,
      target: t,
      inField: insideFocusedField(t),
      wasSelected,
      moving: false,
      movers: [],
      strokes: [],
      onEmpty,
    };
  }

  private pressMove(e: PointerEvent, g: Extract<Gesture, { type: 'press' }>) {
    const dist = Math.hypot(e.clientX - g.startClient[0], e.clientY - g.startClient[1]);
    if (!g.moving) {
      if (dist < DRAG_SLOP[g.kind]) return;
      g.moving = true;
      this.capture(g.id);
      if (g.onEmpty === 'pan') {
        this.g = { type: 'pan', id: g.id, last: [e.clientX, e.clientY], samples: [] };
        this.board.clearSelection();
        return;
      }
      if (g.onEmpty === 'lasso') {
        this.engine.lasso = [g.startWorld];
        this.g = { type: 'lasso', id: g.id };
        return this.lassoMove(e);
      }
      if (g.onEmpty === 'marquee') {
        this.g = { type: 'marquee', id: g.id, start: g.startWorld };
        return this.marqueeMove(e, this.g);
      }
      if (g.linkId) return; // links don't move on their own
      this.beginMove(g);
    }
    this.dragMove(e, g);
  }

  private selectPressed(nodeId: string | null, linkId: string | null, toggle = false) {
    const sel = this.board.selection.get();
    if (nodeId) {
      if (toggle) this.board.toggleNode(nodeId);
      else if (!sel.nodes.includes(nodeId)) this.board.selectNodes([nodeId]);
    } else if (linkId) {
      this.board.setSelection({ nodes: [], links: [linkId], strokes: [] });
    }
  }

  private beginMove(g: Extract<Gesture, { type: 'press' }>) {
    blurField();
    if (g.kind === 'touch') this.selectPressed(g.nodeId, null);
    const sel = this.board.selection.get();
    const nodeIds = new Set(sel.nodes);
    const strokeIds = new Set(sel.strokes);
    // Frames carry what's inside them.
    for (const id of sel.nodes) {
      const n = this.doc.node(id);
      if (n?.kind === 'frame') {
        const c = this.board.frameContents(id);
        c.nodes.forEach((x) => nodeIds.add(x));
        c.strokes.forEach((x) => strokeIds.add(x));
      }
    }
    g.movers = this.doc.p.nodes.filter((n) => nodeIds.has(n.id)).map((n) => ({ id: n.id, x: n.x, y: n.y }));
    this.board.lifted.set(new Set(g.movers.map((m) => m.id)));
    g.strokes = [...strokeIds];
    this.engine.selectedStrokes = strokeIds;
    this.engine.strokeDrag = strokeIds.size ? { dx: 0, dy: 0 } : null;
    this.engine.requestBase();
    this.doc.begin('Move');
  }

  private dragMove(e: PointerEvent, g: Extract<Gesture, { type: 'press' }>) {
    const [wx, wy] = this.engine.clientToWorld(e.clientX, e.clientY);
    let dx = wx - g.startWorld[0];
    let dy = wy - g.startWorld[1];
    if (!e.altKey && g.movers.length) [dx, dy] = snapToGrid.get() ? this.snapGrid(g, dx, dy) : this.snap(g, dx, dy);
    else this.engine.guides = [];
    for (const m of g.movers) this.doc.patch('nodes', m.id, { x: Math.round(m.x + dx), y: Math.round(m.y + dy) });
    if (this.engine.strokeDrag) this.engine.strokeDrag = { dx, dy };
    this.engine.requestLive();
  }

  /** With snap to grid on, the group's top-left corner lands on the grid. */
  private snapGrid(g: Extract<Gesture, { type: 'press' }>, dx: number, dy: number): [number, number] {
    this.engine.guides = [];
    const minX = Math.min(...g.movers.map((m) => m.x));
    const minY = Math.min(...g.movers.map((m) => m.y));
    return [toGrid(minX + dx) - minX, toGrid(minY + dy) - minY];
  }

  /** Snaps the moving group's edges and centres to other nodes, showing guides. */
  private snap(g: Extract<Gesture, { type: 'press' }>, dx: number, dy: number): [number, number] {
    const moving = new Set(g.movers.map((m) => m.id));
    const start = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    for (const m of g.movers) {
      const n = this.doc.node(m.id)!;
      const r = nodeRect(n);
      const w = r.maxX - r.minX,
        h = r.maxY - r.minY;
      start.minX = Math.min(start.minX, m.x);
      start.minY = Math.min(start.minY, m.y);
      start.maxX = Math.max(start.maxX, m.x + w);
      start.maxY = Math.max(start.maxY, m.y + h);
    }
    const tol = SNAP_PX / this.engine.view.zoom;
    const vp = this.engine.worldViewport();
    const xsOf = (b: Box) => [b.minX, (b.minX + b.maxX) / 2, b.maxX];
    const ysOf = (b: Box) => [b.minY, (b.minY + b.maxY) / 2, b.maxY];
    const box = { minX: start.minX + dx, maxX: start.maxX + dx, minY: start.minY + dy, maxY: start.maxY + dy };
    let bestX: { d: number; at: number; other: Box } | null = null;
    let bestY: { d: number; at: number; other: Box } | null = null;
    for (const n of this.doc.p.nodes) {
      if (moving.has(n.id)) continue;
      const r = nodeRect(n);
      if (r.maxX < vp.minX || r.minX > vp.maxX || r.maxY < vp.minY || r.minY > vp.maxY) continue;
      for (const a of xsOf(box))
        for (const b of xsOf(r)) {
          const d = b - a;
          if (Math.abs(d) <= tol && (!bestX || Math.abs(d) < Math.abs(bestX.d))) bestX = { d, at: b, other: r };
        }
      for (const a of ysOf(box))
        for (const b of ysOf(r)) {
          const d = b - a;
          if (Math.abs(d) <= tol && (!bestY || Math.abs(d) < Math.abs(bestY.d))) bestY = { d, at: b, other: r };
        }
    }
    const guides: Guide[] = [];
    if (bestX) {
      dx += bestX.d;
      const o = bestX.other;
      guides.push({ x1: bestX.at, y1: Math.min(o.minY, box.minY + (bestY?.d ?? 0)) - 12, x2: bestX.at, y2: Math.max(o.maxY, box.maxY + (bestY?.d ?? 0)) + 12 });
    }
    if (bestY) {
      dy += bestY.d;
      const o = bestY.other;
      guides.push({ x1: Math.min(o.minX, box.minX + (bestX?.d ?? 0)) - 12, y1: bestY.at, x2: Math.max(o.maxX, box.maxX + (bestX?.d ?? 0)) + 12, y2: bestY.at });
    }
    this.engine.guides = guides;
    return [dx, dy];
  }

  private pressEnd(e: PointerEvent, g: Extract<Gesture, { type: 'press' }>, cancelled: boolean) {
    if (g.moving) {
      // Commit moved ink.
      const off = this.engine.strokeDrag;
      if (off && (off.dx || off.dy)) {
        const ids = new Set(g.strokes);
        for (const s of this.doc.p.strokes) if (ids.has(s.id)) this.doc.put('strokes', translateStroke(s, off.dx, off.dy));
      }
      this.engine.strokeDrag = null;
      this.engine.guides = [];
      this.engine.selectedStrokes = new Set(this.board.selection.get().strokes);
      this.board.lifted.set(new Set());
      this.doc.end();
      this.engine.requestBase();
      this.engine.requestLive();
      return;
    }
    if (cancelled || g.inField) return;
    // A tap.
    const now = performance.now();
    const lt = this.lastTap;
    const isDouble = !!lt && now - lt.t < DOUBLE_TAP_MS && lt.nodeId === g.nodeId && Math.hypot(lt.x - e.clientX, lt.y - e.clientY) < 24;
    this.lastTap = isDouble ? null : { t: now, nodeId: g.nodeId, x: e.clientX, y: e.clientY };

    if (!g.nodeId && !g.linkId && g.onEmpty !== 'none') {
      blurField();
      this.board.clearSelection();
      return;
    }
    if (g.kind === 'touch') this.selectPressed(g.nodeId, g.linkId);
    // Buttons inside cards (collapse, chips, + Field) get their click here.
    const btn = g.target.closest<HTMLElement>('[data-btn]');
    if (btn) {
      btn.click();
      return;
    }
    // Tap a text field of a selected object to type; the first tap selects.
    const field = g.target.closest<HTMLElement>('[data-edit]');
    if (field && (g.wasSelected || isDouble)) {
      focusField(field);
      return;
    }
    if (g.nodeId && isDouble) {
      this.doubleTap(g.nodeId);
      return;
    }
    if (!field) blurField();
  }

  /** Double-tap an object (not on a field) to edit its main text. */
  private doubleTap(nodeId: string) {
    const nodeEl = this.el.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(nodeId)}"]`);
    const field = nodeEl?.querySelector<HTMLElement>('[data-edit][data-primary]') ?? nodeEl?.querySelector<HTMLElement>('[data-edit]');
    if (field) focusField(field);
  }

  // ---------- Safari pinch fallback ----------

  private gs: { view: { x: number; y: number; zoom: number }; at: [number, number] } | null = null;

  private gesture(e: GestureLike, phase: 'start' | 'change' | 'end') {
    e.preventDefault();
    if (phase === 'end' || this.pinch) {
      this.gs = null;
      return;
    }
    const at = this.engine.clientToLocal(e.clientX ?? this.engine.width / 2, e.clientY ?? this.engine.height / 2);
    if (phase === 'start' || !this.gs) {
      this.gs = { view: { ...this.engine.view }, at };
      return;
    }
    this.engine.setView(pinchView(this.gs.view, this.gs.at, 1, at, e.scale || 1));
  }

  // ---------- handles: resize & connect ----------

  private startHandle(e: PointerEvent, h: HTMLElement) {
    const kind = h.dataset.handle!;
    const nodeId = h.dataset.nodeId;
    if (kind === 'link' && nodeId) {
      const [x, y] = this.engine.clientToWorld(e.clientX, e.clientY);
      this.board.linkDraft.set({ fromId: nodeId, x, y, targetId: null });
      this.g = { type: 'link', id: e.pointerId, fromId: nodeId, startClient: [e.clientX, e.clientY] };
      return;
    }
    if (kind.startsWith('resize-') && nodeId) {
      const n = this.doc.node(nodeId);
      if (!n) return;
      const r = nodeRect(n);
      const start = { x: n.x, y: n.y, w: r.maxX - r.minX, h: r.maxY - r.minY };
      this.doc.begin('Resize');
      this.g = { type: 'resize', id: e.pointerId, nodeId, corner: kind.slice(7) as Corner, start, aspect: start.w / start.h };
    }
  }

  private resizeMove(e: PointerEvent, g: Extract<Gesture, { type: 'resize' }>) {
    const n = this.doc.node(g.nodeId);
    if (!n) return;
    const [wx, wy] = this.engine.clientToWorld(e.clientX, e.clientY);
    const s = g.start;
    const left = g.corner.includes('w');
    const top = g.corner.includes('n');
    const ax = left ? s.x + s.w : s.x; // fixed corner
    const ay = top ? s.y + s.h : s.y;
    const min = n.kind === 'text' ? { w: 60, h: 24 } : n.kind === 'card' ? { w: 220, h: 60 } : { w: 48, h: 40 };
    // With snap to grid, the dragged corner lands on the grid.
    const grid = snapToGrid.get() && !e.altKey;
    const cx = grid ? toGrid(wx) : wx;
    const cy = grid ? toGrid(wy) : wy;
    let w = Math.max(min.w, left ? ax - cx : cx - ax);
    let h = Math.max(min.h, top ? ay - cy : cy - ay);
    const keepAspect = (n.kind === 'image') !== e.shiftKey;
    if (keepAspect) {
      if (w / h > g.aspect) h = w / g.aspect;
      else w = h * g.aspect;
    }
    const patch: Partial<BoardNode> = { w: Math.round(w), h: Math.round(h), x: Math.round(left ? ax - w : ax), y: Math.round(top ? ay - h : ay) };
    if (n.kind === 'text') {
      // Text height follows its content; only width is dragged.
      patch.h = n.h;
      patch.y = n.y;
    }
    this.doc.patch('nodes', n.id, patch);
  }

  private linkMove(e: PointerEvent, g: Extract<Gesture, { type: 'link' }>) {
    const [x, y] = this.engine.clientToWorld(e.clientX, e.clientY);
    const target = this.board.nodeAt(x, y, (n) => n.id !== g.fromId && n.kind !== 'frame');
    this.board.linkDraft.set({ fromId: g.fromId, x, y, targetId: target?.id ?? null });
  }

  private linkEnd(e: PointerEvent, g: Extract<Gesture, { type: 'link' }>, cancelled: boolean) {
    const draft = this.board.linkDraft.get();
    this.board.linkDraft.set(null);
    if (cancelled || !draft) return;
    if (draft.targetId) {
      const l = this.board.addLink(g.fromId, draft.targetId);
      if (l) this.board.setSelection({ nodes: [], links: [l.id], strokes: [] });
      return;
    }
    const moved = Math.hypot(e.clientX - g.startClient[0], e.clientY - g.startClient[1]);
    if (moved > 60) this.board.addLinkedNode(g.fromId, draft.x, draft.y);
  }

  // ---------- panning ----------

  private panMove(e: PointerEvent, g: Extract<Gesture, { type: 'pan' }>) {
    const dx = e.clientX - g.last[0];
    const dy = e.clientY - g.last[1];
    g.last = [e.clientX, e.clientY];
    const now = performance.now();
    g.samples.push({ t: now, x: e.clientX, y: e.clientY });
    while (g.samples.length && now - g.samples[0].t > 100) g.samples.shift();
    const v = this.engine.view;
    this.engine.setView({ ...v, x: v.x + dx, y: v.y + dy });
  }

  private panEnd(g: Extract<Gesture, { type: 'pan' }>, cancelled: boolean) {
    if (cancelled) return;
    const s = g.samples;
    if (s.length < 2) return;
    const a = s[0],
      b = s[s.length - 1];
    const dt = b.t - a.t;
    if (dt <= 0 || performance.now() - b.t > 60) return;
    this.engine.fling((b.x - a.x) / dt, (b.y - a.y) / dt);
  }

  // ---------- touch ----------

  private touchDown(e: PointerEvent) {
    const now = performance.now();
    const penBusy = this.g && now - this.gAt < 1500 && (this.g.type === 'stroke' || this.g.type === 'erase' || this.g.type === 'lasso' || (this.g.type === 'press' && this.g.kind !== 'touch'));
    const palm = penBusy || now - this.lastPenUp < PALM_GRACE_MS || Math.max(e.width || 0, e.height || 0) > PALM_SIZE_PX;
    if (palm) {
      this.ignored.add(e.pointerId);
      this.ignoredAt.set(e.pointerId, now);
      return;
    }
    if (!this.touches.size && !this.ignored.size) this.multi = { start: now, max: 0, moved: 0, pinched: false };
    if (this.blocked) {
      this.ignored.add(e.pointerId);
      if (this.multi) this.multi.max = Math.max(this.multi.max, this.touches.size + this.ignored.size);
      return;
    }
    this.capture(e.pointerId);
    this.touches.set(e.pointerId, [e.clientX, e.clientY]);
    this.touchAt.set(e.pointerId, now);
    if (this.multi) this.multi.max = Math.max(this.multi.max, this.touches.size);

    if (this.touches.size === 1) {
      this.gAt = now;
      this.startPress(e, 'touch');
    } else if (this.touches.size === 2) {
      // Second finger: whatever the first finger was doing becomes a pinch.
      this.abortTouchGesture();
      this.startPinch();
    } else {
      // A resting hand. Ignore everything until all fingers lift.
      this.pinch = null;
      this.blocked = true;
      for (const id of this.touches.keys()) this.ignored.add(id);
      this.touches.clear();
    }
  }

  /** Ends a one-finger gesture when a second finger lands. Moves already made are kept. */
  private abortTouchGesture() {
    const g = this.g;
    if (!g || !this.touches.has(g.id)) return;
    if (g.type === 'press' && g.moving) {
      this.engine.strokeDrag = null;
      this.engine.guides = [];
      this.board.lifted.set(new Set());
      this.doc.end();
    } else if (g.type === 'resize') this.doc.end();
    else if (g.type === 'link') this.board.linkDraft.set(null);
    this.g = null;
    this.engine.requestLive();
  }

  private startPinch() {
    const [a, b] = [...this.touches.values()];
    this.pinch = {
      startView: { ...this.engine.view },
      startMid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
      startDist: Math.hypot(a[0] - b[0], a[1] - b[1]),
      samples: [],
    };
  }

  private pinchMove() {
    const p = this.pinch!;
    const [a, b] = [...this.touches.values()];
    const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const dist = Math.hypot(a[0] - b[0], a[1] - b[1]);
    const local = this.engine.clientToLocal(mid[0], mid[1]);
    const startLocal = this.engine.clientToLocal(p.startMid[0], p.startMid[1]);
    const now = performance.now();
    p.samples.push({ t: now, x: mid[0], y: mid[1] });
    while (p.samples.length && now - p.samples[0].t > 100) p.samples.shift();
    if (this.multi) {
      this.multi.moved = Math.max(this.multi.moved, Math.hypot(mid[0] - p.startMid[0], mid[1] - p.startMid[1]), Math.abs(dist - p.startDist));
      if (this.multi.moved > 12) this.multi.pinched = true;
    }
    this.engine.setView(pinchView(p.startView, startLocal, p.startDist, local, dist));
  }

  private touchUp(e: PointerEvent) {
    this.ignored.delete(e.pointerId);
    this.ignoredAt.delete(e.pointerId);
    this.touchAt.delete(e.pointerId);
    const wasPinch = !!this.pinch && this.touches.has(e.pointerId);
    if (this.touches.delete(e.pointerId) && wasPinch) {
      const s = this.pinch!.samples;
      this.pinch = null;
      // Two-finger pan release keeps gliding.
      if (s.length >= 2 && this.multi?.pinched) {
        const a = s[0],
          b = s[s.length - 1];
        const dt = b.t - a.t;
        if (dt > 0 && performance.now() - b.t < 60) this.engine.fling((b.x - a.x) / dt, (b.y - a.y) / dt);
      }
    }
    if (!this.touches.size && !this.ignored.size) {
      const m = this.multi;
      this.multi = null;
      this.blocked = false;
      // Quick multi-finger taps: two to undo, three to redo.
      if (m && !m.pinched && m.moved < 12 && performance.now() - m.start < 300) {
        if (m.max === 2) this.board.doc.undo() && this.board.notify('Undo');
        else if (m.max === 3) this.board.doc.redo() && this.board.notify('Redo');
      }
    }
  }

  private cancelTouches() {
    this.pinch = null;
    for (const id of this.touches.keys()) this.ignored.add(id);
    if (this.g && this.touches.has(this.g.id)) this.abortTouchGesture();
    this.touches.clear();
  }

  // ---------- wheel & keys ----------

  private wheel(e: WheelEvent) {
    if (isEditing(e.target) && !(e.ctrlKey || e.metaKey)) {
      const ta = (e.target as Element).closest('textarea');
      if (ta && ta.scrollHeight > ta.clientHeight) return;
    }
    e.preventDefault();
    this.engine.stopAnimation();
    const [sx, sy] = this.engine.clientToLocal(e.clientX, e.clientY);
    const v = this.engine.view;
    if (e.ctrlKey || e.metaKey) {
      this.engine.setView(zoomAt(v, v.zoom * Math.exp(-e.deltaY * 0.01), sx, sy));
    } else {
      this.engine.setView({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY });
    }
  }

  private key(e: KeyboardEvent, down: boolean) {
    if (isEditing(e.target)) {
      if (down && e.key === 'Escape') (e.target as HTMLElement).blur();
      return;
    }
    if (e.code === 'Space') {
      this.spaceDown = down;
      if (down) e.preventDefault();
      return;
    }
    if (!down) return;
    const b = this.board;
    const mod = e.metaKey || e.ctrlKey;
    const k = e.key.toLowerCase();
    const handled = () => e.preventDefault();

    if (mod && k === 'z') return handled(), e.shiftKey ? b.doc.redo() : b.doc.undo();
    if (mod && k === 'y') return handled(), b.doc.redo();
    if (mod && k === 'a') return handled(), b.selectAll();
    if (mod && k === 'd') return handled(), b.duplicateSelection();
    if (mod && k === 'c') return void (b.copySelection() && handled());
    if (mod && k === 'x') return void (b.copySelection(true) && handled());
    if (mod && k === 'v') return void (b.paste() && handled());
    if (mod && k === '0') return handled(), this.engine.zoomTo(1);
    if (mod && k === '1') return handled(), b.zoomToFit();
    if (mod && (k === '=' || k === '+')) return handled(), this.engine.zoomBy(1.25);
    if (mod && k === '-') return handled(), this.engine.zoomBy(0.8);
    if (mod) return;

    if (k === 'backspace' || k === 'delete') return handled(), b.deleteSelection();
    if (k === 'escape') return b.clearSelection();
    const sel = b.selection.get();
    if (k.startsWith('arrow') && (sel.nodes.length || sel.strokes.length)) {
      handled();
      const step = e.shiftKey ? 10 : 1;
      const dx = k === 'arrowleft' ? -step : k === 'arrowright' ? step : 0;
      const dy = k === 'arrowup' ? -step : k === 'arrowdown' ? step : 0;
      this.doc.transact(() => {
        for (const n of b.selectedNodes()) this.doc.patch('nodes', n.id, { x: n.x + dx, y: n.y + dy });
        const ids = new Set(sel.strokes);
        for (const s of this.doc.p.strokes) if (ids.has(s.id)) this.doc.put('strokes', translateStroke(s, dx, dy));
      }, 'Nudge');
      return;
    }
    const tools: Record<string, Parameters<typeof b.tool.set>[0]> = { v: 'select', p: 'pen', h: 'highlighter', e: 'eraser', l: 'lasso' };
    if (tools[k]) return b.tool.set(tools[k]);
    if (k === 'g') {
      snapToGrid.set(!snapToGrid.get());
      return b.notify(snapToGrid.get() ? 'Snap to grid on' : 'Snap to grid off');
    }
    if (k === 'n') return b.addSticky();
    if (k === 't') return b.addText();
  }
}

function coalesced(e: PointerEvent): PointerEvent[] {
  const list = e.getCoalescedEvents?.();
  return list && list.length ? list : [e];
}

function isEditing(t: EventTarget | null): boolean {
  return !!(t as Element | null)?.closest?.('input, textarea, select, [contenteditable="true"]');
}

type GestureLike = Event & { scale?: number; clientX?: number; clientY?: number };

function focusedField(): HTMLElement | null {
  const a = document.activeElement as HTMLElement | null;
  return a && a !== document.body && a.matches('input, textarea, [contenteditable="true"]') ? a : null;
}

/** True when the target is inside the text field that currently has focus. */
function insideFocusedField(t: EventTarget | null): boolean {
  const f = focusedField();
  return !!f && !!t && f.contains(t as Node);
}

function blurField() {
  focusedField()?.blur();
}

/** Focuses a field with the caret at the end (called from a tap, so iOS shows the keyboard). */
function focusField(el: HTMLElement) {
  el.focus({ preventScroll: true });
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const n = el.value.length;
    try {
      el.setSelectionRange(n, n);
    } catch {
      /* some input types don't support selection */
    }
  }
}

/** A stroke that barely moved: the Pencil was tapped, not drawn. */
function isTap(points: Point[], zoom: number): boolean {
  if (points.length > 6) return false;
  const [x0, y0] = points[0];
  return points.every(([x, y]) => Math.hypot(x - x0, y - y0) * zoom < 4);
}
