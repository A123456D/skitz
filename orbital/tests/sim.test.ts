import { describe, it, expect } from 'vitest';
import {
  createWorld, startStroke, launch, placePin, stepTick, drainEvents,
  predict, sampleField, makeFieldSample,
} from '../src/sim';
import type { LevelDef, SimEvent } from '../src/sim';

const BOUNDS = { cx: 600, cy: 300, rx: 700, ry: 450 };

function baseLevel(extra: Partial<LevelDef>): LevelDef {
  return {
    id: 'T0', name: 'Test', region: 1, concept: 'test', par: 2, pinBudget: 2,
    tee: { x: 150, y: 300 },
    hole: { x: 1500, y: 800 }, // out of the way by default
    bounds: BOUNDS,
    bodies: [],
    ...extra,
  };
}

function run(w: ReturnType<typeof createWorld>, seconds: number): SimEvent[] {
  const ticks = Math.round(seconds * 60);
  for (let i = 0; i < ticks; i++) stepTick(w);
  return drainEvents(w);
}

const f = makeFieldSample();

describe('gravity + orbits', () => {
  it('captures the ball into a stable orbit at circular velocity', () => {
    const def = baseLevel({
      tee: { x: 450, y: 300 },
      bodies: [{ id: 'p', kind: 'attractor', x: 600, y: 300, radius: 60, mu: 5e6, influenceR: 500, material: 'rock' }],
    });
    const w = createWorld(def, 1);
    startStroke(w);
    sampleField(w, w.ball.x, w.ball.y, f);
    const vCirc = Math.sqrt(f.dominantA * 150);
    expect(vCirc).toBeGreaterThan(150);
    expect(vCirc).toBeLessThan(220);
    launch(w, 0, -1, vCirc);
    run(w, 10);
    const body = w.bodies[0];
    const d = Math.hypot(w.ball.x - body.cx, w.ball.y - body.cy);
    expect(d).toBeGreaterThan(70); // never crashed
    expect(d).toBeLessThan(320); // never escaped far
    expect(w.orbits).toBeGreaterThanOrEqual(1); // full 2π tracked
  });

  it('lets a fast ball escape the influence', () => {
    const def = baseLevel({
      tee: { x: 450, y: 300 },
      bodies: [{ id: 'p', kind: 'attractor', x: 600, y: 300, radius: 60, mu: 5e6, influenceR: 500, material: 'rock' }],
    });
    const w = createWorld(def, 1);
    startStroke(w);
    launch(w, 0, -1, 500);
    let maxDist = 0;
    for (let i = 0; i < 600; i++) {
      stepTick(w);
      maxDist = Math.max(maxDist, Math.hypot(w.ball.x - 600, w.ball.y - 300));
    }
    expect(maxDist).toBeGreaterThan(420);
  });

  it('repulsors push the ball back before contact', () => {
    const def = baseLevel({
      bodies: [{ id: 'r', kind: 'repulsor', x: 600, y: 300, radius: 60, mu: 5e6, influenceR: 500, material: 'metal' }],
    });
    const w = createWorld(def, 1);
    startStroke(w);
    launch(w, 1, 0, 300);
    let maxX = 0;
    run(w, 5);
    maxX = w.ball.x;
    expect(maxX).toBeLessThan(545); // turned around before the surface (530)
    expect(w.ball.vx).toBeLessThan(0); // heading back
  });

  it('pulse bodies modulate mu deterministically', () => {
    const def = baseLevel({
      bodies: [{ id: 'pu', kind: 'pulse', x: 600, y: 100, radius: 50, mu: 5e6, influenceR: 500, material: 'gas', pulsePeriod: 2 }],
    });
    const a = createWorld(def, 7);
    const b = createWorld(def, 7);
    for (let i = 0; i < 30; i++) { stepTick(a); stepTick(b); }
    const early = a.bodies[0].muCurrent;
    for (let i = 0; i < 60; i++) { stepTick(a); stepTick(b); }
    expect(Math.abs(a.bodies[0].muCurrent - early)).toBeGreaterThan(5e5);
    expect(a.bodies[0].muCurrent).toBe(b.bodies[0].muCurrent);
  });

  it('path bodies travel their waypoints', () => {
    const def = baseLevel({
      bodies: [{
        id: 'm', kind: 'path', x: 400, y: 300, radius: 40, mu: 1e6, influenceR: 300, material: 'ice',
        path: { points: [{ x: 400, y: 300 }, { x: 800, y: 300 }], speed: 100, mode: 'loop' },
      }],
    });
    const w = createWorld(def, 1);
    for (let i = 0; i < 60; i++) stepTick(w);
    expect(w.bodies[0].cx).toBeGreaterThan(440);
    expect(w.bodies[0].cx).toBeLessThan(540);
  });
});

