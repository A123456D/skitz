// themes.ts — per-level WORLD THEMES (one unique world per level, L01..L24).
//
// Pure TS: no Pixi, no DOM — unit-testable headless (see tests/render.test.ts).
// The background layer consumes a theme for the whole scene grade: sky gradient,
// key-light sun color + placement, nebula hues/alpha, silhouette motif + tints,
// star and dust tinting. Region palettes (../levels/palettes.ts) survive only
// as a faint ~10% base influence blended into the sky so the four regions keep
// a whisper of continuity.
//
// Curation rules (enforced by tests):
//  - No two ADJACENT levels share a hue family (deep teal, ember, violet, jade,
//    ice-blue, gold, crimson, aurora green, magenta, slate, champagne, cobalt,
//    burnt orange, rose, petrol, copper, indigo, lime, coral, steel, plum,
//    sage, aqua, wine).
//  - No two ADJACENT levels share a silhouette motif (the 6 archetypes).
//  - nebulaAlpha stays inside 0.25..0.4 — brighter than the old <=0.18 wash but
//    still far below the lit green pad, which remains the brightest warm
//    landmark on every level.
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

export interface WorldTheme {
  /** Flavor name (screenshots, debug overlay). */
  name: string;
  /** Curated hue family — adjacency uniqueness is asserted on this. */
  family: string;
  /** Sky gradient, top -> bottom (canvas hex strings). */
  skyTop: string;
  skyBottom: string;
  /** Key-light color: sun glow/core tint AND the scene's warm wash. */
  sunColor: string;
  /** Where the key light sits (drives baked body terminators via themeSunPos). */
  sunSide: SunSide;
  /** 2-3 nebula hues, cycled across the additive fog blobs. */
  nebulaColors: readonly string[];
  /** Nebula blob alpha band, 0.25..0.4 (readability cap, see header). */
  nebulaAlpha: number;
  /** Which of the 6 silhouette archetypes this world shows. */
  silhouetteMotif: WorldMotif;
  /** Ambient dust mote tint. */
  dustColor: string;
  /** World accent: star tint, silhouette hue base, UI-adjacent glow. */
  accentTint: string;
}

/**
 * The 24 curated worlds. Hue families rotate so neighbors always contrast;
 * motifs walk all 6 archetypes with no adjacent repeats (L17/L18 deliberately
 * break the 6-cycle to keep families + motifs both de-collided).
 */
