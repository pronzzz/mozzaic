import { lightness, oklabToRgb, rgb8ToOklab, type Lab, type RGB } from './color';

/** Small deterministic PRNG so the same image always yields the same palette. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Extract a k-colour palette from RGBA pixels using k-means++ in Oklab space.
 * Transparent pixels are ignored. Pixels are sub-sampled to `maxSamples`.
 */
export function extractPalette(
  pixels: Uint8ClampedArray | Uint8Array,
  k: number,
  { maxSamples = 12_000, iterations = 12, seed = 1337 } = {},
): RGB[] {
  const total = pixels.length / 4;
  const step = Math.max(1, Math.floor(total / maxSamples));
  const samples: number[] = [];
  const tmp: Lab = [0, 0, 0];
  for (let i = 0; i < total; i += step) {
    const o = i * 4;
    if (pixels[o + 3] < 128) continue;
    rgb8ToOklab(pixels[o], pixels[o + 1], pixels[o + 2], tmp);
    samples.push(tmp[0], tmp[1], tmp[2]);
  }
  const n = samples.length / 3;
  if (n === 0) return [[0, 0, 0]];
  k = Math.max(1, Math.min(k, n));

  const rand = mulberry32(seed);
  const centers = new Float64Array(k * 3);
  const dist = new Float64Array(n).fill(Infinity);

  // k-means++ seeding: spread the initial centres out.
  let pick = Math.floor(rand() * n);
  for (let c = 0; c < k; c++) {
    centers[c * 3] = samples[pick * 3];
    centers[c * 3 + 1] = samples[pick * 3 + 1];
    centers[c * 3 + 2] = samples[pick * 3 + 2];
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const dl = samples[i * 3] - centers[c * 3];
      const da = samples[i * 3 + 1] - centers[c * 3 + 1];
      const db = samples[i * 3 + 2] - centers[c * 3 + 2];
      const d = dl * dl + da * da + db * db;
      if (d < dist[i]) dist[i] = d;
      sum += dist[i];
    }
    if (sum === 0) break;
    let r = rand() * sum;
    pick = 0;
    for (let i = 0; i < n; i++) {
      r -= dist[i];
      if (r <= 0) {
        pick = i;
        break;
      }
    }
  }

  // Lloyd iterations.
  const assign = new Int32Array(n);
  const sums = new Float64Array(k * 3);
  const counts = new Int32Array(k);
  for (let it = 0; it < iterations; it++) {
    sums.fill(0);
    counts.fill(0);
    let moved = 0;
    for (let i = 0; i < n; i++) {
      const L = samples[i * 3];
      const A = samples[i * 3 + 1];
      const B = samples[i * 3 + 2];
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const dl = L - centers[c * 3];
        const da = A - centers[c * 3 + 1];
        const db = B - centers[c * 3 + 2];
        const d = dl * dl + da * da + db * db;
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      if (assign[i] !== best) moved++;
      assign[i] = best;
      sums[best * 3] += L;
      sums[best * 3 + 1] += A;
      sums[best * 3 + 2] += B;
      counts[best]++;
    }
    for (let c = 0; c < k; c++) {
      if (counts[c] === 0) continue;
      centers[c * 3] = sums[c * 3] / counts[c];
      centers[c * 3 + 1] = sums[c * 3 + 1] / counts[c];
      centers[c * 3 + 2] = sums[c * 3 + 2] / counts[c];
    }
    if (it > 0 && moved === 0) break;
  }

  const out: RGB[] = [];
  for (let c = 0; c < k; c++) {
    if (counts[c] === 0 && out.length > 0) continue;
    const rgb = oklabToRgb([centers[c * 3], centers[c * 3 + 1], centers[c * 3 + 2]]);
    out.push(rgb.map((v) => Math.round(v)) as RGB);
  }
  // Dark → light reads nicely in the swatch strip.
  return out.sort((a, b) => lightness(a) - lightness(b));
}