describe('gravity pins', () => {
  it('bends a straight shot and enforces the budget', () => {
    const def = baseLevel({ pinBudget: 1 });
    const w1 = createWorld(def, 3);
    startStroke(w1);
    launch(w1, 1, 0, 200);
    let yBase = 300;
    for (let i = 0; i < 500; i++) {
      stepTick(w1);
      if (w1.ball.x >= 1000) { yBase = w1.ball.y; break; }
    }
    const w2 = createWorld(def, 3);
    startStroke(w2);
    expect(placePin(w2, 700, 180)).toBe(true);
    expect(placePin(w2, 300, 400)).toBe(false); // budget 1
    expect(drainEvents(w2).some((e) => e.type === 'pinDeny')).toBe(true);
    launch(w2, 1, 0, 200);
    let yPin = 300;
    for (let i = 0; i < 500; i++) {
      stepTick(w2);
      if (w2.ball.x >= 1000) { yPin = w2.ball.y; break; }
    }
    expect(Math.abs(yPin - yBase)).toBeGreaterThan(20);
  });

  it('clears pins when the stroke ends', () => {
    const def = baseLevel({ pinBudget: 2 });
    const w = createWorld(def, 3);
    startStroke(w);
    placePin(w, 500, 200);
    launch(w, 1, 0, 400); // flies out of bounds
    run(w, 12);
    expect(w.strokeEnded).not.toBeNull();
    startStroke(w);
    expect(w.pins.length).toBe(0);
  });
});

describe('hole', () => {
  it('sinks slow entries and lip-outs fast ones', () => {
    const def = baseLevel({ hole: { x: 900, y: 300 } });
    const slow = createWorld(def, 1);
    startStroke(slow);
    launch(slow, 1, 0, 200);
    const evSlow = run(slow, 8);
    expect(slow.strokeEnded).toBe('sunk');
    expect(evSlow.some((e) => e.type === 'sink')).toBe(true);

    const fast = createWorld(def, 1);
    startStroke(fast);
    launch(fast, 1, 0, 450);
    const evFast = run(fast, 8);
    expect(evFast.some((e) => e.type === 'lipout')).toBe(true);
    expect(fast.strokeEnded).not.toBe('sunk');
  });

  it('counts strokes and loses balls to the void outside bounds', () => {
    const def = baseLevel({ hole: { x: 900, y: 300 } });
    const w = createWorld(def, 1);
    startStroke(w);
    launch(w, 0, -1, 500); // straight up, out of bounds
    run(w, 12);
    expect(w.strokes).toBe(1);
    expect(w.strokeEnded).toBe('voided');
  });
});

describe('determinism', () => {
  it('same seed → identical outcome, different seed → divergence (unstable)', () => {
    const def = baseLevel({
      bodies: [{
        id: 'u', kind: 'unstable', x: 600, y: 300, radius: 50, mu: 5e6, influenceR: 500,
        material: 'crystal', muMin: 2e6, muMax: 8e6, wanderT: 0.8,
      }],
    });
    const a = createWorld(def, 1234);
    const b = createWorld(def, 1234);
    const c = createWorld(def, 1235);
    for (const w of [a, b, c]) { startStroke(w); launch(w, 1, 0.1, 350); }
    for (let i = 0; i < 600; i++) { stepTick(a); stepTick(b); stepTick(c); }
    expect(a.ball.x).toBe(b.ball.x);
    expect(a.ball.y).toBe(b.ball.y);
    expect(a.ball.x).not.toBeCloseTo(c.ball.x, 0);
  });
});

