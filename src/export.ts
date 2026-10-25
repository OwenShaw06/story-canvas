import { getImage, imageIdsIn } from './db';
import { strokeBox, unionBoxes, type Box } from './engine/geometry';
import { fillStroke, strokePath } from './engine/render';
import { nodeRect, stickyFontSize } from './layout';
import { cardTitle, type BoardNode, type Project, type Template } from './model';
import { accent, fill, INK_THEME, type Theme } from './palette';
import { safeName } from './io';
import { structureMarkdown } from './structure';

// Renders a board to a canvas without the DOM, for PNG/PDF export and
// project thumbnails; plus Markdown export for Obsidian.

const BG: Record<Theme, string> = { light: '#f7f5f0', dark: '#1c1b19' };
const CARD_BG: Record<Theme, string> = { light: '#ffffff', dark: '#2a2926' };
const MUTED: Record<Theme, string> = { light: 'rgba(43,42,39,0.5)', dark: 'rgba(236,235,230,0.5)' };
const SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
const SERIF = 'ui-serif, "New York", Georgia, serif';
const ROUNDED = 'ui-rounded, "SF Pro Rounded", -apple-system, system-ui, sans-serif';

export function contentBounds(p: Project): Box | null {
  const boxes: Box[] = p.nodes.map(nodeRect);
  for (const s of p.strokes) boxes.push(strokeBox(s));
  return unionBoxes(boxes);
}

async function loadImages(p: Project): Promise<Map<string, ImageBitmap>> {
  const out = new Map<string, ImageBitmap>();
  for (const id of imageIdsIn(p)) {
    try {
      const b = await getImage(id);
      if (b) out.set(id, await createImageBitmap(b));
    } catch {
      /* skip unreadable images */
    }
  }
  return out;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/)) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxW && line) {
        lines.push(line);
        line = word;
        if (lines.length >= maxLines) break;
      } else line = test;
    }
    if (lines.length >= maxLines) break;
    lines.push(line);
  }
  if (lines.length > maxLines) lines.length = maxLines;
  return lines;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export async function renderBoard(
  p: Project,
  opts: { maxSide?: number; scale?: number; theme?: Theme; pad?: number } = {},
): Promise<HTMLCanvasElement> {
  const t = opts.theme ?? 'light';
  const pad = opts.pad ?? 48;
  const b = contentBounds(p) ?? { minX: 0, minY: 0, maxX: 800, maxY: 600 };
  const bw = b.maxX - b.minX + pad * 2;
  const bh = b.maxY - b.minY + pad * 2;
  let scale = opts.scale ?? 2;
  if (opts.maxSide) scale = Math.min(scale, opts.maxSide / Math.max(bw, bh));
  // Browsers cap canvas area (~16M px on iPad).
  scale = Math.min(scale, Math.sqrt(16_000_000 / (bw * bh)));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bw * scale));
  canvas.height = Math.max(1, Math.round(bh * scale));
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = BG[t];
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(scale, 0, 0, scale, (pad - b.minX) * scale, (pad - b.minY) * scale);

  const images = await loadImages(p);
  const templates = new Map(p.templates.map((x) => [x.id, x]));
  const ink = INK_THEME[t];

  const nodes = [...p.nodes.filter((n) => n.kind === 'frame'), ...p.nodes.filter((n) => n.kind !== 'frame')];
  // Frames first, then links, then everything else.
  for (const n of nodes.filter((n) => n.kind === 'frame')) drawNode(ctx, n, t, templates, images, ink);
  drawLinks(ctx, p, t);
  for (const n of nodes.filter((n) => n.kind !== 'frame')) drawNode(ctx, n, t, templates, images, ink);
  for (const s of p.strokes) fillStroke(ctx, s, ink, strokePath(s));
  images.forEach((bm) => bm.close?.());
  return canvas;
}

