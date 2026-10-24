import { useRef, useState } from 'preact/hooks';
import type { Board } from '../board';
import { toScreen } from '../engine/geometry';
import { layoutVersion } from '../layout';
import type { LinkStyle, ShapeKind, TextSize } from '../model';
import { ACCENT_COLORS, PEN_COLORS, SHAPE_COLORS, STICKY_COLORS, accent, fill, type ColorName } from '../palette';
import { theme, useStore, type Store } from '../store';
import { ColorDots } from './chrome';
import { useDocVersion } from './hooks';
import {
  BackIcon,
  CollapseIcon,
  DuplicateIcon,
  ExpandIcon,
  FrontIcon,
  LineArrowIcon,
  LineDashedIcon,
  LineSolidIcon,
  TrashIcon,
} from './icons';
import { IconButton, Popover } from './Popover';
import { shapePath } from './nodes';

const SHAPES: ShapeKind[] = ['rect', 'rounded', 'ellipse', 'diamond', 'triangle', 'star'];

/**
 * The floating bar above the current selection, Freeform-style: the actions
 * that make sense for what's selected.
 */
export function ContextBar({ board, viewTick }: { board: Board; viewTick: Store<number> }) {
  useStore(viewTick);
  useStore(layoutVersion);
  useDocVersion(board.doc);
  const t = useStore(theme);
  const sel = useStore(board.selection);
  const [pop, setPop] = useState<string | null>(null);
  const colorRef = useRef<HTMLButtonElement>(null);
  const shapeRef = useRef<HTMLButtonElement>(null);

  if (!board.engine || board.linkDraft.get()) return null;
  const nodes = board.selectedNodes();
  const links = sel.links.map((id) => board.doc.get('links', id)).filter(Boolean);
  const strokes = sel.strokes.length;
  if (!nodes.length && !links.length && !strokes) return null;
  // Hide while dragging or resizing.
  if (board.doc.inTransaction && !document.activeElement?.closest('[data-edit]')) return null;

  // Position above the selection, flipping below near the top edge.
  let anchor: { x: number; top: number; bottom: number } | null = null;
  const box = board.selectionBox();
  if (box) {
    const [x1, y1] = toScreen(board.engine.view, box.minX, box.minY);
    const [x2, y2] = toScreen(board.engine.view, box.maxX, box.maxY);
    anchor = { x: (x1 + x2) / 2, top: y1, bottom: y2 };
  } else if (links.length) {
    const l = links[0]!;
    const a = board.doc.node(l.fromId),
      b = board.doc.node(l.toId);
    if (a && b) {
      const [sx, sy] = toScreen(board.engine.view, (a.x + a.w / 2 + b.x + b.w / 2) / 2, (a.y + a.h / 2 + b.y + b.h / 2) / 2);
      anchor = { x: sx, top: sy - 20, bottom: sy + 20 };
    }
  }
  if (!anchor) return null;
  const W = board.engine.width;
  const H = board.engine.height;
  const below = anchor.top < 160;
  const y = below ? Math.min(anchor.bottom + 44, H - 140) : anchor.top - 42;
  const x = Math.max(170, Math.min(W - 170, anchor.x));
  const style = { left: `${x}px`, top: `${y}px`, transform: `translate(-50%, ${below ? '0' : '-100%'})` };

  const kinds = new Set(nodes.map((n) => n.kind));
  const only = kinds.size === 1 ? [...kinds][0] : null;
  const first = nodes[0];

  const common = (
    <>
      {nodes.length + strokes > 0 && (
        <>
          <IconButton label="Duplicate" onClick={() => board.duplicateSelection()}>
            <DuplicateIcon size={20} />
          </IconButton>
          <IconButton label="Bring to front" onClick={() => board.arrange('front')}>
            <FrontIcon size={20} />
          </IconButton>
          <IconButton label="Send to back" onClick={() => board.arrange('back')}>
            <BackIcon size={20} />
          </IconButton>
        </>
      )}
      <IconButton label="Delete" class="is-danger" onClick={() => board.deleteSelection()}>
        <TrashIcon size={20} />
      </IconButton>
    </>
  );

  // ----- link selected -----
  if (!nodes.length && !strokes && links.length) {
    const l = links[0]!;
    const setStyle = (style: LinkStyle) => board.doc.patch('links', l.id, { style });
    return (
      <div class="context-bar glass" style={style}>
        <IconButton label="Solid line" active={l.style === 'solid'} onClick={() => setStyle('solid')}>
          <LineSolidIcon size={20} />
        </IconButton>
        <IconButton label="Dashed line" active={l.style === 'dashed'} onClick={() => setStyle('dashed')}>
          <LineDashedIcon size={20} />
        </IconButton>
        <IconButton label="Arrow" active={l.style === 'arrow'} onClick={() => setStyle('arrow')}>
          <LineArrowIcon size={20} />
        </IconButton>
        <span class="bar-sep" />
        <LinkLabelInput board={board} id={l.id} value={l.label ?? ''} />
        <span class="bar-sep" />
        <IconButton label="Delete connection" class="is-danger" onClick={() => board.deleteSelection()}>
          <TrashIcon size={20} />
        </IconButton>
      </div>
    );
  }

  // ----- color button for nodes -----
  const colorable = nodes.length > 0 && nodes.every((n) => n.kind !== 'image');
  const strokeOnly = !nodes.length && strokes > 0;
  const curColor = first && 'color' in first ? (first.color as string | undefined) : undefined;
  const colorSet: ColorName[] =
    only === 'sticky' ? STICKY_COLORS : only === 'shape' ? SHAPE_COLORS : ACCENT_COLORS;
  const colorKind = only === 'sticky' || only === 'shape' ? 'fill' : 'accent';
  const swatchBg = curColor ? (colorKind === 'fill' ? fill(curColor, t) : accent(curColor, t)) : 'var(--ink)';

  return (
    <div class="context-bar glass" style={style}>
      {colorable && (
        <button ref={colorRef} class="color-btn" aria-label="Color" onClick={() => setPop(pop === 'color' ? null : 'color')}>
          <span style={{ background: swatchBg }} />
        </button>
      )}
      {strokeOnly && (
        <div class="color-dots">
          {PEN_COLORS.map((c) => (
            <button key={c.value} class="swatch" aria-label={c.label} onClick={() => board.setStrokeColor(c.value)}>
              <span style={{ background: c.value === 'ink' ? 'var(--ink)' : c.value }} />
            </button>
          ))}
        </div>
      )}

      {only === 'shape' && nodes.length === 1 && first.kind === 'shape' && (
        <button ref={shapeRef} class="icon-btn" aria-label="Shape" onClick={() => setPop(pop === 'shape' ? null : 'shape')}>
          <svg width="22" height="20" viewBox="0 0 22 20">
            <path d={shapePath(first.shape, 22, 20, 2)} fill="none" stroke="currentColor" stroke-width="1.6" />
          </svg>
        </button>
      )}

      {only === 'text' && (
        <div class="segmented">
          {(['s', 'm', 'l', 'xl'] as TextSize[]).map((s) => (
            <button
              key={s}
              class={first.kind === 'text' && first.size === s ? 'is-on' : ''}
              onClick={() => board.doc.transact(() => nodes.forEach((n) => board.doc.patch('nodes', n.id, { size: s })))}
            >
              {s.toUpperCase()}
            </button>
          ))}
        </div>
      )}

      {only === 'card' && nodes.length === 1 && first.kind === 'card' && (
        <IconButton
          label={first.collapsed ? 'Expand' : 'Collapse'}
          onClick={() => board.doc.patch('nodes', first.id, { collapsed: !first.collapsed })}
        >
          {first.collapsed ? <ExpandIcon size={20} /> : <CollapseIcon size={20} />}
        </IconButton>
      )}

      {(colorable || strokeOnly || only === 'text' || only === 'card' || only === 'shape') && <span class="bar-sep" />}
      {common}

      <Popover open={pop === 'color'} onClose={() => setPop(null)} class="sub-pop" anchor={colorRef}>
        <ColorDots
          colors={colorSet}
          value={curColor}
          kind={colorKind}
          onPick={(c) => {
            board.setColor(c);
            setPop(null);
          }}
        />
      </Popover>
      <Popover open={pop === 'shape'} onClose={() => setPop(null)} class="sub-pop" anchor={shapeRef}>
        <div class="shape-row">
          {SHAPES.map((s) => (
            <button
              key={s}
              class="shape-tile"
              aria-label={s}
              onClick={() => {
                board.doc.patch('nodes', first.id, { shape: s });
                setPop(null);
              }}
            >
              <svg width="30" height="24" viewBox="0 0 30 24">
                <path d={shapePath(s, 30, 24, 2)} fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
              </svg>
            </button>
          ))}
        </div>
      </Popover>
    </div>
  );
}

function LinkLabelInput({ board, id, value }: { board: Board; id: string; value: string }) {
  return (
    <input
      data-edit
      class="link-label-input"
      placeholder="Label, e.g. brother of"
      value={value}
      onFocus={() => board.doc.begin('Label')}
      onBlur={() => board.doc.end()}
      onInput={(e) => {
        const v = (e.currentTarget as HTMLInputElement).value;
        board.doc.patch('links', id, { label: v || undefined });
      }}
      onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
    />
  );
}
