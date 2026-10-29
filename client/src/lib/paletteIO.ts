import { hexToRgb, rgbToHex, type RGB } from './color';

/** Max colours the GPU quantiser accepts (uniform array size). */
export const MAX_PALETTE = 64;

/**
 * Parse a palette from free text. Accepts:
 * - Lospec `.hex` files (one hex per line, with or without `#`)
 * - GIMP `.gpl` files (`R G B name` rows)
 * - any text containing `#rrggbb` / `#rgb` tokens (CSS, JSON, comma lists)
 */
export function parsePalette(text: string): RGB[] {
  const out: RGB[] = [];
  const seen = new Set<string>();
  const push = (rgb: RGB) => {
    const key = rgbToHex(rgb);
    if (seen.has(key) || out.length >= MAX_PALETTE) return;
    seen.add(key);
    out.push(rgb);
  };

  const lines = text.split(/\r?\n/);
  const isGpl = lines[0]?.trim().toUpperCase() === 'GIMP PALETTE';

  if (isGpl) {
    for (const line of lines.slice(1)) {
      const m = /^\s*(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})/.exec(line);
      if (m) push([+m[1], +m[2], +m[3]].map((v) => Math.min(255, v)) as RGB);
    }
    return out;
  }

  // Bare 6-digit lines (Lospec .hex) first, then any #hex tokens.
  for (const line of lines) {
    const t = line.trim();
    if (/^[0-9a-f]{6}$/i.test(t)) push(hexToRgb(t));
  }
  const tokens = text.match(/#(?:[0-9a-f]{6}|[0-9a-f]{3})\b/gi) ?? [];
  for (const tok of tokens) push(hexToRgb(tok));
  return out;
}

export function toHexFile(palette: RGB[]): string {
  return palette.map((c) => rgbToHex(c).slice(1)).join('\n') + '\n';
}

export function toGplFile(palette: RGB[], name = 'Mozzaic'): string {
  const rows = palette.map((c) => {
    const [r, g, b] = c.map((v) => Math.round(v));
    return `${String(r).padStart(3)} ${String(g).padStart(3)} ${String(b).padStart(3)}\t${rgbToHex(c)}`;
  });
  return `GIMP Palette\nName: ${name}\nColumns: 8\n#\n${rows.join('\n')}\n`;
}
