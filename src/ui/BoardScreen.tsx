import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Board } from '../board';
import { Controller } from '../controller';
import { Autosaver, putImage, saveProject } from '../db';
import { Doc } from '../doc';
import { CanvasEngine } from '../engine/engine';
import { renderBoard } from '../export';
import { dataUrlToBlob, importProject } from '../io';
import type { Project } from '../model';
import { store, theme, useStore } from '../store';
import { ContextBar } from './ContextBar';
import { Dock, TopBar, ZoomControl } from './chrome';
import { useDocVersion } from './hooks';
import { NodeView } from './nodes';
import { LinksLayer, SelectionOverlay } from './overlays';
import { BoardMenu, SearchPanel, TagPanel } from './panels';
import { TemplateEditor } from './TemplateEditor';
import { CardIcon, PenIcon, PlusIcon } from './icons';

export function BoardScreen({ project, onExit, onOpen }: { project: Project; onExit: () => void; onOpen: (p: Project) => void }) {
  const board = useMemo(() => new Board(new Doc(project)), [project]);
  const containerRef = useRef<HTMLDivElement>(null);
  const belowRef = useRef<HTMLDivElement>(null);
  const inkRef = useRef<HTMLDivElement>(null);
  const aboveRef = useRef<HTMLDivElement>(null);
  const [controller, setController] = useState<Controller | null>(null);
  const viewTick = useMemo(() => store(0), [board]);
  const insertOpen = useMemo(() => store(false), [board]);
  const [panel, setPanel] = useState<string | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const saver = useMemo(() => new Autosaver(), [board]);
  const menuRef = useRef<HTMLButtonElement>(null);
  const tagRef = useRef<HTMLButtonElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const toast = useStore(board.toast);

  useEffect(() => {
    const engine = new CanvasEngine(containerRef.current!, [belowRef.current!, aboveRef.current!], inkRef.current!, board.doc);
    board.engine = engine;
    if (import.meta.env.DEV) (window as unknown as { __board: Board }).__board = board;
    engine.onViewChange = () => viewTick.set((v) => v + 1);
    const ctrl = new Controller(board, containerRef.current!);
    setController(ctrl);
    saver.onError = () => board.notify('Could not save. Export a backup from the menu.');
    const unsub = board.doc.subscribe((changed) => {
      if (changed.size === 1 && changed.has('view')) saver.scheduleLazy(board.doc.p);
      else saver.schedule(board.doc.p);
    });
    viewTick.set((v) => v + 1);

    const flush = () => void saver.flush();
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        flush();
        void saveThumbnail(board.doc.p);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', flush);
      unsub();
      ctrl.destroy();
      engine.destroy();
      void saver.flush().then(() => saveThumbnail(board.doc.p));
    };
  }, [board]);

  // Leaving select mode clears handles; ink tools should never show them.
  const tool = useStore(board.tool);
  useEffect(() => {
    if (containerRef.current) containerRef.current.dataset.tool = tool;
  }, [tool]);

  const exit = async () => {
    (document.activeElement as HTMLElement | null)?.blur?.();
    await saver.flush();
    onExit();
  };

  const onImportFile = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    try {
      const { project: p, images } = importProject(await f.text());
      for (const [id, url] of Object.entries(images)) await putImage(id, await dataUrlToBlob(url));
      await saveProject(p);
      await saver.flush();
      onOpen(p);
    } catch (err) {
      board.notify((err as Error).message || 'Import failed.');
    }
  };

  return (
    <div class="board-screen">
      <div class="canvas" ref={containerRef} data-tool={tool}>
        <div class="world below" ref={belowRef}>
          <NodesLayer board={board} />
        </div>
        <div class="ink-host" ref={inkRef} />
        <div class="world above" ref={aboveRef}>
          <SelectionOverlay board={board} />
        </div>
        <EmptyHint board={board} onInsert={() => insertOpen.set(true)} />
      </div>

      <TopBar board={board} onExit={exit} panel={panel} setPanel={setPanel} menuRef={menuRef} tagRef={tagRef} />
      <ContextBar board={board} viewTick={viewTick} />
      <Dock board={board} controller={controller} insertOpen={insertOpen} />
      <ZoomControl board={board} view={viewTick} />

      {panel === 'search' && <SearchPanel board={board} onClose={() => setPanel(null)} />}
      {panel === 'tags' && <TagPanel board={board} onClose={() => setPanel(null)} anchor={tagRef} />}
      {panel === 'menu' && (
        <BoardMenu
          board={board}
          anchor={menuRef}
          onClose={() => setPanel(null)}
          onTemplates={() => setTemplatesOpen(true)}
          onImport={() => importRef.current?.click()}
          flush={() => saver.flush()}
        />
      )}
      {templatesOpen && <TemplateEditor board={board} onClose={() => setTemplatesOpen(false)} />}
      <input ref={importRef} type="file" accept=".json,application/json" hidden onChange={onImportFile} />
      {toast && (
        <div class="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

function NodesLayer({ board }: { board: Board }) {
  useDocVersion(board.doc, ['nodes', 'templates']);
  const sel = useStore(board.selection);
  const flash = useStore(board.flash);
  const filter = useStore(board.tagFilter);
  const t = useStore(theme);
  const selected = new Set(sel.nodes);
  const templates = new Map(board.doc.p.templates.map((x) => [x.id, x]));
  const view = (n: (typeof board.doc.p.nodes)[number]) => (
        <NodeView
          key={n.id}
          node={n}
          board={board}
          template={n.kind === 'card' ? templates.get(n.templateId) : undefined}
          theme={t}
          selected={selected.has(n.id)}
          dimmed={filter.length > 0 && !(n.kind === 'card' && n.tags.some((g) => filter.includes(g)))}
          flashing={flash === n.id}
        />
  );
  // Frames, then connectors, then everything else.
  const nodes = board.doc.p.nodes;
  return (
    <>
      {nodes.filter((n) => n.kind === 'frame').map(view)}
      <LinksLayer board={board} />
      {nodes.filter((n) => n.kind !== 'frame').map(view)}
    </>
  );
}

function EmptyHint({ board, onInsert }: { board: Board; onInsert: () => void }) {
  useDocVersion(board.doc, ['nodes', 'strokes']);
  if (board.doc.p.nodes.length || board.doc.p.strokes.length) return null;
  return (
    <div class="empty-hint">
      <h2>A blank page for your world</h2>
      <div class="empty-rows">
        <span>
          <PenIcon size={18} /> Draw with Apple Pencil
        </span>
        <span>
          <CardIcon size={18} /> Add characters, places and plot cards
        </span>
        <span>
          <PlusIcon size={18} /> Tap <button class="inline-btn" data-btn onClick={onInsert}>Insert</button> to begin
        </span>
      </div>
      <p>One finger moves, two fingers zoom. Two-finger tap to undo.</p>
    </div>
  );
}

async function saveThumbnail(p: Project) {
  try {
    const c = await renderBoard(p, { maxSide: 480, scale: 1, theme: theme.get(), pad: 32 });
    const url = c.toDataURL('image/jpeg', 0.78);
    await saveProject(p, url);
  } catch (e) {
    console.warn('Thumbnail failed', e);
  }
}