function drawLinks(ctx: CanvasRenderingContext2D, p: Project, t: Theme) {
  const byId = new Map(p.nodes.map((n) => [n.id, n]));
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  for (const l of p.links) {
    const a = byId.get(l.fromId),
      b = byId.get(l.toId);
    if (!a || !b) continue;
    const ra = nodeRect(a),
      rb = nodeRect(b);
    const ca: [number, number] = [(ra.minX + ra.maxX) / 2, (ra.minY + ra.maxY) / 2];
    const cb: [number, number] = [(rb.minX + rb.maxX) / 2, (rb.minY + rb.maxY) / 2];
    const edge = (r: Box, c: [number, number], to: [number, number]): [number, number] => {
      const dx = to[0] - c[0],
        dy = to[1] - c[1];
      const s = Math.min(dx ? ((r.maxX - r.minX) / 2 + 6) / Math.abs(dx) : Infinity, dy ? ((r.maxY - r.minY) / 2 + 6) / Math.abs(dy) : Infinity);
      return [c[0] + dx * s, c[1] + dy * s];
    };
    const pa = edge(ra, ca, cb),
      pb = edge(rb, cb, ca);
    ctx.strokeStyle = MUTED[t];
    ctx.setLineDash(l.style === 'dashed' ? [7, 6] : []);
    ctx.beginPath();
    ctx.moveTo(pa[0], pa[1]);
    ctx.lineTo(pb[0], pb[1]);
    ctx.stroke();
    ctx.setLineDash([]);
    if (l.style === 'arrow') {
      const ang = Math.atan2(pb[1] - pa[1], pb[0] - pa[0]);
      ctx.beginPath();
      ctx.moveTo(pb[0] - 11 * Math.cos(ang - 0.42), pb[1] - 11 * Math.sin(ang - 0.42));
      ctx.lineTo(pb[0], pb[1]);
      ctx.lineTo(pb[0] - 11 * Math.cos(ang + 0.42), pb[1] - 11 * Math.sin(ang + 0.42));
      ctx.stroke();
    }
    if (l.label) {
      const mx = (pa[0] + pb[0]) / 2,
        my = (pa[1] + pb[1]) / 2;
      ctx.font = `500 12px ${SANS}`;
      const w = ctx.measureText(l.label).width + 20;
      ctx.fillStyle = CARD_BG[t];
      roundRect(ctx, mx - w / 2, my - 12, w, 24, 12);
      ctx.fill();
      ctx.fillStyle = INK_THEME[t];
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(l.label, mx, my);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }
  }
}

