import { SCHEMA_VERSION, uid, type Project } from './model';
import { defaultTemplates } from './templates';

// JSON export/import (requirement D2). Exports carry a schemaVersion so later
// versions of the app can migrate older files.

export type ExportFile = {
  app: 'story-canvas';
  schemaVersion: number;
  exportedAt: number;
  project: Project;
};

export function exportProject(p: Project): string {
  const file: ExportFile = {
    app: 'story-canvas',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: Date.now(),
    project: p,
  };
  return JSON.stringify(file);
}

export function exportFilename(p: Project): string {
  const safe = p.name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'project';
  const date = new Date().toISOString().slice(0, 10);
  return `${safe}-${date}.storycanvas.json`;
}

/** Migrations keyed by the version they upgrade *from*. */
const migrations: Record<number, (raw: any) => any> = {
  // 1: (raw) => ({ ...raw, newField: default }),
};

/**
 * Parses an export file. The imported project gets a new id so it never
 * overwrites an existing project; its content is otherwise unchanged.
 */
export function importProject(json: string): Project {
  let file: any;
  try {
    file = JSON.parse(json);
  } catch {
    throw new Error('This file is not valid JSON.');
  }
  if (file?.app !== 'story-canvas' || typeof file.schemaVersion !== 'number' || !file.project) {
    throw new Error('This is not a Story Canvas export.');
  }
  if (file.schemaVersion > SCHEMA_VERSION) {
    throw new Error('This file was made by a newer version of Story Canvas. Update the app first.');
  }
  let raw = file.project;
  for (let v = file.schemaVersion; v < SCHEMA_VERSION; v++) {
    const m = migrations[v];
    if (m) raw = m(raw);
  }
  return validate(raw);
}

function validate(raw: any): Project {
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  if (typeof raw !== 'object' || raw === null) throw new Error('The project in this file is empty.');
  const now = Date.now();
  return {
    id: uid(),
    name: typeof raw.name === 'string' && raw.name ? raw.name : 'Imported world',
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : now,
    updatedAt: now,
    view:
      raw.view && typeof raw.view.zoom === 'number'
        ? { x: +raw.view.x || 0, y: +raw.view.y || 0, zoom: raw.view.zoom }
        : { x: 0, y: 0, zoom: 1 },
    cards: arr(raw.cards),
    links: arr(raw.links),
    strokes: arr(raw.strokes).filter(
      (s: any) => s && typeof s.id === 'string' && Array.isArray(s.points),
    ),
    templates: arr(raw.templates).length ? raw.templates : defaultTemplates(),
  };
}
