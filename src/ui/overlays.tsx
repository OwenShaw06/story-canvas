import type { Board } from '../board';
import type { Box } from '../engine/geometry';
import { layoutVersion, nodeRect } from '../layout';
import type { BoardNode, Link } from '../model';
import { theme, useStore } from '../store';
import { useDocVersion } from './hooks';

const center = (r: Box): [number, number] => [(r.minX + r.maxX) / 2, (r.minY + r.maxY) / 2];

type Outline = 'box' | 'ellipse' | 'diamond';

const outlineOf = (n: BoardNode): Outline =>
  n.kind === 'shape' && (n.shape === 'ellipse' || n.shape === 'diamond') ? n.shape : 'box';

/** Where the line from the node's centre toward `to` leaves its outline (plus a gap). */
function edgePoint(r: Box, to: [number, number], outline: Outline = 'box', gap = 6): [number, number] {
  const [cx, cy] = center(r);
  const dx = to[0] - cx,
    dy = to[1] - cy;
  if (!dx && !dy) return [cx, cy];
  const hw = (r.maxX - r.minX) / 2 + gap,
    hh = (r.maxY - r.minY) / 2 + gap;
  let s: number;
  if (outline === 'ellipse') s = 1 / Math.hypot(dx / hw, dy / hh);
  else if (outline === 'diamond') s = 1 / (Math.abs(dx) / hw + Math.abs(dy) / hh);
  else s = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity);
  return [cx + dx * s, cy + dy * s];
}

export function linkEnds(board: Board, l: Link): { a: [number, number]; b: [number, number] } | null {
  const from = board.doc.node(l.fromId);
  const to = board.doc.node(l.toId);
  if (!from || !to) return null;
  const ra = nodeRect(from),
    rb = nodeRect(to);
  return { a: edgePoint(ra, center(rb), outlineOf(from)), b: edgePoint(rb, center(ra), outlineOf(to)) };
}

function arrowHead(a: [number, number], b: [number, number], size = 11): string {
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const p1 = [b[0] - size * Math.cos(ang - 0.42), b[1] - size * Math.sin(ang - 0.42)];
  const p2 = [b[0] - size * Math.cos(ang + 0.42), b[1] - size * Math.sin(ang + 0.42)];
  return `M${p1[0]},${p1[1]}L${b[0]},${b[1]}L${p2[0]},${p2[1]}`;
}

/** Connectors between nodes. Sits beneath the nodes. */
export function LinksLayer({ board }: { board: Board }) {
  useDocVersion(board.doc);
  useStore(layoutVersion);
  useStore(theme);
  const sel = useStore(board.selection);
  const links = board.doc.p.links;
  if (!links.length) return null;
  return (
    <svg class="links" aria-hidden="true">
      {links.map((l) => {
        const ends = linkEnds(board, l);
        if (!ends) return null;
        const { a, b } = ends;
        const selected = sel.links.includes(l.id);
        const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const d = `M${a[0]},${a[1]}L${b[0]},${b[1]}`;
        const labelW = l.label ? Math.min(220, l.label.length * 7.4 + 22) : 0;
        return (
          <g key={l.id} class={`link ${selected ? 'is-selected' : ''}`} data-link-id={l.id}>
            <path class="link-hit" d={d} />
            <path class={`link-line ${l.style === 'dashed' ? 'is-dashed' : ''}`} d={d} />
            {l.style === 'arrow' && <path class="link-line link-arrow" d={arrowHead(a, b)} />}
            {l.label && (
              <g class="link-label" transform={`translate(${mid[0]},${mid[1]})`}>
                <rect x={-labelW / 2} y={-13} width={labelW} height={26} rx={13} />
                <text text-anchor="middle" dominant-baseline="central">
                  {l.label}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** Selection outline, resize handles and connector handles. Sits above the ink. */
export function SelectionOverlay({ board }: { board: Board }) {
  useDocVersion(board.doc);
  useStore(layoutVersion);
  const sel = useStore(board.selection);
  const draft = useStore(board.linkDraft);

  const nodes = board.selectedNodes();
  const single = nodes.length === 1 && !sel.strokes.length ? nodes[0] : null;
  const box = board.selectionBox();

  const draftFrom = draft ? board.doc.node(draft.fromId) : null;
  const draftTarget = draft?.targetId ? board.doc.node(draft.targetId) : null;

  return (
    <>
      {box && (nodes.length > 1 || sel.strokes.length > 0) && (
        <div
          class="sel-box is-group"
          style={{ left: `${box.minX}px`, top: `${box.minY}px`, width: `${box.maxX - box.minX}px`, height: `${box.maxY - box.minY}px` }}
        />
      )}
      {nodes.length > 1 &&
        nodes.map((n) => {
          const r = nodeRect(n);
          return (
            <div
              key={n.id}
              class="sel-box is-member"
              style={{ left: `${r.minX}px`, top: `${r.minY}px`, width: `${r.maxX - r.minX}px`, height: `${r.maxY - r.minY}px` }}
            />
          );
        })}
      {single &&
        (() => {
          const r = nodeRect(single);
          const w = r.maxX - r.minX,
            h = r.maxY - r.minY;
          const canLink = single.kind !== 'frame';
          return (
            <div class="sel-box is-single" style={{ left: `${r.minX}px`, top: `${r.minY}px`, width: `${w}px`, height: `${h}px` }}>
              {!(single.kind === 'card' && single.collapsed) &&
                (['nw', 'ne', 'sw', 'se'] as const).map((c) => (
                  <div key={c} class={`handle resize ${c}`} data-handle={`resize-${c}`} data-node-id={single.id} />
                ))}
              {single.kind === 'card' && single.collapsed &&
                (['ne', 'se'] as const).map((c) => (
                  <div key={c} class={`handle resize ${c}`} data-handle={`resize-${c}`} data-node-id={single.id} />
                ))}
              {canLink &&
                (['n', 'e', 's', 'w'] as const).map((s) => (
                  <div key={s} class={`handle link ${s}`} data-handle="link" data-node-id={single.id}>
                    <span />
                  </div>
                ))}
            </div>
          );
        })()}
      {draft && draftFrom && (
        <svg class="link-draft" aria-hidden="true">
          {(() => {
            const ra = nodeRect(draftFrom);
            const target: [number, number] = draftTarget ? center(nodeRect(draftTarget)) : [draft.x, draft.y];
            const a = edgePoint(ra, target, outlineOf(draftFrom));
            const b = draftTarget ? edgePoint(nodeRect(draftTarget), center(ra), outlineOf(draftTarget)) : target;
            return (
              <>
                <path d={`M${a[0]},${a[1]}L${b[0]},${b[1]}`} />
                <circle cx={b[0]} cy={b[1]} r="5" />
              </>
            );
          })()}
        </svg>
      )}
      {draftTarget &&
        (() => {
          const r = nodeRect(draftTarget);
          return (
            <div
              class="sel-box is-target"
              style={{ left: `${r.minX}px`, top: `${r.minY}px`, width: `${r.maxX - r.minX}px`, height: `${r.maxY - r.minY}px` }}
            />
          );
        })()}
    </>
  );
}