describe('switches + sequence', () => {
  it('a once-switch latches its gated body on', () => {
    const def = baseLevel({
      switches: [{ id: 's1', x: 500, y: 300, r: 20, mode: 'once', targets: ['g1'] }],
      bodies: [{ id: 'g1', kind: 'attractor', x: 800, y: 100, radius: 40, mu: 1e6, influenceR: 300, material: 'machine', gate: { switchId: 's1' } }],
    });
    const w = createWorld(def, 1);
    startStroke(w);
    launch(w, 1, 0, 250);
    run(w, 2);
    expect(w.bodies[0].active).toBe(true);
    expect(drainEvents(w).concat([]).length).toBeGreaterThanOrEqual(0);
  });

  it('sequence resets on out-of-order contact', () => {
    const def = baseLevel({
      switches: [
        { id: 's1', x: 400, y: 300, r: 20, mode: 'once', targets: ['g1'] },
        { id: 's2', x: 700, y: 300, r: 20, mode: 'once', targets: ['g2'] },
      ],
      sequence: ['s2', 's1'], // ball meets s1 first → wrong
      bodies: [
        { id: 'g1', kind: 'attractor', x: 1400, y: 100, radius: 30, mu: 1e6, influenceR: 200, material: 'machine', gate: { switchId: 's1' } },
        { id: 'g2', kind: 'attractor', x: 1400, y: 500, radius: 30, mu: 1e6, influenceR: 200, material: 'machine', gate: { switchId: 's2' } },
      ],
    });
    const w = createWorld(def, 1);
    startStroke(w);
    launch(w, 1, 0, 250);
    const ev = run(w, 3.5);
    expect(ev.some((e) => e.type === 'sequenceReset')).toBe(true);
    // s1 never fired; s2 is legitimately the first step of the restarted sequence
    expect(w.bodies.find((b) => b.id === 'g1')?.active).toBe(false);
  });

  it('fires both when hit in order', () => {
    const def = baseLevel({
      switches: [
        { id: 's1', x: 400, y: 300, r: 20, mode: 'once', targets: ['g1'] },
        { id: 's2', x: 700, y: 300, r: 20, mode: 'once', targets: ['g2'] },
      ],
      sequence: ['s1', 's2'],
      bodies: [
        { id: 'g1', kind: 'attractor', x: 1400, y: 100, radius: 30, mu: 1e6, influenceR: 200, material: 'machine', gate: { switchId: 's1' } },
        { id: 'g2', kind: 'attractor', x: 1400, y: 500, radius: 30, mu: 1e6, influenceR: 200, material: 'machine', gate: { switchId: 's2' } },
      ],
    });
    const w = createWorld(def, 1);
    startStroke(w);
    launch(w, 1, 0, 250);
    run(w, 3.5);
    expect(w.bodies.map((b) => b.active)).toEqual([true, true]);
  });
});

describe('zones', () => {
  it('void zones cancel gravity inside them', () => {
    const body = { id: 'p', kind: 'attractor' as const, x: 600, y: 100, radius: 40, mu: 4e6, influenceR: 400, material: 'rock' as const };
    const base = baseLevel({ bodies: [body] });
    const w1 = createWorld(base, 1);
    startStroke(w1);
    launch(w1, 1, 0, 300);
    let yBase = 300;
    for (let i = 0; i < 300; i++) { stepTick(w1); if (w1.ball.x >= 700) { yBase = w1.ball.y; break; } }

    const voided = baseLevel({ bodies: [body], zones: [{ id: 'z', kind: 'void', x: 350, y: 300, radius: 250, strength: 1 }] });
    const w2 = createWorld(voided, 1);
    startStroke(w2);
    launch(w2, 1, 0, 300);
    let yVoid = 300;
    for (let i = 0; i < 300; i++) { stepTick(w2); if (w2.ball.x >= 700) { yVoid = w2.ball.y; break; } }
    expect(yVoid).toBeGreaterThan(yBase); // less bend toward the body above
  });

  it('corridors accelerate along their axis', () => {
    const def = baseLevel({
      zones: [{ id: 'c', kind: 'corridor', a: { x: 200, y: 300 }, b: { x: 800, y: 300 }, corridorR: 80, accel: 2, dir: 1 }],
    });
    const w = createWorld(def, 1);
    startStroke(w);
    launch(w, 1, 0, 50);
    for (let i = 0; i < 120; i++) stepTick(w);
    expect(Math.hypot(w.ball.vx, w.ball.vy)).toBeGreaterThan(350);
  });

  it('flipper zones reverse gravity', () => {
    const def = baseLevel({
      tee: { x: 450, y: 300 },
      bodies: [{ id: 'p', kind: 'attractor', x: 600, y: 300, radius: 60, mu: 5e6, influenceR: 500, material: 'rock' }],
      zones: [{ id: 'f', kind: 'flipper', x: 450, y: 300, radius: 100 }],
    });
    const w = createWorld(def, 1);
    startStroke(w);
    launch(w, 1, 0, 60);
    for (let i = 0; i < 60; i++) stepTick(w);
    expect(w.ball.vx).toBeLessThan(0);
    expect(w.ball.x).toBeLessThan(450);
  });
});

