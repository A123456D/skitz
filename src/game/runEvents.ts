/**
 * Run-event director: periodic world events that break the loop rhythm.
 * One event at a time; exclusive windows; every effect is sim-authored so
 * tests can drive it deterministically (no Math.random — World.rng only).
 */
import { ARENA_H, ARENA_W, type World } from './state';
import type { Events } from './events';
import { damageEnemy, hurtPlayer } from './physics';

export interface RunEventDef {
  id: 'meteor' | 'goldrush' | 'frenzy' | 'overcharge';
  name: string;
  icon: string;
  desc: string;
  dur: number;
  weight: number;
}

export const RUN_EVENTS: RunEventDef[] = [
  {
    id: 'meteor', name: 'METEOR SHOWER', icon: '☄️', dur: 12, weight: 3,
    desc: 'The sky is falling — meteors crush ENEMIES. Do not stand in the rings!',
  },
  {
    id: 'goldrush', name: 'GOLD RUSH', icon: '🪙', dur: 15, weight: 3,
    desc: 'Everything drops double gold. Go break the world open!',
  },
  {
    id: 'frenzy', name: 'ENEMY FRENZY', icon: '😈', dur: 12, weight: 2,
    desc: '3x spawns, +50% damage taken. A piñata with teeth — feast!',
  },
  {
    id: 'overcharge', name: 'OVERCHARGE', icon: '⚡', dur: 12, weight: 2,
    desc: '+40% damage and +33% attack speed. UNLEASH.',
  },
];

export const EVENT_FIRST_AT = 70;   // director arms after this sim time
export const EVENT_GAP_MIN = 50;
export const EVENT_GAP_MAX = 78;
const METEOR_SPAWN_EVERY = 0.3;
/** telegraph-to-impact time + blast radius; the renderer animates with both */
export const METEOR_FALL_T = 0.85;
export const METEOR_RADIUS = 64;
const METEOR_DMG = 70;
const METEOR_PLAYER_DMG = 10;

export function eventDef(w: World): RunEventDef | null {
  return w.eventId >= 0 ? RUN_EVENTS[w.eventId] ?? null : null;
}

/** Deterministic weighted pick. */
function pickEvent(w: World): number {
  let total = 0;
  for (const e of RUN_EVENTS) total += e.weight;
  let roll = w.rng.next() * total;
  for (let i = 0; i < RUN_EVENTS.length; i++) {
    roll -= RUN_EVENTS[i].weight;
    if (roll <= 0) return i;
  }
  return RUN_EVENTS.length - 1;
}

export function startEvent(w: World, idx: number, onBegin: (def: RunEventDef) => void): void {
  const def = RUN_EVENTS[idx];
  w.eventId = idx;
  w.eventT = def.dur;
  w.eventAcc = 0;
  switch (def.id) {
    case 'frenzy':
      w.frenzyT = def.dur;
      w.evDmgMult = 1.5;
      break;
    case 'overcharge':
      w.evDmgMult = 1.4;
      w.evCdBoost = 1.33;
      break;
    case 'goldrush':
      w.goldrushT = def.dur;
      break;
    case 'meteor':
      break;
  }
  onBegin(def);
}

function endEvent(w: World): void {
  w.eventId = -1;
  w.eventT = 0;
  w.frenzyT = 0;
  w.goldrushT = 0;
  w.evDmgMult = 1;
  w.evCdBoost = 1;
  // pending meteors still fall — they resolve harmlessly on their own timers
}

/** Advance the director + active event. Call after stepEnemies (uses the fresh hash). */
export function stepRunEvents(
  w: World,
  dt: number,
  ev: Events,
  onBegin: (def: RunEventDef) => void,
  onEnd: (def: RunEventDef) => void,
): void {
  const t = w.runStats.time;
  if (t < EVENT_FIRST_AT) return;

  if (w.eventId >= 0) {
    const def = RUN_EVENTS[w.eventId];
    w.eventT -= dt;
    if (def.id === 'frenzy') w.frenzyT = Math.max(0, w.frenzyT - dt);
    if (def.id === 'goldrush') w.goldrushT = Math.max(0, w.goldrushT - dt);
    if (def.id === 'meteor') spawnMeteors(w, dt);
    stepMeteors(w, dt, ev);
    if (w.eventT <= 0) {
      endEvent(w);
      onEnd(def);
      w.eventCd = EVENT_GAP_MIN + w.rng.next() * (EVENT_GAP_MAX - EVENT_GAP_MIN);
    }
    return;
  }

  w.eventCd -= dt;
  if (w.eventCd <= 0) {
    startEvent(w, pickEvent(w), onBegin);
  }
}

function spawnMeteors(w: World, dt: number): void {
  w.eventAcc += dt;
  while (w.eventAcc >= METEOR_SPAWN_EVERY) {
    w.eventAcc -= METEOR_SPAWN_EVERY;
    if (w.mCount >= w.mCap) continue;
    // rain around the player, biased to their movement
    const a = w.rng.angle();
    const dist = 30 + w.rng.next() * 230;
    const i = w.mCount++;
    w.mx[i] = Math.max(24, Math.min(ARENA_W - 24, w.px + Math.cos(a) * dist + w.pvx * 0.35));
    w.my[i] = Math.max(24, Math.min(ARENA_H - 24, w.py + Math.sin(a) * dist + w.pvy * 0.35));
    w.mt[i] = METEOR_FALL_T;
  }
}

function stepMeteors(w: World, dt: number, ev: Events): void {
  for (let i = 0; i < w.mCount; i++) {
    w.mt[i] -= dt;
    if (w.mt[i] > 0) continue;
    const x = w.mx[i];
    const y = w.my[i];
    ev.meteor(x, y, METEOR_RADIUS);
    // enemies inside the blast get launched — feed the bonk chains
    const last = --w.mCount;
    w.hash.queryCircle(x, y, METEOR_RADIUS + 16, (j) => {
      if (j >= w.eCount) return true; // swap-removed mid-iteration
      const dx = w.ex[j] - x;
      const dy = w.ey[j] - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < (METEOR_RADIUS + w.eradius[j]) * (METEOR_RADIUS + w.eradius[j])) {
        damageEnemy(w, j, METEOR_DMG, 300, Math.atan2(dy, dx), ev, true);
      }
      return true;
    });
    // the player is not immune — the telegraph rings are honest
    const pdx = w.px - x;
    const pdy = w.py - y;
    if (pdx * pdx + pdy * pdy < (METEOR_RADIUS - 6) * (METEOR_RADIUS - 6)) {
      hurtPlayer(w, METEOR_PLAYER_DMG, ev);
    }
    if (i !== last) {
      w.mx[i] = w.mx[last];
      w.my[i] = w.my[last];
      w.mt[i] = w.mt[last];
    }
    i--;
  }
}
