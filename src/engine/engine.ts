import { INK_AUTO, uid, type Point, type Project, type Stroke, type View } from '../model';
import {
  boxesOverlap,
  clampZoom,
  pinchView,
  round,
  sampleSegment,
  strokeBox,
  strokeHit,
  toWorld,
  zoomAt,
  type Box,
} from './geometry';
import { History, removeStrokes, type RemovedItem } from './history';
import { buildPath, fillStroke, HIGHLIGHTER_ALPHA, resolveColor } from './render';

export type Tool = 'pen' | 'highlighter' | 'eraser';

export type EngineState = { canUndo: boolean; canRedo: boolean; zoom: number };

type Options = {
  /** Called when undo/redo availability or zoom changes. */
  onState: (s: EngineState) => void;
  /** Called after any change that must be saved (ink or view). */
  onChange: () => void;
};

/** Touches that start this soon after the pen lifts are treated as a palm. */
const PALM_GRACE_MS = 500;
/** Touch contacts wider than this (CSS px) are treated as a palm. */
const PALM_SIZE_PX = 60;
/** Eraser radius in screen pixels. */
const ERASER_RADIUS_PX = 10;

type ActiveStroke = {
  pointerId: number;
  tool: 'pen' | 'highlighter';
  color: string;
  size: number;
  points: Point[];
  predicted: Point[];
};

type ActiveErase = {
  pointerId: number;
  last: [number, number];
  /** Strokes removed so far in this swipe, in removal order (one undo step). */
  removed: RemovedItem[];
  cursor: [number, number];
};

type Pinch = {
  startView: View;
  startMid: [number, number];
  startDist: number;
};

/**
 * The ink canvas. Rendering and input are imperative (no framework) so a
 * stroke never waits on a UI re-render.
 *
 * Layers: `base` holds committed strokes and the dot grid; `live` holds the
 * stroke being drawn and the eraser cursor, and is cleared every frame.
 *
 * Input rules (requirement C2 and the palm acceptance criterion):
 * - pen (and mouse, for desktop testing) draws or erases;
 * - exactly two touches pan and pinch-zoom; one touch does nothing;
 * - three or more touches, wide contacts, touches while the pen is down, and
 *   touches right after the pen lifts are all ignored as a palm.
 */
export class CanvasEngine {
  private base: HTMLCanvasElement;
  private live: HTMLCanvasElement;
  private bctx: CanvasRenderingContext2D;
  private lctx: CanvasRenderingContext2D;
  private dpr = 1;
  private width = 0;
  private height = 0;

  private project: Project;
  private history: History;

  tool: Tool = 'pen';
  color: string = INK_AUTO;
  /** Screen-pixel width for the current tool; stored strokes use world units. */
  size = 3;

  private stroke: ActiveStroke | null = null;
  private erase: ActiveErase | null = null;
  private touches = new Map<number, [number, number]>();
  private ignoredTouches = new Set<number>();
  private touchesBlocked = false; // set by 3+ touches until all lift
  private pinch: Pinch | null = null;
  private lastPenUp = 0;
  private mousePan: { pointerId: number; last: [number, number] } | null = null;
  private spaceDown = false;

  private needsBase = true;
  private needsLive = false;
  private raf = 0;
  private autoInk = '#1d1c1a';
  private gridColor = 'rgba(0,0,0,0.12)';
  private lastState: EngineState | null = null;

  private cleanup: (() => void)[] = [];
  private resizeObserver: ResizeObserver;

  constructor(
    private container: HTMLElement,
    project: Project,
    private opts: Options,
  ) {
    this.project = project;
    this.history = new History(() => this.project.strokes);

    this.base = document.createElement('canvas');
    this.live = document.createElement('canvas');
    for (const c of [this.base, this.live]) {
      c.className = 'ink-layer';
      container.appendChild(c);
    }
    this.bctx = this.base.getContext('2d')!;
    this.lctx = this.live.getContext('2d', { desynchronized: true } as CanvasRenderingContext2DSettings)!;

    this.readTheme();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.bindInput();
    this.emitState();
  }

