import { describe, expect, it } from 'vitest';
import { extractPalette } from './kmeans';

describe('extractPalette', () => {
  it('recovers the colours of a two-colour image', () => {
    const px = new Uint8ClampedArray(200 * 4);
    for (let i = 0; i < 200; i++) px.set(i < 100 ? [255, 0, 0, 255] : [0, 0, 255, 255], i * 4);
    const pal = extractPalette(px, 2);
    expect(pal).toHaveLength(2);
    const flat = pal.map((c) => c.join(','));
    expect(flat).toContain('255,0,0');
    expect(flat).toContain('0,0,255');
  });

  it('is deterministic', () => {
    const px = new Uint8ClampedArray(5000 * 4);
    for (let i = 0; i < px.length; i++) px[i] = (i * 2654435761) % 251;
    for (let i = 3; i < px.length; i += 4) px[i] = 255;
    expect(extractPalette(px, 8)).toEqual(extractPalette(px, 8));
  });

  it('ignores transparent pixels', () => {
    const px = new Uint8ClampedArray([255, 255, 255, 0, 10, 20, 30, 255]);
    expect(extractPalette(px, 4)).toEqual([[10, 20, 30]]);
  });
});
