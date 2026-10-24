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
