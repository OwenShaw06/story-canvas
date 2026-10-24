import { memo } from 'preact/compat';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { Board } from '../board';
import { imageUrl, storeImageFile } from '../db';
import { strokeSvgPath } from '../engine/render';
import { focusNodeSoon } from './hooks';
import { stickyFontSize } from '../layout';
import { forgetSize, reportSize } from '../layout';
import {
  INK_AUTO,
  type BoardNode,
  type CardNode,
  type FrameNode,
  type ImageNode,
  type ShapeNode,
  type StickyNode,
  type Stroke,
  type Template,
  type TextNode,
} from '../model';
import { accent, fill, type Theme } from '../palette';
import { CloseIcon, CollapseIcon, ExpandIcon, ImageIcon, TemplateGlyph } from './icons';

type Props = {
  node: BoardNode;
  board: Board;
  template?: Template;
  theme: Theme;
  selected: boolean;
  dimmed: boolean;
  flashing: boolean;
};

/** One board object. Memoized: re-renders only when its own data changes. */
export const NodeView = memo(
  function NodeView(p: Props) {
    const ref = useRef<HTMLDivElement>(null);
    const n = p.node;

    // Report rendered size (cards and text grow with content).
    useLayoutEffect(() => {
      const el = ref.current;
      if (!el) return;
      const ro = new ResizeObserver(() => reportSize(n.id, el.offsetWidth, el.offsetHeight));
      ro.observe(el);
      reportSize(n.id, el.offsetWidth, el.offsetHeight);
      return () => {
        ro.disconnect();
        forgetSize(n.id);
      };
    }, [n.id]);

    const fixedHeight = n.kind !== 'card' && n.kind !== 'text';
    const style: Record<string, string | number> = {
      left: `${n.x}px`,
      top: `${n.y}px`,
      width: `${n.w}px`,
    };
    if (fixedHeight) style.height = `${n.h}px`;
    else if (n.kind === 'card' && !n.collapsed) style.minHeight = `${n.h}px`;

    const cls = ['node', `node-${n.kind}`, p.selected && 'is-selected', p.dimmed && 'is-dimmed', p.flashing && 'is-flashing']
      .filter(Boolean)
      .join(' ');

    return (
      <div ref={ref} class={cls} style={style} data-node-id={n.id}>
        {n.kind === 'card' && <CardBody {...p} node={n} />}
        {n.kind === 'sticky' && <StickyBody {...p} node={n} />}
        {n.kind === 'text' && <TextBody {...p} node={n} />}
        {n.kind === 'shape' && <ShapeBody {...p} node={n} />}
        {n.kind === 'image' && <ImageBody node={n} />}
        {n.kind === 'frame' && <FrameBody {...p} node={n} />}
      </div>
    );
  },
  (a, b) =>
    a.node === b.node &&
    a.template === b.template &&
    a.theme === b.theme &&
    a.selected === b.selected &&
    a.dimmed === b.dimmed &&
    a.flashing === b.flashing,
);

// ---------- shared editing helpers ----------

/** Groups all typing in one focus session into a single undo step. */
function useEditGroup(board: Board) {
  const open = useRef(false);
  useEffect(
    () => () => {
      if (open.current) board.doc.end();
    },
    [board],
  );
  return {
    onFocus: () => {
      if (!open.current) {
        open.current = true;
        board.doc.begin('Edit');
      }
    },
    onBlur: () => {
      if (open.current) {
        open.current = false;
        board.doc.end();
      }
    },
  };
}

function AutoTextarea(props: {
  value: string;
  onInput: (v: string) => void;
  placeholder?: string;
  class?: string;
  board: Board;
  primary?: boolean;
  field?: string;
  onBlur?: () => void;
  style?: Record<string, string | number>;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const group = useEditGroup(props.board);
  const fit = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
  };
  useLayoutEffect(fit, [props.value]);
  return (
    <textarea
      ref={ref}
      data-edit
      data-primary={props.primary ? '' : undefined}
      data-field={props.field}
      class={props.class}
      style={props.style}
      rows={1}
      value={props.value}
      placeholder={props.placeholder}
      spellcheck
      onInput={(e) => {
        props.onInput((e.currentTarget as HTMLTextAreaElement).value);
        fit();
      }}
      onFocus={group.onFocus}
      onBlur={() => {
        group.onBlur();
        props.onBlur?.();
      }}
    />
  );
}

