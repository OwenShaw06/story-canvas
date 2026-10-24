import { PALETTE, type ColorName, type Theme } from './palette';

// Every tag gets a stable colour from its name, so #act-1 always looks the same.
const TAG_COLORS: ColorName[] = ['blue', 'red', 'green', 'purple', 'orange', 'teal', 'pink', 'yellow'];

export function tagColor(tag: string, theme: Theme): string {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0;
  return PALETTE[TAG_COLORS[h % TAG_COLORS.length]].accent[theme];
}
