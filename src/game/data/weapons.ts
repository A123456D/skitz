/** Weapon + passive definitions. All numbers scale by level (1-based). */

export type WeaponId = 'slam' | 'shot' | 'orbit' | 'dash' | 'trail' | 'chain' | 'boomer';
export type PassiveId = 'mass' | 'velocity' | 'magnet' | 'vitality' | 'regen' | 'impact' | 'ricochet' | 'luck';
export type Rarity = 'common' | 'rare' | 'epic';

export interface WeaponDef {
  id: WeaponId;
  name: string;
  icon: string;
  desc: string;
  maxLevel: number;
  rarity: Rarity;
  /** DESCEND depth required before this weapon joins drafts (save unlock gate) */
  unlockDepth?: number;
  /** per-level param table; index = level-1 */
  levels: Array<{
    cd: number;        // seconds between activations
    dmg: number;
    knock: number;     // px/s impulse
    count?: number;    // projectiles / spikes / chain targets
    radius?: number;   // aoe / orbit radius
    speed?: number;    // projectile speed / orbit speed
    bounces?: number;
  }>;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  slam: {
    id: 'slam', name: 'Seismic Slam', icon: '💥', maxLevel: 5, rarity: 'common',
    desc: 'Slam the ground: damages, launches and CHARGES every enemy around you. Charged enemies damage others they crash into.',
    levels: [
      { cd: 2.4, dmg: 14, knock: 330, radius: 92 },
      { cd: 2.2, dmg: 20, knock: 360, radius: 100 },
      { cd: 2.0, dmg: 27, knock: 390, radius: 110 },
      { cd: 1.7, dmg: 36, knock: 430, radius: 122 },
      { cd: 1.4, dmg: 48, knock: 480, radius: 138 },
    ],
  },
  shot: {
    id: 'shot', name: 'Ricochet Round', icon: '🔸', maxLevel: 5, rarity: 'common',
    desc: 'Fires bolts at the nearest enemy that ricochet to the next one. Bolts knock enemies flying.',
    levels: [
      { cd: 1.15, dmg: 11, knock: 170, count: 1, speed: 300, bounces: 2 },
      { cd: 1.05, dmg: 14, knock: 180, count: 1, speed: 310, bounces: 3 },
      { cd: 0.95, dmg: 17, knock: 190, count: 2, speed: 320, bounces: 3 },
      { cd: 0.85, dmg: 21, knock: 205, count: 2, speed: 330, bounces: 4 },
      { cd: 0.7, dmg: 26, knock: 220, count: 3, speed: 345, bounces: 5 },
    ],
  },
  orbit: {
    id: 'orbit', name: 'Orbit Spikes', icon: '✳️', maxLevel: 5, rarity: 'common',
    desc: 'Spiked orbs circle you, bashing and launching anything they touch.',
    levels: [
      { cd: 0, dmg: 9, knock: 150, count: 2, radius: 48, speed: 2.6 },
      { cd: 0, dmg: 12, knock: 165, count: 3, radius: 50, speed: 2.8 },
      { cd: 0, dmg: 16, knock: 180, count: 3, radius: 54, speed: 3.0 },
      { cd: 0, dmg: 21, knock: 200, count: 4, radius: 58, speed: 3.3 },
      { cd: 0, dmg: 28, knock: 225, count: 5, radius: 64, speed: 3.6 },
    ],
  },
  dash: {
    id: 'dash', name: 'Wreck Dash', icon: '🚀', maxLevel: 5, rarity: 'rare',
    desc: 'Periodically rocket forward, crushing and blasting through everything in your path.',
    levels: [
      { cd: 3.4, dmg: 20, knock: 360, speed: 4.2 },
      { cd: 3.1, dmg: 26, knock: 390, speed: 4.4 },
      { cd: 2.8, dmg: 33, knock: 420, speed: 4.6 },
      { cd: 2.5, dmg: 42, knock: 460, speed: 4.8 },
      { cd: 2.1, dmg: 54, knock: 510, speed: 5.2 },
    ],
  },
  trail: {
    id: 'trail', name: 'Shock Trail', icon: '🌊', maxLevel: 5, rarity: 'rare',
    desc: 'Your roll leaves charged tremors that erupt under passing enemies.',
    levels: [
      { cd: 0.55, dmg: 8, knock: 130, radius: 36 },
      { cd: 0.48, dmg: 11, knock: 145, radius: 40 },
      { cd: 0.42, dmg: 15, knock: 160, radius: 44 },
      { cd: 0.36, dmg: 20, knock: 175, radius: 49 },
      { cd: 0.3, dmg: 26, knock: 195, radius: 56 },
    ],
  },
  chain: {
    id: 'chain', name: 'Static Chain', icon: '⚡', maxLevel: 5, rarity: 'epic',
    desc: 'Every impact arcs lightning to nearby enemies, zapping and shoving them.',
    levels: [
      { cd: 0.35, dmg: 0.55, knock: 110, count: 1, radius: 130 },
      { cd: 0.3, dmg: 0.65, knock: 125, count: 2, radius: 140 },
      { cd: 0.25, dmg: 0.75, knock: 140, count: 2, radius: 155 },
      { cd: 0.2, dmg: 0.85, knock: 155, count: 3, radius: 170 },
      { cd: 0.15, dmg: 1.0, knock: 175, count: 3, radius: 190 },
    ],
  },
  boomer: {
    id: 'boomer', name: 'Wreckang', icon: '🪃', maxLevel: 5, rarity: 'rare', unlockDepth: 3,
    desc: 'Hurls a boomerang that carves through the horde out AND back — piercing everything twice.',
    levels: [
      { cd: 2.3, dmg: 13, knock: 200, count: 1, speed: 360 },
      { cd: 2.0, dmg: 17, knock: 220, count: 1, speed: 380 },
      { cd: 1.8, dmg: 21, knock: 240, count: 2, speed: 400 },
      { cd: 1.5, dmg: 27, knock: 270, count: 2, speed: 420 },
      { cd: 1.25, dmg: 34, knock: 300, count: 3, speed: 440 },
    ],
  },
};

