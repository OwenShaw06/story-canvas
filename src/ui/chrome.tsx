import { useRef, useState } from 'preact/hooks';
import type { Board, ToolName } from '../board';
import type { Controller } from '../controller';
import type { ShapeKind } from '../model';
import { accent, HIGHLIGHTER_COLORS, PALETTE, PEN_COLORS, STICKY_COLORS, type ColorName } from '../palette';
import { theme, useStore, type Store } from '../store';
import { dockSide, snapToGrid, type DockSide } from '../prefs';
import { fullscreenSupported, isFullscreen, toggleFullscreen } from '../fullscreen';
import { focusNodeSoon, useDocVersion } from './hooks';
import {
  ChevronDownIcon,
  EraserIcon,
  FitIcon,
  FrameIcon,
  GridIcon,
  HighlighterIcon,
  ImageIcon,
  LassoIcon,
  MoreIcon,
  PenIcon,
  PlusIcon,
  RedoIcon,
  SearchIcon,
  SelectIcon,
  ShapesIcon,
  StickyIcon,
  TagIcon,
  TemplateGlyph,
  TextIcon,
  UndoIcon,
  ExpandScreenIcon,
  ShrinkIcon,
  SnapGridIcon,
} from './icons';
import { IconButton, Popover } from './Popover';
import { shapePath } from './nodes';

// ---------- top bar ----------