  // ---------- public API ----------

  get view(): View {
    return this.project.view;
  }

  setProject(p: Project) {
    this.cancelInput();
    this.project = p;
    this.history.clear();
    this.requestBase();
    this.emitState();
  }

  undo() {
    if (this.stroke || this.erase) return;
    if (this.history.undo()) this.afterInkEdit();
  }

  redo() {
    if (this.stroke || this.erase) return;
    if (this.history.redo()) this.afterInkEdit();
  }

  /** Zoom around the centre of the screen. */
  zoomTo(zoom: number) {
    this.setView(zoomAt(this.view, zoom, this.width / 2, this.height / 2));
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.cleanup.forEach((f) => f());
    this.base.remove();
    this.live.remove();
  }

  // ---------- state ----------

  private setView(v: View) {
    this.project.view = { x: v.x, y: v.y, zoom: clampZoom(v.zoom) };
    this.requestBase();
    this.opts.onChange();
    this.emitState();
  }

  private afterInkEdit() {
    this.requestBase();
    this.opts.onChange();
    this.emitState();
  }

  private emitState() {
    const s: EngineState = {
      canUndo: this.history.canUndo,
      canRedo: this.history.canRedo,
      zoom: this.view.zoom,
    };
    const l = this.lastState;
    if (l && l.canUndo === s.canUndo && l.canRedo === s.canRedo && l.zoom === s.zoom) return;
    this.lastState = s;
    this.opts.onState(s);
  }

  // ---------- rendering ----------

  private readTheme() {
    const cs = getComputedStyle(this.container);
    this.autoInk = cs.getPropertyValue('--ink').trim() || '#1d1c1a';
    this.gridColor = cs.getPropertyValue('--grid').trim() || 'rgba(0,0,0,0.12)';
  }

  private resize() {
    const r = this.container.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.width = r.width;
    this.height = r.height;
    for (const c of [this.base, this.live]) {
      c.width = Math.round(r.width * this.dpr);
      c.height = Math.round(r.height * this.dpr);
      c.style.width = `${r.width}px`;
      c.style.height = `${r.height}px`;
    }
    this.needsBase = true;
    this.needsLive = true;
    this.renderNow();
  }

  private requestBase() {
    this.needsBase = true;
    this.schedule();
  }

  private requestLive() {
    this.needsLive = true;
    this.schedule();
  }

  private schedule() {
    if (!this.raf) this.raf = requestAnimationFrame(() => this.renderNow());
  }

  private renderNow() {
    this.raf = 0;
    if (this.needsBase) this.renderBase();
    if (this.needsLive) this.renderLive();
    this.needsBase = this.needsLive = false;
  }

  private worldViewport(): Box {
    const v = this.view;
    const [minX, minY] = toWorld(v, 0, 0);
    const [maxX, maxY] = toWorld(v, this.width, this.height);
    return { minX, minY, maxX, maxY };
  }

  private applyWorldTransform(ctx: CanvasRenderingContext2D) {
    const { x, y, zoom } = this.view;
    const d = this.dpr;
    ctx.setTransform(d * zoom, 0, 0, d * zoom, d * x, d * y);
  }

  private renderBase() {
    const ctx = this.bctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.base.width, this.base.height);
    this.drawGrid(ctx);

