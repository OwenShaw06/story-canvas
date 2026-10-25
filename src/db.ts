import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { defaultTemplates } from './templates';
import { DEFAULT_TAGS } from './suggestions';
import { emptyStructure } from './structure';
import { normalizeProject } from './migrate';
import { uid, type Project, type ProjectMeta } from './model';

interface StoryDB extends DBSchema {
  projects: { key: string; value: Project };
  projectMeta: { key: string; value: ProjectMeta; indexes: { updatedAt: number } };
  /** Images are stored as blobs and referenced from nodes by id. */
  images: { key: string; value: Blob };
  meta: { key: string; value: unknown };
}

let dbPromise: Promise<IDBPDatabase<StoryDB>> | null = null;

export function db(): Promise<IDBPDatabase<StoryDB>> {
  dbPromise ??= openDB<StoryDB>('story-canvas', 2, {
    async upgrade(d, oldVersion, _newVersion, tx) {
      if (oldVersion < 1) {
        d.createObjectStore('projects', { keyPath: 'id' });
        d.createObjectStore('images');
        d.createObjectStore('meta');
      }
      if (oldVersion < 2) {
        const metaStore = d.createObjectStore('projectMeta', { keyPath: 'id' });
        metaStore.createIndex('updatedAt', 'updatedAt');
        // Migrate phase-1 projects and build their listing entries.
        const store = tx.objectStore('projects');
        for (const raw of await store.getAll()) {
          const p = normalizeProject(raw);
          await store.put(p);
          await metaStore.put(metaFor(p));
        }
      }
    },
  });
  return dbPromise;
}

export function metaFor(p: Project, thumbnail?: string): ProjectMeta {
  return {
    id: p.id,
    name: p.name,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    cardCount: p.nodes.filter((n) => n.kind === 'card').length,
    nodeCount: p.nodes.length + p.strokes.length,
    ...(thumbnail ? { thumbnail } : {}),
    ...(p.cover ? { cover: p.cover } : {}),
    ...(p.coverAt ? { coverAt: p.coverAt } : {}),
  };
}

export function newProject(name = 'Untitled world'): Project {
  const now = Date.now();
  return {
    id: uid(),
    name,
    createdAt: now,
    updatedAt: now,
    view: { x: 0, y: 0, zoom: 1 },
    nodes: [],
    links: [],
    strokes: [],
    templates: defaultTemplates(),
    background: 'dots',
    tagPresets: [...DEFAULT_TAGS],
    structure: emptyStructure(),
  };
}

// ---------- projects ----------

/** Worlds deleted this session. A save that was already on its way (autosave, thumbnail)
 *  must never bring one back. */
const deleted = new Set<string>();

export async function saveProject(p: Project, thumbnail?: string): Promise<void> {
  if (deleted.has(p.id)) return;
  const d = await db();
  const tx = d.transaction(['projects', 'projectMeta'], 'readwrite');
  const old = await tx.objectStore('projectMeta').get(p.id);
  // The cover is set from the worlds list while an open board's copy may still be saving:
  // whichever change is newer wins, and the board's copy catches up.
  if (old?.coverAt && old.coverAt > (p.coverAt ?? 0)) {
    p.coverAt = old.coverAt;
    if (old.cover) p.cover = old.cover;
    else delete p.cover;
  }
  await Promise.all([
    tx.objectStore('projects').put(p),
    tx.objectStore('projectMeta').put(metaFor(p, thumbnail ?? old?.thumbnail)),
    tx.done,
  ]);
}

export async function loadProject(id: string): Promise<Project | undefined> {
  const raw = await (await db()).get('projects', id);
  return raw ? normalizeProject(raw) : undefined;
}

