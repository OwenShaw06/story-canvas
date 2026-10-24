import type { Doc } from '../doc';
import type { Background, Point, Stroke, View } from '../model';
import { boxesOverlap, clampZoom, fitView, strokeBox, toWorld, zoomAt, type Box } from './geometry';
import { buildPath, fillStroke, HIGHLIGHTER_ALPHA, resolveColor, strokePath } from './render';

/** A stroke being drawn. `clip` limits it to a card or sticky (world coords). */
export type LiveStroke = {
  tool: 'pen' | 'highlighter';
  color: string;
  size: number;
  points: Point[];
  predicted: Point[];
  clip?: Box;
};

export type Guide = { x1: number; y1: number; x2: number; y2: number };

/**
 * View and rendering for the board. Input lives in Controller.
 *
 * Layers, bottom to top: `below` (frames, links, nodes as HTML), `base`
 * canvas (committed ink, grid), `live` canvas (stroke in progress, lasso,
 * guides, selected ink), `above` (selection handles as HTML). The two HTML
 * layers get the view as a CSS transform in the same frame the canvases
 * redraw, so everything moves together.
 */
export class CanvasEngine {
  private base: HTMLCanvasElement;
  private live: HTMLCanvasElement;
  private bctx: CanvasRenderingContext2D;
  private lctx: CanvasRenderingContext2D;
  private dpr = 1;
  width = 0;
  height = 0;

  // Live-layer state, set by Controller.
  liveStroke: LiveStroke | null = null;
  eraserCursor: [number, number] | null = null; // screen px
  eraserRadius = 10;
  lasso: [number, number][] | null = null; // world
  marquee: Box | null = null; // world
  guides: Guide[] = [];
  selectedStrokes = new Set<string>();
  /** Bolder dots while snap to grid is on. */
  emphasizeGrid = false;
  /** Offset applied to selected strokes while they are dragged (hidden from base). */
  strokeDrag: { dx: number; dy: number } | null = null;

  private needsBase = true;
  private needsLive = false;
  private raf = 0;
  private anim = 0;
  private autoInk = '#1d1c1a';
  private gridColor = 'rgba(0,0,0,0.12)';
  private accent = '#2f6fd6';
  private lastStrokes: Stroke[] = [];
  private lastBackground: Background | null = null;
  private resizeObserver: ResizeObserver;
  private unsub: () => void;
  private mq = window.matchMedia('(prefers-color-scheme: dark)');
  private onTheme = () =>
    requestAnimationFrame(() => {
      this.readTheme();
      this.requestBase();
    });

  onViewChange: (v: View) => void = () => {};

  constructor(
    private container: HTMLElement,
    private layers: HTMLElement[],
    inkHost: HTMLElement,
    private doc: Doc,
  ) {
    this.base = document.createElement('canvas');
    this.live = document.createElement('canvas');
    for (const c of [this.base, this.live]) {
      c.className = 'ink-layer';
      inkHost.appendChild(c);
    }
    this.bctx = this.base.getContext('2d')!;
    this.lctx = this.live.getContext('2d', { desynchronized: true } as CanvasRenderingContext2DSettings)!;
    this.lastStrokes = doc.p.strokes;

    this.readTheme();
    this.mq.addEventListener('change', this.onTheme);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.unsub = doc.subscribe((changed) => {
      if (changed.has('strokes')) this.onStrokesChanged();
      if (changed.has('meta') && doc.p.background !== this.lastBackground) this.requestBase();
    });
    this.resize();
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    cancelAnimationFrame(this.anim);
    this.resizeObserver.disconnect();
    this.mq.removeEventListener('change', this.onTheme);
    this.unsub();
    this.base.remove();
    this.live.remove();
  }

  // ---------- view ----------

  get view(): View {
    return this.doc.p.view;
  }

  setView(v: View) {
    const next = { x: v.x, y: v.y, zoom: clampZoom(v.zoom) };
    const cur = this.view;
    if (cur.x === next.x && cur.y === next.y && cur.zoom === next.zoom) return;
    this.doc.setMeta({ view: next });
    this.applyLayerTransform();
    this.requestBase();
    if (this.liveStroke || this.lasso || this.selectedStrokes.size || this.guides.length) this.requestLive();
    this.onViewChange(next);
  }

  stopAnimation() {
    cancelAnimationFrame(this.anim);
    this.anim = 0;
  }

  /** Smoothly moves to a view: pans along a straight line in world space, zooms in log space. */
  animateTo(target: View, ms = 480) {
    this.stopAnimation();
    const from = this.view;
    const w = this.width,
      h = this.height;
    const c0 = toWorld(from, w / 2, h / 2);
    const c1 = toWorld(target, w / 2, h / 2);
    const z0 = Math.log(from.zoom),
      z1 = Math.log(clampZoom(target.zoom));
    const t0 = performance.now();
    const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const step = () => {
      const t = Math.min(1, (performance.now() - t0) / ms);
      const e = ease(t);
      const z = Math.exp(z0 + (z1 - z0) * e);
      const cx = c0[0] + (c1[0] - c0[0]) * e;
      const cy = c0[1] + (c1[1] - c0[1]) * e;
      this.setView({ x: w / 2 - cx * z, y: h / 2 - cy * z, zoom: z });
      this.anim = t < 1 ? requestAnimationFrame(step) : 0;
    };
    this.anim = requestAnimationFrame(step);
  }

