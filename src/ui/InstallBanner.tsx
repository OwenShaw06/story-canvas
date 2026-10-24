import { useState } from 'preact/hooks';
import { ShareIcon } from './icons';

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Safari can evict data for sites that aren't installed, so ask once. */
export function InstallBanner() {
  const [show, setShow] = useState(() => !isStandalone() && read('installDismissed') !== '1');
  if (!show) return null;
  const dismiss = () => {
    try {
      localStorage.setItem('installDismissed', '1');
    } catch {
      /* private mode */
    }
    setShow(false);
  };
  return (
    <div class="install glass" role="dialog" aria-label="Install Story Canvas">
      <span class="install-icon">
        <ShareIcon size={22} />
      </span>
      <p>
        <strong>Add Story Canvas to your Home Screen.</strong> Tap <em>Share</em>, then <em>Add to Home Screen</em>. Installed, it works offline and Safari
        keeps your worlds safe.
      </p>
      <button class="btn-primary" onClick={dismiss}>
        Got it
      </button>
    </div>
  );
}
