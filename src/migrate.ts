import { defaultTemplates } from './templates';
import { uid, type BoardNode, type Project } from './model';

// Brings any stored or imported project up to the current shape. Safe to run
// on an already-current project.

const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);

export function normalizeProject(raw: any, opts: { newId?: boolean } = {}): Project {
  if (typeof raw !== 'object' || raw === null) throw new Error('The project in this file is empty.');
  const now = Date.now();

  // v1 → v2: cards became nodes; links used fromCardId/toCardId.
  const nodes: BoardNode[] = Array.isArray(raw.nodes)
    ? raw.nodes
    : arr(raw.cards).map((c: any) => ({ kind: 'card', ...c, ink: arr(c.ink), tags: arr(c.tags), fields: c.fields ?? {} }));
  const links = arr(raw.links)
    .map((l: any) => ({
      id: l.id ?? uid(),
      fromId: l.fromId ?? l.fromCardId,
      toId: l.toId ?? l.toCardId,
      style: l.style ?? 'solid',
      ...(l.label ? { label: l.label } : {}),
    }))
    .filter((l) => l.fromId && l.toId);

  const templates = arr(raw.templates).length ? raw.templates : defaultTemplates();
  // Older projects lack template icons/colors: fill them from the defaults.
  const defaults = new Map(defaultTemplates().map((t) => [t.id, t]));
  for (const t of templates) {
    const d = defaults.get(t.id);
    if (d) {
      t.icon ??= d.icon;
      t.color ??= d.color;
    }
  }

  return {
    id: opts.newId || typeof raw.id !== 'string' ? uid() : raw.id,
    name: typeof raw.name === 'string' && raw.name ? raw.name : 'Untitled world',
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'number' && !opts.newId ? raw.updatedAt : now,
    view:
      raw.view && typeof raw.view.zoom === 'number'
        ? { x: +raw.view.x || 0, y: +raw.view.y || 0, zoom: raw.view.zoom }
        : { x: 0, y: 0, zoom: 1 },
    nodes: nodes.filter((n) => n && typeof n.id === 'string' && typeof n.kind === 'string'),
    links,
    strokes: arr(raw.strokes).filter((s: any) => s && typeof s.id === 'string' && Array.isArray(s.points)),
    templates,
    background: ['dots', 'grid', 'lines', 'plain'].includes(raw.background) ? raw.background : 'dots',
  };
}
