import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Board } from '../board';
import { getImage, imageIdsIn } from '../db';
import { canvasToBlob, canvasToPdf, markdownZip, renderBoard, shareOrDownload } from '../export';
import { blobToDataUrl, exportFilename, exportProject } from '../io';
import { cardTitle, type Background, type BoardNode } from '../model';
import { theme, useStore } from '../store';
import { dockSide, type DockSide } from '../prefs';
import { tagColor } from '../tags';
import { useDocVersion } from './hooks';
import {
  CardIcon,
  CloseIcon,
  DownloadIcon,
  FrameIcon,
  ImageIcon,
  SearchIcon,
  ShapesIcon,
  StickyIcon,
  TemplateGlyph,
  TemplateIcon,
  TextIcon,
  UploadIcon,
} from './icons';
import { Popover } from './Popover';

// ---------- search ----------

type Hit = { node: BoardNode; title: string; kind: string; snippet: string; icon?: string; score: number };

function searchBoard(board: Board, q: string): Hit[] {
  const query = q.trim().toLowerCase();
  if (!query) return [];
  const terms = query.split(/\s+/);
  const hits: Hit[] = [];
  const templates = new Map(board.doc.p.templates.map((t) => [t.id, t]));
  for (const n of board.doc.p.nodes) {
    let title = '';
    let kind = '';
    let icon: string | undefined;
    let texts: string[] = [];
    if (n.kind === 'card') {
      const t = templates.get(n.templateId);
      title = cardTitle(n, t) || `Untitled ${t?.name.toLowerCase() ?? 'card'}`;
      kind = t?.name ?? 'Card';
      icon = t?.icon;
      const titleKey = t?.fields.find((f) => f.type === 'text')?.key;
      const imageKeys = new Set(t?.fields.filter((f) => f.type === 'image').map((f) => f.key));
      const others = Object.entries(n.fields)
        .filter(([k, v]) => k !== titleKey && !imageKeys.has(k) && v)
        .map(([, v]) => v);
      texts = [title, ...others, ...n.tags.map((g) => `#${g}`)];
    } else if (n.kind === 'sticky' || n.kind === 'text' || n.kind === 'shape') {
      title = n.text.split('\n')[0] || '';
      kind = n.kind === 'sticky' ? 'Sticky note' : n.kind === 'text' ? 'Text' : 'Shape';
      texts = [n.text];
    } else if (n.kind === 'frame') {
      title = n.label;
      kind = 'Frame';
      texts = [n.label];
    } else continue;
    const hay = texts.join('\n').toLowerCase();
    if (!terms.every((t) => hay.includes(t))) continue;
    // Snippet around the first match outside the title.
    let snippet = '';
    for (const tx of texts.slice(1)) {
      const i = tx.toLowerCase().indexOf(terms[0]);
      if (i >= 0) {
        const start = Math.max(0, i - 30);
        snippet = (start ? '…' : '') + tx.slice(start, i + 70).replace(/\s+/g, ' ') + (i + 70 < tx.length ? '…' : '');
        break;
      }
    }
    const score = (title.toLowerCase().includes(terms[0]) ? 0 : 1) + (title.toLowerCase().startsWith(terms[0]) ? -0.5 : 0);
    hits.push({ node: n, title: title || '(empty)', kind, snippet, icon, score });
  }
  return hits.sort((a, b) => a.score - b.score).slice(0, 60);
}

function Highlight({ text, q }: { text: string; q: string }) {
  const t = q.trim().split(/\s+/)[0];
  if (!t) return <>{text}</>;
  const i = text.toLowerCase().indexOf(t.toLowerCase());
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + t.length)}</mark>
      {text.slice(i + t.length)}
    </>
  );
}

const KIND_ICON: Record<string, (p: { size?: number }) => preact.JSX.Element> = {
  'Sticky note': StickyIcon,
  Text: TextIcon,
  Shape: ShapesIcon,
  Frame: FrameIcon,
};

