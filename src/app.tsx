import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { CanvasEngine, type EngineState, type Tool } from './engine/engine';
import { Autosaver, openCurrentProject, requestPersistence, saveProject, setMeta } from './db';
import { exportFilename, exportProject, importProject } from './io';
import { INK_AUTO, type Project } from './model';
import { EraserIcon, HighlighterIcon, MenuIcon, PenIcon, RedoIcon, UndoIcon } from './icons';

type InkTool = 'pen' | 'highlighter';

const COLORS: Record<InkTool, { value: string; label: string }[]> = {
  pen: [
    { value: INK_AUTO, label: 'Ink' },
    { value: '#d1453b', label: 'Red' },
    { value: '#2f6fd6', label: 'Blue' },
    { value: '#2f9e5b', label: 'Green' },
    { value: '#e08a1e', label: 'Orange' },
    { value: '#8a4fd1', label: 'Purple' },
  ],
  highlighter: [
    { value: '#f5d90a', label: 'Yellow' },
    { value: '#7ee081', label: 'Green' },
    { value: '#ff8fc7', label: 'Pink' },
    { value: '#7cc4ff', label: 'Blue' },
  ],
};

/** Widths in screen pixels at the zoom the stroke is drawn at. */
const SIZES: Record<InkTool, number[]> = {
  pen: [1.5, 3, 6],
  highlighter: [12, 20, 32],
};

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeLocal(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode: ignore */
  }
}

