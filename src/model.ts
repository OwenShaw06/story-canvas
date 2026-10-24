// Data model, as defined in the requirements doc ("Data model and persistence").
// Coordinates are in canvas (world) space. Card ink is stored relative to its card.

export const SCHEMA_VERSION = 1;

export type Point = [x: number, y: number, pressure: number];

export type Stroke = {
  id: string;
  tool: 'pen' | 'highlighter';
  /** A CSS color, or the special value INK_AUTO which follows light/dark mode. */
  color: string;
  size: number;
  points: Point[];
};

export type FieldType = 'text' | 'longtext' | 'select' | 'image';

export type Template = {
  id: string;
  name: string;
  fields: { key: string; label: string; type: FieldType; options?: string[] }[];
};

export type Card = {
  id: string;
  templateId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  collapsed: boolean;
  color?: string;
  tags: string[];
  fields: Record<string, string>;
  ink: Stroke[];
};

export type Link = {
  id: string;
  fromCardId: string;
  toCardId: string;
  label?: string;
  style: 'solid' | 'dashed' | 'arrow';
};

export type View = { x: number; y: number; zoom: number };

export type Project = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  /** Screen offset of the world origin, plus zoom: screen = world * zoom + (x, y). */
  view: View;
  cards: Card[];
  links: Link[];
  strokes: Stroke[];
  templates: Template[];
};

/** Stroke color that renders dark in light mode and light in dark mode. */
export const INK_AUTO = 'ink';

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 4;

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
