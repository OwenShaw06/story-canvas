import { useEffect, useState } from 'preact/hooks';

// A tiny observable value, shared between the imperative canvas code and Preact.

export type Store<T> = {
  get(): T;
  set(v: T | ((prev: T) => T)): void;
  subscribe(fn: (v: T) => void): () => void;
};

export function store<T>(initial: T): Store<T> {
  let value = initial;
  const subs = new Set<(v: T) => void>();
  return {
    get: () => value,
    set(v) {
      const next = typeof v === 'function' ? (v as (p: T) => T)(value) : v;
      if (Object.is(next, value)) return;
      value = next;
      for (const fn of subs) fn(value);
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}

export function useStore<T>(s: Store<T>): T {
  const [v, setV] = useState(s.get());
  useEffect(() => {
    setV(s.get());
    return s.subscribe(setV);
  }, [s]);
  return v;
}

// ---------- theme ----------

const mq = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
export const theme = store<'light' | 'dark'>(mq?.matches ? 'dark' : 'light');
mq?.addEventListener('change', (e) => theme.set(e.matches ? 'dark' : 'light'));
