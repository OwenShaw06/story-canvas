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
import { CloseIcon, CollapseIcon, DiceIcon, ExpandIcon, ImageIcon, StarIcon, TemplateGlyph } from './icons';
import { NAMEABLE, randomName } from '../suggestions';
import { tagColor } from '../tags';

type Props = {
  node: BoardNode;
  board: Board;
  template?: Template;
  theme: Theme;
  selected: boolean;
  dimmed: boolean;
  flashing: boolean;
  lifted: boolean;
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

    const cls = ['node', `node-${n.kind}`, p.selected && 'is-selected', p.dimmed && 'is-dimmed', p.flashing && 'is-flashing', p.lifted && 'is-lifted']
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
    a.flashing === b.flashing &&
    a.lifted === b.lifted,
);

// ---------- shared editing helpers ----------

function AutoTextarea(props: {
  value: string;
  onInput: (v: string) => void;
  placeholder?: string;
  class?: string;
  board: Board;
  primary?: boolean;
  field?: string;
  onBlur?: () => void;
  onFocus?: () => void;
  style?: Record<string, string | number>;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
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
      onFocus={props.onFocus}
      onBlur={() => {
        props.board.doc.sealMerge();
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
  onFocus?: () => void;
}) {
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
      onFocus={props.onFocus}
      onBlur={() => {
        props.board.doc.sealMerge();
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
  const setField = (key: string, v: string) => board.doc.type('nodes', n.id, { fields: { ...n.fields, [key]: v } }, `${n.id}:${key}`);
  const [tagDraft, setTagDraft] = useState('');
  const [revealed, setRevealed] = useState<string | null>(null);
  /** Which field is being edited ('#title', '#tags' or a field key), for its suggestion row. */
  const [focused, setFocused] = useState<string | null>(null);
  const blurred = (key: string) => setFocused((f) => (f === key ? null : f));
  // Filled fields show; empty ones collapse into "+ Field" chips while selected.
  const shown = rest.filter((f) => n.fields[f.key] || f.key === revealed);
  const empty = rest.filter((f) => !shown.includes(f));
  const reveal = (key: string, type: string) => {
    setRevealed(key);
    if (type === 'text' || type === 'longtext') focusNodeSoon(n.id, `[data-field="${key}"]`);
  };
  const hideIfEmpty = (key: string) => {
    blurred(key);
    if (!n.fields[key] && revealed === key) setRevealed(null);
  };
  const saveSuggestion = (key: string, value: string) => {
    if (!t) return;
    board.doc.put('templates', {
      ...t,
      fields: t.fields.map((f) => (f.key === key ? { ...f, suggestions: [...(f.suggestions ?? []), value] } : f)),
    });
    board.notify(`Saved “${value}” as a suggestion`);
  };
  const projectTags = [...new Set([...board.doc.p.tagPresets, ...board.doc.p.nodes.flatMap((x) => (x.kind === 'card' ? x.tags : []))])];

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
              onFocus={() => setFocused('#title')}
              onBlur={() => blurred('#title')}
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
      {focused === '#title' && titleField && t && NAMEABLE.has(t.id) && (
        <div class="suggest-row suggest-title">
          <button
            data-btn
            data-keep-focus
            class="suggest-chip is-dice"
            onClick={() => setField(titleField.key, randomName(t.id, n.fields.type ?? ''))}
          >
            <DiceIcon size={15} /> Random name
          </button>
        </div>
      )}

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
                  onFocus={() => setFocused(f.key)}
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
                  onFocus={() => setFocused(f.key)}
                  onBlur={() => hideIfEmpty(f.key)}
                />
              )}
              {focused === f.key && (f.type === 'text' || f.type === 'longtext') && (
                <SuggestRow
                  items={f.suggestions ?? []}
                  value={n.fields[f.key] ?? ''}
                  multi={!!f.multi}
                  onChange={(v) => setField(f.key, v)}
                  onSave={(v) => saveSuggestion(f.key, v)}
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
              <span class="tag" key={tag} style={{ '--tag-color': tagColor(tag, theme) }}>
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
                onFocus={() => setFocused('#tags')}
                onBlur={() => {
                  addTag();
                  blurred('#tags');
                }}
              />
            )}
          </div>
          {focused === '#tags' && (
            <div class="suggest-row">
              {projectTags
                .filter((g) => !n.tags.includes(g) && g.toLowerCase().includes(tagDraft.trim().replace(/^#/, '').toLowerCase()))
                .slice(0, 16)
                .map((g) => (
                  <button
                    key={g}
                    data-btn
                    data-keep-focus
                    class="suggest-chip is-tag"
                    style={{ '--tag-color': tagColor(g, theme) }}
                    onClick={() => {
                      setTagDraft('');
                      board.doc.patch('nodes', n.id, { tags: [...n.tags, g] });
                    }}
                  >
                    #{g}
                  </button>
                ))}
            </div>
          )}
        </div>
      )}
      {!n.collapsed && <NodeInk ink={n.ink} theme={theme} />}
    </div>
  );
}

/** Quick picks under the field being edited. Tap to fill; list fields collect several. */
function SuggestRow(props: { items: string[]; value: string; multi: boolean; onChange: (v: string) => void; onSave: (v: string) => void }) {
  const [more, setMore] = useState(false);
  const parts = props.value
    .split(/\s*,\s*/)
    .map((x) => x.trim())
    .filter(Boolean);
  const has = (item: string) => (props.multi ? parts.some((x) => x.toLowerCase() === item.toLowerCase()) : props.value.trim() === item);
  const toggle = (item: string) => {
    if (!props.multi) return props.onChange(has(item) ? '' : item);
    const next = has(item) ? parts.filter((x) => x.toLowerCase() !== item.toLowerCase()) : [...parts, item];
    props.onChange(next.join(', '));
  };
  // Offer to save what you typed (the last item, for list fields) as a new suggestion.
  const candidate = (props.multi ? parts[parts.length - 1] : props.value.trim()) ?? '';
  const canSave = !!candidate && candidate.length <= 40 && !props.items.some((x) => x.toLowerCase() === candidate.toLowerCase());
  const LIMIT = 12;
  const shown = more ? props.items : props.items.slice(0, LIMIT);
  if (!props.items.length && !canSave) return null;
  return (
    <div class="suggest-row">
      {shown.map((item) => (
        <button key={item} data-btn data-keep-focus class={`suggest-chip ${has(item) ? 'is-on' : ''}`} onClick={() => toggle(item)}>
          {item}
        </button>
      ))}
      {!more && props.items.length > LIMIT && (
        <button data-btn data-keep-focus class="suggest-chip is-more" onClick={() => setMore(true)}>
          +{props.items.length - LIMIT} more
        </button>
      )}
      {canSave && (
        <button data-btn data-keep-focus class="suggest-chip is-save" onClick={() => props.onSave(candidate)} title="Save as a suggestion for this field">
          <StarIcon size={13} /> Save “{candidate}”
        </button>
      )}
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
        onInput={(v) => board.doc.type('nodes', n.id, { text: v }, `${n.id}:text`)}
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
      onInput={(v) => board.doc.type('nodes', n.id, { text: v }, `${n.id}:text`)}
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
        <AutoTextarea board={board} primary class="shape-text" value={n.text} placeholder="" onInput={(v) => board.doc.type('nodes', n.id, { text: v }, `${n.id}:text`)} />
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
        <TextInput board={board} primary class="frame-title" value={n.label} placeholder="Frame" onInput={(v) => board.doc.type('nodes', n.id, { label: v }, `${n.id}:label`)} />
      </div>
    </div>
  );
}

