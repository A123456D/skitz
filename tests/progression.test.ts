import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../src/game/data/characters';
import { applyChoice, rollChoices, xpForLevel } from '../src/game/progression';
import { World } from '../src/game/state';

function makeWorld(): World {
  return new World(CHARACTERS[0], 12345, 100);
}

describe('progression', () => {
  it('xp requirements are monotonic', () => {
    let prev = 0;
    for (let lvl = 1; lvl < 40; lvl++) {
      const need = xpForLevel(lvl);
      expect(need).toBeGreaterThan(prev);
      prev = need;
    }
  });

  it('rolls at most 3 distinct choices', () => {
    const w = makeWorld();
    for (let i = 0; i < 50; i++) {
      const choices = rollChoices(w);
      expect(choices.length).toBeLessThanOrEqual(3);
      const keys = new Set(choices.map((c) => `${c.kind}:${c.id}`));
      expect(keys.size).toBe(choices.length);
    }
  });

  it('rolls nothing when everything is maxed', () => {
    const w = makeWorld();
    for (let i = 0; i < 300; i++) {
      const choices = rollChoices(w);
      if (choices.length === 0) break;
      applyChoice(w, choices[0]);
    }
    expect(rollChoices(w)).toHaveLength(0);
    // slot caps respected
    expect(w.weapons.size).toBeLessThanOrEqual(4);
    expect(w.passives.size).toBeLessThanOrEqual(4);
  });

  it('applying a weapon choice registers it and refreshes stats', () => {
    const w = makeWorld();
    let pick: ReturnType<typeof rollChoices>[number] | undefined;
    for (let i = 0; i < 40 && !pick; i++) {
      pick = rollChoices(w).find((c) => (c.kind === 'weapon' || c.kind === 'passive') && c.isNew);
    }
    expect(pick).toBeDefined();
    applyChoice(w, pick!);
    if (pick!.kind === 'weapon') {
      expect(w.weapons.get(pick!.id as never)).toBe(1);
    } else {
      expect(w.passives.get(pick!.id as never)).toBe(1);
    }
  });

  it('vitality passive raises max hp', () => {
    const w = makeWorld();
    const before = w.stats.maxHp;
    w.passives.set('vitality', 3);
    w.refreshStats();
    expect(w.stats.maxHp).toBeGreaterThan(before);
    expect(w.hp).toBe(w.stats.maxHp); // heal-on-gain tops up to new max from full
  });
});
