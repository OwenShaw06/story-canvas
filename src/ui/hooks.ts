import { useEffect, useReducer } from 'preact/hooks';
import type { Coll, Doc } from '../doc';

/** Re-renders when the document changes (optionally only for some collections). */
export function useDocVersion(doc: Doc, only?: (Coll | 'meta' | 'view')[]): number {
  const [, bump] = useReducer((x: number) => x + 1, 0);
  useEffect(
    () =>
      doc.subscribe((changed) => {
        // Pan/zoom alone never re-renders document views.
        if (only ? only.some((c) => changed.has(c)) : !(changed.size === 1 && changed.has('view'))) bump(0);
      }),
    [doc],
  );
  return doc.version;
}

/** Focuses a node's main text field after it renders. Call from a tap/click handler. */
export function focusNodeSoon(id: string, inner = '[data-primary]') {
  // iOS only opens the keyboard for focus() inside a user gesture, so focus a
  // hidden input now (keyboard opens), then move focus to the real field.
  let proxy = document.getElementById('focus-proxy') as HTMLInputElement | null;
  if (!proxy) {
    proxy = document.createElement('input');
    proxy.id = 'focus-proxy';
    proxy.setAttribute('aria-hidden', 'true');
    proxy.tabIndex = -1;
    document.body.appendChild(proxy);
  }
  proxy.focus({ preventScroll: true });
  const tryFocus = (n: number) => {
    const el = document.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(id)}"] ${inner}`);
    if (el) el.focus({ preventScroll: true });
    else if (n > 0) requestAnimationFrame(() => tryFocus(n - 1));
    else proxy!.blur();
  };
  requestAnimationFrame(() => tryFocus(10));
}
