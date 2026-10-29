import { hexToRgb, type RGB } from './color';

export interface PalettePreset {
  id: string;
  name: string;
  /** Short note shown under the swatches. */
  note: string;
  colors: string[];
}

/**
 * Built-in palettes. Hex values follow the published versions on Lospec
 * (https://lospec.com/palette-list) or the original hardware references.
 */
export const PALETTES: PalettePreset[] = [
  {
    id: 'pico-8',
    name: 'PICO-8',
    note: 'Fantasy console · 16 colours',
    colors: [
      '#000000', '#1d2b53', '#7e2553', '#008751', '#ab5236', '#5f574f', '#c2c3c7', '#fff1e8',
      '#ff004d', '#ffa300', '#ffec27', '#00e436', '#29adff', '#83769c', '#ff77a8', '#ffccaa',
    ],
  },
  {
    id: 'sweetie-16',
    name: 'Sweetie 16',
    note: 'GrafxKid · 16 colours',
    colors: [
      '#1a1c2c', '#5d275d', '#b13e53', '#ef7d57', '#ffcd75', '#a7f070', '#38b764', '#257179',
      '#29366f', '#3b5dc9', '#41a6f6', '#73eff7', '#f4f4f4', '#94b0c2', '#566c86', '#333c57',
    ],
  },
  {
    id: 'endesga-32',
    name: 'Endesga 32',
    note: 'Endesga · 32 colours',
    colors: [
      '#be4a2f', '#d77643', '#ead4aa', '#e4a672', '#b86f50', '#733e39', '#3e2731', '#a22633',
      '#e43b44', '#f77622', '#feae34', '#fee761', '#63c74d', '#3e8948', '#265c42', '#193c3e',
      '#124e89', '#0099db', '#2ce8f5', '#ffffff', '#c0cbdc', '#8b9bb4', '#5a6988', '#3a4466',
      '#262b44', '#181425', '#ff0044', '#68386c', '#b55088', '#f6757a', '#e8b796', '#c28569',
    ],
  },
  {
    id: 'game-boy',
    name: 'Game Boy',
    note: 'DMG-01 green · 4 shades',
    colors: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'],
  },
  {
    id: 'game-boy-pocket',
    name: 'Pocket Grey',
    note: 'Game Boy Pocket · 4 shades',
    colors: ['#000000', '#555555', '#aaaaaa', '#ffffff'],
  },
  {
    id: 'cga',
    name: 'CGA Mode 4',
    note: 'IBM CGA palette 1 · 4 colours',
    colors: ['#000000', '#55ffff', '#ff55ff', '#ffffff'],
  },
  {
    id: 'one-bit',
    name: '1-bit',
    note: 'Black & white',
    colors: ['#000000', '#ffffff'],
  },
  {
    id: 'paper',
    name: 'Ink & Paper',
    note: 'Warm 1-bit · 2 colours',
    colors: ['#2b2129', '#f2e8d5'],
  },
  {
    id: 'nord',
    name: 'Nord',
    note: 'Arctic UI palette · 16 colours',
    colors: [
      '#2e3440', '#3b4252', '#434c5e', '#4c566a', '#d8dee9', '#e5e9f0', '#eceff4', '#8fbcbb',
      '#88c0d0', '#81a1c1', '#5e81ac', '#bf616a', '#d08770', '#ebcb8b', '#a3be8c', '#b48ead',
    ],
  },
  {
    id: 'vaporwave',
    name: 'Vapor',
    note: 'Neon dusk · 8 colours',
    colors: ['#0d0221', '#261447', '#541388', '#d40078', '#ff6c11', '#ffd319', '#2de2e6', '#f6f7f9'],
  },
];

export function getPreset(id: string): PalettePreset {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0];
}

export function presetRgb(id: string): RGB[] {
  return getPreset(id).colors.map(hexToRgb);
}
