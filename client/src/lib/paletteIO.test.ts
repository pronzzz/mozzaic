import { describe, expect, it } from 'vitest';
import { parsePalette, toGplFile, toHexFile } from './paletteIO';

describe('parsePalette', () => {
  it('reads Lospec .hex files', () => {
    expect(parsePalette('000000\nffffff\nff004d\n')).toEqual([[0, 0, 0], [255, 255, 255], [255, 0, 77]]);
  });
  it('reads GIMP .gpl files', () => {
    const gpl = 'GIMP Palette\nName: test\n#\n  0   0   0\tblack\n255 255 255\twhite\n';
    expect(parsePalette(gpl)).toEqual([[0, 0, 0], [255, 255, 255]]);
  });
  it('finds hex tokens in free text and dedupes', () => {
    expect(parsePalette('--a: #fff; --b: #000000; --c: #FFFFFF')).toEqual([[255, 255, 255], [0, 0, 0]]);
  });
  it('round-trips through .hex and .gpl', () => {
    const pal: [number, number, number][] = [[26, 28, 44], [93, 39, 93], [177, 62, 83]];
    expect(parsePalette(toHexFile(pal))).toEqual(pal);
    expect(parsePalette(toGplFile(pal))).toEqual(pal);
  });
});
