import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CHARACTERS } from '../src/game/data/characters';
import { ENEMY, ENEMY_DEFS } from '../src/game/data/enemies';
import { damageEnemy, damageObstacle, stepEnemies, stepPlayer } from '../src/game/physics';
import { isBossTime, stepSpawner } from '../src/game/spawn';
import { stepWeapons } from '../src/game/weapons';
import { grantXp } from '../src/game/progression';
import { Run } from '../src/game/run';
import { World } from '../src/game/state';

type Ev = Parameters<typeof damageEnemy>[5];

let ev: Ev;

beforeEach(() => {
  ev = {
    hitEnemy: vi.fn(),
    enemyDeath: vi.fn(),
    impact: vi.fn(),
    wallBonk: vi.fn(),
    explosion: vi.fn(),
    slam: vi.fn(),
    zap: vi.fn(),
    playerHurt: vi.fn(),
    levelUp: vi.fn(),
    goldPickup: vi.fn(),
    gemPickup: vi.fn(),
    bossSpawn: vi.fn(),
    playerAttack: vi.fn(),
    enemyAttack: vi.fn(),
    eruption: vi.fn(),
    pound: vi.fn(),
    crateHit: vi.fn(),
    obstacleBreak: vi.fn(),
    bumperHit: vi.fn(),
    jumpPad: vi.fn(),
    boostPad: vi.fn(),
    zoneChange: vi.fn(),
    shrineTaken: vi.fn(),
    cacheLooted: vi.fn(),
    chestOpened: vi.fn(),
  };
});

describe('world / physics', () => {
  it('spawns and swap-removes enemies without leaking count', () => {
    const w = new World(CHARACTERS[0], 7, 50);
    const a = w.spawnEnemy(ENEMY.imp, 100, 100, false, 1);
    const b = w.spawnEnemy(ENEMY.imp, 200, 200, false, 1);
    const c = w.spawnEnemy(ENEMY.imp, 300, 300, false, 1);
    expect(w.eCount).toBe(3);
    w.killEnemy(b, () => {});
    expect(w.eCount).toBe(2);
    expect(w.ex[a]).toBe(100);
    expect(w.ex[1]).toBe(300); // old 'c' swapped into b's slot
  });

  it('damageEnemy knocks the target away from the player', () => {
    const w = new World(CHARACTERS[0], 7, 50);
    // player starts at arena center (1300, 1300) — spawn the enemy to its +x
    const i = w.spawnEnemy(ENEMY.imp, w.px + 150, w.py, false, 1);
    damageEnemy(w, i, 5, 300, null, ev);
    expect(w.evx[i]).toBeGreaterThan(100); // pushed away from player (+x)
    expect(w.ehp[i]).toBeLessThan(ENEMY_DEFS[ENEMY.imp].hp);
  });

  it('damageEnemy kills and awards xp gems + kill count', () => {
    const w = new World(CHARACTERS[0], 7, 50);
    const i = w.spawnEnemy(ENEMY.swarmie, 100, 100, false, 1);
    const dead = damageEnemy(w, i, 9999, 0, null, ev);
    expect(dead).toBe(true);
    expect(w.runStats.kills).toBe(1);
    expect(w.gCount).toBeGreaterThan(0);
    expect(w.eCount).toBe(0);
  });

  it('tanks resist knockback more than swarmies', () => {
    const w = new World(CHARACTERS[0], 7, 50);
    const s = w.spawnEnemy(ENEMY.swarmie, 150, 100, false, 1);
    const t = w.spawnEnemy(ENEMY.tank, 150, 100, false, 1);
    damageEnemy(w, s, 0, 400, null, ev);
    damageEnemy(w, t, 0, 400, null, ev);
    expect(Math.hypot(w.evx[s], w.evy[s])).toBeGreaterThan(Math.hypot(w.evx[t], w.evy[t]) * 2);
  });

  it('boss death flips end state to won', () => {
    const w = new World(CHARACTERS[0], 7, 50);
    const i = w.spawnEnemy(ENEMY.boss, 500, 500, false, 1);
    expect(w.bossAlive).toBe(true);
    damageEnemy(w, i, 1e9, 0, null, ev);
    expect(w.endState).toBe('won');
    expect(w.bossAlive).toBe(false);
  });

  it('enemy collision transfers momentum (bonk)', () => {
    const w = new World(CHARACTERS[0], 7, 64);
    w.spawnEnemy(ENEMY.swarmie, 400, 400, false, 1);
    const b = w.spawnEnemy(ENEMY.swarmie, 416, 400, false, 1);
    w.evx[0] = 600;
    w.hash.clear(w.eCount);
    for (let i = 0; i < w.eCount; i++) w.hash.insert(i, w.ex[i], w.ey[i]);
    stepEnemies(w, 1 / 120, ev);
    const bMoved = Math.abs(w.evx[b]) + Math.abs(w.evy[b]);
    expect(bMoved).toBeGreaterThan(1);
  });
});

