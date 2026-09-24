/** Enemy type definitions — data-driven, indexed by EnemyId. */

export const ENEMY = {
  swarmie: 0,
  imp: 1,
  spitter: 2,
  exploder: 3,
  tank: 4,
  splitter: 5,
  splitterHalf: 6,
  boss: 7,
} as const;

export type EnemyId = (typeof ENEMY)[keyof typeof ENEMY];

export type AttackKind = 'lunge' | 'spit' | 'pound' | 'charge';

export interface EnemyAttack {
  kind: AttackKind;
  /** seconds between attack attempts */
  cd: number;
  /** trigger range from the player (px) */
  range: number;
  /** telegraph duration before the attack lands */
  windup: number;
  /** lunge/charge impulse speed, or pound radius for pounds */
  power: number;
  /** pound damage */
  dmg?: number;
}

export interface EnemyDef {
  id: EnemyId;
  name: string;
  sprite: string;
  hp: number;
  speed: number;
  radius: number;
  mass: number;
  contactDmg: number;
  xp: number;
  /** knockback taken multiplier (tanks resist) */
  knockMult: number;
  /** ranged attacker */
  ranged?: { range: number; cd: number; speed: number; dmg: number };
  /** explodes on death/contact fuse */
  explodes?: { radius: number; dmg: number; fuse: number };
  /** spawns children on death */
  splits?: { into: EnemyId; count: number };
  /** signature special attack (windup -> act) */
  attack?: EnemyAttack;
  boss?: boolean;
}

export const ENEMY_DEFS: Record<number, EnemyDef> = {
  [ENEMY.swarmie]: { id: 0, name: 'Swarmie', sprite: 'swarmie', hp: 8, speed: 46, radius: 6, mass: 0.5, contactDmg: 4, xp: 1, knockMult: 1.5 },
  [ENEMY.imp]: {
    id: 1, name: 'Imp', sprite: 'imp', hp: 22, speed: 60, radius: 8, mass: 1, contactDmg: 8, xp: 2, knockMult: 1,
    attack: { kind: 'lunge', cd: 3.4, range: 130, windup: 0.45, power: 360 },
  },
  [ENEMY.spitter]: {
    id: 2, name: 'Spitter', sprite: 'spitter', hp: 26, speed: 40, radius: 8, mass: 1, contactDmg: 8, xp: 3, knockMult: 1,
    ranged: { range: 170, cd: 3, speed: 90, dmg: 10 },
    attack: { kind: 'spit', cd: 3, range: 180, windup: 0.5, power: 0 },
  },
  [ENEMY.exploder]: { id: 3, name: 'Exploder', sprite: 'exploder', hp: 14, speed: 70, radius: 7, mass: 0.8, contactDmg: 6, xp: 3, knockMult: 1.3, explodes: { radius: 78, dmg: 22, fuse: 0.45 } },
  [ENEMY.tank]: {
    id: 4, name: 'Tank', sprite: 'tank', hp: 95, speed: 33, radius: 11, mass: 4.5, contactDmg: 14, xp: 8, knockMult: 0.35,
    attack: { kind: 'pound', cd: 4.5, range: 95, windup: 0.7, power: 115, dmg: 18 },
  },
  [ENEMY.splitter]: { id: 5, name: 'Splitter', sprite: 'splitter', hp: 36, speed: 44, radius: 9, mass: 1.6, contactDmg: 8, xp: 3, knockMult: 0.9, splits: { into: ENEMY.splitterHalf, count: 2 } },
  [ENEMY.splitterHalf]: { id: 6, name: 'Splitling', sprite: 'splitter_half', hp: 12, speed: 62, radius: 6, mass: 0.6, contactDmg: 5, xp: 1, knockMult: 1.5 },
  [ENEMY.boss]: {
    id: 7, name: 'BONZAR', sprite: 'boss', hp: 2400, speed: 30, radius: 17, mass: 14, contactDmg: 26, xp: 120, knockMult: 0.06,
    attack: { kind: 'charge', cd: 5.5, range: 420, windup: 0.8, power: 640 },
    boss: true,
  },
};
