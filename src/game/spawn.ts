/** Wave director: time-based enemy budget, type unlocks, elites, boss. */
import { ENEMY, ENEMY_DEFS } from './data/enemies';
import type { EnemyId } from './data/enemies';
import { ELITE_MOD, ELITE_MOD_CHANCE, ELITE_MOD_COUNT } from './data/eliteMods';
import { ARENA_H, ARENA_W, type World } from './state';
import type { Events } from './events';

interface WaveEntry {
  type: EnemyId;
  from: number;  // seconds
  weight: number;
}

const WAVES: WaveEntry[] = [
  { type: ENEMY.swarmie, from: 0, weight: 10 },
  { type: ENEMY.imp, from: 20, weight: 8 },
  { type: ENEMY.spitter, from: 110, weight: 4 },
  { type: ENEMY.exploder, from: 190, weight: 4 },
  { type: ENEMY.splitter, from: 260, weight: 4 },
  { type: ENEMY.tank, from: 340, weight: 3 },
  { type: ENEMY.swarmie, from: 420, weight: 0 }, // late: swarmies fade out
];

const BOSS_TIME = 600;
export const DESCEND_BOSS_EVERY = 90;

export function isBossTime(t: number): boolean {
  return t >= BOSS_TIME;
}

export function stepSpawner(w: World, dt: number, ev: Events, maxActive: number): void {
  const t = w.runStats.time;
  const descending = w.descendLevel > 0;

  if (isBossTime(t) && !descending && !w.bossAlive && w.endState === 'playing') {
    // one boss to rule the arena
    const a = w.rng.angle();
    const dist = 520;
    const x = clampArena(w.px + Math.cos(a) * dist, ARENA_W);
    const y = clampArena(w.py + Math.sin(a) * dist, ARENA_H);
    const i = w.spawnEnemy(ENEMY.boss, x, y, false, 1 + t / 900);
    if (i >= 0) ev.bossSpawn(x, y);
    return;
  }

  if (isBossTime(t) && !descending) return; // vanilla solo phase

  if (descending) {
    // the pit sends another BONZAR every ~90s — killing one is a payout pit stop
    w.descendBossAcc += dt;
    if (!w.bossAlive && w.descendBossAcc >= DESCEND_BOSS_EVERY) {
      w.descendBossAcc = 0;
      const a = w.rng.angle();
      const x = clampArena(w.px + Math.cos(a) * 520, ARENA_W);
      const y = clampArena(w.py + Math.sin(a) * 520, ARENA_H);
      const i = w.spawnEnemy(ENEMY.boss, x, y, false, (1 + t / 900) * (1 + w.descendLevel * 0.8));
      if (i >= 0) ev.bossSpawn(x, y);
    }
  }

  // spawn budget ramps with time (population bounded by maxActive anyway)
  const rate = (1.1 + Math.pow(t / 60, 1.15) * 0.9)
    * (w.frenzyT > 0 ? 3 : 1)
    * (1 + w.descendLevel * 0.35);
  w.spawnAcc += rate * dt;
  while (w.spawnAcc >= 1) {
    w.spawnAcc -= 1;
    if (w.eCount >= maxActive) break;
    pickAndSpawn(w, t);
  }
}

function pickAndSpawn(w: World, t: number): void {
  // weighted pick among unlocked types
  let total = 0;
  for (const e of WAVES) if (e.from <= t && e.weight > 0) total += e.weight;
  let roll = w.rng.next() * total;
  let chosen = WAVES[0];
  for (const e of WAVES) {
    if (e.from <= t && e.weight > 0) {
      roll -= e.weight;
      if (roll <= 0) {
        chosen = e;
        break;
      }
    }
  }

  // spawn just off-screen on a ring around the player, clear of obstacles
  const a = w.rng.angle();
  const dist = 540 + w.rng.range(0, 120);
  let x = clampArena(w.px + Math.cos(a) * dist, ARENA_W);
  let y = clampArena(w.py + Math.sin(a) * dist, ARENA_H);
  if (w.blocked(x, y, 18)) {
    const alt = w.rng.angle();
    x = clampArena(w.px + Math.cos(alt) * dist, ARENA_W);
    y = clampArena(w.py + Math.sin(alt) * dist, ARENA_H);
    if (w.blocked(x, y, 18)) return; // skip this spawn rather than embed one
  }

  const hpScale = (1 + Math.pow(t / 60, 1.15) * 0.55) * (1 + w.descendLevel * 0.45);
  const eliteChance = t < 240 && w.descendLevel === 0 ? 0 : Math.min(0.1, (t - 240) / 3600) + w.descendLevel * 0.04;
  const elite = w.rng.chance(eliteChance) && chosen.type !== ENEMY.swarmie;
  let mod = 0;
  if (elite && w.rng.chance(ELITE_MOD_CHANCE)) {
    mod = 1 + Math.floor(w.rng.next() * ELITE_MOD_COUNT);
    // Juggernaut needs a special attack to charge with — otherwise it's just a roadblock
    if (mod === ELITE_MOD.juggernaut && !ENEMY_DEFS[chosen.type].attack) mod = ELITE_MOD.frostbound;
  }
  w.spawnEnemy(chosen.type, x, y, elite, hpScale, mod);
}

export function enemyDpsScale(t: number): number {
  void ENEMY_DEFS;
  return 1 + t / 240; // contact damage ramps mildly
}

function clampArena(v: number, max: number): number {
  return Math.max(24, Math.min(max - 24, v));
}