describe('wave director', () => {
  it('spawns enemies over time up to the cap', () => {
    const w = new World(CHARACTERS[0], 7, 30);
    for (let t = 0; t < 60 * 30; t++) {
      stepSpawner(w, 1 / 60, ev, 30);
      w.runStats.time += 1 / 60;
    }
    expect(w.eCount).toBeGreaterThan(10);
  });

  it('boss phase begins at 600s and spawns exactly one boss', () => {
    expect(isBossTime(599)).toBe(false);
    expect(isBossTime(600)).toBe(true);
    const w = new World(CHARACTERS[0], 7, 100);
    w.runStats.time = 600;
    stepSpawner(w, 1 / 60, ev, 100);
    expect(w.eCount).toBe(1);
    expect(w.etype[0]).toBe(ENEMY.boss);
    stepSpawner(w, 1 / 60, ev, 100);
    expect(w.eCount).toBe(1);
  });
});

describe('run integration', () => {
  it('ticks headlessly without crashing and accumulates time', () => {
    const run = new Run(CHARACTERS[0], 42, { maxActive: 50, onLevelUp: () => {}, onEnd: () => {} });
    for (let i = 0; i < 600; i++) run.tick(1 / 60, null);
    expect(run.w.runStats.time).toBeCloseTo(10, 1);
  });

  it('levels up when enough xp is granted', () => {
    const run = new Run(CHARACTERS[0], 42, { maxActive: 50, onLevelUp: () => {}, onEnd: () => {} });
    const w = run.w;
    const lvl0 = w.runStats.level;
    let levelUps = 0;
    grantXp(w, 999, () => levelUps++);
    expect(w.runStats.level).toBeGreaterThan(lvl0);
    expect(levelUps).toBeGreaterThan(0);
    expect(run.waitingChoice).toBe(false); // direct grant doesn't queue UI
  });
});

describe('enemy special attacks', () => {
  it('imp winds up then lunges toward the player', () => {
    const w = new World(CHARACTERS[0], 7, 50);
    const i = w.spawnEnemy(ENEMY.imp, w.px + 100, w.py, false, 1);
    w.eatkCd[i] = 0; // attack immediately
    const ev2 = ev;
    // tick until windup starts
    stepEnemies(w, 1 / 60, ev2);
    expect(w.ewindup[i]).toBeGreaterThan(0);
    expect(w.edirX[i]).toBeCloseTo(-1); // player is to the -x of the imp
    // windup lasts 0.45s: after it elapses the lunge impulse fires
    for (let t = 0; t < 30; t++) stepEnemies(w, 1 / 60, ev2);
    expect(w.ewindup[i]).toBeLessThanOrEqual(0);
    expect(Math.abs(w.evx[i])).toBeGreaterThan(100); // launched at the player
    expect(w.eactive[i]).toBeGreaterThan(0);
  });

  it('tank pound telegraphs then shakes the arena', () => {
    const w = new World(CHARACTERS[0], 7, 50);
    const i = w.spawnEnemy(ENEMY.tank, w.px + 80, w.py, false, 1);
    w.eatkCd[i] = 0;
    const calls: Array<{ x: number; y: number; r: number }> = [];
    const ev2: Ev = {
      ...ev,
      pound: (x, y, r) => calls.push({ x, y, r }),
    };
    stepEnemies(w, 1 / 60, ev2);
    expect(w.ewindup[i]).toBeGreaterThan(0);
    for (let t = 0; t < 50; t++) stepEnemies(w, 1 / 60, ev2);
    expect(calls.length).toBe(1);
    expect(calls[0].r).toBeCloseTo(115);
    // player was inside the pound radius and took damage
    expect(w.hp).toBeLessThan(w.stats.maxHp);
  });
});

