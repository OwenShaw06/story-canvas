import { store } from './store';

// Full screen hides Safari's address bar on iPad. Installed (Home Screen)
// apps have no bar at all, so the button only shows in the browser.

type FsDoc = Document & { webkitFullscreenElement?: Element; webkitFullscreenEnabled?: boolean; webkitExitFullscreen?: () => void };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => void };

const d = document as FsDoc;

export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export const fullscreenSupported = () => !isStandalone() && !!(d.fullscreenEnabled || d.webkitFullscreenEnabled);

const current = () => !!(d.fullscreenElement || d.webkitFullscreenElement);
export const isFullscreen = store(current());
document.addEventListener('fullscreenchange', () => isFullscreen.set(current()));
document.addEventListener('webkitfullscreenchange', () => isFullscreen.set(current()));

export async function toggleFullscreen(): Promise<void> {
  try {
    if (current()) {
      if (d.exitFullscreen) await d.exitFullscreen();
      else d.webkitExitFullscreen?.();
    } else {
      const el = document.documentElement as FsEl;
      if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
      else el.webkitRequestFullscreen?.();
    }
  } catch {
    /* refused (not from a tap, or unsupported) */
  }
}
