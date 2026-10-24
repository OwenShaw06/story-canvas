import { store } from './store';

// Per-device UI preferences, kept in localStorage (they're conveniences, not data).

export type DockSide = 'bottom' | 'left' | 'right';

function read<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return allowed.includes(v as T) ? (v as T) : fallback;
  } catch {
    return fallback;
  }
}

function persist(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode */
  }
}

export const DOCK_SIDES = ['bottom', 'left', 'right'] as const;
export const dockSide = store<DockSide>(read('dockSide', DOCK_SIDES, 'bottom'));
dockSide.subscribe((v) => persist('dockSide', v));

/** Snap to grid: positions and sizes land on the board's 32-unit dot grid. */
export const GRID = 32;
function readBool(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}
export const snapToGrid = store<boolean>(readBool('snapToGrid'));
snapToGrid.subscribe((v) => persist('snapToGrid', v ? '1' : '0'));

export const toGrid = (v: number) => Math.round(v / GRID) * GRID;
