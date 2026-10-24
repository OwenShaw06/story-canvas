import type { Stroke } from '../model';

// Undo/redo for canvas strokes (requirement C4: at least 50 steps).
// Commands are small diffs rather than snapshots, so long histories stay cheap.

export type Command =
  | { kind: 'add'; strokes: Stroke[] }
  /**
   * Items are in the order they were removed; each index is the stroke's
   * position in the list at the moment it was removed. Reverting replays them
   * backwards, so every stroke returns to its original layer.
   */
  | { kind: 'remove'; items: RemovedItem[] };

export type RemovedItem = { stroke: Stroke; index: number };

export const HISTORY_LIMIT = 100;

export class History {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];

  constructor(private strokes: () => Stroke[]) {}

  /** Records a command that has already been applied. */
  push(cmd: Command): void {
    if (cmd.kind === 'add' && !cmd.strokes.length) return;
    if (cmd.kind === 'remove' && !cmd.items.length) return;
    this.undoStack.push(cmd);
    if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
    this.redoStack = [];
  }

  undo(): boolean {
    const cmd = this.undoStack.pop();
    if (!cmd) return false;
    revert(this.strokes(), cmd);
    this.redoStack.push(cmd);
    return true;
  }

  redo(): boolean {
    const cmd = this.redoStack.pop();
    if (!cmd) return false;
    apply(this.strokes(), cmd);
    this.undoStack.push(cmd);
    return true;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  get canUndo() {
    return this.undoStack.length > 0;
  }
  get canRedo() {
    return this.redoStack.length > 0;
  }
}

function removeIds(list: Stroke[], ids: Set<string>) {
  for (let i = list.length - 1; i >= 0; i--) if (ids.has(list[i].id)) list.splice(i, 1);
}

function apply(list: Stroke[], cmd: Command) {
  if (cmd.kind === 'add') list.push(...cmd.strokes);
  else removeIds(list, new Set(cmd.items.map((i) => i.stroke.id)));
}

function revert(list: Stroke[], cmd: Command) {
  if (cmd.kind === 'add') {
    removeIds(list, new Set(cmd.strokes.map((s) => s.id)));
  } else {
    for (let i = cmd.items.length - 1; i >= 0; i--) {
      const { stroke, index } = cmd.items[i];
      list.splice(Math.min(index, list.length), 0, stroke);
    }
  }
}

/**
 * Removes strokes from the list and returns what was removed, in removal
 * order (last index first, so earlier indexes stay valid).
 */
export function removeStrokes(list: Stroke[], ids: Set<string>): RemovedItem[] {
  const items: RemovedItem[] = [];
  for (let i = list.length - 1; i >= 0; i--) {
    if (ids.has(list[i].id)) {
      items.push({ stroke: list[i], index: i });
      list.splice(i, 1);
    }
  }
  return items;
}