describe('obstacles', () => {
  it('world generates pillars and crates away from spawn', () => {
    const w = new World(CHARACTERS[0], 7, 50);
    expect(w.oCount).toBeGreaterThan(10);
    let pillars = 0;
    let crates = 0;
    for (let i = 0; i < w.oCount; i++) {
      if (w.otype[i] === 0) pillars++;
      else crates++;
      // nothing embedded in the player spawn area
      expect(Math.hypot(w.ox[i] - w.px, w.oy[i] - w.py)).toBeGreaterThan(200);
    }
    expect(pillars).toBeGreaterThan(3);
    expect(crates).toBeGreaterThan(3);
  });

  it('player bounces off a pillar instead of passing through', () => {
    const w = new World(CHARACTERS[0], 7, 50);
    // place a pillar directly to the right of the player
    w.ox[0] = w.px + 20;
    w.oy[0] = w.py;
    w.oradius[0] = 17;
    w.otype[0] = 0;
    w.ohp[0] = -1;
    w.rebuildObstHash();
    const ev2 = ev;
    // roll right into it
    for (let t = 0; t < 30; t++) stepPlayer(w, 1, 0, 1 / 60, ev2, false);
    const dx = w.px - w.ox[0];
    expect(Math.hypot(dx, w.py - w.oy[0])).toBeGreaterThanOrEqual(17 + 9 - 2); // pushed out
    expect(w.px).toBeLessThan(w.ox[0]); // still on the left side — bounced, not tunneled
  });

  it('bolts destroy crates which drop gold', () => {
    const w = new World(CHARACTERS[0], 7, 50);
    w.ox[0] = w.px + 30;
    w.oy[0] = w.py;
    w.oradius[0] = 13;
    w.otype[0] = 1;
    w.ohp[0] = 5;
    w.omaxhp[0] = 5;
    w.rebuildObstHash();
    w.addWeapon('shot');
    w.weaponCds.set('shot', 0);
    const ev2 = ev;
    for (let t = 0; t < 240 && w.ohp[0] > 0; t++) {
      w.hash.clear(w.eCount);
      stepWeapons(w, 1 / 60, ev2);
    }
    expect(w.ohp[0]).toBeLessThanOrEqual(0); // crate destroyed
  });
});