export function SearchPanel({ board, onClose }: { board: Board; onClose: () => void }) {
  useDocVersion(board.doc, ['nodes']);
  const [q, setQ] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const hits = useMemo(() => searchBoard(board, q), [q, board.doc.p.nodes]);
  return (
    <aside class="side-panel glass" aria-label="Search">
      <div class="panel-head">
        <div class="search-field">
          <SearchIcon size={18} />
          <input
            ref={input}
            type="search"
            placeholder="Search cards, notes, frames"
            value={q}
            onInput={(e) => setQ((e.currentTarget as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && hits[0]) board.reveal(hits[0].node.id);
              if (e.key === 'Escape') onClose();
            }}
          />
        </div>
        <button class="icon-btn" aria-label="Close search" onClick={onClose}>
          <CloseIcon size={18} />
        </button>
      </div>
      <div class="panel-body">
        {!q.trim() && <p class="panel-empty">Find any character, place or note on this board.</p>}
        {q.trim() && !hits.length && <p class="panel-empty">No matches for “{q.trim()}”.</p>}
        {hits.map((h) => {
          const KI = KIND_ICON[h.kind];
          return (
            <button
              key={h.node.id}
              class="result"
              onClick={() => {
                board.reveal(h.node.id);
                if (window.innerWidth < 720) onClose();
              }}
            >
              <span class="result-icon">{KI ? <KI size={18} /> : <TemplateGlyph name={h.icon} size={18} />}</span>
              <span class="result-text">
                <span class="result-title">
                  <Highlight text={h.title} q={q} />
                </span>
                <span class="result-kind">{h.kind}</span>
                {h.snippet && (
                  <span class="result-snippet">
                    <Highlight text={h.snippet} q={q} />
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

// ---------- tags ----------

export function TagPanel({ board, onClose, anchor }: { board: Board; onClose: () => void; anchor: { current: HTMLElement | null } }) {
  useDocVersion(board.doc, ['nodes', 'meta']);
  const t = useStore(theme);
  const filter = useStore(board.tagFilter);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const counts = new Map<string, number>();
  for (const n of board.doc.p.nodes) if (n.kind === 'card') for (const g of n.tags) counts.set(g, (counts.get(g) ?? 0) + 1);
  const tags = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const presets = board.doc.p.tagPresets;
  const addPreset = () => {
    const v = draft.trim().replace(/^#/, '').replace(/\s+/g, '-');
    setDraft('');
    if (v && !presets.includes(v)) board.doc.setMeta({ tagPresets: [...presets, v] });
  };
  return (
    <Popover open onClose={onClose} class="menu tag-panel" anchor={anchor}>
      <div class="menu-title">
        Filter by tag
        {filter.length > 0 && (
          <button class="link-btn" onClick={() => board.tagFilter.set([])}>
            Clear
          </button>
        )}
      </div>
      {!tags.length && <p class="panel-empty">Tag cards (the “+ tag” field on a selected card) to filter by them here.</p>}
      <div class="tag-cloud">
        {tags.map(([g, c]) => (
          <button
            key={g}
            class={`chip tag-chip ${filter.includes(g) ? 'is-on' : ''}`}
            style={{ '--tag-color': tagColor(g, t) }}
            onClick={() => board.tagFilter.set(filter.includes(g) ? filter.filter((x) => x !== g) : [...filter, g])}
          >
            #{g} <span class="chip-count">{c}</span>
          </button>
        ))}
      </div>
      <div class="menu-sep" />
      <div class="menu-title">
        Ready-made tags
        <button class="link-btn" onClick={() => setEditing(!editing)}>
          {editing ? 'Done' : 'Edit'}
        </button>
      </div>
      <div class="tag-cloud">
        {presets.map((g) => (
          <span key={g} class="chip tag-chip is-preset" style={{ '--tag-color': tagColor(g, t) }}>
            #{g}
            {editing && (
              <button class="chip-x" aria-label={`Remove ${g}`} onClick={() => board.doc.setMeta({ tagPresets: presets.filter((x) => x !== g) })}>
                <CloseIcon size={11} />
              </button>
            )}
          </span>
        ))}
        {editing && (
          <input
            class="te-chip-input"
            placeholder="+ New tag"
            value={draft}
            onInput={(e) => setDraft((e.currentTarget as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addPreset();
              }
            }}
            onBlur={addPreset}
          />
        )}
      </div>
      {!editing && <p class="panel-hint">Offered whenever you tag a card. Each tag keeps its own colour.</p>}
    </Popover>
  );
}

// ---------- board menu ----------

const BACKGROUNDS: { id: Background; label: string }[] = [
  { id: 'dots', label: 'Dots' },
  { id: 'grid', label: 'Grid' },
  { id: 'lines', label: 'Lines' },
  { id: 'plain', label: 'Plain' },
];

export function BoardMenu(props: {
  board: Board;
  onClose: () => void;
  anchor: { current: HTMLElement | null };
  onTemplates: () => void;
  onImport: () => void;
  flush: () => Promise<void>;
}) {
  const { board, onClose } = props;
  useDocVersion(board.doc, ['meta']);
  const t = useStore(theme);
  const [busy, setBusy] = useState<string | null>(null);
  const p = board.doc.p;

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await props.flush();
      await fn();
    } catch (e) {
      console.error(e);
      board.notify(`${label} failed.`);
    } finally {
      setBusy(null);
      onClose();
    }
  };

  return (
    <Popover open onClose={onClose} class="menu board-menu" anchor={props.anchor}>
      <div class="menu-title">Background</div>
      <div class="bg-picker">
        {BACKGROUNDS.map((b) => (
          <button key={b.id} class={`bg-option bg-${b.id} ${p.background === b.id ? 'is-on' : ''}`} onClick={() => board.doc.setMeta({ background: b.id })}>
            <span />
            {b.label}
          </button>
        ))}
      </div>
      <div class="menu-title">Toolbar</div>
      <ToolbarSide />
      <div class="menu-sep" />
      <div class="menu-title">Export</div>
      <button
        class="menu-item"
        disabled={!!busy}
        onClick={() =>
          run('PNG export', async () => {
            const c = await renderBoard(p, { scale: 2, theme: t });
            await shareOrDownload(await canvasToBlob(c), exportFilename(p, 'png'));
          })
        }
      >
        <ImageIcon size={18} /> Image (PNG)
      </button>
      <button
        class="menu-item"
        disabled={!!busy}
        onClick={() =>
          run('PDF export', async () => {
            const c = await renderBoard(p, { scale: 2, theme: 'light' });
            await shareOrDownload(await canvasToPdf(c), exportFilename(p, 'pdf'));
          })
        }
      >
        <CardIcon size={18} /> PDF
      </button>
      <button
        class="menu-item"
        disabled={!!busy}
        onClick={() => run('Markdown export', async () => shareOrDownload(markdownZip(p), exportFilename(p, 'zip')))}
      >
        <TemplateIcon size={18} /> Cards as Markdown (Obsidian)
      </button>
      <button
        class="menu-item"
        disabled={!!busy}
        onClick={() =>
          run('Backup', async () => {
            const images: Record<string, string> = {};
            for (const id of imageIdsIn(p)) {
              const b = await getImage(id);
              if (b) images[id] = await blobToDataUrl(b);
            }
            const blob = new Blob([exportProject(p, images)], { type: 'application/json' });
            await shareOrDownload(blob, exportFilename(p));
          })
        }
      >
        <DownloadIcon size={18} /> Backup file (JSON)
      </button>
      <button
        class="menu-item"
        onClick={() => {
          onClose();
          props.onImport();
        }}
      >
        <UploadIcon size={18} /> Open a backup…
      </button>
      <div class="menu-sep" />
      <button
        class="menu-item"
        onClick={() => {
          onClose();
          props.onTemplates();
        }}
      >
        <TemplateIcon size={18} /> Card templates…
      </button>
      {busy && <div class="menu-busy">{busy}…</div>}
    </Popover>
  );
}

function ToolbarSide() {
  const side = useStore(dockSide);
  const opts: { id: DockSide; label: string }[] = [
    { id: 'left', label: 'Left' },
    { id: 'bottom', label: 'Bottom' },
    { id: 'right', label: 'Right' },
  ];
  return (
    <div class="segmented menu-segmented">
      {opts.map((o) => (
        <button key={o.id} class={side === o.id ? 'is-on' : ''} onClick={() => dockSide.set(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
