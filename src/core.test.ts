import { describe, expect, it, vi } from 'vitest';
import { Doc } from './doc';
import { pinchView, pointInPolygon, strokeHit, translateStroke, zoomAt } from './engine/geometry';
import { exportProject, importProject } from './io';
import { normalizeProject } from './migrate';
import { Autosaver, newProject, SAVE_DELAY } from './db';
import { projectToMarkdown, zip } from './export';
import type { CardNode, StickyNode, Stroke } from './model';

const s = (id: string, pts: [number, number][] = [[0, 0], [10, 0]]): Stroke => ({
  id,
  tool: 'pen',
  color: 'ink',
  size: 2,
  points: pts.map(([x, y]) => [x, y, 0.5]),
});

const sticky = (id: string, x = 0): StickyNode => ({ id, kind: 'sticky', x, y: 0, w: 200, h: 200, color: 'yellow', text: '', ink: [] });

const card = (id: string, name: string, extra: Partial<CardNode> = {}): CardNode => ({
  id,
  kind: 'card',
  templateId: 'character',
  x: 0,
  y: 0,
  w: 300,
  h: 120,
  collapsed: false,
  tags: [],
  fields: { name },
  ink: [],
  ...extra,
});

const ids = (d: Doc, c: 'nodes' | 'strokes') => d.p[c].map((x) => x.id);

describe('document store: undo/redo', () => {
  it('undoes and redoes adds, edits and deletes', () => {
    const d = new Doc(newProject());
    d.put('nodes', sticky('a'));
    d.patch('nodes', 'a', { text: 'hello' });
    d.remove('nodes', ['a']);
    expect(ids(d, 'nodes')).toEqual([]);
    d.undo();
    expect((d.node('a') as StickyNode).text).toBe('hello');
    d.undo();
    expect((d.node('a') as StickyNode).text).toBe('');
    d.undo();
    expect(ids(d, 'nodes')).toEqual([]);
    d.redo();
    d.redo();
    expect((d.node('a') as StickyNode).text).toBe('hello');
  });

  it('restores layer order after deleting from the middle, across separate removes in one group', () => {
    const d = new Doc(newProject());
    for (const id of ['a', 'b', 'c', 'd', 'e']) d.put('strokes', s(id));
    d.begin();
    d.remove('strokes', ['b']);
    d.remove('strokes', ['d']);
    d.end();
    expect(ids(d, 'strokes')).toEqual(['a', 'c', 'e']);
    d.undo();
    expect(ids(d, 'strokes')).toEqual(['a', 'b', 'c', 'd', 'e']);
    d.redo();
    expect(ids(d, 'strokes')).toEqual(['a', 'c', 'e']);
  });

  it('groups a drag into one undo step and still notifies during it', () => {
    const d = new Doc(newProject());
    d.put('nodes', sticky('a'));
    const seen: number[] = [];
    d.subscribe(() => seen.push((d.node('a') as StickyNode).x));
    d.begin('Move');
    for (let x = 1; x <= 5; x++) d.patch('nodes', 'a', { x });
    d.end();
    expect(seen.slice(0, 5)).toEqual([1, 2, 3, 4, 5]);
    d.undo();
    expect(d.node('a')!.x).toBe(0);
    d.redo();
    expect(d.node('a')!.x).toBe(5);
  });

  it('undoes z-order changes', () => {
    const d = new Doc(newProject());
    for (const id of ['a', 'b', 'c']) d.put('nodes', sticky(id));
    d.reorder('nodes', ['a'], 'front');
    expect(ids(d, 'nodes')).toEqual(['b', 'c', 'a']);
    d.undo();
    expect(ids(d, 'nodes')).toEqual(['a', 'b', 'c']);
  });

  it('drops empty groups (e.g. focusing a field without typing)', () => {
    const d = new Doc(newProject());
    d.put('nodes', sticky('a'));
    d.begin();
    d.end();
    d.undo();
    expect(ids(d, 'nodes')).toEqual([]);
  });

  it('ignores an unbalanced end()', () => {
    const d = new Doc(newProject());
    d.end();
    d.put('nodes', sticky('a'));
    expect(d.canUndo).toBe(true);
  });

  it('keeps at least 50 steps', () => {
    const d = new Doc(newProject());
    for (let i = 0; i < 60; i++) d.put('strokes', s(String(i)));
    let n = 0;
    while (d.undo()) n++;
    expect(n).toBeGreaterThanOrEqual(50);
  });
});

