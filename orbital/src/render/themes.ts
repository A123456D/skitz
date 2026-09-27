// themes.ts — per-level WORLD THEMES: 24 variations of THE ICON IDENTITY.
//
// ORBITAL's look is the app icon (public/icon.svg): a deep teal-emerald space
// (#0e3a38 -> #04100f), a rim-lit planet limb, a glowing green cup, a dotted
// cyan gravity arc, sparse stars, thin elegant lines. Every level is THAT
// world — variation lives INSIDE the family, never outside it:
//   - sky gradient slides across teal <-> deep-emerald <-> ice-mint
//   - nebula tints stay in the green/teal/cyan family
//   - star density, key-light placement, limb side and silhouette motif vary
// There are no crimson/magenta/gold worlds any more — ORBITAL is THE teal game.
// (Warm accents live only in gameplay language: amber interactivity, red
// danger, and the cup's green bloom, which stays the brightest landmark.)
//
// Pure TS: no Pixi, no DOM — unit-testable headless (see tests/render.test.ts).
//
// Curation rules (enforced by tests):
//  - Every `family` is a distinct sub-family of the identity (24 unique names)
//    so no two levels read identical; adjacent levels additionally never share
//    a family or a silhouette motif.
//  - nebulaAlpha stays inside 0.25..0.4 — atmospheric, but still far below the
//    lit green pad, which remains the brightest landmark on every level.
//  - Unknown ids resolve through an FNV hash into the curated table, so any
//    bonus/test level still gets a stable, valid world.

import { hashSeed } from './core';
import type { Bounds } from './camera';

/** Key-light placement around the level (screen coords, y grows downward). */
export type SunSide = 'left' | 'right' | 'high' | 'low';

/** The 6 silhouette archetypes (drawn by layers/background.ts). */
export type WorldMotif = 'arches' | 'wreck' | 'crystals' | 'horizon' | 'aurora' | 'grid';

export const WORLD_MOTIFS: readonly WorldMotif[] = [
  'arches', 'wreck', 'crystals', 'horizon', 'aurora', 'grid',
];

/** Index into the background layer's archetype art, from a motif name. */
export const MOTIF_INDEX: Readonly<Record<WorldMotif, number>> = {
  arches: 0,
  wreck: 1,
  crystals: 2,
  horizon: 3,
  aurora: 4,
  grid: 5,
};

/** Where the big rim-lit planet limb sits (the icon's bottom-left limb). */
export type LimbSide = 'bottom-left' | 'bottom-right' | 'top-back';

export const LIMB_SIDES: readonly LimbSide[] = ['bottom-left', 'bottom-right', 'top-back'];

export interface WorldTheme {
  /** Flavor name (screenshots, debug overlay). */
  name: string;
  /** Identity sub-family — uniqueness across all 24 levels is asserted. */
  family: string;
  /** Sky gradient, top -> bottom (canvas hex strings, always dark space). */
  skyTop: string;
  skyBottom: string;
  /** Key-light color: pale mint-ice sun glow/core tint AND the scene wash. */
  sunColor: string;
  /** Where the key light sits (drives baked body terminators via themeSunPos). */
  sunSide: SunSide;
  /** 2-3 nebula hues (green/teal/cyan family), cycled across the fog blobs. */
  nebulaColors: readonly string[];
  /** Nebula blob alpha band, 0.25..0.4 (readability cap, see header). */
  nebulaAlpha: number;
  /** Which of the 6 silhouette archetypes this world shows. */
  silhouetteMotif: WorldMotif;
  /** Where the rim-lit planet limb of this world sits. */
  limbSide: LimbSide;
  /** Starfield density multiplier (sparse icon sky: ~0.65..1.3). */
  starDensity: number;
  /** Ambient dust mote tint. */
  dustColor: string;
  /** World accent: star tint, silhouette hue base, atmosphere-halo tint. */
  accentTint: string;
}

/**
 * The 24 curated worlds — one icon identity, 24 weathers. Motifs walk all 6
 * archetypes with no adjacent repeats; families are all distinct so every
 * level still reads as its own place inside the teal universe.
 */
