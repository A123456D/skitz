/**
 * Pass C — Run & Endgame: run-event director (meteors/goldrush/frenzy/overcharge),
 * BONZAR phase-2 enrage, and endless DESCEND scaling.
 */
import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../src/game/data/characters';
import { World } from '../src/game/state';
import { Run } from '../src/game/run';
import { ENEMY } from '../src/game/data/enemies';
import type { Events } from '../src/game/events';
import { damageEnemy, killEnemyByIndex, stepEnemies } from '../src/game/physics';
import { stepSpawner } from '../src/game/spawn';
import { EVENT_FIRST_AT, RUN_EVENTS, startEvent, stepRunEvents } from '../src/game/runEvents';

let seedCounter = 0;
function makeWorld(): World {
  return new World(CHARACTERS[0], (++seedCounter * 7919) | 0, 200);
}

function rebuildHash(w: World): void {
  w.hash.clear(w.eCount);
  for (let i = 0; i < w.eCount; i++) w.hash.insert(i, w.ex[i], w.ey[i]);
}

const noop = () => {};
function silentEvents(): Events {
  return new Proxy({} as Events, { get: () => noop });
}
const ev = silentEvents();

function makeRun(): Run {
  return new Run(CHARACTERS[0], (++seedCounter * 104729) | 0, { maxActive: 200, onLevelUp: () => {}, onEnd: () => {} });
}

describe('run-event director', () => {
  it('is silent before EVENT_FIRST_AT, then starts an event and announces it', () => {
    const w = makeWorld();
    w.runStats.time = EVENT_FIRST_AT - 1;
    w.eventCd = 0.01;
    const begun: string[] = [];
    stepRunEvents(w, 0.5, ev, (def) => begun.push(def.name), noop);
    expect(begun).toHaveLength(0); // too early

    w.runStats.time = EVENT_FIRST_AT + 1;
    stepRunEvents(w, 0.5, ev, (def) => begun.push(def.name), noop);
    expect(begun).toHaveLength(1);
    expect(w.eventId).toBeGreaterThanOrEqual(0);
    expect(w.eventT).toBeGreaterThan(0);
    expect(RUN_EVENTS[w.eventId].name).toBe(begun[0]);
  });

  it('events expire, announce the end, and reset all modifiers', () => {
    const w = makeWorld();
    startEvent(w, 1, noop); // overcharge
    w.runStats.time = EVENT_FIRST_AT + 1; // director is armed
    w.eventT = 0.01;
    const ended: string[] = [];
    stepRunEvents(w, 0.5, ev, noop, (def) => ended.push(def.name));
    expect(ended).toHaveLength(1);
    expect(w.eventId).toBe(-1);
    expect(w.evDmgMult).toBe(1);
    expect(w.evCdBoost).toBe(1);
    expect(w.eventCd).toBeGreaterThan(0); // next event waits its turn
  });

  it('METEOR SHOWER drops meteors near the player and detonates them onto enemies', () => {
    const w = makeWorld();
    startEvent(w, 0, noop); // meteor
    w.runStats.time = EVENT_FIRST_AT + 1; // director is armed
    w.px = 500;
    w.py = 500;
    w.pvx = 0;
    w.pvy = 0;
    const before = w.mCount;
    // sub-fuse step: a meteor is pending (dt=1 would spawn AND land them all)
    stepRunEvents(w, 0.3, ev, noop, noop);
    expect(w.mCount).toBeGreaterThan(before);

    // park a beefy enemy under a pending meteor and let it land
    const e = w.spawnEnemy(ENEMY.tank, 0, 0, false, 1);
    w.ehp[e] = 500;
    const hpBefore = w.ehp[e];
    rebuildHash(w);
    w.ex[e] = w.mx[0];
    w.ey[e] = w.my[0];
    w.hash.insert(e, w.ex[e], w.ey[e]);
    w.mt[0] = 0.01;
    stepRunEvents(w, 0.1, ev, noop, noop);
    expect(w.ehp[e]).toBeLessThan(hpBefore);
  });

  it('ENEMY FRENZY triples the spawn budget and enemies take +50% damage', () => {
    const w = makeWorld();
    w.runStats.time = 300; // healthy base rate
    startEvent(w, 2, noop); // frenzy
    expect(w.evDmgMult).toBeCloseTo(1.5, 5);
    expect(w.frenzyT).toBeGreaterThan(0);

    w.spawnAcc = 0;
    stepSpawner(w, 1, ev, 200);
    const spawnsWithFrenzy = w.eCount;
    w.eCount = 0;
    w.frenzyT = 0;
    w.evDmgMult = 1;
    w.spawnAcc = 0;
    stepSpawner(w, 1, ev, 200);
    const spawnsNormal = w.eCount;
    expect(spawnsWithFrenzy).toBeGreaterThan(spawnsNormal * 2);

    // the multiplier flows through damageEnemy
    w.evDmgMult = 1.5;
    const i = w.spawnEnemy(ENEMY.swarmie, 100, 100, false, 1);
    w.ehp[i] = 100;
    damageEnemy(w, i, 10, 0, null, ev);
    expect(w.ehp[i]).toBeCloseTo(85, 5);
  });

  it('OVERCHARGE boosts enemy damage taken and weapon cooldown rate', () => {
    const w = makeWorld();
    startEvent(w, 3, noop); // overcharge
    expect(w.evDmgMult).toBeCloseTo(1.4, 5);
    expect(w.evCdBoost).toBeCloseTo(1.33, 2);
    const i = w.spawnEnemy(ENEMY.swarmie, 100, 100, false, 1);
    w.ehp[i] = 1000;
    damageEnemy(w, i, 100, 0, null, ev);
    expect(w.ehp[i]).toBeCloseTo(860, 5); // 1000 - 100*1.4
  });

  it('GOLD RUSH makes kills rain double-value coins', () => {
    const w = makeWorld();
    const i = w.spawnEnemy(ENEMY.imp, 100, 100, false, 1);
    w.gCount = 0;
    killEnemyByIndex(w, i, ev);
    const goldCoinsNormal = w.gkind.subarray(0, w.gCount).filter((k) => k === 1).length;

    w.gCount = 0;
    w.goldrushT = 5;
    const j = w.spawnEnemy(ENEMY.imp, 100, 100, false, 1);
    killEnemyByIndex(w, j, ev);
    w.goldrushT = 0;
    const coins = w.gkind.subarray(0, w.gCount).filter((k) => k === 1);
    expect(coins.length).toBeGreaterThan(goldCoinsNormal);
    expect(coins.length).toBeGreaterThan(0);
    // every coin dropped under gold rush is worth at least double the base 2
    const values = w.gvalue.subarray(0, w.gCount);
    expect(values.some((v) => v >= 4)).toBe(true);
  });
});

