import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { Doc } from './doc';
import { pinchView, pointInPolygon, strokeHit, translateStroke, zoomAt } from './engine/geometry';
import { exportProject, importProject } from './io';
import { normalizeProject } from './migrate';
import { Autosaver, newProject, SAVE_DELAY } from './db';
import { projectToMarkdown, zip } from './export';
import type { CardNode, StickyNode, Stroke } from './model';
import { randomName, DEFAULT_TAGS } from './suggestions';
import { defaultTemplates } from './templates';
import { align, distribute, tidy } from './arrange';

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

  it('merges typing in one field into one undo step, without leaving anything open', () => {
    const d = new Doc(newProject());
    d.put('nodes', sticky('a'));
    for (const t of ['H', 'He', 'Hey']) d.type('nodes', 'a', { text: t }, 'a:text');
    expect(d.inTransaction).toBe(false);
    d.undo();
    expect((d.node('a') as StickyNode).text).toBe('');
    d.redo();
    expect((d.node('a') as StickyNode).text).toBe('Hey');
  });

  it('starts a new undo step after sealMerge (a new editing session)', () => {
    const d = new Doc(newProject());
    d.put('nodes', sticky('a'));
    d.type('nodes', 'a', { text: 'one' }, 'a:text');
    d.sealMerge();
    d.type('nodes', 'a', { text: 'one two' }, 'a:text');
    d.undo();
    expect((d.node('a') as StickyNode).text).toBe('one');
  });

  it('endAll closes a group whose end was lost', () => {
    const d = new Doc(newProject());
    d.begin('Move');
    d.put('nodes', sticky('a'));
    d.endAll();
    expect(d.inTransaction).toBe(false);
    expect(d.canUndo).toBe(true);
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

describe('suggestions and names', () => {
  it('seeds field suggestions into default templates', () => {
    const role = defaultTemplates().find((t) => t.id === 'character')!.fields.find((f) => f.key === 'role')!;
    expect(role.suggestions).toContain('Mentor');
    const personality = defaultTemplates().find((t) => t.id === 'character')!.fields.find((f) => f.key === 'personality')!;
    expect(personality.multi).toBe(true);
  });

  it('adds suggestions and tag presets to older projects, but keeps edits', () => {
    const p = newProject();
    const old: any = structuredClone(p);
    delete old.tagPresets;
    for (const t of old.templates) for (const f of t.fields) delete f.suggestions;
    old.templates[0].fields[1].suggestions = ['Only this'];
    const up = normalizeProject(old);
    expect(up.tagPresets).toEqual(DEFAULT_TAGS);
    expect(up.templates[0].fields[1].suggestions).toEqual(['Only this']);
    expect(up.templates[0].fields.find((f) => f.key === 'personality')!.suggestions!.length).toBeGreaterThan(5);
  });

  it('generates names for each card type', () => {
    for (const id of ['character', 'location', 'faction', 'item', 'system']) {
      for (let i = 0; i < 20; i++) {
        const n = randomName(id);
        expect(n.length).toBeGreaterThan(2);
        expect(n[0]).toBe(n[0].toUpperCase());
      }
    }
    expect(randomName('location', 'Tavern')).toMatch(/^The /);
  });
});

describe('arrange', () => {
  const rs = [
    { id: 'a', x: 10, y: 0, w: 100, h: 50 },
    { id: 'b', x: 200, y: 80, w: 60, h: 40 },
    { id: 'c', x: 90, y: 300, w: 120, h: 70 },
  ];
  const by = (ps: { id: string; x: number; y: number }[]) => Object.fromEntries(ps.map((p) => [p.id, [p.x, p.y]]));

  it('aligns edges and centres', () => {
    expect(by(align(rs, 'left'))).toEqual({ a: [10, 0], b: [10, 80], c: [10, 300] });
    expect(by(align(rs, 'right'))).toEqual({ a: [160, 0], b: [200, 80], c: [140, 300] });
    expect(by(align(rs, 'top'))).toEqual({ a: [10, 0], b: [200, 0], c: [90, 0] });
    expect(align(rs, 'hcenter').map((p) => p.x + rs.find((r) => r.id === p.id)!.w / 2)).toEqual([135, 135, 135]);
  });

  it('spaces objects evenly, keeping the ends in place', () => {
    const d = by(distribute(rs, 'y'));
    // span 0..370, heights 160 → gap 105
    expect(d).toEqual({ a: [10, 0], b: [200, 155], c: [90, 300] });
  });

  it('tidies into a grid without overlaps', () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ id: String(i), x: (i * 137) % 400, y: (i * 251) % 300, w: 100 + (i % 3) * 20, h: 60 + (i % 2) * 30 }));
    const out = tidy(many, 32);
    const rects = out.map((p) => ({ ...p, w: many.find((m) => m.id === p.id)!.w, h: many.find((m) => m.id === p.id)!.h }));
    for (const a of rects)
      for (const b of rects) {
        if (a === b) continue;
        const overlap = a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
        expect(overlap).toBe(false);
      }
  });

  it('tidy can land on the grid', () => {
    const out = tidy(rs, 32, (v) => Math.round(v / 32) * 32);
    for (const p of out) {
      expect(p.x % 32).toBe(0);
      expect(p.y % 32).toBe(0);
    }
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

describe('deleting a world', () => {
  it('stays deleted even if a late save arrives', async () => {
    const { createProject, deleteProject, saveProject, listProjects, loadProject } = await import('./db');
    const p = await createProject('Doomed');
    await deleteProject(p.id);
    await saveProject(p, 'data:image/jpeg;base64,AAAA'); // e.g. the thumbnail from leaving the board
    expect(await loadProject(p.id)).toBeUndefined();
    expect((await listProjects()).some((m) => m.id === p.id)).toBe(false);
  });
});

describe('world covers', () => {
  it('sets, survives an older board save, and removes', async () => {
    const { createProject, setProjectCover, saveProject, loadProject, listProjects } = await import('./db');
    const p = await createProject('Covered');
    const stale = structuredClone(p); // e.g. the open board's copy, saved late
    await setProjectCover(p.id, 'data:image/jpeg;base64,COVER');
    await saveProject(stale);
    expect((await loadProject(p.id))?.cover).toBe('data:image/jpeg;base64,COVER');
    expect((await listProjects()).find((m) => m.id === p.id)?.cover).toBe('data:image/jpeg;base64,COVER');
    await setProjectCover(p.id, null);
    expect((await loadProject(p.id))?.cover).toBeUndefined();
  });

  it('travels with a backup', () => {
    const p = { ...newProject('Backup'), cover: 'data:image/jpeg;base64,COVER', coverAt: 1 };
    expect(importProject(exportProject(p)).project.cover).toBe('data:image/jpeg;base64,COVER');
  });
});