describe('verticality (z-axis)', () => {
  function makeInput(jump: boolean): Parameters<typeof Run.prototype.tick>[1] {
    return { jumpQueued: jump, moveX: 0, moveY: 0, pollGamepad: () => {} } as never;
  }

  it('jump arcs up ~55px and lands inside a reasonable airtime', () => {
    const run = new Run(CHARACTERS[0], 9, { maxActive: 50, onLevelUp: () => {}, onEnd: () => {} });
    const w = run.w;
    let maxZ = 0;
    let ticks = 0;
    run.tick(1 / 60, makeInput(true)); // take off
    while (ticks < 120 && (w.pz > 0 || w.pvz > 0)) {
      run.tick(1 / 60, makeInput(false));
      maxZ = Math.max(maxZ, w.pz);
      ticks++;
    }
    expect(maxZ).toBeGreaterThan(40);
    expect(maxZ).toBeLessThan(80);
    const airtime = ticks / 60;
    expect(airtime).toBeGreaterThan(0.4);
    expect(airtime).toBeLessThan(0.9);
  });

  it('airborne players dodge contact damage', () => {
    const run = new Run(CHARACTERS[0], 9, { maxActive: 50, onLevelUp: () => {}, onEnd: () => {} });
    const w = run.w;
    const i = w.spawnEnemy(ENEMY.imp, w.px + 10, w.py, false, 1);
    w.pz = 60; // sailed over it
    const hpBefore = w.hp;
    stepEnemies(w, 1 / 60, ev);
    expect(w.hp).toBe(hpBefore);
    // grounded: the same imp connects
    w.pz = 0;
    stepEnemies(w, 1 / 60, ev);
    expect(w.hp).toBeLessThan(hpBefore);
    void i;
  });

  it('body slam damages and launches nearby enemies', () => {
    const run = new Run(CHARACTERS[0], 9, { maxActive: 50, onLevelUp: () => {}, onEnd: () => {} });
    const w = run.w;
    w.hash.clear(0);
    const a = w.spawnEnemy(ENEMY.swarmie, w.px + 30, w.py, false, 1);
    const b = w.spawnEnemy(ENEMY.swarmie, w.px - 40, w.py + 10, false, 1);
    w.hash.clear(w.eCount);
    for (let i = 0; i < w.eCount; i++) w.hash.insert(i, w.ex[i], w.ey[i]);
    w.pz = 80;
    w.pvz = -560;
    w.slamming = true;
    const slamEvents: Array<{ x: number; y: number; r: number }> = [];
    const ev2: Ev = { ...ev, groundSlam: (x, y, r) => slamEvents.push({ x, y, r }) };
    for (let t = 0; t < 60 && w.pz > 0; t++) stepPlayer(w, 0, 0, 1 / 60, ev2, false);
    expect(slamEvents.length).toBe(1);
    expect(w.runStats.kills).toBe(2); // both swarmies crushed
  });

  it('terraces raise ground height and ease stepping', () => {
    const w = new World(CHARACTERS[0], 9, 50);
    w.terraces.length = 0;
    w.terraces.push({ x: w.px + 40, y: w.py - 100, w: 200, h: 200, z: 30 });
    expect(w.groundHeightAt(w.px + 140, w.py)).toBe(30);
    expect(w.groundHeightAt(w.px, w.py)).toBe(0);
    // walk in: eased ground rises toward the terrace height
    const run = new Run(CHARACTERS[0], 9, { maxActive: 50, onLevelUp: () => {}, onEnd: () => {} });
    const w2 = run.w;
    w2.terraces.length = 0;
    w2.terraces.push({ x: w2.px + 40, y: w2.py - 100, w: 200, h: 200, z: 30 });
    for (let t = 0; t < 90; t++) {
      stepPlayer(w2, 1, 0, 1 / 60, ev, false);
      // pin inside the terrace so easing completes
      if (w2.px < w2.terraces[0].x + 100) { /* still travelling */ }
    }
    expect(w2.groundHeightAt(w2.px, w2.py)).toBe(30);
    expect(w2.egz).toBeGreaterThan(20);
  });
});

