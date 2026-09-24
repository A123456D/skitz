import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../src/game/data/characters';
import { ELITE_MOD } from '../src/game/data/eliteMods';
import { applyChoice, choiceKey, availableEvolution, rollChoices } from '../src/game/progression';
import { World } from '../src/game/state';
import { ENEMY } from '../src/game/data/enemies';
import { stepDashDamage, stepOrbit, stepWeapons, tryChain, clearTrail } from '../src/game/weapons';
import { damageEnemy, killEnemyByIndex, stepEliteMods } from '../src/game/physics';
import type { Events } from '../src/game/events';

let seedCounter = 0;
function makeWorld(): World {
  return new World(CHARACTERS[0], (++seedCounter * 7919) | 0, 200);
}

/** the spatial hash is rebuilt inside stepEnemies — tests must build it after spawning */
function rebuildHash(w: World): void {
  w.hash.clear(w.eCount);
  for (let i = 0; i < w.eCount; i++) w.hash.insert(i, w.ex[i], w.ey[i]);
}

/** silent event sink */
function silentEvents(): Events {
  const noop = () => {};
  return new Proxy({} as Events, { get: () => noop });
}
const ev = silentEvents();

describe('item layer', () => {
  it('items apply their stat mods through refreshStats', () => {
    const w = makeWorld();
    const dmgBefore = w.stats.dmgMult;
    const hpBefore = w.stats.maxHp;
    w.items.set('heavy_bolts', 2); // +8% dmg per copy (additive pcts)
    w.items.set('scrap_plate', 1); // +20 flat hp
    w.items.set('glass_cannon', 1); // +45% dmg, -40% hp
    w.refreshStats();
    expect(w.stats.dmgMult).toBeCloseTo(dmgBefore + 0.16 + 0.45, 5);
    expect(w.stats.maxHp).toBeGreaterThan(hpBefore * 0.6); // net of -40% but +20 flat vs base ~100
  });

  it('every item can be drafted and respects its copy cap', () => {
    const w = makeWorld();
    let sawLegendary = false;
    for (let i = 0; i < 4000 && !sawLegendary; i++) {
      const choices = rollChoices(w);
      for (const c of choices) {
        if (c.kind === 'item') {
          if (c.rarity === 'legendary') sawLegendary = true;
          applyChoice(w, c);
          expect(w.items.get(c.id)).toBeLessThanOrEqual(99);
        }
      }
    }
    expect(sawLegendary).toBe(true);
  });
});

describe('draft agency', () => {
  it('banished cards never reappear', () => {
    const w = makeWorld();
    const choices = rollChoices(w);
    const target = choices.find((c) => c.kind === 'weapon' && c.isNew) ?? choices[0];
    w.banished.add(choiceKey(target));
    for (let i = 0; i < 60; i++) {
      for (const c of rollChoices(w)) {
        expect(choiceKey(c)).not.toBe(choiceKey(target));
      }
    }
  });

  it('the locked card is pinned into the next hand', () => {
    const w = makeWorld();
    const choices = rollChoices(w);
    w.locked = choices[0];
    for (let i = 0; i < 20; i++) {
      const next = rollChoices(w);
      expect(next.some((c) => choiceKey(c) === choiceKey(w.locked!))).toBe(true);
    }
    // picking anything clears the lock
    applyChoice(w, w.locked);
    expect(w.locked).toBeNull();
  });

  it('a maxed weapon + paired passive offers its evolution first', () => {
    const w = makeWorld();
    w.addWeapon('slam');
    w.weapons.set('slam', 5);
    expect(availableEvolution(w)).toBeNull(); // passive missing
    w.passives.set('mass', 1);
    const evo = availableEvolution(w);
    expect(evo?.weapon).toBe('slam');
    const choices = rollChoices(w);
    expect(choices[0].kind).toBe('evolution');
    expect(choices[0].id).toBe('gravcrush');

    applyChoice(w, choices[0]);
    expect(w.evolved.has('slam')).toBe(true);
    expect(availableEvolution(w)).toBeNull(); // already evolved
    for (let i = 0; i < 30; i++) {
      for (const c of rollChoices(w)) expect(c.kind).not.toBe('evolution');
    }
  });
});