  /** Continues a finger pan with momentum after release. Velocity in px/ms. */
  fling(vx: number, vy: number) {
    this.stopAnimation();
    let last = performance.now();
    const step = () => {
      const now = performance.now();
      const dt = Math.min(32, now - last);
      last = now;
      const decay = Math.pow(0.994, dt);
      vx *= decay;
      vy *= decay;
      if (Math.hypot(vx, vy) < 0.02) {
        this.anim = 0;
        return;
      }
      const v = this.view;
      this.setView({ ...v, x: v.x + vx * dt, y: v.y + vy * dt });
      this.anim = requestAnimationFrame(step);
    };
    this.anim = requestAnimationFrame(step);
  }

  zoomBy(factor: number, animate = true) {
    const v = zoomAt(this.view, this.view.zoom * factor, this.width / 2, this.height / 2);
    if (animate) this.animateTo(v, 260);
    else this.setView(v);
  }

  zoomTo(zoom: number) {
    this.animateTo(zoomAt(this.view, zoom, this.width / 2, this.height / 2), 320);
  }

  fit(box: Box | null, maxZoom = 1) {
    if (!box) return this.animateTo({ x: 0, y: 0, zoom: 1 });
    this.animateTo(fitView(box, this.width, this.height, 96, maxZoom));
  }

  worldViewport(): Box {
    const [minX, minY] = toWorld(this.view, 0, 0);
    const [maxX, maxY] = toWorld(this.view, this.width, this.height);
    return { minX, minY, maxX, maxY };
  }

  clientToWorld(clientX: number, clientY: number): [number, number] {
    const r = this.container.getBoundingClientRect();
    return toWorld(this.view, clientX - r.left, clientY - r.top);
  }

  clientToLocal(clientX: number, clientY: number): [number, number] {
    const r = this.container.getBoundingClientRect();
    return [clientX - r.left, clientY - r.top];
  }

  // ---------- rendering ----------

  requestBase() {
    this.needsBase = true;
    this.schedule();
  }

  requestLive() {
    this.needsLive = true;
    this.schedule();
  }

  private schedule() {
    if (!this.raf) this.raf = requestAnimationFrame(() => this.renderNow());
  }

  private onStrokesChanged() {
    const prev = this.lastStrokes;
    const next = this.doc.p.strokes;
    this.lastStrokes = next;
    // Fast path: one stroke appended. Draw just that stroke on top.
    if (
      !this.needsBase &&
      !this.strokeDrag &&
      next.length === prev.length + 1 &&
      (prev.length === 0 || next[next.length - 2] === prev[prev.length - 1])
    ) {
      this.applyWorldTransform(this.bctx);
      fillStroke(this.bctx, next[next.length - 1], this.autoInk);
      return;
    }
    this.requestBase();
    if (this.selectedStrokes.size) this.requestLive();
  }

  private readTheme() {
    const cs = getComputedStyle(this.container);
    this.autoInk = cs.getPropertyValue('--ink').trim() || '#1d1c1a';
    this.gridColor = cs.getPropertyValue('--grid').trim() || 'rgba(0,0,0,0.12)';
    this.accent = cs.getPropertyValue('--accent').trim() || '#2f6fd6';
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
    this.applyLayerTransform();
    this.needsBase = true;
    this.needsLive = true;
    this.renderNow();
  }