export const THEMES: Readonly<Record<string, WorldTheme>> = {
  L01: { name: 'Teal Reach',      family: 'abyssal teal',   skyTop: '#04222a', skyBottom: '#0e4a4c', sunColor: '#d8fff2', sunSide: 'right', nebulaColors: ['#0f6e66', '#1fae9a'],                 nebulaAlpha: 0.30, silhouetteMotif: 'arches',   limbSide: 'bottom-left',  starDensity: 1.0,  dustColor: '#9fe8de', accentTint: '#5fe8d0' },
  L02: { name: 'Verdant Yard',    family: 'jade mist',      skyTop: '#04160f', skyBottom: '#0d4534', sunColor: '#d2f8e4', sunSide: 'low',   nebulaColors: ['#1f8a5e', '#35c890'],                 nebulaAlpha: 0.30, silhouetteMotif: 'wreck',    limbSide: 'bottom-right', starDensity: 0.9,  dustColor: '#a8e8c8', accentTint: '#62e8a8' },
  L03: { name: 'Mint Deep',       family: 'glacial mint',   skyTop: '#05242a', skyBottom: '#14545c', sunColor: '#c8f8f4', sunSide: 'high',  nebulaColors: ['#1f8ea0', '#4fd0d8'],                 nebulaAlpha: 0.28, silhouetteMotif: 'crystals', limbSide: 'top-back',     starDensity: 0.7,  dustColor: '#b0ecf0', accentTint: '#6fe4dc' },
  L04: { name: 'Jade Hollow',     family: 'deep emerald',   skyTop: '#03180e', skyBottom: '#0c4430', sunColor: '#d6ffe4', sunSide: 'left',  nebulaColors: ['#177a50', '#2fb888'],                 nebulaAlpha: 0.28, silhouetteMotif: 'horizon',  limbSide: 'bottom-left',  starDensity: 1.15, dustColor: '#a0e8c4', accentTint: '#58e8a0' },
  L05: { name: 'Ice Drift',       family: 'lagoon cyan',    skyTop: '#042028', skyBottom: '#104c5e', sunColor: '#d8f4ff', sunSide: 'right', nebulaColors: ['#1f8fa8', '#4fc4d8'],                 nebulaAlpha: 0.30, silhouetteMotif: 'aurora',   limbSide: 'bottom-right', starDensity: 1.05, dustColor: '#b4e8f2', accentTint: '#6fd8e8' },
  L06: { name: 'Seafoam Rise',    family: 'seafoam',        skyTop: '#051d18', skyBottom: '#114a3e', sunColor: '#dcfbe8', sunSide: 'low',   nebulaColors: ['#239878', '#48d8a8'],                 nebulaAlpha: 0.32, silhouetteMotif: 'grid',     limbSide: 'top-back',     starDensity: 0.85, dustColor: '#b8f0d8', accentTint: '#78ecb4' },
  L07: { name: 'Emerald Shelf',   family: 'verdigris',      skyTop: '#031511', skyBottom: '#0b3d34', sunColor: '#d0f8e8', sunSide: 'high',  nebulaColors: ['#128268', '#2ab894'],                 nebulaAlpha: 0.30, silhouetteMotif: 'arches',   limbSide: 'bottom-left',  starDensity: 1.2,  dustColor: '#9ce4d0', accentTint: '#52e0b0' },
  L08: { name: 'Aurora Veil',     family: 'ice teal',       skyTop: '#04191c', skyBottom: '#0d4a48', sunColor: '#d4fff4', sunSide: 'left',  nebulaColors: ['#17c888', '#66ffb8', '#2ad9a8'],      nebulaAlpha: 0.30, silhouetteMotif: 'wreck',    limbSide: 'bottom-right', starDensity: 0.8,  dustColor: '#a0f0d4', accentTint: '#4dffb0' },
  L09: { name: 'Reef Bloom',      family: 'moss jade',      skyTop: '#041a14', skyBottom: '#0f4a38', sunColor: '#d8f8ec', sunSide: 'right', nebulaColors: ['#1f9870', '#3fd098'],                 nebulaAlpha: 0.31, silhouetteMotif: 'crystals', limbSide: 'top-back',     starDensity: 1.1,  dustColor: '#ace8d0', accentTint: '#5ae8a8' },
  L10: { name: 'Quiet Teal',      family: 'emerald night',  skyTop: '#041318', skyBottom: '#0a3644', sunColor: '#d2f2ea', sunSide: 'high',  nebulaColors: ['#10606a', '#2a9a94'],                 nebulaAlpha: 0.27, silhouetteMotif: 'horizon',  limbSide: 'bottom-right', starDensity: 0.75, dustColor: '#9cdcd8', accentTint: '#4fc8c0' },
  L11: { name: 'Tidal Terrace',   family: 'petrol teal',    skyTop: '#042024', skyBottom: '#0f4a52', sunColor: '#d4f6f0', sunSide: 'low',   nebulaColors: ['#0e7280', '#2aa8b0'],                 nebulaAlpha: 0.29, silhouetteMotif: 'aurora',   limbSide: 'bottom-left',  starDensity: 0.9,  dustColor: '#a2e4e2', accentTint: '#52d4d0' },
  L12: { name: 'Mint Expanse',    family: 'mint aurora',    skyTop: '#06262c', skyBottom: '#175a60', sunColor: '#e0fcf4', sunSide: 'right', nebulaColors: ['#35c8a0', '#7ae8c8'],                 nebulaAlpha: 0.33, silhouetteMotif: 'grid',     limbSide: 'top-back',     starDensity: 1.25, dustColor: '#c0f2e0', accentTint: '#8df0c8' },
  L13: { name: 'Deep Bough',      family: 'pine shadow',    skyTop: '#03140e', skyBottom: '#0a3828', sunColor: '#d0f6e2', sunSide: 'high',  nebulaColors: ['#116448', '#24a080'],                 nebulaAlpha: 0.28, silhouetteMotif: 'arches',   limbSide: 'bottom-left',  starDensity: 1.0,  dustColor: '#98e0c8', accentTint: '#4ad898' },
  L14: { name: 'Glass Span',      family: 'reef cyan',      skyTop: '#041e24', skyBottom: '#0f4654', sunColor: '#d6f2fa', sunSide: 'left',  nebulaColors: ['#1a8a9e', '#3abcc8'],                 nebulaAlpha: 0.30, silhouetteMotif: 'wreck',    limbSide: 'bottom-right', starDensity: 0.85, dustColor: '#aae6ee', accentTint: '#5cd4dc' },
  L15: { name: 'Petrol Trench',   family: 'malachite',      skyTop: '#03181a', skyBottom: '#0c4244', sunColor: '#ceeae4', sunSide: 'right', nebulaColors: ['#0e5f58', '#229a8c'],                 nebulaAlpha: 0.29, silhouetteMotif: 'crystals', limbSide: 'top-back',     starDensity: 1.05, dustColor: '#96dcd2', accentTint: '#46c8b4' },
  L16: { name: 'Horizon Crown',   family: 'arctic jade',    skyTop: '#051d22', skyBottom: '#124e50', sunColor: '#e2f8f0', sunSide: 'low',   nebulaColors: ['#1f9080', '#48c8b0'],                 nebulaAlpha: 0.32, silhouetteMotif: 'horizon',  limbSide: 'top-back',     starDensity: 1.2,  dustColor: '#b4eee0', accentTint: '#6ce4cc' },
  L17: { name: 'Vault of Pines',  family: 'serpentine',     skyTop: '#041710', skyBottom: '#0d402a', sunColor: '#d4f6e0', sunSide: 'high',  nebulaColors: ['#177052', '#30b090'],                 nebulaAlpha: 0.29, silhouetteMotif: 'grid',     limbSide: 'bottom-left',  starDensity: 0.7,  dustColor: '#a4e8cc', accentTint: '#5ce0a8' },
  L18: { name: 'Jade Terrace',    family: 'harbor teal',    skyTop: '#041c20', skyBottom: '#0e4850', sunColor: '#d8f6ee', sunSide: 'left',  nebulaColors: ['#158878', '#32b8a4'],                 nebulaAlpha: 0.28, silhouetteMotif: 'arches',   limbSide: 'bottom-right', starDensity: 1.1,  dustColor: '#a4e8dc', accentTint: '#56e0c4' },
  L19: { name: 'Celadon Fields',  family: 'celadon mist',   skyTop: '#052226', skyBottom: '#155058', sunColor: '#defcf4', sunSide: 'right', nebulaColors: ['#2aa890', '#68e0c0'],                 nebulaAlpha: 0.31, silhouetteMotif: 'aurora',   limbSide: 'top-back',     starDensity: 1.3,  dustColor: '#baf0e0', accentTint: '#7ae8cc' },
  L20: { name: 'Deepwater Still', family: 'abyss green',    skyTop: '#030f12', skyBottom: '#093038', sunColor: '#ceeae6', sunSide: 'high',  nebulaColors: ['#0d5860', '#22908c'],                 nebulaAlpha: 0.26, silhouetteMotif: 'wreck',    limbSide: 'bottom-left',  starDensity: 0.65, dustColor: '#92dcd8', accentTint: '#44c4bc' },
  L21: { name: 'Mirage Pines',    family: 'frost cyan',     skyTop: '#042026', skyBottom: '#0f4a56', sunColor: '#d8f4f8', sunSide: 'low',   nebulaColors: ['#1f92a4', '#48ccd4'],                 nebulaAlpha: 0.30, silhouetteMotif: 'horizon',  limbSide: 'bottom-left',  starDensity: 1.0,  dustColor: '#a6e6ea', accentTint: '#58d8dc' },
  L22: { name: 'Tidal Emerald',   family: 'chrysolite',     skyTop: '#041a12', skyBottom: '#0e4632', sunColor: '#d6f8e6', sunSide: 'left',  nebulaColors: ['#1a8a5e', '#38c890'],                 nebulaAlpha: 0.29, silhouetteMotif: 'crystals', limbSide: 'bottom-right', starDensity: 1.15, dustColor: '#a6ecd0', accentTint: '#60e8ac' },
  L23: { name: 'Aqua Circuit',    family: 'boreal teal',    skyTop: '#04242a', skyBottom: '#13565e', sunColor: '#d6f6fa', sunSide: 'right', nebulaColors: ['#1690a4', '#4fd0dc'],                 nebulaAlpha: 0.30, silhouetteMotif: 'grid',     limbSide: 'bottom-left',  starDensity: 0.95, dustColor: '#a6e6ef', accentTint: '#5fdcec' },
  L24: { name: 'Evergreen Crown', family: 'dark chrysolite', skyTop: '#031510', skyBottom: '#0b3e2c', sunColor: '#d2f6e4', sunSide: 'high', nebulaColors: ['#127050', '#28b48c'],                 nebulaAlpha: 0.31, silhouetteMotif: 'aurora',   limbSide: 'top-back',     starDensity: 0.8,  dustColor: '#9ee6cc', accentTint: '#4ee8a0' },
};

