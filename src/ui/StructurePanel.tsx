import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { Board } from '../board';
import {
  ADDON_IDS,
  GENRES,
  MODULE_BY_ID,
  activeModules,
  isDone,
  itemsOf,
  nextUp,
  progress,
  tableRows,
  withModule,
  type StructureItem,
  type StructureModule,
  type StructureState,
} from '../structure';
import { useDocVersion } from './hooks';
import { CheckIcon, ChevronDownIcon, CloseIcon, PlusIcon, TrashIcon } from './icons';

/**
 * The story structure checklist (from the Fiction Structure Template):
 * Core sections for every book, plus genre add-ons stacked on top.
 */
export function StructurePanel({ board, onClose }: { board: Board; onClose: () => void }) {
  useDocVersion(board.doc, ['meta']);
  const s = board.doc.p.structure;
  const set = (next: StructureState) => board.doc.setMeta({ structure: next });
  const modules = activeModules(s);
  const next = nextUp(s);
  const [open, setOpen] = useState<Set<string>>(() => new Set([next ? moduleOf(next.id) : 'core1']));
  const [showAddons, setShowAddons] = useState(s.modules.length === 0);
  const [showOrder, setShowOrder] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  const totals = modules.reduce(
    (acc, m) => {
      const p = progress(s, m);
      return { done: acc.done + p.done, total: acc.total + p.total };
    },
    { done: 0, total: 0 },
  );

  const toggleOpen = (id: string) => {
    const n = new Set(open);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setOpen(n);
  };

  const goTo = (item: StructureItem) => {
    const mid = moduleOf(item.id);
    setOpen((o) => new Set(o).add(mid));
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const el = bodyRef.current?.querySelector<HTMLElement>(`[data-item="${CSS.escape(item.id)}"]`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el?.classList.add('is-flash');
        setTimeout(() => el?.classList.remove('is-flash'), 1400);
        el?.querySelector<HTMLElement>('textarea, input')?.focus({ preventScroll: true });
      }),
    );
  };

  const genreOn = (mods: string[]) => mods.every((m) => s.modules.includes(m));
  const toggleGenre = (mods: string[]) => {
    let next = s.modules;
    const on = genreOn(mods);
    for (const m of mods) next = withModule(next, m, !on);
    set({ ...s, modules: next });
  };

  return (
    <aside class="side-panel structure-panel glass" aria-label="Story structure">
      <div class="panel-head structure-head">
        <Ring done={totals.done} total={totals.total} />
        <div class="structure-titles">
          <h2>Story structure</h2>
          <span>
            {totals.done} of {totals.total} boxes
          </span>
        </div>
        <button class="icon-btn" aria-label="Close" onClick={onClose}>
          <CloseIcon size={18} />
        </button>
      </div>

      <div class="panel-body structure-body" ref={bodyRef}>
        {next && (
          <button class="next-up" onClick={() => goTo(next)}>
            <span class="next-up-kicker">Next up</span>
            <span class="next-up-label">{next.label}</span>
            <span class="next-up-where">{MODULE_BY_ID.get(moduleOf(next.id))?.title}</span>
          </button>
        )}
        {!next && totals.total > 0 && <div class="next-up is-done">Every box is filled or skipped. Run the Structure check again after the first draft.</div>}

        <section class="genre-picker">
          <div class="sp-row">
            <span class="sp-title">Genre</span>
            <button class="link-btn" onClick={() => setShowAddons(!showAddons)}>
              {showAddons ? 'Hide add-ons' : 'All add-ons'}
            </button>
          </div>
          <div class="genre-chips">
            {GENRES.map((g) => (
              <button key={g.id} class={`chip ${genreOn(g.modules) ? 'is-on' : ''}`} onClick={() => toggleGenre(g.modules)}>
                {g.label}
              </button>
            ))}
          </div>
          {showAddons && (
            <div class="addon-list">
              {ADDON_IDS.map((id) => {
                const m = MODULE_BY_ID.get(id)!;
                const on = s.modules.includes(id);
                return (
                  <button key={id} class={`addon ${on ? 'is-on' : ''}`} role="switch" aria-checked={on} onClick={() => set({ ...s, modules: withModule(s.modules, id, !on) })}>
                    <span class="addon-box">{on && <CheckIcon size={14} />}</span>
                    <span class="addon-text">
                      <span class="addon-name">
                        {m.title}
                        {m.stackOn && <em> · on {MODULE_BY_ID.get(m.stackOn)?.title}</em>}
                      </span>
                      {(m.promise || m.intro) && <span class="addon-promise">{m.promise ?? m.intro}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          <button class="link-btn fill-order-toggle" onClick={() => setShowOrder(!showOrder)}>
            {showOrder ? 'Hide fill order' : 'Fill order that saves the most rewriting'}
          </button>
          {showOrder && (
            <ol class="fill-order">
              <li>One-line pitch</li>
              <li>Protagonist want, need, and lie</li>
              <li>The ending (climax + final image)</li>
              <li>The beat sheet, working backward from the ending</li>
              <li>Genre modules</li>
              <li>Everything else</li>
            </ol>
          )}
        </section>

        {modules.map((m) => (
          <ModuleSection key={m.id} board={board} m={m} s={s} set={set} open={open.has(m.id)} onToggle={() => toggleOpen(m.id)} />
        ))}

        <p class="structure-foot">
          The beats and percentages are guides, not law. If a box doesn't apply, skip it. If you can't fill a box that does apply, that's a gap in the story, not the
          template.
        </p>
      </div>
    </aside>
  );
}

const moduleOf = (itemId: string) => itemId.split('.')[0];

function Ring({ done, total }: { done: number; total: number }) {
  const r = 17;
  const c = 2 * Math.PI * r;
  const f = total ? done / total : 0;
  return (
    <svg class="ring" width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">
      <circle cx="22" cy="22" r={r} class="ring-track" />
      <circle cx="22" cy="22" r={r} class="ring-fill" stroke-dasharray={`${c * f} ${c}`} transform="rotate(-90 22 22)" />
      <text x="22" y="22" text-anchor="middle" dominant-baseline="central">
        {Math.round(f * 100)}%
      </text>
    </svg>
  );
}

function ModuleSection(props: {
  board: Board;
  m: StructureModule;
  s: StructureState;
  set: (s: StructureState) => void;
  open: boolean;
  onToggle: () => void;
}) {
  const { m, s, set } = props;
  const p = progress(s, m);
  const complete = p.done === p.total;
  return (
    <section class={`sp-module ${props.open ? 'is-open' : ''} ${m.kind === 'addon' ? 'is-addon' : ''}`}>
      <button class="sp-module-head" onClick={props.onToggle} aria-expanded={props.open}>
        <span class={`sp-count ${complete ? 'is-complete' : ''}`}>{complete ? <CheckIcon size={14} /> : `${p.done}/${p.total}`}</span>
        <span class="sp-module-title">
          {m.kind === 'core' && <span class="sp-kicker">Core {m.id.slice(4)}</span>}
          {m.kind === 'addon' && <span class="sp-kicker">Add-on</span>}
          {m.title}
        </span>
        <span class="sp-chevron">
          <ChevronDownIcon size={18} />
        </span>
      </button>
      <div class="sp-bar">
        <span style={{ width: `${p.total ? (p.done / p.total) * 100 : 0}%` }} />
      </div>
      {props.open && (
        <div class="sp-module-body">
          {m.promise && (
            <p class="sp-promise">
              <strong>Promise:</strong> {m.promise}
            </p>
          )}
          {m.intro && <p class="sp-intro">{m.intro}</p>}
          {m.groups.map((g, gi) => (
            <div class="sp-group" key={gi}>
              {g.title && <h4>{g.title}</h4>}
              {g.note && <p class="sp-intro">{g.note}</p>}
              {g.items.map((it, i) => (
                <Item key={it.id} item={it} index={i} s={s} set={set} />
              ))}
            </div>
          ))}
          {m.id === 'core3' && (
            <button class="btn-secondary sp-board-btn" onClick={() => props.board.addBeatSheet(itemsOf(m).map((it) => ({ label: it.label, pct: it.pct ?? '', hint: it.hint ?? '', answer: s.answers[it.id] ?? '' })))}>
              <PlusIcon size={16} /> Put the beat sheet on the board
            </button>
          )}
          {m.hooks && (
            <div class="sp-callout is-hooks">
              <strong>Structure hooks</strong>
              {m.hooks}
            </div>
          )}
          {m.traps && (
            <div class="sp-callout is-traps">
              <strong>Traps</strong>
              {m.traps}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Item({ item, index, s, set }: { item: StructureItem; index: number; s: StructureState; set: (s: StructureState) => void }) {
  const done = isDone(s, item);
  const skipped = !!s.skipped[item.id];
  const setAnswer = (v: string) => set({ ...s, answers: { ...s.answers, [item.id]: v } });
  const toggleSkip = () => set({ ...s, skipped: { ...s.skipped, [item.id]: !skipped } });

  if (item.type === 'check') {
    const on = !!s.checks[item.id];
    return (
      <button data-item={item.id} class={`sp-check ${on ? 'is-on' : ''}`} role="checkbox" aria-checked={on} onClick={() => set({ ...s, checks: { ...s.checks, [item.id]: !on } })}>
        <span class="addon-box">{on && <CheckIcon size={14} />}</span>
        <span>{item.label}</span>
      </button>
    );
  }

  return (
    <div data-item={item.id} class={`sp-item ${done ? 'is-done' : ''} ${skipped ? 'is-skipped' : ''} ${item.type === 'beat' ? 'is-beat' : ''}`}>
      <div class="sp-item-head">
        <span class="sp-dot">{done ? <CheckIcon size={11} /> : item.type === 'beat' ? index + 1 : ''}</span>
        <span class="sp-label">{item.label}</span>
        {item.pct && <span class="sp-pct">{item.pct}</span>}
        <button class="sp-skip" onClick={toggleSkip}>
          {skipped ? 'Skipped' : 'Skip'}
        </button>
      </div>
      {item.hint && <p class="sp-hint">{item.hint}</p>}
      {!skipped && item.type === 'table' && <Table item={item} s={s} set={set} />}
      {!skipped && item.type !== 'table' && (
        <Grow value={s.answers[item.id] ?? ''} onInput={setAnswer} placeholder={item.type === 'beat' ? 'Your story…' : 'Your answer…'} single={item.type === 'text'} />
      )}
    </div>
  );
}

function Grow(props: { value: string; onInput: (v: string) => void; placeholder: string; single?: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fit = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
  };
  useLayoutEffect(fit, [props.value]);
  useEffect(fit, []);
  return (
    <textarea
      ref={ref}
      class="sp-input"
      rows={props.single ? 1 : 2}
      value={props.value}
      placeholder={props.placeholder}
      onInput={(e) => {
        props.onInput((e.currentTarget as HTMLTextAreaElement).value);
        fit();
      }}
    />
  );
}

function Table({ item, s, set }: { item: StructureItem; s: StructureState; set: (s: StructureState) => void }) {
  const cols = item.columns ?? [];
  const rows = tableRows(s, item);
  const save = (next: string[][]) => set({ ...s, tables: { ...s.tables, [item.id]: next } });
  const setCell = (r: number, c: number, v: string) => save(rows.map((row, i) => (i === r ? row.map((x, j) => (j === c ? v : x)) : row)));
  return (
    <div class="sp-table">
      {rows.map((row, r) => (
        <div class="sp-table-row" key={r}>
          {cols.map((col, ci) => (
            <label class={`sp-cell ${ci === 0 ? 'is-first' : ''}`} key={ci}>
              <span>{col}</span>
              <input value={row[ci] ?? ''} onInput={(e) => setCell(r, ci, (e.currentTarget as HTMLInputElement).value)} />
            </label>
          ))}
          <button class="icon-btn sp-row-x" aria-label="Remove row" onClick={() => save(rows.filter((_, i) => i !== r))}>
            <TrashIcon size={15} />
          </button>
        </div>
      ))}
      <button class="sp-add-row" onClick={() => save([...rows, cols.map(() => '')])}>
        <PlusIcon size={14} /> Add {cols[0]?.toLowerCase() ?? 'row'}
      </button>
    </div>
  );
}