    this.applyWorldTransform(ctx);
    const vp = this.worldViewport();
    const minSize = 0.5 / this.view.zoom; // skip strokes smaller than half a pixel on screen
    for (const s of this.project.strokes) {
      const b = strokeBox(s);
      if (!boxesOverlap(b, vp)) continue;
      if (b.maxX - b.minX < minSize && b.maxY - b.minY < minSize) continue;
      fillStroke(ctx, s, this.autoInk);
    }
  }

  private drawGrid(ctx: CanvasRenderingContext2D) {
    const { x, y, zoom } = this.view;
    let step = 32 * zoom;
    while (step < 16) step *= 4;
    const d = this.dpr;
    const r = Math.max(1, 1.2 * d);
    const ox = ((x % step) + step) % step;
    const oy = ((y % step) + step) % step;
    ctx.fillStyle = this.gridColor;
    ctx.beginPath();
    for (let gx = ox; gx < this.width; gx += step) {
      for (let gy = oy; gy < this.height; gy += step) {
        ctx.rect(gx * d - r / 2, gy * d - r / 2, r, r);
      }
    }
    ctx.fill();
  }

  private renderLive() {
    const ctx = this.lctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.live.width, this.live.height);

    if (this.stroke) {
      const s = this.stroke;
      const pts = s.predicted.length ? s.points.concat(s.predicted) : s.points;
      this.applyWorldTransform(ctx);
      ctx.fillStyle = resolveColor(s.color, this.autoInk);
      ctx.globalAlpha = s.tool === 'highlighter' ? HIGHLIGHTER_ALPHA : 1;
      ctx.fill(buildPath(s.tool, s.size, pts, false));
      ctx.globalAlpha = 1;
    }

    if (this.erase) {
      const [cx, cy] = this.erase.cursor;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.beginPath();
      ctx.arc(cx, cy, ERASER_RADIUS_PX, 0, Math.PI * 2);
      ctx.strokeStyle = this.autoInk;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  // ---------- input ----------

  private bindInput() {
    const el = this.container;
    const on = <K extends keyof HTMLElementEventMap>(
      target: HTMLElement | Window | MediaQueryList,
      type: K | string,
      fn: (e: any) => void,
      opts?: AddEventListenerOptions,
    ) => {
      target.addEventListener(type, fn, opts);
      this.cleanup.push(() => target.removeEventListener(type, fn, opts));
    };

    on(el, 'pointerdown', (e: PointerEvent) => this.onDown(e));
    on(el, 'pointermove', (e: PointerEvent) => this.onMove(e));
    on(el, 'pointerup', (e: PointerEvent) => this.onUp(e, false));
    on(el, 'pointercancel', (e: PointerEvent) => this.onUp(e, true));
    on(el, 'lostpointercapture', (e: PointerEvent) => this.onUp(e, true));

    // Stop iOS Safari from showing the magnifier, selecting text, or zooming the page.
    const block = (e: Event) => e.preventDefault();
    on(el, 'touchstart', block, { passive: false });
    on(el, 'touchmove', block, { passive: false });
    on(el, 'gesturestart', block, { passive: false });
    on(el, 'contextmenu', block);

    on(el, 'wheel', (e: WheelEvent) => this.onWheel(e), { passive: false });
    on(window, 'keydown', (e: KeyboardEvent) => this.onKey(e, true));
    on(window, 'keyup', (e: KeyboardEvent) => this.onKey(e, false));

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    on(mq, 'change', () => {
      // CSS variables update after the media query flips; read them next frame.
      requestAnimationFrame(() => {
        this.readTheme();
        this.requestBase();
      });
    });
  }

  private capture(pointerId: number) {
    try {
      this.container.setPointerCapture(pointerId);
    } catch {
      // The pointer may already be gone (fast taps); input still works without capture.
    }
  }

  private local(e: PointerEvent): [number, number] {
    const r = this.container.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  private onDown(e: PointerEvent) {
    if (e.pointerType === 'touch') return this.touchDown(e);

    if (e.pointerType === 'mouse' && (e.button === 1 || (e.button === 0 && this.spaceDown))) {
      this.mousePan = { pointerId: e.pointerId, last: [e.clientX, e.clientY] };
      this.capture(e.pointerId);
      return;
    }
    if (e.button !== 0) return;
    if (this.stroke || this.erase) return; // one pen at a time

    // A pen landing ends any touch gesture; the touches already down are likely a palm.
    this.pinch = null;
    for (const id of this.touches.keys()) this.ignoredTouches.add(id);
    this.touches.clear();

    this.capture(e.pointerId);
    const [sx, sy] = this.local(e);
    const [wx, wy] = toWorld(this.view, sx, sy);

    if (this.tool === 'eraser') {
      this.erase = { pointerId: e.pointerId, last: [wx, wy], removed: [], cursor: [sx, sy] };
      this.eraseAt([[wx, wy]]);
      this.requestLive();
      return;
    }
    this.stroke = {
      pointerId: e.pointerId,
      tool: this.tool,
      color: this.color,
      size: round(this.size / this.view.zoom, 3),
      points: [this.toPoint(e, sx, sy)],
      predicted: [],
    };
    this.requestLive();
  }

  private onMove(e: PointerEvent) {
    if (e.pointerType === 'touch') return this.touchMove(e);

    if (this.mousePan?.pointerId === e.pointerId) {
      const dx = e.clientX - this.mousePan.last[0];
      const dy = e.clientY - this.mousePan.last[1];
      this.mousePan.last = [e.clientX, e.clientY];
      this.setView({ ...this.view, x: this.view.x + dx, y: this.view.y + dy });
      return;
    }

    const events = (e.getCoalescedEvents?.() ?? []).length ? e.getCoalescedEvents() : [e];

    if (this.stroke?.pointerId === e.pointerId) {
      const s = this.stroke;
      const minDist = 0.5 / this.view.zoom;
      for (const ce of events) {
        const [sx, sy] = this.local(ce);
        const p = this.toPoint(ce, sx, sy);
        const last = s.points[s.points.length - 1];
        if (Math.hypot(p[0] - last[0], p[1] - last[1]) < minDist) continue;
        s.points.push(p);
      }
      s.predicted = (e.getPredictedEvents?.() ?? []).map((pe) => {
        const [sx, sy] = this.local(pe);
        return this.toPoint(pe, sx, sy);
      });
      this.requestLive();
      return;
    }

    if (this.erase?.pointerId === e.pointerId) {
      const er = this.erase;
      const pts: [number, number][] = [];
      for (const ce of events) {
        const [sx, sy] = this.local(ce);
        const w = toWorld(this.view, sx, sy);
        pts.push(...sampleSegment(er.last, w, ERASER_RADIUS_PX / this.view.zoom));
        er.last = w;
        er.cursor = [sx, sy];
      }
      this.eraseAt(pts);
      this.requestLive();
    }
  }

  private onUp(e: PointerEvent, cancelled: boolean) {
    if (e.pointerType === 'touch') return this.touchUp(e);

    if (this.mousePan?.pointerId === e.pointerId) {
      this.mousePan = null;
      return;
    }

    if (this.stroke?.pointerId === e.pointerId) {
      const s = this.stroke;
      this.stroke = null;
      this.lastPenUp = performance.now();
      if (!cancelled) {
        const [sx, sy] = this.local(e);
        const p = this.toPoint(e, sx, sy);
        const last = s.points[s.points.length - 1];
        if (p[0] !== last[0] || p[1] !== last[1]) s.points.push(p);
      }
      // A cancelled stroke (e.g. iOS interrupting the touch) is still kept: losing ink is worse.
      this.commitStroke(s);
      this.requestLive();
      return;
    }

    if (this.erase?.pointerId === e.pointerId) {
      const er = this.erase;
      this.erase = null;
      this.lastPenUp = performance.now();
      if (er.removed.length) {
        // The strokes were removed live; record one undo step for the whole swipe.
        this.history.push({ kind: 'remove', items: er.removed });
        this.opts.onChange();
        this.emitState();
      }
      this.requestLive();
    }
  }

  private toPoint(e: PointerEvent, sx: number, sy: number): Point {
    const [wx, wy] = toWorld(this.view, sx, sy);
    // Mouse and some styluses report 0 or 0.5; give them a steady medium pressure.
    const pressure = e.pointerType === 'pen' ? Math.max(0.05, e.pressure || 0.5) : 0.5;
    return [round(wx, 2), round(wy, 2), round(pressure, 3)];
  }

  private commitStroke(a: ActiveStroke) {
    if (!a.points.length) return;
    const stroke: Stroke = { id: uid(), tool: a.tool, color: a.color, size: a.size, points: a.points };
    this.project.strokes.push(stroke);
    this.history.push({ kind: 'add', strokes: [stroke] });
    // Draw just the new stroke on top of the base layer instead of redrawing everything.
    if (!this.needsBase) {
      this.applyWorldTransform(this.bctx);
      fillStroke(this.bctx, stroke, this.autoInk);
    }
    this.opts.onChange();
    this.emitState();
  }

  private eraseAt(points: [number, number][]) {
    const er = this.erase!;
    const r = ERASER_RADIUS_PX / this.view.zoom;
    const hits = new Set<string>();
    for (const s of this.project.strokes) {
      for (const [x, y] of points) {
        if (strokeHit(s, x, y, r)) {
          hits.add(s.id);
          break;
        }
      }
    }
    if (!hits.size) return;
    er.removed.push(...removeStrokes(this.project.strokes, hits));
    this.requestBase();
  }

  private touchDown(e: PointerEvent) {
    const now = performance.now();
    const palm =
      this.stroke !== null ||
      this.erase !== null ||
      now - this.lastPenUp < PALM_GRACE_MS ||
      Math.max(e.width || 0, e.height || 0) > PALM_SIZE_PX;
    if (palm || this.touchesBlocked) {
      this.ignoredTouches.add(e.pointerId);
      return;
    }
    this.capture(e.pointerId);
    this.touches.set(e.pointerId, this.local(e));
    if (this.touches.size === 2) this.startPinch();
    else if (this.touches.size > 2) {
      // Three or more contacts: almost always a resting hand. Stop and wait for all to lift.
      this.pinch = null;
      this.touchesBlocked = true;
      for (const id of this.touches.keys()) this.ignoredTouches.add(id);
      this.touches.clear();
    }
  }

  private startPinch() {
    const [a, b] = [...this.touches.values()];
    this.pinch = {
      startView: { ...this.view },
      startMid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
      startDist: Math.hypot(a[0] - b[0], a[1] - b[1]),
    };
  }

  private touchMove(e: PointerEvent) {
    if (!this.touches.has(e.pointerId)) return;
    this.touches.set(e.pointerId, this.local(e));
    if (!this.pinch || this.touches.size !== 2) return;
    const [a, b] = [...this.touches.values()];
    const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const dist = Math.hypot(a[0] - b[0], a[1] - b[1]);
    const p = this.pinch;
    this.setView(pinchView(p.startView, p.startMid, p.startDist, mid, dist));
  }

  private touchUp(e: PointerEvent) {
    this.ignoredTouches.delete(e.pointerId);
    if (this.touches.delete(e.pointerId)) this.pinch = null;
    if (this.touchesBlocked && this.ignoredTouches.size === 0 && this.touches.size === 0) {
      this.touchesBlocked = false;
    }
  }

  private cancelInput() {
    if (this.stroke) this.commitStroke(this.stroke);
    this.stroke = null;
    this.erase = null;
    this.pinch = null;
    this.touches.clear();
    this.ignoredTouches.clear();
    this.mousePan = null;
  }

  private onWheel(e: WheelEvent) {
    e.preventDefault();
    const r = this.container.getBoundingClientRect();
    const [sx, sy] = [e.clientX - r.left, e.clientY - r.top];
    if (e.ctrlKey || e.metaKey) {
      // Trackpad pinch (reported as ctrl+wheel) or cmd+scroll.
      this.setView(zoomAt(this.view, this.view.zoom * Math.exp(-e.deltaY * 0.01), sx, sy));
    } else {
      this.setView({ ...this.view, x: this.view.x - e.deltaX, y: this.view.y - e.deltaY });
    }
  }

  private onKey(e: KeyboardEvent, down: boolean) {
    const target = e.target as HTMLElement | null;
    if (target?.closest('input, textarea, [contenteditable="true"]')) return;
    if (e.code === 'Space') {
      this.spaceDown = down;
      if (down) e.preventDefault();
      return;
    }
    if (!down) return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) this.redo();
      else this.undo();
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      this.redo();
    }
  }
}
