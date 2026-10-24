import { useState } from 'preact/hooks';
import type { Board } from '../board';
import { uid, type FieldType, type Template } from '../model';
import { ACCENT_COLORS, accent } from '../palette';
import { theme, useStore } from '../store';
import { ColorDots } from './chrome';
import { useDocVersion } from './hooks';
import { ArrowDownIcon, ArrowUpIcon, CloseIcon, DuplicateIcon, PlusIcon, TEMPLATE_ICONS, TemplateGlyph, TrashIcon } from './icons';

const TYPES: { id: FieldType; label: string }[] = [
  { id: 'text', label: 'Short text' },
  { id: 'longtext', label: 'Long text' },
  { id: 'select', label: 'Choice' },
  { id: 'image', label: 'Image' },
];

/** Card templates are data: this edits them per project (requirement: duplicate and edit templates). */
export function TemplateEditor({ board, onClose }: { board: Board; onClose: () => void }) {
  useDocVersion(board.doc, ['templates', 'nodes']);
  const t = useStore(theme);
  const templates = board.doc.p.templates;
  const [selId, setSelId] = useState<string | undefined>(templates[0]?.id);
  const tpl = templates.find((x) => x.id === selId) ?? templates[0];
  const usage = (id: string) => board.doc.p.nodes.filter((n) => n.kind === 'card' && n.templateId === id).length;

  const update = (patch: Partial<Template>) => tpl && board.doc.put('templates', { ...tpl, ...patch });
  const updateField = (i: number, patch: Partial<Template['fields'][number]>) => {
    if (!tpl) return;
    const fields = tpl.fields.map((f, j) => (j === i ? { ...f, ...patch } : f));
    update({ fields });
  };
  const moveField = (i: number, d: -1 | 1) => {
    if (!tpl) return;
    const fields = tpl.fields.slice();
    const j = i + d;
    if (j < 0 || j >= fields.length) return;
    [fields[i], fields[j]] = [fields[j], fields[i]];
    update({ fields });
  };
  const addField = () => {
    if (!tpl) return;
    const used = new Set(tpl.fields.map((f) => f.key));
    let key = 'new_field';
    for (let i = 2; used.has(key); i++) key = `new_field_${i}`;
    update({ fields: [...tpl.fields, { key, label: 'New field', type: 'longtext' }] });
  };
  const duplicate = () => {
    if (!tpl) return;
    const copy: Template = { ...structuredClone(tpl), id: uid(), name: `${tpl.name} copy` };
    board.doc.put('templates', copy);
    setSelId(copy.id);
  };
  const create = () => {
    const nt: Template = { id: uid(), name: 'New template', icon: 'card', color: 'gray', fields: [{ key: 'name', label: 'Name', type: 'text' }, { key: 'notes', label: 'Notes', type: 'longtext' }] };
    board.doc.put('templates', nt);
    setSelId(nt.id);
  };
  const remove = () => {
    if (!tpl) return;
    if (usage(tpl.id)) return board.notify('Templates used by cards can’t be deleted.');
    board.doc.remove('templates', [tpl.id]);
    setSelId(templates.find((x) => x.id !== tpl.id)?.id);
  };

  return (
    <div class="modal-scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div class="modal template-editor" role="dialog" aria-label="Card templates">
        <div class="modal-head">
          <h2>Card templates</h2>
          <button class="icon-btn" aria-label="Close" onClick={onClose}>
            <CloseIcon size={18} />
          </button>
        </div>
        <div class="te-body">
          <nav class="te-list">
            {templates.map((x) => (
              <button key={x.id} class={`te-item ${x.id === tpl?.id ? 'is-on' : ''}`} style={{ '--tile-accent': accent(x.color, t) }} onClick={() => setSelId(x.id)}>
                <span class="tile-icon">
                  <TemplateGlyph name={x.icon} size={18} />
                </span>
                <span class="te-item-name">{x.name}</span>
                <span class="te-item-count">{usage(x.id) || ''}</span>
              </button>
            ))}
            <button class="te-item te-new" onClick={create}>
              <span class="tile-icon">
                <PlusIcon size={18} />
              </span>
              New template
            </button>
          </nav>
          {tpl && (
            <section class="te-detail">
              <div class="te-row">
                <input class="te-name" value={tpl.name} aria-label="Template name" onInput={(e) => update({ name: (e.currentTarget as HTMLInputElement).value })} />
                <button class="icon-btn" aria-label="Duplicate template" title="Duplicate" onClick={duplicate}>
                  <DuplicateIcon size={18} />
                </button>
                <button class="icon-btn is-danger" aria-label="Delete template" title="Delete" onClick={remove}>
                  <TrashIcon size={18} />
                </button>
              </div>
              <div class="te-row te-looks">
                <div class="icon-picker">
                  {Object.keys(TEMPLATE_ICONS).map((k) => (
                    <button key={k} class={`icon-btn ${tpl.icon === k ? 'is-active' : ''}`} aria-label={k} onClick={() => update({ icon: k })}>
                      <TemplateGlyph name={k} size={18} />
                    </button>
                  ))}
                </div>
                <ColorDots colors={ACCENT_COLORS} value={tpl.color} kind="accent" onPick={(c) => update({ color: c })} />
              </div>
              <p class="te-hint">The first short-text field is the card’s title. Renaming a field keeps what cards already hold.</p>
              <div class="te-fields">
                {tpl.fields.map((f, i) => (
                  <div class="te-field" key={f.key}>
                    <input
                      class="te-field-label"
                      value={f.label}
                      aria-label="Field name"
                      onInput={(e) => updateField(i, { label: (e.currentTarget as HTMLInputElement).value })}
                    />
                    <select value={f.type} aria-label="Field type" onChange={(e) => updateField(i, { type: (e.currentTarget as HTMLSelectElement).value as FieldType })}>
                      {TYPES.map((ty) => (
                        <option key={ty.id} value={ty.id}>
                          {ty.label}
                        </option>
                      ))}
                    </select>
                    {f.type === 'select' && (
                      <input
                        class="te-options"
                        placeholder="Choices, comma separated"
                        value={(f.options ?? []).join(', ')}
                        onInput={(e) =>
                          updateField(i, {
                            options: (e.currentTarget as HTMLInputElement).value
                              .split(',')
                              .map((s) => s.trim())
                              .filter(Boolean),
                          })
                        }
                      />
                    )}
                    <div class="te-field-actions">
                      <button class="icon-btn" aria-label="Move up" disabled={i === 0} onClick={() => moveField(i, -1)}>
                        <ArrowUpIcon size={16} />
                      </button>
                      <button class="icon-btn" aria-label="Move down" disabled={i === tpl.fields.length - 1} onClick={() => moveField(i, 1)}>
                        <ArrowDownIcon size={16} />
                      </button>
                      <button class="icon-btn is-danger" aria-label="Remove field" onClick={() => update({ fields: tpl.fields.filter((_, j) => j !== i) })}>
                        <TrashIcon size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <button class="btn-secondary" onClick={addField}>
                <PlusIcon size={16} /> Add field
              </button>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