export interface PassiveDef {
  id: PassiveId;
  name: string;
  icon: string;
  desc: string;
  maxLevel: number;
  rarity: Rarity;
}

export const PASSIVES: Record<PassiveId, PassiveDef> = {
  mass: { id: 'mass', name: 'Dense Core', icon: '🟣', maxLevel: 5, rarity: 'common', desc: '+30% mass. You shove enemies harder and resist their pushes.' },
  velocity: { id: 'velocity', name: 'Overdrive', icon: '🟢', maxLevel: 5, rarity: 'common', desc: '+10% move speed. Momentum is damage.' },
  vitality: { id: 'vitality', name: 'Vitality', icon: '🔴', maxLevel: 5, rarity: 'common', desc: '+25 max HP and heal that amount now.' },
  magnet: { id: 'magnet', name: 'Magnetism', icon: '🔵', maxLevel: 5, rarity: 'rare', desc: '+40% pickup range for XP and gold.' },
  impact: { id: 'impact', name: 'Brute Force', icon: '🟠', maxLevel: 5, rarity: 'rare', desc: '+35% impact damage — rams, slams and crash-into kills.' },
  regen: { id: 'regen', name: 'Nanorepair', icon: '🟡', maxLevel: 5, rarity: 'rare', desc: 'Regenerate +0.9 HP per second.' },
  ricochet: { id: 'ricochet', name: 'Rubber Physics', icon: '🟤', maxLevel: 3, rarity: 'epic', desc: 'All bolts gain +1 ricochet.' },
  luck: { id: 'luck', name: 'Lucky Ball', icon: '🌈', maxLevel: 3, rarity: 'epic', desc: 'Better upgrade rarity odds and +15% gold.' },
};

export type AnyUpgradeId = WeaponId | PassiveId;

export const MAX_WEAPONS = 4;
export const MAX_PASSIVES = 4;