export async function listProjects(): Promise<ProjectMeta[]> {
  const all = await (await db()).getAll('projectMeta');
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function createProject(name?: string): Promise<Project> {
  const p = newProject(name);
  await saveProject(p);
  return p;
}

export async function renameProject(id: string, name: string): Promise<void> {
  const p = await loadProject(id);
  if (!p) return;
  p.name = name;
  p.updatedAt = Date.now();
  await saveProject(p);
}

/** Copies a project, including its images (so deleting one never breaks the other). */
export async function duplicateProject(id: string): Promise<Project | undefined> {
  const p = await loadProject(id);
  if (!p) return;
  const copy: Project = structuredClone(p);
  copy.id = uid();
  copy.name = `${p.name} copy`;
  copy.createdAt = copy.updatedAt = Date.now();
  const remap = new Map<string, string>();
  for (const imageId of imageIdsIn(p)) {
    const blob = await getImage(imageId);
    if (!blob) continue;
    const nid = uid();
    remap.set(imageId, nid);
    await putImage(nid, blob);
  }
  rewriteImageIds(copy, remap);
  const old = (await (await db()).get('projectMeta', id))?.thumbnail;
  await saveProject(copy, old);
  return copy;
}

/** Sets (or, with null, removes) a world's cover image. */
export async function setProjectCover(id: string, cover: string | null): Promise<void> {
  const p = await loadProject(id);
  if (!p) return;
  if (cover) p.cover = cover;
  else delete p.cover;
  p.coverAt = Date.now();
  await saveProject(p);
}

export async function deleteProject(id: string): Promise<void> {
  deleted.add(id);
  const d = await db();
  // A damaged world must still be deletable, so finding its images is best-effort.
  let imageIds = new Set<string>();
  try {
    const p = await loadProject(id);
    if (p) imageIds = imageIdsIn(p);
  } catch (e) {
    console.warn('Could not read world before deleting; its images stay behind', e);
  }
  const tx = d.transaction(['projects', 'projectMeta', 'images'], 'readwrite');
  const ops: Promise<unknown>[] = [tx.objectStore('projects').delete(id), tx.objectStore('projectMeta').delete(id)];
  for (const imageId of imageIds) ops.push(tx.objectStore('images').delete(imageId));
  await Promise.all([...ops, tx.done]);
}

export function imageIdsIn(p: Project): Set<string> {
  const ids = new Set<string>();
  for (const n of p.nodes) {
    if (n.kind === 'image') ids.add(n.imageId);
    if (n.kind === 'card') {
      const t = p.templates.find((t) => t.id === n.templateId);
      for (const f of t?.fields ?? []) if (f.type === 'image' && n.fields[f.key]) ids.add(n.fields[f.key]);
    }
  }
  return ids;
}

export function rewriteImageIds(p: Project, remap: Map<string, string>) {
  for (const n of p.nodes) {
    if (n.kind === 'image' && remap.has(n.imageId)) n.imageId = remap.get(n.imageId)!;
    if (n.kind === 'card') {
      for (const [k, v] of Object.entries(n.fields)) if (remap.has(v)) n.fields[k] = remap.get(v)!;
    }
  }
}

// ---------- images ----------

export async function putImage(id: string, blob: Blob): Promise<void> {
  await (await db()).put('images', blob, id);
}

export async function getImage(id: string): Promise<Blob | undefined> {
  return (await db()).get('images', id);
}

const urlCache = new Map<string, Promise<string | null>>();

/** An object URL for an image blob, cached for the session. */
export function imageUrl(id: string): Promise<string | null> {
  let p = urlCache.get(id);
  if (!p) {
    p = getImage(id).then((b) => (b ? URL.createObjectURL(b) : null));
    urlCache.set(id, p);
  }
  return p;
}

/** Downscales large photos so the database stays small. Returns the stored id and natural size. */
export async function storeImageFile(file: Blob, maxSide = 2048): Promise<{ id: string; w: number; h: number }> {
  const bitmap = await createImageBitmap(file);
  let { width: w, height: h } = bitmap;
  let blob: Blob = file;
  const scale = Math.min(1, maxSide / Math.max(w, h));
  if (scale < 1 || file.size > 1.5e6) {
    w = Math.round(w * scale);
    h = Math.round(h * scale);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d')!.drawImage(bitmap, 0, 0, w, h);
    const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('encode'))), type, 0.88));
  }
  bitmap.close?.();
  const id = uid();
  await putImage(id, blob);
  return { id, w, h };
}

// ---------- app meta ----------

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db()).get('meta', key) as Promise<T | undefined>;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await (await db()).put('meta', value, key);
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
 * changes, so continuous editing still saves at least every SAVE_DELAY ms
 * (requirement D1: debounced under 1 second).
 */
export const SAVE_DELAY = 400;

export class Autosaver {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lazy = false;
  private pending: Project | null = null;
  private saving: Promise<void> = Promise.resolve();
  onError: (err: unknown) => void = (e) => console.error('Autosave failed', e);
  onSaved: (p: Project) => void = () => {};

  constructor(private save: (p: Project) => Promise<void> = (p) => saveProject(p)) {}

  schedule(p: Project): void {
    p.updatedAt = Date.now();
    this.pending = p;
    // An edit always saves within SAVE_DELAY, even if a lazy (view) save is waiting.
    if (this.timer !== null && this.lazy) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.lazy = false;
    if (this.timer === null) this.timer = setTimeout(() => void this.flush(), SAVE_DELAY);
  }

  /** For pan/zoom only: save within a couple of seconds, without rushing. */
  scheduleLazy(p: Project): void {
    this.pending = p;
    if (this.timer === null) {
      this.lazy = true;
      this.timer = setTimeout(() => void this.flush(), 2000);
    }
  }

  async flush(): Promise<void> {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    const p = this.pending;
    this.pending = null;
    if (!p) return this.saving;
    this.saving = this.saving
      .then(() => this.save(p))
      .then(() => this.onSaved(p))
      .catch(this.onError);
    return this.saving;
  }

  get dirty(): boolean {
    return this.pending !== null;
  }
}