export function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<CanvasEngine | null>(null);
  const projectRef = useRef<Project | null>(null);
  const saverRef = useRef(new Autosaver());

  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>('pen');
  const [colors, setColors] = useState<Record<InkTool, string>>({ pen: INK_AUTO, highlighter: '#f5d90a' });
  const [sizes, setSizes] = useState<Record<InkTool, number>>({ pen: 1, highlighter: 1 });
  const [engineState, setEngineState] = useState<EngineState>({ canUndo: false, canRedo: false, zoom: 1 });
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [showInstall, setShowInstall] = useState(() => !isStandalone() && readLocal('installDismissed') !== '1');
  const fileInput = useRef<HTMLInputElement>(null);

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 3500);
  };

  // Load the project and start the canvas.
  useEffect(() => {
    let cancelled = false;
    const saver = saverRef.current;
    saver.onError = (e) => {
      console.error(e);
      flash('Could not save. Export a backup from the menu.');
    };
    openCurrentProject()
      .then((p) => {
        if (cancelled || !containerRef.current) return;
        projectRef.current = p;
        engineRef.current = new CanvasEngine(containerRef.current, p, {
          onState: setEngineState,
          onChange: () => projectRef.current && saver.schedule(projectRef.current),
        });
        setReady(true);
      })
      .catch((e) => {
        console.error(e);
        setLoadError('Story Canvas could not open its storage. Private browsing can cause this.');
      });
    void requestPersistence();

    // Save immediately when the app is hidden or closed.
    const flush = () => void saver.flush();
    const onVisibility = () => document.visibilityState === 'hidden' && flush();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
      flush();
      engineRef.current?.destroy();
      engineRef.current = null;
    };
  }, []);

  // Push tool settings into the engine.
  useEffect(() => {
    const e = engineRef.current;
    if (!e) return;
    e.tool = tool;
    if (tool !== 'eraser') {
      e.color = colors[tool];
      e.size = SIZES[tool][sizes[tool]];
    }
  }, [ready, tool, colors, sizes]);

  async function handleExport() {
    setMenuOpen(false);
    const p = projectRef.current;
    if (!p) return;
    await saverRef.current.flush();
    const name = exportFilename(p);
    const blob = new Blob([exportProject(p)], { type: 'application/json' });
    const file = new File([blob], name, { type: 'application/json' });
    // On iPad, the share sheet ("Save to Files") is more reliable than a download link.
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: p.name });
        return;
      } catch (err) {
        if ((err as DOMException).name === 'AbortError') return;
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  async function handleImportFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    try {
      const p = importProject(await f.text());
      const ok = window.confirm(
        `Open "${p.name}" (${p.strokes.length} strokes)? Your current world stays saved on this iPad.`,
      );
      if (!ok) return;
      await saverRef.current.flush();
      await saveProject(p);
      await setMeta('currentProjectId', p.id);
      projectRef.current = p;
      engineRef.current?.setProject(p);
      flash(`Opened "${p.name}".`);
    } catch (err) {
      flash((err as Error).message || 'Import failed.');
    }
  }

  function dismissInstall() {
    writeLocal('installDismissed', '1');
    setShowInstall(false);
  }

  const inkTool: InkTool | null = tool === 'eraser' ? null : tool;
  const lastInkToolRef = useRef<InkTool>('pen');
  if (inkTool) lastInkToolRef.current = inkTool;
  const lastInkTool = lastInkToolRef.current;

  return (
    <div class="app">
      <div class="canvas" ref={containerRef} />

      {loadError && <div class="notice">{loadError}</div>}

      <div class="toolbar" role="toolbar" aria-label="Drawing tools">
        <div class="group">
          <ToolButton label="Pen" active={tool === 'pen'} onClick={() => setTool('pen')}>
            <PenIcon />
          </ToolButton>
          <ToolButton label="Highlighter" active={tool === 'highlighter'} onClick={() => setTool('highlighter')}>
            <HighlighterIcon />
          </ToolButton>
          <ToolButton label="Eraser" active={tool === 'eraser'} onClick={() => setTool('eraser')}>
            <EraserIcon />
          </ToolButton>
        </div>

        {/* Colors and sizes stay in place for the eraser (dimmed), so the
            toolbar never changes width and buttons never move under the hand. */}
        {(() => {
          const t: InkTool = inkTool ?? lastInkTool;
          const off = inkTool === null;
          return (
          <div class={`ink-options ${off ? 'off' : ''}`} aria-hidden={off}>
            <div class="group">
              {COLORS[t].map((c) => (
                <button
                  disabled={off}
                  class={`swatch ${colors[t] === c.value ? 'active' : ''}`}
                  aria-label={c.label}
                  aria-pressed={colors[t] === c.value}
                  onClick={() => setColors({ ...colors, [t]: c.value })}
                >
                  <span style={{ background: c.value === INK_AUTO ? 'var(--ink)' : c.value }} />
                </button>
              ))}
            </div>
            <div class="group">
              {SIZES[t].map((_, i) => (
                <button
                  disabled={off}
                  class={`size ${sizes[t] === i ? 'active' : ''}`}
                  aria-label={`Size ${i + 1}`}
                  aria-pressed={sizes[t] === i}
                  onClick={() => setSizes({ ...sizes, [t]: i })}
                >
                  <span style={{ width: `${4 + i * 4}px`, height: `${4 + i * 4}px` }} />
                </button>
              ))}
            </div>
          </div>
          );
        })()}

        <div class="group">
          <ToolButton label="Undo" disabled={!engineState.canUndo} onClick={() => engineRef.current?.undo()}>
            <UndoIcon />
          </ToolButton>
          <ToolButton label="Redo" disabled={!engineState.canRedo} onClick={() => engineRef.current?.redo()}>
            <RedoIcon />
          </ToolButton>
        </div>

        <div class="group">
          <button class="zoom" aria-label="Reset zoom to 100%" onClick={() => engineRef.current?.zoomTo(1)}>
            {Math.round(engineState.zoom * 100)}%
          </button>
          <div class="menu-wrap">
            <ToolButton label="Menu" active={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
              <MenuIcon />
            </ToolButton>
            {menuOpen && (
              <div class="menu" role="menu">
                <button role="menuitem" onClick={handleExport}>
                  Export backup (JSON)
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    fileInput.current?.click();
                  }}
                >
                  Import backup…
                </button>
                {!isStandalone() && (
                  <button
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      setShowInstall(true);
                    }}
                  >
                    Install on iPad…
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={handleImportFile} />

      {showInstall && (
        <div class="install" role="dialog" aria-label="Install Story Canvas">
          <p>
            <strong>Install Story Canvas.</strong> Tap <em>Share</em>, then <em>Add to Home Screen</em>. Safari can
            delete data for sites that aren't installed, so install before you rely on it, and export backups.
          </p>
          <button onClick={dismissInstall}>Got it</button>
        </div>
      )}

      {toast && <div class="toast">{toast}</div>}
    </div>
  );
}

function ToolButton(props: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ComponentChildren;
}) {
  return (
    <button
      class={`tool ${props.active ? 'active' : ''}`}
      aria-label={props.label}
      title={props.label}
      aria-pressed={props.active}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}
