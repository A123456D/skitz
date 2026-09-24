/** Playable characters ("balls"). */
import type { WeaponId } from './weapons';

export interface CharacterDef {
  id: string;
  name: string;
  sprite: string;
  /** optional upright face overlay (the ball spins beneath it) */
  face?: string;
  blurb: string;
  cost: number; // gold to unlock, 0 = free
  /** DESCEND depth required to unlock (achievement-gated, never purchasable) */
  unlockDepth?: number;
  startWeapon: WeaponId;
  stats: {
    maxHp: number;
    speed: number;
    mass: number;
    knockMult: number;
    impactDmg: number;
    ricochet: number;
  };
  perk: string;
}

export const CHARACTERS: CharacterDef[] = [
  {
    id: 'wrecker',
    name: 'WRECKER',
    sprite: 'ball_wrecker',
    face: 'ball_face',
    blurb: 'Heavy yellow iron. Slow, massive, hits like a freight train.',
    cost: 0,
    startWeapon: 'slam',
    stats: { maxHp: 110, speed: 118, mass: 2.2, knockMult: 1.35, impactDmg: 1.5, ricochet: 0 },
    perk: 'Slam start · +35% knockback · +50% impact damage',
  },
  {
    id: 'bouncy',
    name: 'BOUNCY',
    sprite: 'ball_bouncy',
    blurb: 'Pure rubber. Fast, jumpy, never stops moving.',
    cost: 120,
    startWeapon: 'shot',
    stats: { maxHp: 85, speed: 146, mass: 1.2, knockMult: 1.0, impactDmg: 1.0, ricochet: 1 },
    perk: 'Ricochet Round start · +24% speed · bolts +1 bounce',
  },
  {
    id: 'spiker',
    name: 'SPIKER',
    sprite: 'ball_spiker',
    blurb: 'Covered in spikes. Everything that touches you regrets it.',
    cost: 300,
    startWeapon: 'orbit',
    stats: { maxHp: 95, speed: 132, mass: 1.6, knockMult: 1.15, impactDmg: 1.2, ricochet: 0 },
    perk: 'Orbit Spikes start · contact damage aura',
  },
  {
    id: 'volt',
    name: 'VOLT',
    sprite: 'ball_volt',
    blurb: 'A live wire. Sparks jump off the shell and the horde learns to fear arcs.',
    cost: 0,
    unlockDepth: 2,
    startWeapon: 'chain',
    stats: { maxHp: 90, speed: 140, mass: 1.4, knockMult: 1.05, impactDmg: 1.1, ricochet: 0 },
    perk: 'Static Chain start · +18% speed · +10% impact',
  },
];