export const THEME_COUNT = Object.keys(THEMES).length;

const SUN_LEVEL_IDS = THEME_COUNT; // fallback pool = the curated set

/**
 * The theme for a level id. Known ids hit the curated table; anything else
 * hashes (FNV-1a, stable across sessions) into the table so bonus/procedural
 * levels still get a deterministic, fully-valid world.
 */
export function worldThemeFor(levelId: string): WorldTheme {
  const curated = THEMES[levelId];
  if (curated) return curated;
  return THEMES[`L${String((hashSeed(levelId) % SUN_LEVEL_IDS) + 1).padStart(2, '0')}`];
}

/** Canonical angle per sun side (radians; y grows downward, sun stays high). */
const SUN_ANGLE: Readonly<Record<SunSide, number>> = {
  left: -2.35, // up-left diagonal
  right: -0.79, // up-right diagonal
  high: -1.45, // near-zenith
  low: -0.25, // hugging the right horizon (long shadows mood)
};

/**
 * World-space position of the level's key light — the single source of truth
 * shared by the background glow AND the bodies layer, so baked terminators
 * always face the actual light (same contract as the old regionSun).
 */
export function themeSunPos(side: SunSide, b: Bounds): { x: number; y: number } {
  const a = SUN_ANGLE[side];
  const sd = 0.82; // sit just inside the framing so the glow overlaps play
  return {
    x: b.cx + Math.cos(a) * b.rx * sd,
    y: b.cy + Math.sin(a) * b.ry * sd,
  };
}