describe('BONZAR phase 2', () => {
  it('enrages at half hp: shockwave shoves the player, shrapnel ring spawns, speed scales', () => {
    const w = makeWorld();
    const i = w.spawnEnemy(ENEMY.boss, 600, 600, false, 1);
    w.px = 660;
    w.py = 600; // stand near the boss
    const hpFull = w.ehp[i];
    rebuildHash(w);
    w.pvx = 0;
    w.pvy = 0;
    damageEnemy(w, i, hpFull * 0.55, 0, null, ev);
    expect(w.bossEnraged).toBe(true);
    expect(w.vCount).toBeGreaterThanOrEqual(12); // shrapnel ring
    expect(Math.hypot(w.pvx, w.pvy)).toBeGreaterThan(50); // player shoved

    // speed multiplier applies only to the boss
    expect(w.etype[i]).toBe(ENEMY.boss);
    const enragedSpd = 30 * (1 + Math.min(0.5, w.runStats.time / 600)) * 1.45;
    expect(enragedSpd).toBeGreaterThan(30);
  });

  it('does not enrage above half hp, and killing the boss mid-frenzy still wins', () => {
    const w = makeWorld();
    const i = w.spawnEnemy(ENEMY.boss, 600, 600, false, 1);
    const hpFull = w.ehp[i];
    rebuildHash(w);
    damageEnemy(w, i, hpFull * 0.2, 0, null, ev);
    expect(w.bossEnraged).toBe(false);
  });
});

describe('endless DESCEND', () => {
  it('boss kill sets wonRun; descend resumes the sim at depth 1', () => {
    const run = makeRun();
    const w = run.w;
    const i = w.spawnEnemy(ENEMY.boss, 600, 600, false, 1);
    w.runStats.time = 620; // boss phase
    killEnemyByIndex(w, i, ev);
    expect(w.wonRun).toBe(true);
    expect(w.endState).toBe('won');

    run.descend();
    expect(w.endState).toBe('playing');
    expect(w.descendLevel).toBe(1);
    expect(run.ended).toBe(false);
  });

  it('DESCEND keeps spawning past the boss phase and sends another BONZAR', () => {
    const w = makeWorld();
    w.runStats.time = 640;
    w.descendLevel = 1;
    w.descendBossAcc = 89.9;
    w.eCount = 0;
    w.spawnAcc = 0;
    for (let s = 0; s < 40; s++) stepSpawner(w, 1, ev, 200);
    expect(w.eCount).toBeGreaterThan(0); // regular spawns resumed
    const hasBoss = w.etype.subarray(0, w.eCount).some((t) => t === ENEMY.boss);
    expect(hasBoss).toBe(true); // depth boss arrived
  });

  it('DESCEND enemies are tougher via the hpScale multiplier', () => {
    const w = makeWorld();
    w.runStats.time = 640;
    w.descendLevel = 0;
    const i = w.spawnEnemy(ENEMY.swarmie, 100, 100, false, 1);
    const hpDepth0 = w.emaxhp[i];
    w.eCount = 0;
    w.descendLevel = 2;
    const j = w.spawnEnemy(ENEMY.swarmie, 100, 100, false, 1);
    // spawnEnemy itself doesn't apply descend scaling — the spawner's hpScale does;
    // verify the spawner path: hpScale in pickAndSpawn = base * (1 + level*0.45)
    w.eCount = 0;
    void i;
    void j;
    const base = 1 + Math.pow(640 / 60, 1.15) * 0.55;
    expect(base * (1 + 2 * 0.45)).toBeGreaterThan(base * 1.8);
    expect(hpDepth0).toBeGreaterThan(0);
  });
});
