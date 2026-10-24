// Data model. Version 2 extends the requirements doc's model: cards are one
// kind of board "node" alongside sticky notes, text, shapes, images and
// frames, and links can join any two nodes. Coordinates are in canvas (world)
// space; ink on a card or sticky is stored relative to that node.

export const SCHEMA_VERSION = 2;

export type Point = [x: number, y: number, pressure: number];

export type Stroke = {
  id: string;
  tool: 'pen' | 'highlighter';
  /** A CSS color, or INK_AUTO which follows light/dark mode. */
  color: string;
  size: number;
  points: Point[];
};

export type FieldType = 'text' | 'longtext' | 'select' | 'image';

export type TemplateField = {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  /** Quick picks shown while editing the field. */
  suggestions?: string[];
  /** Picks add to a list (comma separated) instead of replacing the value. */
  multi?: boolean;
};

export type Template = {
  id: string;
  name: string;
  /** Icon name from icons.tsx. */
  icon?: string;
  /** Default accent color for new cards. */
  color?: string;
  fields: TemplateField[];
};

type Box = { id: string; x: number; y: number; w: number; h: number };

export type CardNode = Box & {
  kind: 'card';
  templateId: string;
  collapsed: boolean;
  color?: string;
  tags: string[];
  fields: Record<string, string>;
  ink: Stroke[];
};

export type StickyNode = Box & { kind: 'sticky'; color: string; text: string; ink: Stroke[] };

export type TextSize = 's' | 'm' | 'l' | 'xl';
export type TextNode = Box & { kind: 'text'; text: string; size: TextSize; color: string };

export type ShapeKind = 'rect' | 'rounded' | 'ellipse' | 'diamond' | 'triangle' | 'star';
export type ShapeNode = Box & { kind: 'shape'; shape: ShapeKind; color: string; text: string };

export type ImageNode = Box & { kind: 'image'; imageId: string };

export type FrameNode = Box & { kind: 'frame'; label: string; color?: string };

export type BoardNode = CardNode | StickyNode | TextNode | ShapeNode | ImageNode | FrameNode;
export type NodeKind = BoardNode['kind'];

/** Kept for the requirements doc's naming. */
export type Card = CardNode;

export type LinkStyle = 'solid' | 'dashed' | 'arrow';

export type Link = {
  id: string;
  fromId: string;
  toId: string;
  label?: string;
  style: LinkStyle;
};

export type View = { x: number; y: number; zoom: number };

export type Background = 'dots' | 'grid' | 'lines' | 'plain';

export type Project = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  /** Screen offset of the world origin, plus zoom: screen = world * zoom + (x, y). */
  view: View;
  /** Back to front. Frames always render beneath other nodes. */
  nodes: BoardNode[];
  links: Link[];
  strokes: Stroke[];
  templates: Template[];
  background: Background;
  /** Tags offered when tagging a card (editable). */
  tagPresets: string[];
};

/** Lightweight listing entry for the project screen. */
export type ProjectMeta = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  thumbnail?: string;
  cardCount: number;
  nodeCount: number;
};

export const INK_AUTO = 'ink';

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 4;

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** The card's display title: its first text field. */
export function cardTitle(card: CardNode, t: Template | undefined): string {
  const first = t?.fields.find((f) => f.type === 'text');
  return (first && card.fields[first.key]?.trim()) || '';
}

/** Nodes that can carry their own ink layer. */
export const hasInk = (n: BoardNode): n is CardNode | StickyNode => n.kind === 'card' || n.kind === 'sticky';