function drawNode(
  ctx: CanvasRenderingContext2D,
  n: BoardNode,
  t: Theme,
  templates: Map<string, Template>,
  images: Map<string, ImageBitmap>,
  ink: string,
) {
  const r = nodeRect(n);
  const x = r.minX,
    y = r.minY,
    w = r.maxX - r.minX,
    h = r.maxY - r.minY;
  ctx.save();
  switch (n.kind) {
    case 'frame': {
      ctx.fillStyle = accent(n.color, t);
      ctx.globalAlpha = 0.06;
      roundRect(ctx, x, y, w, h, 18);
      ctx.fill();
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = accent(n.color, t);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = accent(n.color, t);
      ctx.font = `600 15px ${SANS}`;
      ctx.fillText(n.label || 'Frame', x + 4, y - 10);
      break;
    }
    case 'sticky': {
      ctx.shadowColor = 'rgba(0,0,0,0.12)';
      ctx.shadowBlur = 14;
      ctx.shadowOffsetY = 4;
      ctx.fillStyle = fill(n.color, t);
      roundRect(ctx, x, y, w, h, 6);
      ctx.fill();
      ctx.shadowColor = 'transparent';
      const len = n.text.length;
      const size = stickyFontSize(n.w, n.h, len);
      ctx.font = `500 ${size}px ${ROUNDED}`;
      ctx.fillStyle = t === 'light' ? '#2b2a27' : '#f2f0ea';
      const lh = size * 1.28;
      const lines = wrap(ctx, n.text, w - 36, Math.floor((h - 36) / lh));
      const top = y + Math.max(18, (h - lines.length * lh) / 2);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      lines.forEach((ln, i) => ctx.fillText(ln, x + w / 2, top + lh * (i + 0.5)));
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      clipInk(ctx, n.ink, x, y, w, h, ink);
      break;
    }
    case 'text': {
      const sizes = { s: 15, m: 22, l: 34, xl: 52 };
      const size = sizes[n.size];
      ctx.font = `${n.size === 's' ? 400 : 600} ${size}px ${n.size === 's' ? SANS : SERIF}`;
      ctx.fillStyle = n.color === 'white' ? ink : accent(n.color, t);
      const lines = wrap(ctx, n.text, w, 200);
      lines.forEach((ln, i) => ctx.fillText(ln, x, y + size + i * size * 1.3));
      break;
    }
    case 'shape': {
      ctx.fillStyle = fill(n.color, t);
      ctx.strokeStyle = accent(n.color, t);
      ctx.lineWidth = 2;
      const path = new Path2D(shapeD(n.shape, w, h));
      ctx.translate(x, y);
      ctx.fill(path);
      ctx.stroke(path);
      if (n.text) {
        ctx.font = `500 17px ${SANS}`;
        ctx.fillStyle = INK_THEME[t];
        ctx.textAlign = 'center';
        const lines = wrap(ctx, n.text, w * 0.7, 6);
        lines.forEach((ln, i) => ctx.fillText(ln, w / 2, h / 2 - ((lines.length - 1) * 22) / 2 + 6 + i * 22));
      }
      break;
    }
    case 'image': {
      const bm = images.get(n.imageId);
      roundRect(ctx, x, y, w, h, 10);
      ctx.clip();
      if (bm) {
        const s = Math.max(w / bm.width, h / bm.height);
        ctx.drawImage(bm, x + (w - bm.width * s) / 2, y + (h - bm.height * s) / 2, bm.width * s, bm.height * s);
      } else {
        ctx.fillStyle = MUTED[t];
        ctx.fillRect(x, y, w, h);
      }
      break;
    }
    case 'card': {
      const tpl = templates.get(n.templateId);
      const color = accent(n.color ?? tpl?.color, t);
      ctx.shadowColor = 'rgba(0,0,0,0.10)';
      ctx.shadowBlur = 18;
      ctx.shadowOffsetY = 5;
      ctx.fillStyle = CARD_BG[t];
      roundRect(ctx, x, y, w, h, 16);
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.save();
      roundRect(ctx, x, y, w, h, 16);
      ctx.clip();
      ctx.fillStyle = color;
      ctx.fillRect(x, y, w, 4);
      ctx.fillStyle = color;
      ctx.font = `600 11px ${SANS}`;
      ctx.fillText((tpl?.name ?? 'Card').toUpperCase(), x + 18, y + 26);
      ctx.fillStyle = INK_THEME[t];
      ctx.font = `600 20px ${SERIF}`;
      ctx.fillText(cardTitle(n, tpl) || `Untitled`, x + 18, y + 52, w - 36);
      if (!n.collapsed && tpl) {
        let cy = y + 82;
        const title = tpl.fields.find((f) => f.type === 'text');
        for (const f of tpl.fields) {
          if (f === title || f.type === 'image') continue;
          const v = n.fields[f.key];
          if (!v) continue;
          if (cy > y + h - 20) break;
          ctx.font = `600 10px ${SANS}`;
          ctx.fillStyle = MUTED[t];
          ctx.fillText(f.label.toUpperCase(), x + 18, cy);
          cy += 18;
          ctx.font = `400 14px ${SANS}`;
          ctx.fillStyle = INK_THEME[t];
          for (const ln of wrap(ctx, v, w - 36, 8)) {
            ctx.fillText(ln, x + 18, cy);
            cy += 19;
          }
          cy += 10;
        }
        if (n.tags.length) {
          ctx.font = `500 12px ${SANS}`;
          ctx.fillStyle = color;
          ctx.fillText(n.tags.map((g) => `#${g}`).join('  '), x + 18, Math.min(cy + 4, y + h - 14), w - 36);
        }
        clipInk(ctx, n.ink, x, y, w, h, ink);
      }
      ctx.restore();
      break;
    }
  }
  ctx.restore();
}