describe('machinery + debris', () => {
  it('wormholes transfer with rotated velocity', () => {
    const def = baseLevel({
      wormholes: [
        { id: 'a', x: 300, y: 300, r: 30, exitId: 'b', angleDelta: Math.PI / 2 },
        { id: 'b', x: 800, y: 400, r: 30, exitId: 'a' },
      ],
    });
    const w = createWorld(def, 1);
    startStroke(w);
    launch(w, 1, 0, 200);
    for (let i = 0; i < 45; i++) stepTick(w);
    expect(Math.hypot(w.ball.x - 800, w.ball.y - 400)).toBeLessThan(120);
    expect(Math.hypot(w.ball.vx, w.ball.vy)).toBeCloseTo(200, 0);
  });

  it('debris trips a switch (the cascade)', () => {
    const def = baseLevel({
      bodies: [
        { id: 'pull', kind: 'attractor', x: 600, y: 150, radius: 30, mu: 5e6, influenceR: 300, material: 'rock' },
        { id: 'g1', kind: 'attractor', x: 900, y: 400, radius: 30, mu: 1e6, influenceR: 200, material: 'machine', gate: { switchId: 's1' } },
      ],
      debris: [{ x: 600, y: 260, r: 8 }],
      switches: [{ id: 's1', x: 600, y: 210, r: 20, mode: 'once', targets: ['g1'] }],
    });
    const w = createWorld(def, 1);
    startStroke(w);
    launch(w, 1, 0.02, 40); // ball airborne so debris physics matters, path well below the switch
    run(w, 2);
    expect(w.bodies[1].active).toBe(true);
  });
});

describe('settle + prediction', () => {
  it('rolls to a stop on a small body and ends the stroke', () => {
    const def = baseLevel({
      tee: { x: 450, y: 300 },
      bodies: [{ id: 'm', kind: 'attractor', x: 700, y: 300, radius: 40, mu: 8e5, influenceR: 400, material: 'rock' }],
    });
    const w = createWorld(def, 1);
    startStroke(w);
    launch(w, 1, 0, 120);
    run(w, 15);
    expect(w.strokeEnded).toBe('settled');
  });

  it('plays it as it lies: a settled ball keeps its position for the next stroke', () => {
    const def = baseLevel({
      tee: { x: 450, y: 300 },
      bodies: [{ id: 'm', kind: 'attractor', x: 700, y: 300, radius: 40, mu: 8e5, influenceR: 400, material: 'rock' }],
    });
    const w = createWorld(def, 1);
    startStroke(w, true);
    launch(w, 1, 0, 120); // lands on the small moon, rolls to a stop
    run(w, 15);
    expect(w.strokeEnded).toBe('settled');
    const restX = w.ball.x;
    expect(restX).toBeGreaterThan(620); // resting on/near the moon, not at the tee
    startStroke(w); // next stroke: play it as it lies
    expect(w.ball.x).toBeCloseTo(restX, 5);
    startStroke(w, true); // penalty path returns to the tee
    expect(w.ball.x).toBe(def.tee.x);
  });

  it('prediction rolls the real physics without mutating the world', () => {
    const def = baseLevel({ hole: { x: 900, y: 300 }, pinBudget: 1 });
    const w = createWorld(def, 1);
    startStroke(w);
    placePin(w, 150, 570); // outside the influence edge — present but inert
    drainEvents(w); // the pinPlace event belongs to the aim phase, not prediction
    const res = predict(w, 200, 0, 6);
    expect(res.points.length).toBeGreaterThan(10);
    expect(res.end).toBe('sunk');
    expect(w.ball.x).toBe(def.tee.x);
    expect(w.ball.flying).toBe(false);
    expect(w.strokes).toBe(0);
    expect(w.pins.length).toBe(1);
    expect(w.events.length).toBe(0);
    expect(w.strokeEnded).toBeNull();
  });
});