describe('multi-zone world', () => {
  it('spawns at the crossroads and resolves all four zones', () => {
    const w = new World(CHARACTERS[0], 7, 50);
    expect(w.px).toBe(1840);
    expect(w.py).toBe(1840);
    expect(w.zoneAt(100, 100).id).toBe('iron');
    expect(w.zoneAt(3000, 100).id).toBe('frost');
    expect(w.zoneAt(100, 3000).id).toBe('rust');
    expect(w.zoneAt(3000, 3000).id).toBe('ember');
  });

  it('generates terrain features and rewards across zones', () => {
    const w = new World(CHARACTERS[0], 7, 50);
    expect(w.patches.length).toBeGreaterThan(3);
    expect(w.bumpers.length).toBeGreaterThanOrEqual(4);
    expect(w.boostPads.length).toBeGreaterThanOrEqual(2);
    expect(w.jumpPads.length).toBeGreaterThanOrEqual(2);
    expect(w.rewards.filter((r) => r.kind === 'cache').length).toBeGreaterThanOrEqual(3);
    expect(w.rewards.filter((r) => r.kind.startsWith('shrine')).length).toBe(3);
    // two chests placed as obstacles
    let chests = 0;
    for (let i = 0; i < w.oCount; i++) if (w.otype[i] === 2) chests++;
    expect(chests).toBe(2);
  });

  it('interior walls block the player but gates let them through', () => {
    const w = new World(CHARACTERS[0], 7, 50);
    // stand in front of the vertical wall away from any gate
    w.px = 1700;
    w.py = 500;
    for (let t = 0; t < 40; t++) stepPlayer(w, 1, 0, 1 / 60, ev, false);
    expect(w.px).toBeLessThan(1824); // stopped by the wall face
    // in the gate lane the player crosses to the other side
    w.px = 1700;
    w.py = 1840;
    for (let t = 0; t < 150; t++) stepPlayer(w, 1, 0, 1 / 60, ev, false);
    expect(w.px).toBeGreaterThan(1900); // crossed the plaza gate
  });

  it('bumpers fling the player away at high speed', () => {
    const w = new World(CHARACTERS[0], 7, 50);
    w.bumpers.push({ x: w.px + 26, y: w.py, r: 20, flash: 0 });
    stepPlayer(w, 1, 0, 1 / 60, ev, false); // contact on the first tick
    expect(Math.hypot(w.pvx, w.pvy)).toBeGreaterThan(380); // flung hard
    expect(w.px).toBeLessThan(w.bumpers[0].x); // pushed back to the left
  });

  it('patchAt resolves ice and goo', () => {
    const w = new World(CHARACTERS[0], 7, 50);
    w.patches.length = 0;
    w.patches.push({ x: 500, y: 500, r: 100, kind: 'ice' });
    w.patches.push({ x: 2500, y: 2500, r: 100, kind: 'goo' });
    expect(w.patchAt(500, 500)).toBe('ice');
    expect(w.patchAt(2500, 2500)).toBe('goo');
    expect(w.patchAt(1840, 1840)).toBe(null);
  });

  it('shrines grant a timed buff that refreshes stats', () => {
    const run = new Run(CHARACTERS[0], 7, { maxActive: 50, onLevelUp: () => {}, onEnd: () => {} });
    const w = run.w;
    const baseDmg = w.stats.dmgMult;
    w.rewards.push({ x: w.px, y: w.py, kind: 'shrine_might', taken: false });
    run.tick(1 / 60, null);
    expect(w.buff).not.toBe(null);
    if (w.buff) expect(w.buff.kind).toBe('might');
    expect(w.stats.dmgMult).toBeCloseTo(baseDmg * 1.3, 5);
    // 45s later the buff expires
    for (let t = 0; t < 46 * 60; t++) {
      stepPlayer(w, 0, 0, 1 / 60, ev, false);
      if (!w.buff) break;
    }
    expect(w.buff).toBe(null);
    expect(w.stats.dmgMult).toBeCloseTo(baseDmg, 5);
  });

  it('chests burst into coins and xp gems when broken', () => {
    const w = new World(CHARACTERS[0], 7, 50);
    w.placeChestForTest(w.px + 20, w.py);
    const chestIdx = w.oCount - 1;
    const dead = damageEnemy(w, 0, 0, 0, null, ev); // no-op warmup
    void dead;
    damageObstacle(w, chestIdx, 999, ev);
    expect(w.ohp[chestIdx]).toBeLessThanOrEqual(0);
    let golds = 0;
    let gems = 0;
    for (let i = 0; i < w.gCount; i++) {
      if (w.gkind[i] === 1) golds++;
      else gems++;
    }
    expect(golds).toBeGreaterThanOrEqual(5);
    expect(gems).toBeGreaterThanOrEqual(4);
  });
});
