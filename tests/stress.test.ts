import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../src/game/data/characters';
import { Run } from '../src/game/run';

/**
 * Stress: maxed build at 10 minutes (boss phase) must simulate 30s
 * of game time in bounded wall-clock time — catches infinite loops
 * and runaway subsystems headlessly.
 */
describe('stress: maxed build in boss phase', () => {
  it('ticks 30s without hanging or crashing', () => {
    const run = new Run(CHARACTERS[0], 99, { maxActive: 3000, onLevelUp: () => {}, onEnd: () => {} });
    const w = run.w;
    // maxed loadout (mirrors ?build=max)
    for (const [id, lvl] of [['slam', 5], ['shot', 5], ['orbit', 5], ['dash', 5], ['chain', 5]] as const) {
      w.addWeapon(id);
      w.weapons.set(id, lvl);
    }
    for (const [id, lvl] of [['mass', 5], ['vitality', 5], ['impact', 5], ['velocity', 5]] as const) {
      w.passives.set(id, lvl);
    }
    w.refreshStats();
    w.hp = w.stats.maxHp;
    w.runStats.time = 598;

    const t0 = performance.now();
    let levels = 0;
    for (let i = 0; i < 60 * 30; i++) {
      run.tick(1 / 60, null);
      // auto-resolve level-ups like the UI does
      while (run.waitingChoice) {
        const choices = run.takeChoices();
        if (choices.length === 0) { break; }
        run.resolveChoice(choices[0]);
        levels++;
      }
      if (run.ended) break;
    }
    const ms = performance.now() - t0;
    expect(w.runStats.time).toBeGreaterThan(598);
    // 30s of sim must simulate faster than real time headlessly
    expect(ms).toBeLessThan(30000);
  }, 60000);
});