function TextInput(props: {
  value: string;
  onInput: (v: string) => void;
  placeholder?: string;
  class?: string;
  board: Board;
  primary?: boolean;
  field?: string;
  onBlur?: () => void;
}) {
  const group = useEditGroup(props.board);
  return (
    <input
      data-edit
      data-primary={props.primary ? '' : undefined}
      data-field={props.field}
      class={props.class}
      value={props.value}
      placeholder={props.placeholder}
      spellcheck
      onInput={(e) => props.onInput((e.currentTarget as HTMLInputElement).value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
      }}
      onFocus={group.onFocus}
      onBlur={() => {
        group.onBlur();
        props.onBlur?.();
      }}
    />
  );
}

/** Ink drawn on a card or sticky, in node-local coordinates, clipped to the node. */
function NodeInk({ ink, theme }: { ink: Stroke[]; theme: Theme }) {
  if (!ink.length) return null;
  const autoInk = theme === 'dark' ? '#ecebe6' : '#1d1c1a';
  return (
    <svg class="node-ink" aria-hidden="true">
      {ink.map((s) => (
        <path
          key={s.id}
          d={strokeSvgPath(s)}
          fill={s.color === INK_AUTO ? autoInk : s.color}
          fill-opacity={s.tool === 'highlighter' ? 0.35 : 1}
        />
      ))}
    </svg>
  );
}

function useImageUrl(id: string | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setUrl(null);
    if (id) void imageUrl(id).then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [id]);
  return url;
}

// ---------- card ----------

