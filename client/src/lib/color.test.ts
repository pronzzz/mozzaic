import { describe, expect, it } from 'vitest';
import { PaletteMatcher, hexToRgb, levelsPalette, oklabToRgb, rgbToHex, rgbToOklab } from './color';

describe('hex', () => {
  it('parses long and short hex', () => {
    expect(hexToRgb('#ff8000')).toEqual([255, 128, 0]);
    expect(hexToRgb('0f0')).toEqual([0, 255, 0]);
  });
  it('round-trips', () => {
    expect(rgbToHex(hexToRgb('#1d2b53'))).toBe('#1d2b53');
  });
  it('rejects junk', () => {
    expect(() => hexToRgb('#12')).toThrow();
  });
});

describe('oklab', () => {
  it('maps white to L=1 and black to L=0', () => {
    expect(rgbToOklab([255, 255, 255])[0]).toBeCloseTo(1, 3);
    expect(rgbToOklab([0, 0, 0])[0]).toBeCloseTo(0, 5);
  });
  it('round-trips sRGB colours', () => {
    for (const c of [[255, 0, 77], [41, 173, 255], [12, 34, 56]] as [number, number, number][]) {
      const back = oklabToRgb(rgbToOklab(c));
      back.forEach((v, i) => expect(v).toBeCloseTo(c[i], 0));
    }
  });
});

describe('PaletteMatcher', () => {
  const m = new PaletteMatcher([[0, 0, 0], [255, 255, 255], [255, 0, 0]]);
  it('finds the perceptually nearest entry', () => {
    expect(m.nearest(10, 10, 10)).toBe(0);
    expect(m.nearest(240, 240, 240)).toBe(1);
    expect(m.nearest(200, 30, 20)).toBe(2);
  });
  it('clamps out-of-range input', () => {
    expect(m.nearest(-50, -50, -50)).toBe(0);
    expect(m.nearest(400, 400, 400)).toBe(1);
  });
});

describe('levelsPalette', () => {
  it('builds n^3 colours including black and white', () => {
    const p = levelsPalette(3);
    expect(p).toHaveLength(27);
    expect(p[0]).toEqual([0, 0, 0]);
    expect(p[26]).toEqual([255, 255, 255]);
  });
});