  private applyLayerTransform() {
    const { x, y, zoom } = this.view;
    for (const l of this.layers) {
      l.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${zoom})`;
    }
    this.container.style.setProperty('--iz', String(1 / zoom));
    const level = zoom < 0.35 ? 'far' : zoom < 0.6 ? 'mid' : 'near';
    if (this.container.dataset.zoomLevel !== level) this.container.dataset.zoomLevel = level;
  }

  renderNow() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (this.needsBase) this.renderBase();
    if (this.needsLive) this.renderLive();
    this.needsBase = this.needsLive = false;
  }

  private applyWorldTransform(ctx: CanvasRenderingContext2D) {
    const { x, y, zoom } = this.view;
    const d = this.dpr;
    ctx.setTransform(d * zoom, 0, 0, d * zoom, d * x, d * y);
  }

  private renderBase() {
    const ctx = this.bctx;
    this.lastBackground = this.doc.p.background;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.base.width, this.base.height);
    this.drawBackground(ctx, this.doc.p.background);

    this.applyWorldTransform(ctx);
    const vp = this.worldViewport();
    const minSize = 0.5 / this.view.zoom;
    const hide = this.strokeDrag ? this.selectedStrokes : null;
    for (const s of this.doc.p.strokes) {
      if (hide?.has(s.id)) continue;
      const b = strokeBox(s);
      if (!boxesOverlap(b, vp)) continue;
      if (b.maxX - b.minX < minSize && b.maxY - b.minY < minSize) continue;
      fillStroke(ctx, s, this.autoInk);
    }
  }

  private drawBackground(ctx: CanvasRenderingContext2D, bg: Background) {
    if (bg === 'plain') return;
    const { x, y, zoom } = this.view;
    let step = 32 * zoom; // matches the snap grid
    while (step < 18) step *= 4;
    const d = this.dpr;
    const ox = ((x % step) + step) % step;
    const oy = ((y % step) + step) % step;
    ctx.fillStyle = this.gridColor;
    ctx.beginPath();
    if (bg === 'dots') {
      const r = Math.max(1, (this.emphasizeGrid ? 2.1 : 1.3) * d);
      for (let gx = ox; gx < this.width; gx += step)
        for (let gy = oy; gy < this.height; gy += step) ctx.rect(gx * d - r / 2, gy * d - r / 2, r, r);
    } else {
      const lw = Math.max(1, 0.6 * d);
      for (let gy = oy; gy < this.height; gy += step) ctx.rect(0, gy * d, this.base.width, lw);
      if (bg === 'grid') for (let gx = ox; gx < this.width; gx += step) ctx.rect(gx * d, 0, lw, this.base.height);
    }
    ctx.fill();
  }

  private renderLive() {
    const ctx = this.lctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.live.width, this.live.height);
    const z = this.view.zoom;

    // Selected ink: halo, plus the strokes themselves while dragged.
    if (this.selectedStrokes.size) {
      this.applyWorldTransform(ctx);
      const off = this.strokeDrag;
      if (off) ctx.translate(off.dx, off.dy);
      ctx.strokeStyle = this.accent;
      ctx.lineJoin = 'round';
      for (const s of this.doc.p.strokes) {
        if (!this.selectedStrokes.has(s.id)) continue;
        const p = strokePath(s);
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = 6 / z;
        ctx.stroke(p);
        ctx.globalAlpha = 1;
        if (off) fillStroke(ctx, s, this.autoInk, p);
      }
    }

    if (this.liveStroke) {
      const s = this.liveStroke;
      const pts = s.predicted.length ? s.points.concat(s.predicted) : s.points;
      this.applyWorldTransform(ctx);
      ctx.save();
      if (s.clip) {
        ctx.beginPath();
        ctx.rect(s.clip.minX, s.clip.minY, s.clip.maxX - s.clip.minX, s.clip.maxY - s.clip.minY);
        ctx.clip();
      }
      ctx.fillStyle = resolveColor(s.color, this.autoInk);
      ctx.globalAlpha = s.tool === 'highlighter' ? HIGHLIGHTER_ALPHA : 1;
      ctx.fill(buildPath(s.tool, s.size, pts, false));
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    if (this.lasso && this.lasso.length > 1) {
      this.applyWorldTransform(ctx);
      ctx.beginPath();
      ctx.moveTo(this.lasso[0][0], this.lasso[0][1]);
      for (const [x, y] of this.lasso) ctx.lineTo(x, y);
      ctx.closePath();
      ctx.fillStyle = this.accent;
      ctx.globalAlpha = 0.08;
      ctx.fill();
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = this.accent;
      ctx.lineWidth = 1.5 / z;
      ctx.setLineDash([6 / z, 5 / z]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    if (this.marquee) {
      const m = this.marquee;
      this.applyWorldTransform(ctx);
      ctx.fillStyle = this.accent;
      ctx.globalAlpha = 0.08;
      ctx.fillRect(m.minX, m.minY, m.maxX - m.minX, m.maxY - m.minY);
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = this.accent;
      ctx.lineWidth = 1 / z;
      ctx.strokeRect(m.minX, m.minY, m.maxX - m.minX, m.maxY - m.minY);
      ctx.globalAlpha = 1;
    }

    if (this.guides.length) {
      this.applyWorldTransform(ctx);
      ctx.strokeStyle = '#ff3b6b';
      ctx.lineWidth = 1 / z;
      ctx.beginPath();
      for (const g of this.guides) {
        ctx.moveTo(g.x1, g.y1);
        ctx.lineTo(g.x2, g.y2);
      }
      ctx.stroke();
    }

    if (this.eraserCursor) {
      const [cx, cy] = this.eraserCursor;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.beginPath();
      ctx.arc(cx, cy, this.eraserRadius, 0, Math.PI * 2);
      ctx.fillStyle = this.autoInk;
      ctx.globalAlpha = 0.06;
      ctx.fill();
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = this.autoInk;
      ctx.lineWidth = 1.25;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
}