function clipInk(ctx: CanvasRenderingContext2D, strokes: import('./model').Stroke[], x: number, y: number, w: number, h: number, ink: string) {
  if (!strokes.length) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.translate(x, y);
  for (const s of strokes) fillStroke(ctx, s, ink, strokePath(s));
  ctx.restore();
}

function shapeD(shape: string, w: number, h: number): string {
  // Kept in sync with ui/nodes.tsx shapePath (no DOM import here).
  const i = 1.5,
    W = w - i,
    H = h - i;
  switch (shape) {
    case 'rect':
      return `M${i},${i}H${W}V${H}H${i}Z`;
    case 'rounded': {
      const r = Math.min(24, w / 4, h / 4);
      return `M${i + r},${i}H${W - r}Q${W},${i} ${W},${i + r}V${H - r}Q${W},${H} ${W - r},${H}H${i + r}Q${i},${H} ${i},${H - r}V${i + r}Q${i},${i} ${i + r},${i}Z`;
    }
    case 'ellipse':
      return `M${w / 2},${i}A${w / 2 - i},${h / 2 - i} 0 1,1 ${w / 2 - 0.01},${i}Z`;
    case 'diamond':
      return `M${w / 2},${i}L${W},${h / 2}L${w / 2},${H}L${i},${h / 2}Z`;
    case 'triangle':
      return `M${w / 2},${i}L${W},${H}H${i}Z`;
    default: {
      const cx = w / 2,
        cy = h / 2,
        R = Math.min(w, h) / 2 - i,
        r = R * 0.45;
      const pts: string[] = [];
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + (k * Math.PI) / 5;
        const rr = k % 2 ? r : R;
        pts.push(`${cx + Math.cos(a) * rr * (w / Math.min(w, h))},${cy + Math.sin(a) * rr * (h / Math.min(w, h))}`);
      }
      return `M${pts.join('L')}Z`;
    }
  }
}

// ---------- files ----------

export function canvasToBlob(c: HTMLCanvasElement, type = 'image/png', q?: number): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Export failed'))), type, q));
}