export const THEMES: Readonly<Record<string, WorldTheme>> = {
  L01: { name: 'Teal Reach',      family: 'deep teal',    skyTop: '#04222b', skyBottom: '#0e4d55', sunColor: '#c8fff2', sunSide: 'right', nebulaColors: ['#0f6e6e', '#1fae9e'],                 nebulaAlpha: 0.3,  silhouetteMotif: 'arches',   dustColor: '#9fe8de', accentTint: '#5fe8d0' },
  L02: { name: 'Ember Yard',      family: 'ember',        skyTop: '#1c0a08', skyBottom: '#5c2412', sunColor: '#ffb36b', sunSide: 'low',   nebulaColors: ['#a83a18', '#ff7a33', '#d94f2a'],      nebulaAlpha: 0.34, silhouetteMotif: 'wreck',    dustColor: '#e8a684', accentTint: '#ff9e5e' },
  L03: { name: 'Violet Deep',     family: 'violet',       skyTop: '#140b26', skyBottom: '#3a2368', sunColor: '#e8d9ff', sunSide: 'high',  nebulaColors: ['#6a3ad9', '#9a5fff'],                 nebulaAlpha: 0.32, silhouetteMotif: 'crystals', dustColor: '#c9b4f5', accentTint: '#b98fff' },
  L04: { name: 'Jade Hollow',     family: 'jade',         skyTop: '#07200f', skyBottom: '#0f4d38', sunColor: '#d6ffe0', sunSide: 'left',  nebulaColors: ['#1f7a4d', '#3fae76'],                 nebulaAlpha: 0.28, silhouetteMotif: 'horizon',  dustColor: '#a8e8c0', accentTint: '#58e8a0' },
  L05: { name: 'Ice Drift',       family: 'ice-blue',     skyTop: '#061626', skyBottom: '#16466b', sunColor: '#dff2ff', sunSide: 'right', nebulaColors: ['#3f8fd9', '#7fc4f0'],                 nebulaAlpha: 0.3,  silhouetteMotif: 'aurora',   dustColor: '#c4e4fa', accentTint: '#8fd0ff' },
  L06: { name: 'Gold Meridian',   family: 'gold',         skyTop: '#241604', skyBottom: '#6b4a10', sunColor: '#ffe9a8', sunSide: 'low',   nebulaColors: ['#d9a021', '#ffd24f'],                 nebulaAlpha: 0.35, silhouetteMotif: 'grid',     dustColor: '#f0dca0', accentTint: '#ffd76b' },
  L07: { name: 'Crimson Shelf',   family: 'crimson',      skyTop: '#20050c', skyBottom: '#6b1024', sunColor: '#ffb8b0', sunSide: 'high',  nebulaColors: ['#c41e3e', '#ff4d6a'],                 nebulaAlpha: 0.34, silhouetteMotif: 'arches',   dustColor: '#f0aab2', accentTint: '#ff6b85' },
  L08: { name: 'Aurora Veil',     family: 'aurora green', skyTop: '#031a12', skyBottom: '#0d4d3f', sunColor: '#c4ffdd', sunSide: 'left',  nebulaColors: ['#17c888', '#66ffb8', '#2ad9a8'],      nebulaAlpha: 0.3,  silhouetteMotif: 'wreck',    dustColor: '#a0f0cc', accentTint: '#4dffb0' },
  L09: { name: 'Magenta Bloom',   family: 'magenta',      skyTop: '#20041c', skyBottom: '#6b1257', sunColor: '#ffb8ec', sunSide: 'right', nebulaColors: ['#d92a9e', '#ff6bc4'],                 nebulaAlpha: 0.33, silhouetteMotif: 'crystals', dustColor: '#f0b4e0', accentTint: '#ff85d0' },
  L10: { name: 'Slate Quiet',     family: 'slate',        skyTop: '#12161c', skyBottom: '#39434f', sunColor: '#e8eef2', sunSide: 'high',  nebulaColors: ['#5f7186', '#8fa4b8'],                 nebulaAlpha: 0.26, silhouetteMotif: 'horizon',  dustColor: '#c0ccd6', accentTint: '#a8bccb' },
  L11: { name: 'Champagne Rise',  family: 'champagne',    skyTop: '#1e1710', skyBottom: '#5c4a30', sunColor: '#fff0d0', sunSide: 'low',   nebulaColors: ['#c4a878', '#e8d0a8'],                 nebulaAlpha: 0.29, silhouetteMotif: 'aurora',   dustColor: '#e8dcc0', accentTint: '#f0dcb0' },
  L12: { name: 'Cobalt Expanse',  family: 'cobalt',       skyTop: '#050c22', skyBottom: '#14306b', sunColor: '#d0e0ff', sunSide: 'right', nebulaColors: ['#2450d9', '#5f8aff'],                 nebulaAlpha: 0.32, silhouetteMotif: 'grid',     dustColor: '#a8bcf0', accentTint: '#6b93ff' },
  L13: { name: 'Burnt Orbit',     family: 'burnt orange', skyTop: '#1e0e04', skyBottom: '#66300f', sunColor: '#ffc890', sunSide: 'high',  nebulaColors: ['#c4601e', '#ff9040'],                 nebulaAlpha: 0.35, silhouetteMotif: 'arches',   dustColor: '#f0c0a0', accentTint: '#ffa860' },
  L14: { name: 'Rose Span',       family: 'rose',         skyTop: '#1f0a10', skyBottom: '#63283c', sunColor: '#ffd8dc', sunSide: 'left',  nebulaColors: ['#c4546e', '#ff8fa5'],                 nebulaAlpha: 0.3,  silhouetteMotif: 'wreck',    dustColor: '#f0c4cc', accentTint: '#ff9fb0' },
  L15: { name: 'Petrol Trench',   family: 'petrol',       skyTop: '#04181e', skyBottom: '#0d3d4d', sunColor: '#bfe8e0', sunSide: 'right', nebulaColors: ['#0e5f70', '#2a9db0'],                 nebulaAlpha: 0.29, silhouetteMotif: 'crystals', dustColor: '#9ccfdc', accentTint: '#4fc4d6' },
  L16: { name: 'Copper Wastes',   family: 'copper',       skyTop: '#190d06', skyBottom: '#57301a', sunColor: '#ffcf9e', sunSide: 'low',   nebulaColors: ['#a85f2e', '#d98a4f'],                 nebulaAlpha: 0.34, silhouetteMotif: 'horizon',  dustColor: '#e8bfa0', accentTint: '#e8a070' },
  L17: { name: 'Indigo Vault',    family: 'indigo',       skyTop: '#080a1e', skyBottom: '#232a66', sunColor: '#cdd4ff', sunSide: 'high',  nebulaColors: ['#4050c0', '#7a88e8'],                 nebulaAlpha: 0.31, silhouetteMotif: 'grid',     dustColor: '#b0b8ea', accentTint: '#8894f0' },
  L18: { name: 'Lime Terrace',    family: 'lime',         skyTop: '#101c04', skyBottom: '#3d5c14', sunColor: '#eaffc4', sunSide: 'left',  nebulaColors: ['#7aa81e', '#a8d94a'],                 nebulaAlpha: 0.28, silhouetteMotif: 'arches',   dustColor: '#d2ecb0', accentTint: '#bce85f' },
  L19: { name: 'Coral Fields',    family: 'coral',        skyTop: '#1e0b0a', skyBottom: '#66302c', sunColor: '#ffd4c4', sunSide: 'right', nebulaColors: ['#d96050', '#ff9a80'],                 nebulaAlpha: 0.33, silhouetteMotif: 'aurora',   dustColor: '#f0c4b8', accentTint: '#ffa890' },
  L20: { name: 'Steel Silence',   family: 'steel',        skyTop: '#0e1218', skyBottom: '#2f3d4d', sunColor: '#e0ecf5', sunSide: 'high',  nebulaColors: ['#54708c', '#86a4bd'],                 nebulaAlpha: 0.26, silhouetteMotif: 'wreck',    dustColor: '#bccbd9', accentTint: '#9db8cf' },
  L21: { name: 'Plum Mirage',     family: 'plum',         skyTop: '#190717', skyBottom: '#52264a', sunColor: '#f2cfe8', sunSide: 'low',   nebulaColors: ['#8c3a78', '#c46aab'],                 nebulaAlpha: 0.32, silhouetteMotif: 'horizon',  dustColor: '#e0b4d4', accentTint: '#d98cc0' },
  L22: { name: 'Sage Rim',        family: 'sage',         skyTop: '#0f1610', skyBottom: '#364938', sunColor: '#e2eed9', sunSide: 'left',  nebulaColors: ['#5f7d58', '#93b58a'],                 nebulaAlpha: 0.27, silhouetteMotif: 'crystals', dustColor: '#c2d4ba', accentTint: '#a8c99a' },
  L23: { name: 'Aqua Circuit',    family: 'aqua',         skyTop: '#041a20', skyBottom: '#0f4a5c', sunColor: '#c8f2ff', sunSide: 'right', nebulaColors: ['#1690b0', '#4fd0e8'],                 nebulaAlpha: 0.3,  silhouetteMotif: 'grid',     dustColor: '#a6e2ef', accentTint: '#5fdcec' },
  L24: { name: 'Wine Crown',      family: 'wine',         skyTop: '#1c060f', skyBottom: '#5a122e', sunColor: '#f2c4d0', sunSide: 'high',  nebulaColors: ['#a02048', '#d94f78'],                 nebulaAlpha: 0.34, silhouetteMotif: 'aurora',   dustColor: '#e8b4c2', accentTint: '#e87394' },
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
