import type { BoardNode, Link, Project, Stroke, Template } from './model';

// The document store: owns the open project, applies every edit, records
// undo/redo, and notifies listeners.
//
// Collections are replaced (never mutated) on change, and changed entities
// are new objects, so UI components can compare by identity.
//
// Undo records, per collection, each touched entity's value before and after
// plus the id order before and after when membership or order changed. That
// makes undo exact for any mix of edits, including z-order changes.

export type Coll = 'nodes' | 'links' | 'strokes' | 'templates';
type EntityOf<C extends Coll> = C extends 'nodes'
  ? BoardNode
  : C extends 'links'
    ? Link
    : C extends 'strokes'
      ? Stroke
      : Template;
type Entity = BoardNode | Link | Stroke | Template;

type CollChange = {
  before: Map<string, Entity | null>;
  after: Map<string, Entity | null>;
  orderBefore?: string[];
  orderAfter?: string[];
};

type Command = { changes: Partial<Record<Coll, CollChange>>; label?: string };

export const HISTORY_LIMIT = 200;

/** 'view' = only the pan/zoom changed; 'meta' = name, background or undo state. */
export type DocListener = (changed: Set<Coll | 'meta' | 'view'>) => void;

export class Doc {
  p: Project;
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private open: Command | null = null;
  /** Open undo groups (begin/end). Edits inside one share one undo step. */
  private depth = 0;
  /** Open atomic edits (transact). Listeners hear about changes once these close. */
  private atomic = 0;
  private pending = new Set<Coll | 'meta' | 'view'>();
  private listeners = new Set<DocListener>();
  version = 0;

  constructor(project: Project) {
    this.p = project;
  }