export function TopBar(props: {
  board: Board;
  onExit: () => void;
  panel: string | null;
  setPanel: (p: string | null) => void;
  menuRef: { current: HTMLButtonElement | null };
  tagRef: { current: HTMLButtonElement | null };
}) {
  const { board } = props;
  useDocVersion(board.doc, ['meta']);
  const filter = useStore(board.tagFilter);
  const fs = useStore(isFullscreen);
  const toggle = (p: string) => props.setPanel(props.panel === p ? null : p);
  return (
    <>
      <div class="bar bar-left glass">
        <IconButton label="All worlds" onClick={props.onExit}>
          <GridIcon />
        </IconButton>
        <input
          class="project-name"
          value={board.doc.p.name}
          aria-label="World name"
          spellcheck={false}
          onInput={(e) => board.doc.setMeta({ name: (e.currentTarget as HTMLInputElement).value })}
          onBlur={(e) => {
            const v = (e.currentTarget as HTMLInputElement).value.trim();
            if (!v) board.doc.setMeta({ name: 'Untitled world' });
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
        />
      </div>
      <div class="bar bar-right glass">
        <IconButton label="Undo" disabled={!board.doc.canUndo} onClick={() => undoRedo(board, 'undo')}>
          <UndoIcon />
        </IconButton>
        <IconButton label="Redo" disabled={!board.doc.canRedo} onClick={() => undoRedo(board, 'redo')}>
          <RedoIcon />
        </IconButton>
        <span class="bar-sep" />
        {fullscreenSupported() && (
          <IconButton label={fs ? 'Exit full screen' : 'Full screen (hides the Safari bar)'} active={fs} onClick={() => void toggleFullscreen()}>
            {fs ? <ShrinkIcon /> : <ExpandScreenIcon />}
          </IconButton>
        )}
        <IconButton label="Search" active={props.panel === 'search'} onClick={() => toggle('search')}>
          <SearchIcon />
        </IconButton>
        <IconButton label="Filter by tag" active={props.panel === 'tags' || filter.length > 0} onClick={() => toggle('tags')} btnRef={props.tagRef}>
          <TagIcon />
          {filter.length > 0 && <span class="badge">{filter.length}</span>}
        </IconButton>
        <IconButton label="More" active={props.panel === 'menu'} onClick={() => toggle('menu')} btnRef={props.menuRef}>
          <MoreIcon />
        </IconButton>
      </div>
    </>
  );
}

/** Finishes any text edit in progress (closing its undo step) before undoing. */
function undoRedo(board: Board, which: 'undo' | 'redo') {
  (document.activeElement as HTMLElement | null)?.blur?.();
  if (which === 'undo') board.doc.undo();
  else board.doc.redo();
}

// ---------- tool dock ----------

const TOOLS: { id: ToolName; label: string; Icon: (p: { size?: number }) => preact.JSX.Element }[] = [
  { id: 'select', label: 'Select (V)', Icon: SelectIcon },
  { id: 'pen', label: 'Pen (P)', Icon: PenIcon },
  { id: 'highlighter', label: 'Highlighter (H)', Icon: HighlighterIcon },
  { id: 'eraser', label: 'Eraser (E)', Icon: EraserIcon },
  { id: 'lasso', label: 'Lasso (L)', Icon: LassoIcon },
];

const PEN_SIZES = [1.5, 3, 6];
const HL_SIZES = [12, 20, 32];

export function Dock(props: { board: Board; controller: Controller | null; insertOpen: Store<boolean> }) {
  const { board, controller } = props;
  const tool = useStore(board.tool);
  const insertOpen = useStore(props.insertOpen);
  const [, rerender] = useState(0);
  const ink = tool === 'pen' || tool === 'highlighter' ? tool : null;
  const settings = ink && controller ? controller.ink[ink] : null;
  const colors = ink === 'highlighter' ? HIGHLIGHTER_COLORS : PEN_COLORS;
  const sizes = ink === 'highlighter' ? HL_SIZES : PEN_SIZES;
  const plusRef = useRef<HTMLButtonElement>(null);
  const side = useStore(dockSide);
  const [drag, setDrag] = useState<{ x: number; y: number; dx: number; dy: number } | null>(null);
  const [hint, setHint] = useState<DockSide | null>(null);

  // Drag the grip to move the toolbar; it snaps to the nearest side on release.
  const sideAt = (x: number): DockSide => {
    const w = window.innerWidth;
    return x < w * 0.3 ? 'left' : x > w * 0.7 ? 'right' : 'bottom';
  };
  const onGripDown = (e: PointerEvent) => {
    e.preventDefault();
    const wrap = (e.currentTarget as HTMLElement).closest('.dock-wrap')!.getBoundingClientRect();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* pointer already gone */
    }
    props.insertOpen.set(false);
    setDrag({ x: wrap.left, y: wrap.top, dx: e.clientX - wrap.left, dy: e.clientY - wrap.top });
    setHint(sideAt(e.clientX));
  };
  const onGripMove = (e: PointerEvent) => {
    if (!drag) return;
    setDrag({ ...drag, x: e.clientX - drag.dx, y: e.clientY - drag.dy });
    setHint(sideAt(e.clientX));
  };
  const onGripUp = (e: PointerEvent) => {
    if (!drag) return;
    const moved = Math.hypot(e.clientX - drag.dx - drag.x, e.clientY - drag.dy - drag.y);
    setDrag(null);
    setHint(null);
    const target = sideAt(e.clientX);
    // A plain tap on the grip cycles sides: bottom → left → right.
    if (moved < 4 && target === side) dockSide.set(side === 'bottom' ? 'left' : side === 'left' ? 'right' : 'bottom');
    else dockSide.set(target);
  };

  const set = (patch: Partial<{ color: string; size: number }>) => {
    if (!controller || !ink) return;
    controller.ink[ink] = { ...controller.ink[ink], ...patch };
    rerender((x) => x + 1);
  };

  const dragStyle = drag ? { left: `${drag.x}px`, top: `${drag.y}px`, right: 'auto', bottom: 'auto', transform: 'none' } : undefined;

  return (
    <>
      {hint && <div class={`dock-target dock-target-${hint}`} aria-hidden="true" />}
    <div class={`dock-wrap ${drag ? 'is-dragging' : ''}`} data-side={side} style={dragStyle}>
      <InsertSheet board={board} open={insertOpen} onClose={() => props.insertOpen.set(false)} anchor={plusRef} />
      <div class="dock glass">
        <div
          class="dock-grip"
          role="button"
          aria-label="Move toolbar (drag to a side, or tap to switch sides)"
          title="Move toolbar"
          onPointerDown={onGripDown}
          onPointerMove={onGripMove}
          onPointerUp={onGripUp}
          onPointerCancel={() => (setDrag(null), setHint(null))}
        >
          <svg width="10" height="16" viewBox="0 0 10 16" aria-hidden="true">
            {[2, 8].map((x) => [2, 8, 14].map((y) => <circle key={`${x}${y}`} cx={x} cy={y} r="1.5" fill="currentColor" />))}
          </svg>
        </div>
        <button
          ref={plusRef}
          class={`insert-btn ${insertOpen ? 'is-open' : ''}`}
          aria-label="Insert"
          title="Insert"
          onClick={() => props.insertOpen.set(!insertOpen)}
        >
          <PlusIcon size={24} />
        </button>
        <span class="dock-sep" />
        {TOOLS.map((t) => (
          <IconButton
            key={t.id}
            label={t.label}
            active={tool === t.id}
            class="tool-btn"
            onClick={() => {
              board.tool.set(t.id);
              if (t.id !== 'select' && t.id !== 'lasso') board.clearSelection();
            }}
          >
            <t.Icon />
          </IconButton>
        ))}
        <div class={`dock-ink ${settings ? 'is-open' : ''}`}>
          <span class="dock-sep" />
          {settings &&
            colors.map((c) => (
              <button
                key={c.value}
                class={`swatch ${settings.color === c.value ? 'is-active' : ''}`}
                aria-label={c.label}
                aria-pressed={settings.color === c.value}
                onClick={() => set({ color: c.value })}
              >
                <span style={{ background: c.value === 'ink' ? 'var(--ink)' : c.value }} />
              </button>
            ))}
          {settings && <span class="dock-sep" />}
          {settings &&
            sizes.map((s, i) => (
              <button
                key={s}
                class={`size-btn ${settings.size === s ? 'is-active' : ''}`}
                aria-label={`Size ${i + 1}`}
                aria-pressed={settings.size === s}
                onClick={() => set({ size: s })}
              >
                <span style={{ width: `${5 + i * 4}px`, height: `${5 + i * 4}px` }} />
              </button>
            ))}
        </div>
      </div>
    </div>
    </>
  );
}

// ---------- insert sheet ----------

const SHAPES: ShapeKind[] = ['rect', 'rounded', 'ellipse', 'diamond', 'triangle', 'star'];

function InsertSheet(props: { board: Board; open: boolean; onClose: () => void; anchor: { current: HTMLElement | null } }) {
  const { board } = props;
  const t = useStore(theme);
  useDocVersion(board.doc, ['templates']);
  const fileRef = useRef<HTMLInputElement>(null);
  const done = (id?: string) => {
    props.onClose();
    if (board.tool.get() !== 'select') board.tool.set('select');
    if (id) focusNodeSoon(id);
  };
  return (
    <>
      <Popover open={props.open} onClose={props.onClose} class="insert-sheet" anchor={props.anchor}>
        <div class="sheet-section">
          <div class="sheet-title">Story cards</div>
          <div class="tile-grid">
            {board.doc.p.templates.map((tpl) => (
              <button
                key={tpl.id}
                class="tile"
                style={{ '--tile-accent': accent(tpl.color, t) }}
                onClick={() => done(board.addCard(tpl).id)}
              >
                <span class="tile-icon">
                  <TemplateGlyph name={tpl.icon} size={22} />
                </span>
                <span class="tile-label">{tpl.name}</span>
              </button>
            ))}
          </div>
        </div>
        <div class="sheet-section">
          <div class="sheet-title">Board</div>
          <div class="tile-grid">
            <button class="tile" style={{ '--tile-accent': accent('yellow', t) }} onClick={() => done(board.addSticky().id)}>
              <span class="tile-icon">
                <StickyIcon />
              </span>
              <span class="tile-label">Sticky note</span>
            </button>
            <button class="tile" onClick={() => done(board.addText().id)}>
              <span class="tile-icon">
                <TextIcon />
              </span>
              <span class="tile-label">Text</span>
            </button>
            <button class="tile" onClick={() => fileRef.current?.click()}>
              <span class="tile-icon">
                <ImageIcon />
              </span>
              <span class="tile-label">Photo</span>
            </button>
            <button class="tile" onClick={() => done(board.addFrame().id)}>
              <span class="tile-icon">
                <FrameIcon />
              </span>
              <span class="tile-label">Frame</span>
            </button>
          </div>
        </div>
        <div class="sheet-section">
          <div class="sheet-title">
            <ShapesIcon size={14} /> Shapes
          </div>
          <div class="shape-row">
            {SHAPES.map((s) => (
              <button key={s} class="shape-tile" aria-label={s} onClick={() => done(board.addShape(s).id)}>
                <svg width="34" height="28" viewBox="0 0 34 28">
                  <path d={shapePath(s, 34, 28, 2)} fill="var(--shape-fill)" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
                </svg>
              </button>
            ))}
          </div>
          <div class="sticky-row">
            {STICKY_COLORS.map((c) => (
              <button
                key={c}
                class="sticky-swatch"
                aria-label={`${PALETTE[c].label} sticky note`}
                style={{ background: PALETTE[c].fill[t] }}
                onClick={() => done(board.addSticky(c).id)}
              />
            ))}
          </div>
        </div>
      </Popover>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from((e.currentTarget as HTMLInputElement).files ?? []);
          (e.currentTarget as HTMLInputElement).value = '';
          if (files.length) {
            void board.addImageFiles(files);
            done();
          }
        }}
      />
    </>
  );
}

