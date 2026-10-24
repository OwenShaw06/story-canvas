import { useEffect, useRef, useState } from 'preact/hooks';
import { createProject, deleteProject, duplicateProject, listProjects, loadProject, putImage, renameProject, saveProject } from '../db';
import { dataUrlToBlob, importProject } from '../io';
import type { Project, ProjectMeta } from '../model';
import { BookIcon, DuplicateIcon, EditIcon, MoreIcon, PlusIcon, TrashIcon, UploadIcon } from './icons';
import { Popover } from './Popover';

function ago(t: number): string {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`;
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** The world list (requirement O1). */
export function Home({ onOpen }: { onOpen: (p: Project) => void }) {
  const [list, setList] = useState<ProjectMeta[] | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<ProjectMeta | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const anchors = useRef(new Map<string, HTMLElement>());

  const refresh = () => listProjects().then(setList).catch(() => setError('Story Canvas could not open its storage. Private browsing can cause this.'));
  useEffect(() => void refresh(), []);

  const open = async (id: string) => {
    const p = await loadProject(id);
    if (p) onOpen(p);
  };
  const create = async () => onOpen(await createProject());

  const onImport = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    try {
      const { project, images } = importProject(await f.text());
      for (const [id, url] of Object.entries(images)) await putImage(id, await dataUrlToBlob(url));
      await saveProject(project);
      onOpen(project);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div class="home">
      <header class="home-head">
        <div>
          <div class="home-eyebrow">Story Canvas</div>
          <h1>Your worlds</h1>
        </div>
        <div class="home-actions">
          <button class="btn-secondary" onClick={() => importRef.current?.click()}>
            <UploadIcon size={18} /> Open backup
          </button>
          <button class="btn-primary" onClick={create}>
            <PlusIcon size={18} /> New world
          </button>
        </div>
      </header>
      {error && <div class="home-error">{error}</div>}
      <div class="world-grid">
        <button class="world-tile world-new" onClick={create}>
          <span class="world-new-icon">
            <PlusIcon size={30} />
          </span>
          <span>New world</span>
        </button>
        {list?.map((m) => (
          <div class="world-tile" key={m.id}>
            <button class="world-thumb" onClick={() => open(m.id)} aria-label={`Open ${m.name}`}>
              {m.thumbnail ? (
                <img src={m.thumbnail} alt="" draggable={false} />
              ) : (
                <span class="world-thumb-empty">
                  <BookIcon size={34} />
                </span>
              )}
            </button>
            <div class="world-meta">
              {renaming === m.id ? (
                <input
                  class="world-rename"
                  value={m.name}
                  ref={(el) => el?.focus()}
                  onBlur={async (e) => {
                    const v = (e.currentTarget as HTMLInputElement).value.trim();
                    setRenaming(null);
                    if (v && v !== m.name) {
                      await renameProject(m.id, v);
                      void refresh();
                    }
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
                />
              ) : (
                <div class="world-name" onDblClick={() => setRenaming(m.id)}>
                  {m.name}
                </div>
              )}
              <div class="world-sub">
                {m.cardCount} {m.cardCount === 1 ? 'card' : 'cards'} · {ago(m.updatedAt)}
              </div>
            </div>
            <button
              class="icon-btn world-more"
              aria-label={`Options for ${m.name}`}
              ref={(el) => {
                if (el) anchors.current.set(m.id, el);
              }}
              onClick={() => setMenu(menu === m.id ? null : m.id)}
            >
              <MoreIcon size={20} />
            </button>
            <Popover open={menu === m.id} onClose={() => setMenu(null)} class="menu world-menu" anchor={{ current: anchors.current.get(m.id) ?? null }}>
              <button class="menu-item" onClick={() => (setMenu(null), setRenaming(m.id))}>
                <EditIcon size={18} /> Rename
              </button>
              <button
                class="menu-item"
                onClick={async () => {
                  setMenu(null);
                  await duplicateProject(m.id);
                  void refresh();
                }}
              >
                <DuplicateIcon size={18} /> Duplicate
              </button>
              <button
                class="menu-item is-danger"
                onClick={() => {
                  setMenu(null);
                  setConfirming(m);
                }}
              >
                <TrashIcon size={18} /> Delete…
              </button>
            </Popover>
          </div>
        ))}
      </div>
      {list && !list.length && <p class="home-empty">Start your first world. Each book or setting gets its own board.</p>}
      {confirming && (
        <ConfirmDelete
          name={confirming.name}
          onCancel={() => setConfirming(null)}
          onConfirm={async () => {
            const id = confirming.id;
            setConfirming(null);
            // Hide it straight away; the list reloads from storage once the delete lands.
            setList((l) => l?.filter((x) => x.id !== id) ?? l);
            try {
              await deleteProject(id);
            } catch (err) {
              setError(`Could not delete: ${(err as Error).message || 'storage error'}`);
            }
            void refresh();
          }}
        />
      )}
      <input ref={importRef} type="file" accept=".json,application/json" hidden onChange={onImport} />
    </div>
  );
}

/** In-app confirmation. Safari on iPad can silently block window.confirm, so we don't use it. */
function ConfirmDelete(props: { name: string; onCancel: () => void; onConfirm: () => void }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onCancel();
      if (e.key === 'Enter') props.onConfirm();
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, []);
  return (
    <div class="modal-scrim" onPointerDown={(e) => e.target === e.currentTarget && props.onCancel()}>
      <div class="confirm-dialog" role="alertdialog" aria-labelledby="confirm-title">
        <h2 id="confirm-title">Delete “{props.name}”?</h2>
        <p>This can’t be undone. Export a backup first if you might want it later.</p>
        <div class="confirm-actions">
          <button class="btn-secondary" onClick={props.onCancel}>
            Cancel
          </button>
          <button class="btn-primary btn-danger" onClick={props.onConfirm}>
            <TrashIcon size={18} /> Delete
          </button>
        </div>
      </div>
    </div>
  );
}
