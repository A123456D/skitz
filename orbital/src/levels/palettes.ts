// Region palettes — export SHAPE is fixed (renderer + UI consume it); content
// agents may tune the color VALUES in place but must not rename/remove fields.

export type RegionId = 1 | 2 | 3 | 4;

export interface RegionPalette {
  name: string;
  /** Sky gradient, top → bottom. */
  sky: [string, string];
  sun: string;
  /** Far + mid parallax silhouette tints. */
  far: string;
  mid: string;
  /** Interactive accent (pins, switches, UI highlights in-region). */
  accent: string;
  fog: string;
  /** Ambient dust particle color. */
  dust: string;
}

export const REGION_PALETTES: Record<RegionId, RegionPalette> = {  1: {
    name: 'The Practice Orbit',
    sky: ['#0a1428', '#1b3a52'],
    sun: '#ffe9c4',
    far: '#16283f',
    mid: '#0f1e33',
    accent: '#7fd8e8',
    fog: '#12233a',
    dust: '#9fd8e8',
  },
  2: {
    name: 'The Graveyard',
    sky: ['#120d14', '#3a2530'],
    sun: '#ffb38a',
    far: '#2a1c26',
    mid: '#1a1119',
    accent: '#e8a06f',
    fog: '#1e141d',
    dust: '#c9a68f',
  },
  3: {
    name: 'The Giants',
    sky: ['#050a1e', '#12295e'],
    sun: '#fff3d6',
    far: '#0d1834',
    mid: '#081026',
    accent: '#ffc46b',
    fog: '#0a1430',
    dust: '#a8c4f0',
  },
  4: {
    name: 'The Grand Course',
    sky: ['#0b0618', '#2a1a4e'],
    sun: '#e8d9ff',
    far: '#1a1038',
    mid: '#100a26',
    accent: '#c9a0ff',
    fog: '#140c2e',
    dust: '#cbb4f5',
  },
};
