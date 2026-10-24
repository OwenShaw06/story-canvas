import { describe, expect, it, vi } from 'vitest';
import { History, removeStrokes } from './engine/history';
import { pinchView, strokeHit, zoomAt } from './engine/geometry';
import { exportProject, importProject } from './io';
import { Autosaver, newProject, SAVE_DELAY } from './db';
import type { Stroke } from './model';

const s = (id: string, pts: [number, number][] = [[0, 0], [10, 0]]): Stroke => ({
  id,
  tool: 'pen',
  color: 'ink',
  size: 2,
  points: pts.map(([x, y]) => [x, y, 0.5]),
});

describe('history', () => {
  it('undoes an erase swipe back into the original layer order', () => {
    const list = ['a', 'b', 'c', 'd', 'e'].map((id) => s(id));
    const h = new History(() => list);
    // One swipe that hits "b", then later "d" (after "b" is already gone).
    const removed = [...removeStrokes(list, new Set(['b'])), ...removeStrokes(list, new Set(['d']))];
    h.push({ kind: 'remove', items: removed });
    expect(list.map((x) => x.id)).toEqual(['a', 'c', 'e']);
    h.undo();
    expect(list.map((x) => x.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
    h.redo();
    expect(list.map((x) => x.id)).toEqual(['a', 'c', 'e']);
  });

  it('keeps at least 50 steps', () => {
    const list: Stroke[] = [];
    const h = new History(() => list);
    for (let i = 0; i < 60; i++) {
      const st = s(String(i));
      list.push(st);
      h.push({ kind: 'add', strokes: [st] });
    }
    let n = 0;
    while (h.undo()) n++;
    expect(n).toBeGreaterThanOrEqual(50);
  });

  it('clears redo after a new edit', () => {
    const list: Stroke[] = [];
    const h = new History(() => list);
    const a = s('a');
    list.push(a);
    h.push({ kind: 'add', strokes: [a] });
    h.undo();
    const b = s('b');
    list.push(b);
    h.push({ kind: 'add', strokes: [b] });
    expect(h.canRedo).toBe(false);
  });
});

describe('geometry', () => {
  it('hits a stroke within eraser radius and misses outside it', () => {
    const st = s('a');
    expect(strokeHit(st, 5, 3, 3)).toBe(true);
    expect(strokeHit(st, 5, 10, 3)).toBe(false);
  });

  it('zooms around a fixed screen point and clamps to 10%–400%', () => {
    const v = zoomAt({ x: 0, y: 0, zoom: 1 }, 2, 100, 100);
    expect(v).toEqual({ x: -100, y: -100, zoom: 2 });
    expect(zoomAt(v, 50, 0, 0).zoom).toBe(4);
    expect(zoomAt(v, 0.001, 0, 0).zoom).toBe(0.1);
  });

  it('pans with two fingers without changing zoom', () => {
    const v = pinchView({ x: 0, y: 0, zoom: 1 }, [100, 100], 50, [130, 90], 50);
    expect(v).toEqual({ x: 30, y: -10, zoom: 1 });
  });
});

describe('export / import', () => {
  it('reproduces identical ink, cards and links', () => {
    const p = newProject('Test world');
    p.strokes.push(s('a', [[1.25, 2.5], [3, 4]]), s('b'));
    p.view = { x: 12, y: -40, zoom: 0.5 };
    const back = importProject(exportProject(p));
    expect(back.id).not.toBe(p.id);
    expect(back.strokes).toEqual(p.strokes);
    expect(back.cards).toEqual(p.cards);
    expect(back.links).toEqual(p.links);
    expect(back.templates).toEqual(p.templates);
    expect(back.view).toEqual(p.view);
    expect(back.name).toBe('Test world');
  });

  it('rejects files that are not Story Canvas exports', () => {
    expect(() => importProject('{"hello":1}')).toThrow(/not a Story Canvas/);
    expect(() => importProject('nope')).toThrow(/not valid JSON/);
  });

  it('rejects files from a newer schema version', () => {
    const json = JSON.stringify({ app: 'story-canvas', schemaVersion: 999, project: newProject() });
    expect(() => importProject(json)).toThrow(/newer version/);
  });
});

describe('autosave', () => {
  it('saves within a second even while changes keep coming', async () => {
    vi.useFakeTimers();
    const save = vi.fn(async () => {});
    const saver = new Autosaver(save);
    const p = newProject();
    // A change every 100 ms for 2 seconds: a resetting debounce would never fire.
    for (let t = 0; t < 2000; t += 100) {
      saver.schedule(p);
      await vi.advanceTimersByTimeAsync(100);
    }
    expect(SAVE_DELAY).toBeLessThan(1000);
    expect(save.mock.calls.length).toBeGreaterThanOrEqual(4);
    vi.useRealTimers();
  });
});
