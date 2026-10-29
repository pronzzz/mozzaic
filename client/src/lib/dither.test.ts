import { describe, expect, it } from 'vitest';
import { PaletteMatcher, rgbToHex } from './color';
import { diffuse, mapToPalette } from './dither';

function solid(w: number, h: number, rgb: [number, number, number], alpha = 255) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < d.length; i += 4) d.set([...rgb, alpha], i);
  return d;
}

const bw = new PaletteMatcher([[0, 0, 0], [255, 255, 255]]);

describe('diffuse', () => {
  it('only outputs palette colours', () => {
    const src = solid(16, 16, [128, 90, 200]);
    const out = diffuse(src, 16, 16, bw, 'floyd');
    const colours = new Set<string>();
    for (let i = 0; i < out.length; i += 4) colours.add(rgbToHex([out[i], out[i + 1], out[i + 2]]));
    expect([...colours].every((c) => c === '#000000' || c === '#ffffff')).toBe(true);
  });

  it('preserves average brightness of a mid grey with Floyd–Steinberg', () => {
    const w = 64;
    const out = diffuse(solid(w, w, [128, 128, 128]), w, w, bw, 'floyd');
    let white = 0;
    for (let i = 0; i < out.length; i += 4) if (out[i] === 255) white++;
    const share = white / (w * w);
    // sRGB 128 is ~22% linear light, but diffusion here works in sRGB values → ~50%.
    expect(share).toBeGreaterThan(0.4);
    expect(share).toBeLessThan(0.6);
  });

  it('makes transparent pixels fully transparent', () => {
    const out = diffuse(solid(4, 4, [255, 0, 0], 10), 4, 4, bw, 'atkinson');
    for (let i = 3; i < out.length; i += 4) expect(out[i]).toBe(0);
  });

  it('with zero strength equals plain mapping', () => {
    const src = solid(8, 8, [120, 120, 120]);
    expect(Array.from(diffuse(src, 8, 8, bw, 'sierra', 0))).toEqual(Array.from(mapToPalette(src, bw)));
  });
});

describe('diffuse with a palette that cannot reach the input', () => {
  it('keeps error bounded so structure survives', () => {
    // Navy input against a green-only palette: blue error has nowhere to go.
    const gb = new PaletteMatcher([[15, 56, 15], [48, 98, 48], [139, 172, 15], [155, 188, 15]]);
    const w = 64;
    const src = solid(w, w, [26, 28, 44]);
    const out = diffuse(src, w, w, gb, 'floyd');
    let light = 0;
    for (let i = 0; i < out.length; i += 4) if (out[i + 1] >= 172) light++;
    // A dark navy must only use the two darkest greens; light greens mean the
    // unreachable blue error snowballed (the bug this guards against).
    expect(light).toBe(0);
  });
});
