/** Per-run biome: recolors the world, sets ambient particles + atmosphere + grade. */

export type AmbientKind = 'dust' | 'snow' | 'ember';

/** ColorMatrix grade inputs (see render/post.ts gradeMatrix). */
export interface GradeSpec {
  sat: number;
  con: number;
  bright: number;
  tint: [number, number, number];
}

export interface Biome {
  id: string;
  name: string;
  /** multiply-tints on the neutral-gray atlas tiles */
  floorTint: number;
  wallTint: number;
  decoTint: number;
  /** bright accent for glowing cracks / vignette */
  accent: number;
  ambient: AmbientKind;
  /** decoration density multiplier */
  deco: number;
  /** backdrop sky gradient (top -> bottom) */
  skyTop: number;
  skyBottom: number;
  /** drifting ground fog tint */
  fogColor: number;
  /** silhouette layer tints, far -> near */
  silhouetteFar: number;
  silhouetteMid: number;
  silhouetteNear: number;
  /** lit-window color on silhouettes (bloom picks these up) */
  windowColor: number;
  /** vignette edge tint + strength */
  vignetteTint: number;
  vignetteAlpha: number;
  /** color grade */
  grade: GradeSpec;
}

export const BIOMES: Biome[] = [
  {
    id: 'iron',
    name: 'THE IRON COURT',
    floorTint: 0x8a90b8,
    wallTint: 0xaab2d4,
    decoTint: 0x707a9e,
    accent: 0x9fb4d8,
    ambient: 'dust',
    deco: 1,
    skyTop: 0x05070f,
    skyBottom: 0x1a2136,
    fogColor: 0x8a94c0,
    silhouetteFar: 0x0b0e18,
    silhouetteMid: 0x121726,
    silhouetteNear: 0x1a2033,
    windowColor: 0xffd98a,
    vignetteTint: 0x060913,
    vignetteAlpha: 0.8,
    grade: { sat: 0.94, con: 1.06, bright: 1.0, tint: [0.96, 1.0, 1.09] },
  },
  {
    id: 'frost',
    name: 'THE FROST FOUNDRY',
    floorTint: 0x6d9cc4,
    wallTint: 0x9cc8e8,
    decoTint: 0x5d88ac,
    accent: 0x9fe8ff,
    ambient: 'snow',
    deco: 1.15,
    skyTop: 0x060d15,
    skyBottom: 0x1d3448,
    fogColor: 0xbfe4ff,
    silhouetteFar: 0x0a121c,
    silhouetteMid: 0x101c2c,
    silhouetteNear: 0x182a3e,
    windowColor: 0xaef2ff,
    vignetteTint: 0x050b12,
    vignetteAlpha: 0.78,
    grade: { sat: 0.97, con: 1.05, bright: 1.04, tint: [0.94, 1.0, 1.1] },
  },
  {
    id: 'ember',
    name: 'THE EMBER PITS',
    floorTint: 0xb08a72,
    wallTint: 0xd09a78,
    decoTint: 0x8a6a56,
    accent: 0xff9a4d,
    ambient: 'ember',
    deco: 1.3,
    skyTop: 0x120505,
    skyBottom: 0x41130b,
    fogColor: 0xff8a4d,
    silhouetteFar: 0x160808,
    silhouetteMid: 0x241010,
    silhouetteNear: 0x351812,
    windowColor: 0xffb35a,
    vignetteTint: 0x120404,
    vignetteAlpha: 0.85,
    grade: { sat: 1.08, con: 1.1, bright: 1.0, tint: [1.1, 0.95, 0.86] },
  },
  {
    id: 'rust',
    name: 'THE RUST YARD',
    floorTint: 0xb0a06a,
    wallTint: 0xd0bc82,
    decoTint: 0x8a7c56,
    accent: 0xffc46b,
    ambient: 'dust',
    deco: 1.2,
    skyTop: 0x0f0b06,
    skyBottom: 0x38270f,
    fogColor: 0xd8b878,
    silhouetteFar: 0x14100a,
    silhouetteMid: 0x20180e,
    silhouetteNear: 0x2e2414,
    windowColor: 0xffd98a,
    vignetteTint: 0x0d0904,
    vignetteAlpha: 0.82,
    grade: { sat: 1.05, con: 1.05, bright: 1.02, tint: [1.07, 1.0, 0.88] },
  },
];