function CardBody(p: Props & { node: CardNode }) {
  const { node: n, template: t, board, theme } = p;
  const titleField = t?.fields.find((f) => f.type === 'text');
  const rest = t?.fields.filter((f) => f !== titleField) ?? [];
  const color = accent(n.color ?? t?.color, theme);
  const setField = (key: string, v: string) => board.doc.patch('nodes', n.id, { fields: { ...n.fields, [key]: v } });
  const [tagDraft, setTagDraft] = useState('');
  const [revealed, setRevealed] = useState<string | null>(null);
  const tagGroup = useEditGroup(board);
  // Filled fields show; empty ones collapse into "+ Field" chips while selected.
  const shown = rest.filter((f) => n.fields[f.key] || f.key === revealed);
  const empty = rest.filter((f) => !shown.includes(f));
  const reveal = (key: string, type: string) => {
    setRevealed(key);
    if (type === 'text' || type === 'longtext') focusNodeSoon(n.id, `[data-field="${key}"]`);
  };
  const hideIfEmpty = (key: string) => {
    if (!n.fields[key] && revealed === key) setRevealed(null);
  };

  const addTag = () => {
    const tag = tagDraft.trim().replace(/^#/, '');
    setTagDraft('');
    if (tag && !n.tags.includes(tag)) board.doc.patch('nodes', n.id, { tags: [...n.tags, tag] });
  };

  return (
    <div class={`card ${n.collapsed ? 'is-collapsed' : ''}`} style={{ '--card-accent': color }}>
      <div class="card-head" data-card-header>
        <span class="card-glyph">
          <TemplateGlyph name={t?.icon} size={18} />
        </span>
        <div class="card-titles">
          <span class="card-kind">{t?.name ?? 'Card'}</span>
          {titleField ? (
            <TextInput
              board={board}
              primary
              class="card-title"
              value={n.fields[titleField.key] ?? ''}
              placeholder={`Untitled ${t?.name.toLowerCase() ?? 'card'}`}
              onInput={(v) => setField(titleField.key, v)}
            />
          ) : (
            <span class="card-title is-static">{t?.name}</span>
          )}
        </div>
        <button
          class="card-collapse"
          data-btn
          aria-label={n.collapsed ? 'Expand card' : 'Collapse card'}
          onClick={() => board.doc.patch('nodes', n.id, { collapsed: !n.collapsed })}
        >
          {n.collapsed ? <ExpandIcon size={16} /> : <CollapseIcon size={16} />}
        </button>
      </div>

      {!n.collapsed && (
        <div class="card-body">
          {shown.map((f) => (
            <div class={`field field-${f.type} ${n.fields[f.key] ? 'has-value' : ''}`} key={f.key}>
              <label class="field-label">{f.label}</label>
              {f.type === 'longtext' && (
                <AutoTextarea
                  board={board}
                  field={f.key}
                  class="field-input"
                  value={n.fields[f.key] ?? ''}
                  placeholder={`Add ${f.label.toLowerCase()}…`}
                  onInput={(v) => setField(f.key, v)}
                  onBlur={() => hideIfEmpty(f.key)}
                />
              )}
              {f.type === 'text' && (
                <TextInput
                  board={board}
                  field={f.key}
                  class="field-input"
                  value={n.fields[f.key] ?? ''}
                  placeholder={`Add ${f.label.toLowerCase()}…`}
                  onInput={(v) => setField(f.key, v)}
                  onBlur={() => hideIfEmpty(f.key)}
                />
              )}
              {f.type === 'select' && (
                <div class="field-options">
                  {(f.options ?? []).map((o) => (
                    <button
                      data-btn
                      class={`chip ${n.fields[f.key] === o ? 'is-on' : ''}`}
                      onClick={() => setField(f.key, n.fields[f.key] === o ? '' : o)}
                    >
                      {o}
                    </button>
                  ))}
                </div>
              )}
              {f.type === 'image' && <CardImageField board={board} value={n.fields[f.key]} onChange={(v) => setField(f.key, v)} />}
            </div>
          ))}

          {p.selected && empty.length > 0 && (
            <div class="field-adds">
              {empty.map((f) => (
                <button key={f.key} data-btn class="add-chip" onClick={() => reveal(f.key, f.type)}>
                  + {f.label}
                </button>
              ))}
            </div>
          )}

          <div class="card-tags">
            {n.tags.map((tag) => (
              <span class="tag" key={tag}>
                #{tag}
                {p.selected && (
                  <button
                    data-btn
                    class="tag-remove"
                    aria-label={`Remove tag ${tag}`}
                    onClick={() => board.doc.patch('nodes', n.id, { tags: n.tags.filter((x) => x !== tag) })}
                  >
                    <CloseIcon size={12} />
                  </button>
                )}
              </span>
            ))}
            {p.selected && (
              <input
                data-edit
                class="tag-input"
                placeholder="+ tag"
                value={tagDraft}
                onInput={(e) => setTagDraft((e.currentTarget as HTMLInputElement).value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    addTag();
                  }
                }}
                onFocus={tagGroup.onFocus}
                onBlur={() => {
                  addTag();
                  tagGroup.onBlur();
                }}
              />
            )}
          </div>
        </div>
      )}
      {!n.collapsed && <NodeInk ink={n.ink} theme={theme} />}
    </div>
  );
}

function CardImageField({ board, value, onChange }: { board: Board; value?: string; onChange: (v: string) => void }) {
  const url = useImageUrl(value);
  const input = useRef<HTMLInputElement>(null);
  const pick = () => input.current?.click();
  return (
    <div class="field-image">
      {value ? (
        <div class="field-image-frame">
          {url ? <img src={url} alt="" draggable={false} /> : <div class="img-loading" />}
          <button data-btn class="field-image-remove" aria-label="Remove image" onClick={() => onChange('')}>
            <CloseIcon size={14} />
          </button>
        </div>
      ) : (
        <button data-btn class="field-image-add" onClick={pick}>
          <ImageIcon size={18} /> Add image
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const f = (e.currentTarget as HTMLInputElement).files?.[0];
          (e.currentTarget as HTMLInputElement).value = '';
          if (!f) return;
          try {
            const img = await storeImageFile(f, 1400);
            onChange(img.id);
          } catch {
            board.notify('That image could not be added.');
          }
        }}
      />
    </div>
  );
}

// ---------- sticky ----------