  subscribe(fn: DocListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  // ---------- reads ----------

  get<C extends Coll>(c: C, id: string): EntityOf<C> | undefined {
    return (this.p[c] as Entity[]).find((e) => e.id === id) as EntityOf<C> | undefined;
  }

  node(id: string): BoardNode | undefined {
    return this.get('nodes', id);
  }

  template(id: string): Template | undefined {
    return this.get('templates', id);
  }

  // ---------- transactions ----------

  /** Groups every edit until the matching end() into one undo step. */
  begin(label?: string) {
    if (this.depth++ === 0) this.open = { changes: {}, label };
  }

  end() {
    if (this.depth <= 0) return; // unbalanced end(): ignore
    if (--this.depth > 0) {
      this.flushNotify();
      return;
    }
    this.depth = 0;
    const cmd = this.open;
    this.open = null;
    if (cmd && this.finalize(cmd)) {
      this.undoStack.push(cmd);
      if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
      this.redoStack = [];
      this.pending.add('meta');
    }
    this.flushNotify();
  }

  transact<T>(fn: () => T, label?: string): T {
    this.begin(label);
    this.atomic++;
    try {
      return fn();
    } finally {
      this.atomic--;
      this.end();
    }
  }

  get inTransaction() {
    return this.depth > 0;
  }

  // ---------- writes ----------

  /** Inserts (at the end, or at `index`) or replaces an entity in place. */
  put<C extends Coll>(c: C, e: EntityOf<C>, index?: number) {
    this.transact(() => {
      const list = this.p[c] as Entity[];
      const i = list.findIndex((x) => x.id === e.id);
      const ch = this.track(c);
      if (!ch.before.has(e.id)) ch.before.set(e.id, i >= 0 ? list[i] : null);
      let next: Entity[];
      if (i >= 0 && index === undefined) {
        next = list.slice();
        next[i] = e;
      } else {
        ch.orderBefore ??= list.map((x) => x.id);
        next = list.filter((x) => x.id !== e.id);
        next.splice(index ?? next.length, 0, e);
      }
      (this.p as any)[c] = next;
      this.pending.add(c);
    });
  }

  /** Shallow-merges fields into an existing entity. */
  patch<C extends Coll>(c: C, id: string, fields: Partial<EntityOf<C>>) {
    const cur = this.get(c, id);
    if (!cur) return;
    this.put(c, { ...cur, ...fields } as EntityOf<C>);
  }

  remove(c: Coll, ids: Iterable<string>) {
    const set = new Set(ids);
    if (!set.size) return;
    this.transact(() => {
      const list = this.p[c] as Entity[];
      const ch = this.track(c);
      let changed = false;
      for (const e of list) {
        if (!set.has(e.id)) continue;
        if (!ch.before.has(e.id)) ch.before.set(e.id, e);
        changed = true;
      }
      if (!changed) return;
      ch.orderBefore ??= list.map((x) => x.id);
      (this.p as any)[c] = list.filter((x) => !set.has(x.id));
      this.pending.add(c);
    });
  }

  /** Moves entities to the front (end of list) or back (start of list), keeping their relative order. */
  reorder(c: Coll, ids: Iterable<string>, where: 'front' | 'back') {
    const set = new Set(ids);
    this.transact(() => {
      const list = this.p[c] as Entity[];
      const moving = list.filter((x) => set.has(x.id));
      if (!moving.length) return;
      const rest = list.filter((x) => !set.has(x.id));
      const ch = this.track(c);
      ch.orderBefore ??= list.map((x) => x.id);
      for (const e of moving) if (!ch.before.has(e.id)) ch.before.set(e.id, e);
      (this.p as any)[c] = where === 'front' ? rest.concat(moving) : moving.concat(rest);
      this.pending.add(c);
    });
  }

  /** Project-level fields that are not undoable (name, view, background). */
  setMeta(fields: Partial<Pick<Project, 'name' | 'view' | 'background'>>) {
    Object.assign(this.p, fields);
    const viewOnly = Object.keys(fields).every((k) => k === 'view');
    this.pending.add(viewOnly ? 'view' : 'meta');
    this.flushNotify();
  }

  // ---------- undo / redo ----------

  undo(): boolean {
    if (this.depth) return false;
    const cmd = this.undoStack.pop();
    if (!cmd) return false;
    this.applyCmd(cmd, 'before');
    this.redoStack.push(cmd);
    this.pending.add('meta');
    this.flushNotify();
    return true;
  }

  redo(): boolean {
    if (this.depth) return false;
    const cmd = this.redoStack.pop();
    if (!cmd) return false;
    this.applyCmd(cmd, 'after');
    this.undoStack.push(cmd);
    this.pending.add('meta');
    this.flushNotify();
    return true;
  }

  get canUndo() {
    return this.undoStack.length > 0;
  }
  get canRedo() {
    return this.redoStack.length > 0;
  }

  clearHistory() {
    this.undoStack = [];
    this.redoStack = [];
  }

  // ---------- internals ----------

  private track(c: Coll): CollChange {
    const cmd = this.open!;
    return (cmd.changes[c] ??= { before: new Map(), after: new Map() });
  }

  /** Captures after-values; drops no-op changes. Returns false if nothing changed. */
  private finalize(cmd: Command): boolean {
    let any = false;
    for (const c of Object.keys(cmd.changes) as Coll[]) {
      const ch = cmd.changes[c]!;
      const list = this.p[c] as Entity[];
      const byId = new Map(list.map((e) => [e.id, e]));
      for (const [id, before] of ch.before) {
        const after = byId.get(id) ?? null;
        if (after === before) ch.before.delete(id);
        else ch.after.set(id, after);
      }
      if (ch.orderBefore) {
        const orderAfter = list.map((e) => e.id);
        if (orderAfter.length === ch.orderBefore.length && orderAfter.every((id, i) => id === ch.orderBefore![i])) {
          ch.orderBefore = undefined;
        } else ch.orderAfter = orderAfter;
      }
      if (!ch.before.size && !ch.orderBefore) delete cmd.changes[c];
      else any = true;
    }
    return any;
  }

  private applyCmd(cmd: Command, side: 'before' | 'after') {
    for (const c of Object.keys(cmd.changes) as Coll[]) {
      const ch = cmd.changes[c]!;
      const values = side === 'before' ? ch.before : ch.after;
      const order = side === 'before' ? ch.orderBefore : ch.orderAfter;
      const list = this.p[c] as Entity[];
      const byId = new Map<string, Entity | null>(list.map((e) => [e.id, e]));
      for (const [id, v] of values) byId.set(id, v);
      const ids = order ?? list.map((e) => e.id);
      (this.p as any)[c] = ids.map((id) => byId.get(id)).filter((e): e is Entity => !!e);
      this.pending.add(c);
    }
  }

  private flushNotify() {
    if (this.atomic || !this.pending.size) return;
    const changed = this.pending;
    this.pending = new Set();
    this.version++;
    for (const fn of this.listeners) fn(changed);
  }
}
