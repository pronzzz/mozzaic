/** Colour helpers. Colours are [r, g, b] tuples in 0..255 sRGB unless noted. */

export type RGB = [number, number, number];
export type Lab = [number, number, number];

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function isHex(value: string): boolean {
  return HEX_RE.test(value.trim());
}

export function hexToRgb(hex: string): RGB {
  const m = HEX_RE.exec(hex.trim());
  if (!m) throw new Error(`Invalid hex colour: ${hex}`);
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: RGB): string {
  const to = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c: number): number {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.min(255, Math.max(0, v * 255));
}

/** Lookup table: 8-bit sRGB → linear. Used on hot paths (k-means, dithering). */
const LINEAR_LUT = new Float32Array(256);
for (let i = 0; i < 256; i++) LINEAR_LUT[i] = srgbToLinear(i);

/** Oklab from linear RGB (0..1). https://bottosson.github.io/posts/oklab/ */
export function linearToOklab(r: number, g: number, b: number, out: Lab = [0, 0, 0]): Lab {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  out[0] = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  out[1] = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  out[2] = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return out;
}

export function rgbToOklab(rgb: RGB, out: Lab = [0, 0, 0]): Lab {
  return linearToOklab(srgbToLinear(rgb[0]), srgbToLinear(rgb[1]), srgbToLinear(rgb[2]), out);
}

/** Fast path for 8-bit integer channels. */
export function rgb8ToOklab(r: number, g: number, b: number, out: Lab = [0, 0, 0]): Lab {
  return linearToOklab(LINEAR_LUT[r], LINEAR_LUT[g], LINEAR_LUT[b], out);
}

export function oklabToRgb([L, a, b]: Lab): RGB {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

/** Perceived lightness (Oklab L), handy for sorting swatches. */
export function lightness(rgb: RGB): number {
  return rgbToOklab(rgb)[0];
}

/**
 * Nearest-colour matcher in Oklab space with a small cache, so repeated
 * colours (very common in pixel art) are resolved once.
 */
export class PaletteMatcher {
  readonly rgb: Uint8Array;
  readonly lab: Float32Array;
  readonly size: number;
  private cache = new Map<number, number>();
  private tmp: Lab = [0, 0, 0];

  constructor(palette: RGB[]) {
    if (palette.length === 0) throw new Error('Palette must contain at least one colour');
    this.size = palette.length;
    this.rgb = new Uint8Array(palette.length * 3);
    this.lab = new Float32Array(palette.length * 3);
    palette.forEach((c, i) => {
      this.rgb.set(c.map((v) => Math.round(v)), i * 3);
      const lab = rgbToOklab(c);
      this.lab.set(lab, i * 3);
    });
  }

  /** Index of the closest palette entry to an 8-bit colour. */
  nearest(r: number, g: number, b: number): number {
    const ri = r < 0 ? 0 : r > 255 ? 255 : r | 0;
    const gi = g < 0 ? 0 : g > 255 ? 255 : g | 0;
    const bi = b < 0 ? 0 : b > 255 ? 255 : b | 0;
    const key = (ri << 16) | (gi << 8) | bi;
    const hit = this.cache.get(key);
    if (hit !== undefined) return hit;

    const [L, A, B] = rgb8ToOklab(ri, gi, bi, this.tmp);
    let best = 0;
    let bestD = Infinity;
    const lab = this.lab;
    for (let i = 0, j = 0; i < this.size; i++, j += 3) {
      const dl = L - lab[j];
      const da = A - lab[j + 1];
      const db = B - lab[j + 2];
      const d = dl * dl + da * da + db * db;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (this.cache.size > 200_000) this.cache.clear();
    this.cache.set(key, best);
    return best;
  }

  /** Index of the closest palette entry to an Oklab colour (no cache). */
  nearestLab(L: number, A: number, B: number): number {
    let best = 0;
    let bestD = Infinity;
    const lab = this.lab;
    for (let i = 0, j = 0; i < this.size; i++, j += 3) {
      const dl = L - lab[j];
      const da = A - lab[j + 1];
      const db = B - lab[j + 2];
      const d = dl * dl + da * da + db * db;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }
}

/** Build a uniform "levels per channel" palette (the classic posterize look). */
export function levelsPalette(levels: number): RGB[] {
  const out: RGB[] = [];
  const n = Math.max(2, Math.round(levels));
  for (let r = 0; r < n; r++)
    for (let g = 0; g < n; g++)
      for (let b = 0; b < n; b++)
        out.push([(r * 255) / (n - 1), (g * 255) / (n - 1), (b * 255) / (n - 1)]);
  return out;
}