function StickyBody({ node: n, board, theme }: Props & { node: StickyNode }) {
  const len = n.text.length;
  const fontSize = stickyFontSize(n.w, n.h, len);
  return (
    <div class="sticky" style={{ background: fill(n.color, theme), '--sticky-ink': accent(n.color, theme) }}>
      <AutoTextarea
        board={board}
        primary
        class="sticky-text"
        style={{ fontSize: `${fontSize}px` }}
        value={n.text}
        placeholder="Write something…"
        onInput={(v) => board.doc.patch('nodes', n.id, { text: v })}
      />
      <NodeInk ink={n.ink} theme={theme} />
    </div>
  );
}

// ---------- text ----------

const TEXT_SIZES = { s: 15, m: 22, l: 34, xl: 52 };

function TextBody({ node: n, board, theme }: Props & { node: TextNode }) {
  const color = n.color === 'white' ? 'var(--ink)' : accent(n.color, theme);
  return (
    <AutoTextarea
      board={board}
      primary
      class={`text-node text-${n.size}`}
      style={{ fontSize: `${TEXT_SIZES[n.size]}px`, color }}
      value={n.text}
      placeholder="Type something"
      onInput={(v) => board.doc.patch('nodes', n.id, { text: v })}
    />
  );
}

// ---------- shape ----------

export function shapePath(shape: ShapeNode['shape'], w: number, h: number, inset = 1): string {
  const i = inset;
  const W = w - i,
    H = h - i;
  switch (shape) {
    case 'rect':
      return `M${i},${i}H${W}V${H}H${i}Z`;
    case 'rounded': {
      const r = Math.min(24, w / 4, h / 4);
      return `M${i + r},${i}H${W - r}Q${W},${i} ${W},${i + r}V${H - r}Q${W},${H} ${W - r},${H}H${i + r}Q${i},${H} ${i},${H - r}V${i + r}Q${i},${i} ${i + r},${i}Z`;
    }
    case 'ellipse':
      return `M${w / 2},${i}A${w / 2 - i},${h / 2 - i} 0 1,1 ${w / 2 - 0.01},${i}Z`;
    case 'diamond':
      return `M${w / 2},${i}L${W},${h / 2}L${w / 2},${H}L${i},${h / 2}Z`;
    case 'triangle':
      return `M${w / 2},${i}L${W},${H}H${i}Z`;
    case 'star': {
      const cx = w / 2,
        cy = h / 2,
        R = Math.min(w, h) / 2 - i,
        r = R * 0.45;
      const pts: string[] = [];
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + (k * Math.PI) / 5;
        const rr = k % 2 ? r : R;
        pts.push(`${(cx + Math.cos(a) * rr * (w / Math.min(w, h))).toFixed(1)},${(cy + Math.sin(a) * rr * (h / Math.min(w, h))).toFixed(1)}`);
      }
      return `M${pts.join('L')}Z`;
    }
  }
}

function ShapeBody({ node: n, board, theme }: Props & { node: ShapeNode }) {
  return (
    <div class="shape">
      <svg class="shape-svg" width={n.w} height={n.h} aria-hidden="true">
        <path d={shapePath(n.shape, n.w, n.h, 1.5)} fill={fill(n.color, theme)} stroke={accent(n.color, theme)} stroke-width="2" stroke-linejoin="round" />
      </svg>
      <div class="shape-label">
        <AutoTextarea board={board} primary class="shape-text" value={n.text} placeholder="" onInput={(v) => board.doc.patch('nodes', n.id, { text: v })} />
      </div>
    </div>
  );
}

// ---------- image ----------

function ImageBody({ node: n }: { node: ImageNode }) {
  const url = useImageUrl(n.imageId);
  return <div class="image">{url ? <img src={url} alt="" draggable={false} /> : <div class="img-loading" />}</div>;
}

// ---------- frame ----------

function FrameBody({ node: n, board, theme }: Props & { node: FrameNode }) {
  return (
    <div class="frame" style={{ '--frame-accent': accent(n.color, theme) }}>
      <div class="frame-label">
        <TextInput board={board} primary class="frame-title" value={n.label} placeholder="Frame" onInput={(v) => board.doc.patch('nodes', n.id, { label: v })} />
      </div>
    </div>
  );
}