describe('geometry', () => {
  it('hits a stroke within eraser radius and misses outside it', () => {
    expect(strokeHit(s('a'), 5, 3, 3)).toBe(true);
    expect(strokeHit(s('a'), 5, 10, 3)).toBe(false);
  });

  it('zooms around a fixed screen point and clamps to 10%–400%', () => {
    const v = zoomAt({ x: 0, y: 0, zoom: 1 }, 2, 100, 100);
    expect(v).toEqual({ x: -100, y: -100, zoom: 2 });
    expect(zoomAt(v, 50, 0, 0).zoom).toBe(4);
    expect(zoomAt(v, 0.001, 0, 0).zoom).toBe(0.1);
  });

  it('pans with two fingers without changing zoom', () => {
    expect(pinchView({ x: 0, y: 0, zoom: 1 }, [100, 100], 50, [130, 90], 50)).toEqual({ x: 30, y: -10, zoom: 1 });
  });

  it('tests points against a lasso polygon', () => {
    const sq: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    expect(pointInPolygon(5, 5, sq)).toBe(true);
    expect(pointInPolygon(15, 5, sq)).toBe(false);
  });

  it('moves a stroke and keeps its id', () => {
    const m = translateStroke(s('a'), 5, -2);
    expect(m.id).toBe('a');
    expect(m.points[0]).toEqual([5, -2, 0.5]);
  });
});

describe('migration', () => {
  it('upgrades a phase-1 project (cards → nodes, fromCardId → fromId)', () => {
    const v1 = {
      id: 'p1',
      name: 'Old world',
      createdAt: 1,
      updatedAt: 2,
      view: { x: 0, y: 0, zoom: 1 },
      cards: [{ id: 'c1', templateId: 'character', x: 0, y: 0, w: 300, h: 100, collapsed: false, tags: [], fields: {}, ink: [] }],
      links: [{ id: 'l1', fromCardId: 'c1', toCardId: 'c1', style: 'solid' }],
      strokes: [s('a')],
      templates: [{ id: 'character', name: 'Character', fields: [] }],
    };
    const p = normalizeProject(v1);
    expect(p.id).toBe('p1');
    expect(p.nodes[0].kind).toBe('card');
    expect(p.links[0]).toMatchObject({ fromId: 'c1', toId: 'c1' });
    expect(p.templates[0].icon).toBe('person');
    expect(p.background).toBe('dots');
  });
});

describe('export / import', () => {
  it('reproduces identical cards, links and ink, with a new id', () => {
    const p = newProject('Test world');
    p.strokes.push(s('a', [[1.25, 2.5], [3, 4]]), s('b'));
    p.nodes.push(card('c1', 'Mara', { ink: [s('k')] }), sticky('n1', 400));
    p.links.push({ id: 'l1', fromId: 'c1', toId: 'n1', style: 'arrow', label: 'remembers' });
    p.view = { x: 12, y: -40, zoom: 0.5 };
    const { project: back, images } = importProject(exportProject(p, { img1: 'data:image/png;base64,AAAA' }));
    expect(back.id).not.toBe(p.id);
    for (const k of ['strokes', 'nodes', 'links', 'templates', 'view', 'name', 'background'] as const) expect(back[k]).toEqual(p[k]);
    expect(images.img1).toBe('data:image/png;base64,AAAA');
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

describe('markdown export', () => {
  it('writes one note per card with wiki links for connections', () => {
    const p = newProject('Aster');
    p.nodes.push(card('c1', 'Mara', { tags: ['lead'], fields: { name: 'Mara', backstory: 'Raised by wolves.' } }), card('c2', 'Tobin'));
    p.links.push({ id: 'l', fromId: 'c1', toId: 'c2', style: 'solid', label: 'brother of' });
    const files = projectToMarkdown(p);
    const mara = files.find((f) => f.name === 'Mara.md')!;
    expect(mara.content).toContain('# Mara');
    expect(mara.content).toContain('## Backstory');
    expect(mara.content).toContain('- brother of: [[Tobin]]');
    expect(mara.content).toContain('tags: ["lead"]');
    expect(files.find((f) => f.name === 'Tobin.md')!.content).toContain('[[Mara]]');
  });

  it('de-duplicates file names', () => {
    const p = newProject();
    p.nodes.push(card('a', 'Ash'), card('b', 'Ash'));
    expect(projectToMarkdown(p).map((f) => f.name)).toEqual(['Ash.md', 'Ash 2.md']);
  });

  it('builds a valid zip header', async () => {
    const z = zip([{ name: 'a.md', content: 'hi' }], 'w');
    const b = new Uint8Array(await z.arrayBuffer());
    expect([b[0], b[1], b[2], b[3]]).toEqual([0x50, 0x4b, 0x03, 0x04]);
  });
});

describe('autosave', () => {
  it('saves within a second even while changes keep coming', async () => {
    vi.useFakeTimers();
    const save = vi.fn(async () => {});
    const saver = new Autosaver(save);
    const p = newProject();
    for (let t = 0; t < 2000; t += 100) {
      saver.schedule(p);
      await vi.advanceTimersByTimeAsync(100);
    }
    expect(SAVE_DELAY).toBeLessThan(1000);
    expect(save.mock.calls.length).toBeGreaterThanOrEqual(4);
    vi.useRealTimers();
  });

  it('still saves an edit within a second when a lazy view save is waiting', async () => {
    vi.useFakeTimers();
    const save = vi.fn(async () => {});
    const saver = new Autosaver(save);
    const p = newProject();
    saver.scheduleLazy(p); // panning
    await vi.advanceTimersByTimeAsync(100);
    saver.schedule(p); // an edit
    await vi.advanceTimersByTimeAsync(SAVE_DELAY + 10);
    expect(save).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
