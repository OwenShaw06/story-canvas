// Named colors for board objects. Objects store a name, not a hex value, so
// every object looks right in both light and dark mode.

export type Theme = 'light' | 'dark';

export type ColorName =
  | 'yellow'
  | 'orange'
  | 'red'
  | 'pink'
  | 'purple'
  | 'blue'
  | 'teal'
  | 'green'
  | 'gray'
  | 'white';

type Swatch = {
  label: string;
  /** Sticky-note / shape fill. */
  fill: Record<Theme, string>;
  /** Accent for card headers, frames, text, links. */
  accent: Record<Theme, string>;
};

export const PALETTE: Record<ColorName, Swatch> = {
  yellow: { label: 'Yellow', fill: { light: '#fbe9a0', dark: '#5c5122' }, accent: { light: '#c99a06', dark: '#f0c84a' } },
  orange: { label: 'Orange', fill: { light: '#fbd2a8', dark: '#5e3d22' }, accent: { light: '#d9731a', dark: '#f5a25a' } },
  red: { label: 'Red', fill: { light: '#f8c4bd', dark: '#5e2a26' }, accent: { light: '#cf3f35', dark: '#f27a70' } },
  pink: { label: 'Pink', fill: { light: '#f8c8e0', dark: '#5a2945' }, accent: { light: '#c93f8a', dark: '#f084c0' } },
  purple: { label: 'Purple', fill: { light: '#dcccf6', dark: '#3f3060' }, accent: { light: '#7b4fd1', dark: '#b393f5' } },
  blue: { label: 'Blue', fill: { light: '#c3dafb', dark: '#233c60' }, accent: { light: '#2f6fd6', dark: '#76a6f7' } },
  teal: { label: 'Teal', fill: { light: '#bfe8e3', dark: '#1f4a46' }, accent: { light: '#1a8f84', dark: '#5fd0c4' } },
  green: { label: 'Green', fill: { light: '#cbecc2', dark: '#2a4a24' }, accent: { light: '#2f9e5b', dark: '#6fd394' } },
  gray: { label: 'Gray', fill: { light: '#e4e2dd', dark: '#3a3936' }, accent: { light: '#6f6c66', dark: '#aeaba4' } },
  white: { label: 'White', fill: { light: '#ffffff', dark: '#2b2a27' }, accent: { light: '#2b2a27', dark: '#ecebe6' } },
};

export const STICKY_COLORS: ColorName[] = ['yellow', 'orange', 'pink', 'purple', 'blue', 'teal', 'green', 'gray'];
export const ACCENT_COLORS: ColorName[] = ['gray', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink'];
export const SHAPE_COLORS: ColorName[] = ['white', 'gray', 'yellow', 'orange', 'red', 'pink', 'purple', 'blue', 'teal', 'green'];

export const fill = (c: string | undefined, t: Theme) => PALETTE[(c as ColorName) ?? 'white']?.fill[t] ?? PALETTE.white.fill[t];
export const accent = (c: string | undefined, t: Theme) =>
  c && PALETTE[c as ColorName] ? PALETTE[c as ColorName].accent[t] : t === 'light' ? '#2b2a27' : '#ecebe6';

/** Ink colors for the pen. 'ink' follows light/dark mode. */
export const PEN_COLORS = [
  { value: 'ink', label: 'Ink' },
  { value: '#d1453b', label: 'Red' },
  { value: '#e08a1e', label: 'Orange' },
  { value: '#2f9e5b', label: 'Green' },
  { value: '#2f6fd6', label: 'Blue' },
  { value: '#8a4fd1', label: 'Purple' },
];

export const HIGHLIGHTER_COLORS = [
  { value: '#f5d90a', label: 'Yellow' },
  { value: '#7ee081', label: 'Green' },
  { value: '#ff8fc7', label: 'Pink' },
  { value: '#7cc4ff', label: 'Blue' },
  { value: '#ffb86b', label: 'Orange' },
];

export const INK_THEME: Record<Theme, string> = { light: '#1d1c1a', dark: '#ecebe6' };
