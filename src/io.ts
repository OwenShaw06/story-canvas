import { SCHEMA_VERSION, type Project } from './model';
import { normalizeProject } from './migrate';

// JSON export/import (requirement D2). Exports carry a schemaVersion so later
// versions can migrate older files, and embed images so a backup is complete.

export type ExportFile = {
  app: 'story-canvas';
  schemaVersion: number;
  exportedAt: number;
  project: Project;
  /** Image id → data URL. */
  images?: Record<string, string>;
};

export function exportProject(p: Project, images: Record<string, string> = {}): string {
  const file: ExportFile = {
    app: 'story-canvas',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: Date.now(),
    project: p,
    ...(Object.keys(images).length ? { images } : {}),
  };
  return JSON.stringify(file);
}

export function safeName(name: string): string {
  return name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'project';
}

export function exportFilename(p: Project, ext = 'storycanvas.json'): string {
  const date = new Date().toISOString().slice(0, 10);
  return `${safeName(p.name)}-${date}.${ext}`;
}

/**
 * Parses an export file. The imported project gets a new id so it never
 * overwrites an existing project; its content is otherwise unchanged.
 */
export function importProject(json: string): { project: Project; images: Record<string, string> } {
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
  const images: Record<string, string> = {};
  if (file.images && typeof file.images === 'object') {
    for (const [k, v] of Object.entries(file.images)) if (typeof v === 'string' && v.startsWith('data:image/')) images[k] = v;
  }
  return { project: normalizeProject(file.project, { newId: true }), images };
}

export function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });
}

export async function dataUrlToBlob(url: string): Promise<Blob> {
  return (await fetch(url)).blob();
}
