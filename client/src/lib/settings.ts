import type { RGB } from './color';

export type PaletteMode = 'preset' | 'adaptive' | 'levels' | 'custom';

export type DitherMode =
  | 'none'
  | 'bayer2'
  | 'bayer4'
  | 'bayer8'
  | 'noise'
  | 'floyd'
  | 'atkinson'
  | 'sierra';

export interface Settings {
  /** Output width in art pixels. Height follows the source aspect ratio. */
  resolution: number;
  rotation: 0 | 1 | 2 | 3;
  flipX: boolean;

  brightness: number; // -1..1
  contrast: number; // -1..1
  saturation: number; // 0..2

  paletteMode: PaletteMode;
  presetId: string;
  adaptiveColors: number; // 2..32
  levels: number; // 2..8 per channel
  customPalette: RGB[];

  dither: DitherMode;
  ditherStrength: number; // 0..1

  exportScale: number; // 1..16
}

export const DEFAULT_SETTINGS: Settings = {
  resolution: 160,
  rotation: 0,
  flipX: false,
  brightness: 0,
  contrast: 0.1,
  saturation: 1.1,
  paletteMode: 'preset',
  presetId: 'sweetie-16',
  adaptiveColors: 12,
  levels: 4,
  customPalette: [
    [17, 17, 34],
    [68, 51, 102],
    [204, 85, 119],
    [255, 204, 136],
  ],
  dither: 'bayer4',
  ditherStrength: 0.45,
  exportScale: 8,
};

export interface Look {
  id: string;
  name: string;
  patch: Partial<Settings>;
}

/** One-click starting points. They only touch palette, dither and resolution. */
export const LOOKS: Look[] = [
  { id: 'sweetie', name: 'Sweetie', patch: { paletteMode: 'preset', presetId: 'sweetie-16', dither: 'bayer4', ditherStrength: 0.45, resolution: 160 } },
  { id: 'pico', name: 'PICO-8', patch: { paletteMode: 'preset', presetId: 'pico-8', dither: 'bayer4', ditherStrength: 0.35, resolution: 128 } },
  { id: 'gameboy', name: 'Game Boy', patch: { paletteMode: 'preset', presetId: 'game-boy', dither: 'bayer4', ditherStrength: 0.6, resolution: 160 } },
  { id: 'macpaint', name: '1-bit Mac', patch: { paletteMode: 'preset', presetId: 'one-bit', dither: 'atkinson', ditherStrength: 1, resolution: 256 } },
  { id: 'cga', name: 'CGA', patch: { paletteMode: 'preset', presetId: 'cga', dither: 'bayer8', ditherStrength: 0.7, resolution: 200 } },
  { id: 'adaptive', name: 'Adaptive', patch: { paletteMode: 'adaptive', adaptiveColors: 16, dither: 'floyd', ditherStrength: 0.75, resolution: 192 } },
  { id: 'endesga', name: 'Endesga', patch: { paletteMode: 'preset', presetId: 'endesga-32', dither: 'noise', ditherStrength: 0.3, resolution: 180 } },
  { id: 'poster', name: 'Poster', patch: { paletteMode: 'levels', levels: 3, dither: 'none', ditherStrength: 0, resolution: 96 } },
];

const STORAGE_KEY = 'mozzaic:settings:v2';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* storage can be unavailable (private mode); settings just won't persist */
  }
}

export const DITHER_OPTIONS: { value: DitherMode; label: string; hint: string; gpu: boolean }[] = [
  { value: 'none', label: 'None', hint: 'Flat nearest colour', gpu: true },
  { value: 'bayer2', label: 'Bayer 2×2', hint: 'Coarse ordered pattern', gpu: true },
  { value: 'bayer4', label: 'Bayer 4×4', hint: 'Classic ordered dither', gpu: true },
  { value: 'bayer8', label: 'Bayer 8×8', hint: 'Fine ordered pattern', gpu: true },
  { value: 'noise', label: 'Blue-ish noise', hint: 'Interleaved gradient noise', gpu: true },
  { value: 'floyd', label: 'Floyd–Steinberg', hint: 'Error diffusion (CPU)', gpu: false },
  { value: 'atkinson', label: 'Atkinson', hint: 'Classic Mac 1-bit look (CPU)', gpu: false },
  { value: 'sierra', label: 'Sierra Lite', hint: 'Light error diffusion (CPU)', gpu: false },
];
