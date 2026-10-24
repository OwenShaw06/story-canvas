import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

/** A floating panel that closes on outside press or Escape. */
export function Popover(props: {
  open: boolean;
  onClose: () => void;
  class?: string;
  style?: Record<string, string | number>;
  children: ComponentChildren;
  /** Elements (e.g. the toggle button) that should not count as "outside". */
  anchor?: { current: HTMLElement | null };
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!props.open) return;
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || props.anchor?.current?.contains(t)) return;
      props.onClose();
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose();
    // Defer so the opening press doesn't immediately close it.
    const id = setTimeout(() => {
      document.addEventListener('pointerdown', down, true);
      document.addEventListener('keydown', key);
    });
    return () => {
      clearTimeout(id);
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('keydown', key);
    };
  }, [props.open]);
  if (!props.open) return null;
  return (
    <div ref={ref} class={`popover ${props.class ?? ''}`} style={props.style} role="dialog">
      {props.children}
    </div>
  );
}

export function IconButton(props: {
  label: string;
  onClick: (e: MouseEvent) => void;
  active?: boolean;
  disabled?: boolean;
  class?: string;
  children: ComponentChildren;
  btnRef?: { current: HTMLButtonElement | null };
}) {
  return (
    <button
      ref={props.btnRef}
      class={`icon-btn ${props.active ? 'is-active' : ''} ${props.class ?? ''}`}
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
