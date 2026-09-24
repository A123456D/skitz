import { describe, expect, it } from 'vitest';
import { MUSIC_THEMES, midiToFreq, planStep, STEPS_PER_BAR, themeFor } from './music';

describe('music planner', () => {
  it('converts midi to frequency (A4 = 440)', () => {
    expect(midiToFreq(69)).toBeCloseTo(440, 5);
    expect(midiToFreq(57)).toBeCloseTo(220, 5);
    expect(midiToFreq(81)).toBeCloseTo(880, 5);
  });

  it('has a valid theme per biome id with a fallback', () => {
    for (const id of ['iron', 'frost', 'rust', 'ember']) {
      const t = themeFor(id);
      expect(t.bpm).toBeGreaterThan(90);
      expect(t.bpm).toBeLessThan(140);
      expect(t.chords.length).toBe(4);
      for (const c of t.chords) expect(c.length).toBe(3);
      expect(t.bass).toHaveLength(STEPS_PER_BAR);
      expect(t.arp).toHaveLength(STEPS_PER_BAR);
    }
    expect(themeFor('unknown')).toBe(MUSIC_THEMES.iron);
  });

  it('layer gates: calm plays pad+sub only, boss adds drums', () => {
    const t = MUSIC_THEMES.iron;
    const barStart = planStep(t, 0, 0, 0.125);
    expect(barStart.some((e) => e.kind === 'pad')).toBe(true);
    expect(barStart.some((e) => e.kind === 'sub')).toBe(true);
    expect(barStart.some((e) => e.kind === 'bass' || e.kind === 'kick')).toBe(false);

    const bassStep = planStep(t, 0, 1, 0.125);
    expect(bassStep.some((e) => e.kind === 'bass')).toBe(true);

    // step 4 of a bar: no kick at combat, kick at boss intensity
    expect(planStep(t, 4, 2, 0.125).some((e) => e.kind === 'kick')).toBe(false);
    expect(planStep(t, 4, 3, 0.125).some((e) => e.kind === 'kick')).toBe(true);
    expect(planStep(t, 4, 3, 0.125).some((e) => e.kind === 'snare')).toBe(true);
  });

  it('arp shifts up an octave at boss intensity', () => {
    const t = MUSIC_THEMES.iron;
    const combat = planStep(t, 3, 2, 0.125).find((e) => e.kind === 'arp');
    const boss = planStep(t, 3, 3, 0.125).find((e) => e.kind === 'arp');
    expect(combat).toBeDefined();
    expect(boss).toBeDefined();
    expect(boss!.midi).toBe(combat!.midi + 12);
  });

  it('cycles chords per bar and wraps negative steps safely', () => {
    const t = MUSIC_THEMES.iron;
    const padAt = (step: number) =>
      planStep(t, step, 0, 0.125).filter((e) => e.kind === 'pad').map((e) => e.midi).join(',');
    // bar 0 and bar 4 share a chord; bar 1 differs; negative steps wrap safely
    expect(padAt(0)).toBe(padAt(4 * STEPS_PER_BAR));
    expect(padAt(0)).not.toBe(padAt(1 * STEPS_PER_BAR));
    expect(padAt(-STEPS_PER_BAR)).toBe(padAt(3 * STEPS_PER_BAR));
  });
});
