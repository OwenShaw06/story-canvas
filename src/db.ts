import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { defaultTemplates } from './templates';
import { uid, type Project } from './model';

interface StoryDB extends DBSchema {
  projects: { key: string; value: Project };
  /** Card images (phase 4). Stored as blobs, referenced by id. */
  images: { key: string; value: Blob };
  meta: { key: string; value: unknown };
}

let dbPromise: Promise<IDBPDatabase<StoryDB>> | null = null;

export function db(): Promise<IDBPDatabase<StoryDB>> {
  dbPromise ??= openDB<StoryDB>('story-canvas', 1, {
    upgrade(d) {
      d.createObjectStore('projects', { keyPath: 'id' });
      d.createObjectStore('images');
      d.createObjectStore('meta');
    },
  });
  return dbPromise;
}

export function newProject(name = 'Untitled world'): Project {
  const now = Date.now();
  return {
    id: uid(),
    name,
    createdAt: now,
    updatedAt: now,
    view: { x: 0, y: 0, zoom: 1 },
    cards: [],
    links: [],
    strokes: [],
    templates: defaultTemplates(),
  };
}

export async function saveProject(p: Project): Promise<void> {
  await (await db()).put('projects', p);
}

export async function loadProject(id: string): Promise<Project | undefined> {
  return (await db()).get('projects', id);
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db()).get('meta', key) as Promise<T | undefined>;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await (await db()).put('meta', value, key);
}

/** Opens the last-used project, or creates the first one. */
export async function openCurrentProject(): Promise<Project> {
  const lastId = await getMeta<string>('currentProjectId');
  const existing = lastId ? await loadProject(lastId) : undefined;
  if (existing) return existing;
  const p = newProject();
  await saveProject(p);
  await setMeta('currentProjectId', p.id);
  return p;
}

/** Ask Safari not to evict our data. Mostly effective once installed to the home screen. */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

/**
 * Saves the project shortly after a change. The timer is not reset by further
 * changes, so continuous drawing still saves at least every SAVE_DELAY ms
 * (requirement D1: debounced under 1 second).
 */
export const SAVE_DELAY = 400;

export class Autosaver {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending: Project | null = null;
  private saving: Promise<void> = Promise.resolve();
  onError: (err: unknown) => void = (e) => console.error('Autosave failed', e);

  constructor(private save: (p: Project) => Promise<void> = saveProject) {}

  schedule(p: Project): void {
    p.updatedAt = Date.now();
    this.pending = p;
    if (this.timer === null) this.timer = setTimeout(() => void this.flush(), SAVE_DELAY);
  }

  async flush(): Promise<void> {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    const p = this.pending;
    this.pending = null;
    if (!p) return this.saving;
    this.saving = this.saving.then(() => this.save(p)).catch(this.onError);
    return this.saving;
  }

  get dirty(): boolean {
    return this.pending !== null;
  }
}
