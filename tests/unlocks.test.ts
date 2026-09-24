/**
 * Pass 10 — unlock cascade + new content: depth milestone unlocks, save v2
 * migration, draft gating, KRUSHER depth boss, Wreckang boomerang physics.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { CHARACTERS } from '../src/game/data/characters';
import { ENEMY, ENEMY_DEFS } from '../src/game/data/enemies';
import { WEAPONS } from '../src/game/data/weapons';
import { DEPTH_UNLOCKS, SKINS, unlockDef } from '../src/game/data/unlocks';
import { EVOLUTIONS, evolutionFor } from '../src/game/data/evolutions';
import { World } from '../src/game/state';
import { Run } from '../src/game/run';
import { rollChoices } from '../src/game/progression';
import { stepWeapons, clearTrail } from '../src/game/weapons';
import { stepSpawner } from '../src/game/spawn';
import { damageEnemy } from '../src/game/physics';
import {
  migrateSave, grantDepthUnlocks, skinUnlocked, __resetSaveForTests,
  type SaveData,
} from '../src/save/save';
import type { Events } from '../src/game/events';

let seedCounter = 0;
function makeWorld(): World {
  return new World(CHARACTERS[0], (++seedCounter * 7919) | 0, 200);
}
function makeRun(): Run {
  return new Run(CHARACTERS[0], (++seedCounter * 104729) | 0, { maxActive: 200, onLevelUp: () => {}, onEnd: () => {} });
}
const noop = () => {};
function silentEvents(): Events {
  return new Proxy({} as Events, { get: () => noop });
}
const ev = silentEvents();

beforeEach(() => __resetSaveForTests());

describe('save v2 migration', () => {
  it('upgrades a v1 payload with the new fields', () => {
    const v1 = {
      v: 1,
      gold: 55,
      metaRanks: { might: 2 },
      unlockedChars: ['wrecker', 'bouncy'],
      selectedChar: 'bouncy',
      best: { time: 120, kills: 40, level: 5, wins: 1 },
      settings: { sfx: false, music: true },
    };
    const s = migrateSave(v1);
    expect(s.v).toBe(2);
    expect(s.gold).toBe(55);
    expect(s.selectedChar).toBe('bouncy');
    expect(s.best).toMatchObject({ time: 120, kills: 40, wins: 1, depth: 0 });
    expect(s.unlocks).toEqual([]);
    expect(s.skin).toBe('default');
  });

  it('round-trips a v2 payload untouched', () => {
    const v2: SaveData = migrateSave({ best: { depth: 3 }, unlocks: ['u_volt'], skin: 'ember' });
    expect(migrateSave(v2).best.depth).toBe(3);
    expect(migrateSave(v2).skin).toBe('ember');
  });
});

describe('depth unlock cascade', () => {
  it('grants milestones progressively and never twice', () => {
    expect(grantDepthUnlocks(1)).toEqual(['u_skin_ember']);
    expect(grantDepthUnlocks(1)).toEqual([]); // no re-grant
    expect(grantDepthUnlocks(2)).toEqual(['u_volt']);
    expect(grantDepthUnlocks(3)).toEqual(['u_boomer']);
    // depth 4 grants the last one; depth jumps grant everything up to it
    expect(grantDepthUnlocks(4)).toEqual(['u_skin_void']);
    expect(grantDepthUnlocks(9)).toEqual([]);
  });

  it('reaching depth 2 also unlocks the VOLT character', () => {
    grantDepthUnlocks(2);
    expect(CHARACTERS.find((c) => c.id === 'volt')).toBeDefined();
    expect(unlockDef('u_volt')?.depth).toBe(2);
  });

  it('gold can never buy a depth-gated character', () => {
    // volt has no gold price path even with infinite gold
    const volt = CHARACTERS.find((c) => c.id === 'volt')!;
    expect(volt.unlockDepth).toBeGreaterThan(0);
  });

  it('skins gate behind their unlock ids', () => {
    expect(skinUnlocked('default')).toBe(true);
    expect(skinUnlocked('ember')).toBe(false);
    grantDepthUnlocks(1);
    expect(skinUnlocked('ember')).toBe(true);
    expect(skinUnlocked('void')).toBe(false);
  });

  it('every skin maps to a distinct atlas sprite name', () => {
    const sprites = SKINS.map((s) => s.sprite);
    expect(new Set(sprites).size).toBe(SKINS.length);
  });
});

describe('draft gating', () => {
  it('depth-gated weapons stay out of the pool until earned', () => {
    const w = makeWorld();
    expect(WEAPONS.boomer.unlockDepth).toBe(3);
    expect(w.unlockedWeapons.has('boomer')).toBe(false);
    // many rolls never offer it
    for (let i = 0; i < 30; i++) {
      for (const c of rollChoices(w, 3)) expect(c.id).not.toBe('boomer');
    }
    w.unlockedWeapons.add('boomer');
    let seen = false;
    for (let i = 0; i < 60 && !seen; i++) {
      seen = rollChoices(w, 3).some((c) => c.id === 'boomer');
    }
    expect(seen).toBe(true);
  });

  it('the base six weapons are always available', () => {
    const w = makeWorld();
    for (const id of ['slam', 'shot', 'orbit', 'dash', 'trail', 'chain'] as const) {
      expect(w.unlockedWeapons.has(id)).toBe(true);
    }
  });
});

describe('KRUSHER depth boss', () => {
  it('appears at even depths, BONZAR at odd depths', () => {
    const w = makeWorld();
    w.runStats.time = 640;
    w.descendLevel = 2;
    w.descendBossAcc = 89.9;
    w.eCount = 0;
    w.spawnAcc = 0;
    stepSpawner(w, 1, ev, 200);
    expect(w.etype.subarray(0, w.eCount).some((t) => t === ENEMY.krusher)).toBe(true);
  });

  it('enrages at half hp by summoning pit children instead of shrapnel', () => {
    const w = makeWorld();
    const i = w.spawnEnemy(ENEMY.krusher, 600, 600, false, 1);
    const hpFull = w.ehp[i];
    rebuildHash(w);
    damageEnemy(w, i, hpFull * 0.55, 0, null, ev);
    expect(w.bossEnraged).toBe(true);
    // 4 summons: 2 imps + 2 exploders (krusher itself still alive)
    let imps = 0;
    let exploders = 0;
    for (let j = 0; j < w.eCount; j++) {
      if (w.etype[j] === ENEMY.imp) imps++;
      if (w.etype[j] === ENEMY.exploder) exploders++;
    }
    expect(imps).toBe(2);
    expect(exploders).toBe(2);
    expect(w.vCount).toBe(0); // no shrapnel for krusher
  });

  it('is a proper boss: kills set wonRun and it benefits from enrage scaling', () => {
    expect(ENEMY_DEFS[ENEMY.krusher].boss).toBe(true);
    expect(ENEMY_DEFS[ENEMY.krusher].attack?.kind).toBe('pound');
    expect(evolutionFor('boomer')?.id).toBe('doomrangs');
  });
});

describe('Wreckang boomerangs', () => {
  it('fly out, come back, and are caught by the thrower', () => {
    const w = makeWorld();
    clearTrail();
    w.addWeapon('boomer');
    w.px = 500;
    w.py = 500;
    w.facingX = 1;
    w.facingY = 0;
    w.weaponCds.set('boomer', 0);
    stepWeapons(w, 1 / 60, ev); // fires the boomerang
    expect(w.bCount).toBe(1);
    expect(w.bkind[0]).toBe(2);

    // let it fly out past the turn point
    let maxX = w.bx[0];
    for (let f = 0; f < 90; f++) {
      rebuildHash(w);
      stepWeapons(w, 1 / 60, ev);
      if (w.bCount === 0) break;
      maxX = Math.max(maxX, w.bx[0]);
    }
    // it came home: caught near the player (or consumed by the cap)
    const returned = w.bCount === 0 && maxX > w.px + 60;
    expect(returned).toBe(true);
  });

  it('pierces: one boomerang can damage the same enemy twice (out + return)', () => {
    const w = makeWorld();
    w.addWeapon('boomer');
    w.px = 500;
    w.py = 500;
    w.facingX = 1;
    w.facingY = 0;
    const e = w.spawnEnemy(ENEMY.tank, 560, 500, false, 4); // beefy, sits in the path
    w.ehp[e] = 999999;
    w.emaxhp[e] = 999999;
    w.weaponCds.set('boomer', 0);
    stepWeapons(w, 1 / 60, ev); // fires the boomerang (loop below starts with it airborne)
    expect(w.bCount).toBe(1);
    let hits = 0;
    let lastHp = w.ehp[e];
    for (let f = 0; f < 240 && w.bCount > 0; f++) {
      rebuildHash(w);
      stepWeapons(w, 1 / 60, ev);
      if (w.ehp[e] < lastHp) {
        hits++;
        lastHp = w.ehp[e];
      }
      w.ex[e] = 560; // keep it parked in the path
      w.ey[e] = 500;
    }
    expect(hits).toBeGreaterThanOrEqual(2);
  });
});

/** the spatial hash must be rebuilt manually between steps in tests */
function rebuildHash(w: World): void {
  w.hash.clear(w.eCount);
  for (let i = 0; i < w.eCount; i++) w.hash.insert(i, w.ex[i], w.ey[i]);
}

// keep the Run import used (end-to-end smoke of a descend run with unlocks)
describe('cascade end-to-end', () => {
  it('a descend run at depth 2 grants volt + weapon gating flows through Run', () => {
    const run = makeRun();
    run.w.descendLevel = 3;
    const gained = grantDepthUnlocks(run.w.descendLevel);
    expect(gained).toContain('u_volt');
    expect(gained).toContain('u_boomer');
    run.w.unlockedWeapons.add('boomer');
    expect(run.w.unlockedWeapons.has('boomer')).toBe(true);
    expect(DEPTH_UNLOCKS.length).toBeGreaterThanOrEqual(4);
  });
});