describe('evolution behavior', () => {
  it('Gravity Crush pulls and charges enemies around the slam', () => {
    const w = makeWorld();
    w.addWeapon('slam');
    w.weapons.set('slam', 5);
    w.passives.set('mass', 2);
    w.evolved.add('slam');
    const i = w.spawnEnemy(ENEMY.tank, w.px + 120, w.py, false, 1);
    rebuildHash(w);
    w.weaponCds.set('slam', 0);
    for (const [id] of w.weapons) w.weaponCds.set(id, 0);
    stepWeapons(w, 1 / 60, ev);
    expect(w.evx[i]).not.toBe(0); // got pulled
    if (w.ehp[i] > 0) expect(w.echarge[i]).toBeGreaterThan(0);
  });

  it('Sawring launches saw bolts while orbiting', () => {
    const w = makeWorld();
    w.addWeapon('orbit');
    w.weapons.set('orbit', 5);
    w.passives.set('velocity', 1);
    w.evolved.add('orbit');
    for (let t = 0; t < 60 * 3 && w.bCount === 0; t++) stepOrbit(w, { cd: 0, dmg: 28, knock: 225, count: 5, radius: 64, speed: 3.6 }, 1 / 60, ev);
    expect(w.bCount).toBeGreaterThan(0);
    expect(w.bkind[0]).toBe(1);
  });

  it('Juggernaut dash emits tremors with damage', () => {
    const w = makeWorld();
    w.addWeapon('dash');
    w.weapons.set('dash', 5);
    w.passives.set('impact', 2);
    w.evolved.add('dash');
    const i = w.spawnEnemy(ENEMY.tank, w.px + 20, w.py, false, 1);
    rebuildHash(w);
    const hp0 = w.ehp[i];
    w.dashT = 0.42;
    w.dashDx = 1;
    w.dashDy = 0;
    w.pvx = 300;
    w.pvy = 0;
    w.juggTremorAcc = 0.14; // tremor fires immediately
    stepDashDamage(w, ev);
    expect(w.ehp[i]).toBeLessThan(hp0);
  });

  it('Tesla Web slows arced enemies', () => {
    const w = makeWorld();
    w.addWeapon('trail');
    w.weapons.set('trail', 5);
    w.passives.set('magnet', 1);
    w.evolved.add('trail');
    const i = w.spawnEnemy(ENEMY.tank, w.px, w.py, false, 1);
    rebuildHash(w);
    w.pvx = 100; // moving so trail nodes drop
    clearTrail();
    // step until a node arms under the enemy
    for (let t = 0; t < 60 * 4; t++) {
      w.px += 40 * (1 / 60); // roll forward, dropping nodes
      stepWeapons(w, 1 / 60, ev);
      if (w.eslow[i] > 0) break;
    }
    expect(w.eslow[i]).toBeGreaterThan(0);
  });

  it('Stormcaller chain forks and slows', () => {
    const w = makeWorld();
    w.addWeapon('chain');
    w.weapons.set('chain', 5);
    w.passives.set('luck', 1);
    w.evolved.add('chain');
    const a = w.spawnEnemy(ENEMY.tank, w.px + 60, w.py, false, 1);
    const b = w.spawnEnemy(ENEMY.tank, w.px + 110, w.py + 10, false, 1);
    rebuildHash(w);
    tryChain(w, w.px, w.py, 10, ev);
    expect(w.eslow[a]).toBeGreaterThan(0);
    expect(w.eslow[b]).toBeGreaterThan(0);
  });
});

describe('elite modifiers', () => {
  it('Volatile elites explode into charged shrapnel on death', () => {
    const w = makeWorld();
    const modder = w.spawnEnemy(ENEMY.imp, w.px + 100, w.py, true, 1, ELITE_MOD.volatile);
    w.spawnEnemy(ENEMY.swarmie, w.px + 130, w.py, false, 1);
    rebuildHash(w);
    killEnemyByIndex(w, modder, ev);
    // swap-remove moves the victim into the dead elite's slot
    expect(w.echarge[modder]).toBeGreaterThan(0);
    expect(w.evx[modder]).not.toBe(0);
  });

  it('Splitting elites spawn two children on death', () => {
    const w = makeWorld();
    const n0 = w.eCount;
    const modder = w.spawnEnemy(ENEMY.imp, w.px + 100, w.py, true, 1, ELITE_MOD.splitting);
    killEnemyByIndex(w, modder, ev);
    // children spawn before the elite is removed from the pool: +2 net
    expect(w.eCount).toBe(n0 + 2);
    // children carry no modifier
    for (let i = n0; i < w.eCount; i++) expect(w.emod[i]).toBe(0);
  });

  it('Greedy elites drop a pile of gold', () => {
    const w = makeWorld();
    const g0 = w.gCount;
    const modder = w.spawnEnemy(ENEMY.imp, w.px + 100, w.py, true, 1, ELITE_MOD.greedy);
    killEnemyByIndex(w, modder, ev);
    let gold = 0;
    for (let i = g0; i < w.gCount; i++) if (w.gkind[i] === 1) gold++;
    expect(gold).toBeGreaterThanOrEqual(7);
  });

  it('Juggernaut elites barely move when knocked', () => {
    const w = makeWorld();
    const i = w.spawnEnemy(ENEMY.imp, w.px + 100, w.py, true, 1, ELITE_MOD.juggernaut);
    const vx0 = w.evx[i];
    damageEnemy(w, i, 1, 400, 0, ev);
    const delta = Math.abs(w.evx[i] - vx0);
    expect(delta).toBeLessThan(400 * 0.2);
  });

  it('Stormtouched elites zap the player periodically', () => {
    const w = makeWorld();
    const i = w.spawnEnemy(ENEMY.imp, w.px + 200, w.py, true, 1, ELITE_MOD.stormtouched);
    w.emodCd[i] = 0.001;
    const v0 = w.vCount;
    stepEliteMods(w, 1 / 60, ev);
    expect(w.vCount).toBe(v0 + 1);
  });

  it('Frostbound auras chill the player', () => {
    const w = makeWorld();
    const i = w.spawnEnemy(ENEMY.imp, w.px + 40, w.py, true, 1, ELITE_MOD.frostbound);
    stepEliteMods(w, 1 / 60, ev);
    expect(w.playerSlowT).toBeGreaterThan(0);
    void i;
  });
});
