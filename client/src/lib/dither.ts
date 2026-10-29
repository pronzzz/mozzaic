import { rgb8ToOklab, type Lab, type PaletteMatcher } from './color';

/** Error-diffusion kernels: [dx, dy, weight] with weights already normalised. */
const KERNELS = {
  floyd: [
    [1, 0, 7 / 16],
    [-1, 1, 3 / 16],
    [0, 1, 5 / 16],
    [1, 1, 1 / 16],
  ],
  // Atkinson only spreads 6/8 of the error, which keeps highlights crisp.
  atkinson: [
    [1, 0, 1 / 8],
    [2, 0, 1 / 8],
    [-1, 1, 1 / 8],
    [0, 1, 1 / 8],
    [1, 1, 1 / 8],
    [0, 2, 1 / 8],
  ],
  sierra: [
    [1, 0, 2 / 4],
    [-1, 1, 1 / 4],
    [0, 1, 1 / 4],
  ],
} as const;

export type DiffusionKernel = keyof typeof KERNELS;

export function isDiffusion(mode: string): mode is DiffusionKernel {
  return mode in KERNELS;
}

/**
 * Per-channel [min, max] of the palette in the working space. Working colours are clamped
 * into this box before matching and before computing the error. Error the
 * palette can never pay back (e.g. blue with Game Boy greens, or a shadow
 * darker than the darkest colour) would otherwise snowball and smear whole
 * regions into the wrong colour.
 */
function labBox(lab: Float32Array): number[] {
  const box = [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity];
  for (let i = 0; i < lab.length; i += 3) {
    for (let c = 0; c < 3; c++) {
      box[c * 2] = Math.min(box[c * 2], lab[i + c]);
      box[c * 2 + 1] = Math.max(box[c * 2 + 1], lab[i + c]);
    }
  }
  return box;
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/**
 * Error is diffused on V = L^1.364 instead of Oklab L. Oklab L ≈ Y^(1/3) while
 * sRGB ≈ Y^(1/2.2), so V puts lightness back on an sRGB-like curve: a 50% grey
 * dithers to ~50% white, as people expect from pixel-art tools.
 */
const V_GAMMA = 3 / 2.2;
const toV = (L: number) => (L > 0 ? Math.pow(L, V_GAMMA) : 0);
const fromV = (V: number) => (V > 0 ? Math.pow(V, 1 / V_GAMMA) : 0);

/**
 * Quantise RGBA pixels to a palette with error diffusion (serpentine scan).
 * Error is diffused in an Oklab-based space, so lightness and hue are what
 * get preserved, not raw RGB channel sums. Alpha is thresholded at 50%.
 * Returns a new buffer; the input is not modified.
 */
export function diffuse(
  src: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  matcher: PaletteMatcher,
  kernel: DiffusionKernel,
  strength = 1,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length);
  const work = new Float32Array(width * height * 3);
  const tmp: Lab = [0, 0, 0];
  for (let i = 0, j = 0; i < src.length; i += 4, j += 3) {
    rgb8ToOklab(src[i], src[i + 1], src[i + 2], tmp);
    work[j] = toV(tmp[0]);
    work[j + 1] = tmp[1];
    work[j + 2] = tmp[2];
  }

  const taps = KERNELS[kernel];
  const pal = matcher.rgb;
  // Palette in (V, a, b) working space.
  const plab = Float32Array.from(matcher.lab, (v, i) => (i % 3 === 0 ? toV(v) : v));
  const [lLo, lHi, aLo, aHi, bLo, bHi] = labBox(plab);

  for (let y = 0; y < height; y++) {
    const ltr = (y & 1) === 0;
    for (let xi = 0; xi < width; xi++) {
      const x = ltr ? xi : width - 1 - xi;
      const p = y * width + x;
      const w = p * 3;
      const o = p * 4;

      if (src[o + 3] < 128) {
        out[o + 3] = 0;
        continue;
      }

      const L = clamp(work[w], lLo, lHi);
      const A = clamp(work[w + 1], aLo, aHi);
      const B = clamp(work[w + 2], bLo, bHi);
      const k = matcher.nearestLab(fromV(L), A, B);
      const i3 = k * 3;
      out[o] = pal[i3];
      out[o + 1] = pal[i3 + 1];
      out[o + 2] = pal[i3 + 2];
      out[o + 3] = 255;

      const eL = (L - plab[i3]) * strength;
      const eA = (A - plab[i3 + 1]) * strength;
      const eB = (B - plab[i3 + 2]) * strength;
      for (const [dx0, dy, wt] of taps) {
        const nx = x + (ltr ? dx0 : -dx0);
        const ny = y + dy;
        if (nx < 0 || nx >= width || ny >= height) continue;
        const q = (ny * width + nx) * 3;
        work[q] += eL * wt;
        work[q + 1] += eA * wt;
        work[q + 2] += eB * wt;
      }
    }
  }
  return out;
}

/** Plain nearest-colour mapping (no dithering) on the CPU. */
export function mapToPalette(
  src: Uint8Array | Uint8ClampedArray,
  matcher: PaletteMatcher,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length);
  const pal = matcher.rgb;
  for (let o = 0; o < src.length; o += 4) {
    if (src[o + 3] < 128) continue;
    const idx = matcher.nearest(src[o], src[o + 1], src[o + 2]) * 3;
    out[o] = pal[idx];
    out[o + 1] = pal[idx + 1];
    out[o + 2] = pal[idx + 2];
    out[o + 3] = 255;
  }
  return out;
}
