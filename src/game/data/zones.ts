/**
 * Multi-zone world layout.
 * The map is 3680x3680, split into four 1840x1840 zones around a crossroads
 * plaza where the player spawns. Interior wall segments shape lanes and gates.
 * All placement here is data-driven; World seeds the rolls at construction.
 */
import { BIOMES, type Biome } from './biomes';

export const MAP_W = 3680;
export const MAP_H = 3680;
export const ZONE_SIZE = 1840;

export interface ZoneDef {
  id: string;
  name: string;
  /** zone rect in world px */
  x: number;
  y: number;
  w: number;
  h: number;
  biome: Biome;
}

const Z = ZONE_SIZE;

export const ZONES: ZoneDef[] = [
  { id: 'iron', name: 'THE IRON COURT', x: 0, y: 0, w: Z, h: Z, biome: BIOMES[0] },
  { id: 'frost', name: 'THE FROST FOUNDRY', x: Z, y: 0, w: Z, h: Z, biome: BIOMES[1] },
  { id: 'rust', name: 'THE RUST YARD', x: 0, y: Z, w: Z, h: Z, biome: BIOMES[3] },
  { id: 'ember', name: 'THE EMBER PITS', x: Z, y: Z, w: Z, h: Z, biome: BIOMES[2] },
];

/** Center of the crossroads plaza (player spawn). */
export const SPAWN_X = MAP_W / 2;
export const SPAWN_Y = MAP_H / 2;

export interface WallSeg {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Interior wall segments. The plaza is a 520px open square around the map
 * center; each zone keeps one wide gate onto it plus side lanes.
 * Thickness 32. All coordinates are world px.
 */
export const WALL_SEGS: WallSeg[] = [
  // vertical wall (between west and east zones), plaza gate at center
  { x: MAP_W / 2 - 16, y: 0, w: 32, h: MAP_W / 2 - 300 },
  { x: MAP_W / 2 - 16, y: MAP_W / 2 + 300, w: 32, h: MAP_W / 2 - 300 },
  // horizontal wall (between north and south zones), plaza gate at center
  { x: 0, y: MAP_H / 2 - 16, w: MAP_H / 2 - 300, h: 32 },
  { x: MAP_H / 2 + 300, y: MAP_H / 2 - 16, w: MAP_H / 2 - 300, h: 32 },
  // side lanes: NW/NE passage on the north wall + SW/SE on the south
  { x: MAP_W / 2 - 16, y: 150, w: 32, h: 300 },
  { x: MAP_W / 2 - 16, y: MAP_H - 450, w: 32, h: 300 },
  // side lanes: NW/SW + NE/SE on the west/east walls
  { x: 150, y: MAP_H / 2 - 16, w: 300, h: 32 },
  { x: MAP_W - 450, y: MAP_H / 2 - 16, w: 300, h: 32 },
  // cover baffles at the plaza corners (off the gate center-lines)
  { x: MAP_W / 2 - 360, y: MAP_H / 2 - 360, w: 32, h: 170 },
  { x: MAP_W / 2 + 328, y: MAP_H / 2 + 190, w: 32, h: 170 },
  { x: MAP_W / 2 + 328, y: MAP_H / 2 - 360, w: 170, h: 32 },
  { x: MAP_W / 2 - 360, y: MAP_H / 2 + 190, w: 170, h: 32 },
];

export type PatchKind = 'ice' | 'goo';
export interface PatchDef {
  x: number;
  y: number;
  r: number;
  kind: PatchKind;
}
export interface BumperDef { x: number; y: number; r: number }
export interface BoostPadDef { x: number; y: number; w: number; h: number; dx: number; dy: number }
export interface RewardDef {
  x: number;
  y: number;
  kind: 'cache' | 'shrine_might' | 'shrine_regen' | 'shrine_magnet' | 'chest';
}

/**
 * Signature terrain + rewards per zone. Positions are relative to each
 * zone's origin so the layout stays readable; World adds the zone offset
 * and a little seeded jitter.
 */
interface ZoneFeature {
  zone: string;
  patches?: PatchDef[];
  bumpers?: BumperDef[];
  pads?: BoostPadDef[];
  jumpPads?: Array<{ x: number; y: number }>;
  rewards?: RewardDef[];
}

export const ZONE_FEATURES: ZoneFeature[] = [
  {
    // NE — Frost Foundry: big ice field + icy lane, shrine at the far corner
    zone: 'frost',
    patches: [
      { x: 900, y: 500, r: 260, kind: 'ice' },
      { x: 1450, y: 1150, r: 200, kind: 'ice' },
      { x: 500, y: 1250, r: 170, kind: 'ice' },
    ],
    rewards: [
      { x: 1650, y: 150, kind: 'shrine_magnet' },
      { x: 1250, y: 700, kind: 'chest' },
      { x: 350, y: 1600, kind: 'cache' },
    ],
  },
  {
    // SW — Rust Yard: goo blobs + boost lanes + dense cover, shrine far corner
    zone: 'rust',
    patches: [
      { x: 450, y: 600, r: 210, kind: 'goo' },
      { x: 1200, y: 1000, r: 240, kind: 'goo' },
      { x: 700, y: 1500, r: 180, kind: 'goo' },
    ],
    pads: [
      { x: 300, y: 1100, w: 260, h: 60, dx: 1, dy: 0 },
      { x: 1500, y: 400, w: 60, h: 260, dx: 0, dy: -1 },
    ],
    rewards: [
      { x: 1650, y: 1650, kind: 'shrine_regen' },
      { x: 250, y: 200, kind: 'chest' },
      { x: 1550, y: 1250, kind: 'cache' },
    ],
  },
  {
    // SE — Ember Pits: pinball bumpers + jump pads in the open
    zone: 'ember',
    bumpers: [
      { x: 900, y: 800, r: 22 },
      { x: 1250, y: 1150, r: 22 },
      { x: 700, y: 1350, r: 22 },
      { x: 1400, y: 550, r: 22 },
    ],
    jumpPads: [
      { x: 1050, y: 950 },
      { x: 500, y: 500 },
    ],
    rewards: [
      { x: 1650, y: 1650, kind: 'shrine_might' },
      { x: 300, y: 1500, kind: 'cache' },
      { x: 1500, y: 300, kind: 'cache' },
    ],
  },
  {
    // NW — Iron Court: gentle intro zone, one cache near the lanes
    zone: 'iron',
    rewards: [{ x: 1650, y: 150, kind: 'cache' }],
  },
];