/** A one-page PDF containing the board as a JPEG. */
export async function canvasToPdf(c: HTMLCanvasElement): Promise<Blob> {
  const jpeg = new Uint8Array(await (await canvasToBlob(c, 'image/jpeg', 0.92)).arrayBuffer());
  // Page size in points: fit the longer side to 1191pt (A3) keeping aspect.
  const k = 1191 / Math.max(c.width, c.height);
  const pw = Math.round(c.width * k),
    ph = Math.round(c.height * k);
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let len = 0;
  const push = (d: Uint8Array | string) => {
    const b = typeof d === 'string' ? enc.encode(d) : d;
    parts.push(b);
    len += b.length;
  };
  const obj = (n: number, body: string | (() => void)) => {
    offsets[n] = len;
    push(`${n} 0 obj\n`);
    if (typeof body === 'string') push(body);
    else body();
    push('\nendobj\n');
  };
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  obj(4, () => {
    push(`<< /Type /XObject /Subtype /Image /Width ${c.width} /Height ${c.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
    push(jpeg);
    push('\nendstream');
  });
  const content = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`;
  obj(5, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  const xref = len;
  push(`xref\n0 6\n0000000000 65535 f \n`);
  for (let i = 1; i <= 5; i++) push(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(parts as BlobPart[], { type: 'application/pdf' });
}

// ---------- Markdown (Obsidian) ----------

/** One Markdown note per card, with [[wiki links]] for connections, zipped. */
export function projectToMarkdown(p: Project): { name: string; content: string }[] {
  const templates = new Map(p.templates.map((t) => [t.id, t]));
  const used = new Map<string, number>();
  const fileFor = new Map<string, string>();
  const titleFor = new Map<string, string>();
  for (const n of p.nodes) {
    if (n.kind !== 'card') continue;
    const t = templates.get(n.templateId);
    let base = (cardTitle(n, t) || `Untitled ${t?.name ?? 'card'}`).replace(/[\\/:*?"<>|#^[\]]/g, '').trim() || 'Untitled';
    const k = base.toLowerCase();
    const c = used.get(k) ?? 0;
    used.set(k, c + 1);
    if (c) base = `${base} ${c + 1}`;
    fileFor.set(n.id, `${base}.md`);
    titleFor.set(n.id, base);
  }
  const labelOf = (id: string) => {
    const n = p.nodes.find((x) => x.id === id);
    if (!n) return null;
    if (titleFor.has(id)) return `[[${titleFor.get(id)}]]`;
    if (n.kind === 'sticky' || n.kind === 'text' || n.kind === 'shape') return n.text.split('\n')[0] || null;
    return null;
  };

  const files: { name: string; content: string }[] = [];
  for (const n of p.nodes) {
    if (n.kind !== 'card') continue;
    const t = templates.get(n.templateId);
    const title = titleFor.get(n.id)!;
    const lines = ['---', `type: ${t?.name ?? 'Card'}`, `world: "${p.name.replace(/"/g, "'")}"`];
    if (n.tags.length) lines.push(`tags: [${n.tags.map((g) => JSON.stringify(g)).join(', ')}]`);
    lines.push('---', '', `# ${title}`, '');
    const titleField = t?.fields.find((f) => f.type === 'text');
    for (const f of t?.fields ?? []) {
      if (f === titleField || f.type === 'image') continue;
      const v = n.fields[f.key]?.trim();
      if (!v) continue;
      if (f.type === 'longtext') lines.push(`## ${f.label}`, '', v, '');
      else lines.push(`**${f.label}:** ${v}`, '');
    }
    const rel = p.links
      .filter((l) => l.fromId === n.id || l.toId === n.id)
      .map((l) => {
        const other = labelOf(l.fromId === n.id ? l.toId : l.fromId);
        return other ? `- ${l.label ? `${l.label}: ` : ''}${other}` : null;
      })
      .filter(Boolean);
    if (rel.length) lines.push('## Connections', '', ...(rel as string[]), '');
    files.push({ name: fileFor.get(n.id)!, content: lines.join('\n') });
  }
  const structure = structureMarkdown(p.structure, p.name);
  if (structure) files.push({ name: 'Story structure.md', content: structure });
  const notes = p.nodes.filter((n) => (n.kind === 'sticky' || n.kind === 'text') && n.text.trim());
  if (notes.length) {
    files.push({
      name: 'Board notes.md',
      content: [`# ${p.name}: board notes`, '', ...notes.map((n) => `- ${(n as { text: string }).text.trim().replace(/\n+/g, ' ')}`), ''].join('\n'),
    });
  }
  return files;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** A minimal uncompressed ZIP. */
export function zip(files: { name: string; content: string }[], folder: string): Blob {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(`${folder}/${f.name}`);
    const data = enc.encode(f.content);
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, name.length, true);
    chunks.push(new Uint8Array(local.buffer), name, data);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true);
    cen.setUint16(4, 20, true);
    cen.setUint16(6, 20, true);
    cen.setUint16(8, 0x0800, true);
    cen.setUint32(16, crc, true);
    cen.setUint32(20, data.length, true);
    cen.setUint32(24, data.length, true);
    cen.setUint16(28, name.length, true);
    cen.setUint32(42, offset, true);
    central.push(new Uint8Array(cen.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const cenSize = central.reduce((a, c) => a + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, cenSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...chunks, ...central, new Uint8Array(end.buffer)] as BlobPart[], { type: 'application/zip' });
}

export function markdownZip(p: Project): Blob {
  return zip(projectToMarkdown(p), safeName(p.name));
}

/** Share sheet on iPad ("Save to Files"), download link elsewhere. */
export async function shareOrDownload(blob: Blob, filename: string): Promise<void> {
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (err) {
      if ((err as DOMException).name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