// ---------- zoom ----------

export function ZoomControl({ board, view }: { board: Board; view: Store<number> }) {
  useStore(view);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const z = board.engine?.view.zoom ?? 1;
  const hasSel = board.selection.get().nodes.length + board.selection.get().strokes.length > 0;
  const snap = useStore(snapToGrid);
  return (
    <div class="zoom glass">
      <button
        class={`zoom-grid ${snap ? 'is-on' : ''}`}
        aria-label={snap ? 'Snap to grid: on (G)' : 'Snap to grid: off (G)'}
        title={snap ? 'Snap to grid: on (G)' : 'Snap to grid: off (G)'}
        aria-pressed={snap}
        onClick={() => {
          snapToGrid.set(!snap);
          board.notify(!snap ? 'Snap to grid on' : 'Snap to grid off');
        }}
      >
        <SnapGridIcon size={20} />
      </button>
      <span class="zoom-sep" />
      <button class="zoom-step" aria-label="Zoom out" onClick={() => board.engine.zoomBy(0.8)}>
        −
      </button>
      <button ref={ref} class="zoom-value" aria-label="Zoom options" onClick={() => setOpen(!open)}>
        {Math.round(z * 100)}%
        <ChevronDownIcon size={12} />
      </button>
      <button class="zoom-step" aria-label="Zoom in" onClick={() => board.engine.zoomBy(1.25)}>
        +
      </button>
      <Popover open={open} onClose={() => setOpen(false)} class="menu zoom-menu" anchor={ref}>
        <button class="menu-item" onClick={() => (setOpen(false), board.zoomToFit())}>
          <FitIcon size={18} /> Zoom to fit <kbd>⌘1</kbd>
        </button>
        <button class="menu-item" onClick={() => (setOpen(false), board.engine.zoomTo(1))}>
          <span class="menu-glyph">1:1</span> Actual size <kbd>⌘0</kbd>
        </button>
        <button class="menu-item" disabled={!hasSel} onClick={() => (setOpen(false), board.zoomToSelection())}>
          <SelectIcon size={18} /> Zoom to selection
        </button>
      </Popover>
    </div>
  );
}

export function ColorDots(props: { colors: ColorName[]; value?: string; onPick: (c: ColorName) => void; kind: 'fill' | 'accent' }) {
  const t = useStore(theme);
  return (
    <div class="color-dots">
      {props.colors.map((c) => (
        <button
          key={c}
          class={`swatch ${props.value === c ? 'is-active' : ''}`}
          aria-label={PALETTE[c].label}
          onClick={() => props.onPick(c)}
        >
          <span style={{ background: props.kind === 'fill' ? PALETTE[c].fill[t] : PALETTE[c].accent[t] }} />
        </button>
      ))}
    </div>
  );
}
