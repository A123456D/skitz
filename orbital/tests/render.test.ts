// Renderer pure-logic tests. Deliberately avoids importing anything that pulls
// in pixi.js or the DOM (textures.ts, layers/*) — those need a browser.

import { describe, expect, it } from 'vitest';
import {
  BEACON_DUTY,
  BEACON_PERIOD,
  BG_VARIANT_COUNT,
  beaconPulse,
  bgVariantFor,
  bucketSize,
  bodyTextureKey,
  capToEllipse,
  col,
  decayShake,
  desat,
  expDamp,
  fitScale,
  hashSeed,
  mixRGB,
  speedRamp,
} from '../src/render/core';
import { Camera } from '../src/render/camera';

describe('camera framing math', () => {
  it('fits the level ellipse inside the viewport with margin', () => {
    // 1600x1200 level half-extents in a 1280x720 view: height is the binder
    const s = fitScale(1280, 720, 600, 400, 1.2);
    expect(s).toBeCloseTo(Math.min(1280 / (2 * 600 * 1.2), 720 / (2 * 400 * 1.2)), 10);
    expect(s).toBeCloseTo(720 / 960, 10);
  });

  it('binds on the larger half-extent (ry here) regardless of axis', () => {
    const s = fitScale(1280, 720, 300, 700, 1.0);
    expect(s).toBeCloseTo(720 / 1400, 10);
  });

  it('clamps to sane zoom bounds', () => {
    expect(fitScale(1000, 1000, 1, 1, 1)).toBeLessThanOrEqual(2.0);
    expect(fitScale(100, 100, 100000, 100000, 1)).toBeGreaterThanOrEqual(0.22);
  });

  it('keeps offsets inside a shrunken ellipse and preserves direction', () => {
    const out = { x: 0, y: 0 };
    capToEllipse(30, 40, 100, 100, out);
    expect(out.x).toBe(30);
    expect(out.y).toBe(40);
    capToEllipse(300, 400, 100, 100, out);
    expect(Math.hypot(out.x, out.y)).toBeCloseTo(100, 6);
    expect(out.x / out.y).toBeCloseTo(300 / 400, 6);
  });
});

describe('camera follow + shake', () => {
  const b = { cx: 0, cy: 0, rx: 800, ry: 600 };

  it('eases toward the ball while flying and returns when at rest', () => {
    const cam = new Camera();
    cam.setView(1280, 720);
    cam.frame(b, true);
    const ball = { x: 300, y: 0 };
    for (let i = 0; i < 120; i++) cam.update(1 / 60, ball, true);
    const flying = cam.cx;
    expect(flying).toBeGreaterThan(0); // panned toward the ball
    for (let i = 0; i < 240; i++) cam.update(1 / 60, ball, false);
    expect(Math.abs(cam.cx)).toBeLessThan(1); // eased back home
  });

  it('shake stays under its decaying envelope and ends at zero', () => {
    const cam = new Camera();
    cam.shake(12);
    for (let i = 0; i < 60; i++) {
      cam.update(1 / 60, { x: 0, y: 0 }, false);
      const m = Math.hypot(cam.shakeX, cam.shakeY);
      // each axis is bounded by the decaying magnitude; hypot by sqrt(2) of it
      expect(m).toBeLessThanOrEqual(12 * Math.SQRT2 * Math.exp(-5.5 * (i / 60)) + 1e-9);
      expect(m).toBeLessThanOrEqual(12 * Math.SQRT2);
    }
    expect(cam.shakeX).toBe(0);
    expect(cam.shakeY).toBe(0);
  });

  it('worldToScreen maps the camera center to the viewport center', () => {
    const cam = new Camera();
    cam.setView(1280, 720);
    cam.frame(b, true);
    cam.update(1 / 60, { x: 0, y: 0 }, false);
    const out = { x: 0, y: 0 };
    cam.worldToScreen(cam.cx, cam.cy, out);
    expect(out.x).toBeCloseTo(640, 6);
    expect(out.y).toBeCloseTo(360, 6);
  });

  it('screenToWorld inverts worldToScreen (shake-free, pin-stable)', () => {
    const cam = new Camera();
    cam.setView(1280, 720);
    cam.frame(b, true);
    cam.update(1 / 60, { x: 137, y: -64 }, true); // moving + shaking
    cam.shake(8);
    cam.update(1 / 60, { x: 137, y: -64 }, true);
    const s = { x: 0, y: 0 };
    cam.worldToScreen(137, -64, s);
    // exact inverse of the SHAKE-FREE transform: strip shake from the screen
    // point first, then invert
    const w = cam.screenToWorld(s.x - cam.shakeX, s.y - cam.shakeY, { x: 0, y: 0 });
    expect(w.x).toBeCloseTo(137, 6);
    expect(w.y).toBeCloseTo(-64, 6);
    // and it works directly from a raw screen point using the same transform
    const w2 = cam.screenToWorld(640, 360, { x: 0, y: 0 });
    expect(w2.x).toBeCloseTo(cam.cx, 6);
    expect(w2.y).toBeCloseTo(cam.cy, 6);
  });
});

describe('aim-time camera behavior', () => {
  const b = { cx: 0, cy: 0, rx: 800, ry: 600 };

  it('camera stays at bounds framing while aiming (no aim zoom — removed by playtest verdict)', () => {
    const cam = new Camera();
    cam.setView(1280, 720);
    cam.frame(b, true);
    const base = cam.scale;
    const ball = { x: 200, y: 50 };
    for (let i = 0; i < 240; i++) cam.update(1 / 60, ball, false);
    expect(cam.scale / base).toBeCloseTo(1, 3);
    expect(Math.abs(cam.cx)).toBeLessThan(1);
    expect(Math.abs(cam.cy)).toBeLessThan(1);
  });

  it('flight behavior pans with the shot at bounds scale', () => {
    const cam = new Camera();
    cam.setView(1280, 720);
    cam.frame(b, true);
    const base = cam.scale;
    const ball = { x: 300, y: 0 };
    for (let i = 0; i < 120; i++) cam.update(1 / 60, ball, true);
    expect(cam.cx).toBeGreaterThan(0); // still follows the shot
    expect(cam.scale).toBeLessThan(base * 1.15);
    expect(cam.scale).toBeGreaterThan(0);
  });
});

describe('damping / decay primitives', () => {
  it('expDamp is frame-rate independent (2x30ms ~= 1x60ms)', () => {
    const a = expDamp(100, 0, 4, 1 / 30);
    const b2 = expDamp(a, 0, 4, 1 / 30);
    const one = expDamp(100, 0, 4, 1 / 15);
    expect(b2).toBeCloseTo(one, 6);
  });

  it('decayShake snaps small residuals to zero', () => {
    expect(decayShake(0.04, 1 / 60)).toBe(0);
    expect(decayShake(10, 1 / 60)).toBeGreaterThan(1);
  });
});

describe('color + ramp', () => {
  it('parses hex colors (long and short form)', () => {
    expect(col('#ff8800')).toBe(0xff8800);
    expect(col('#f80')).toBe(0xff8800);
    expect(col('#ff8800')).toBe(col('#ff8800')); // cached consistently
  });

  it('mixRGB lerps channels independently', () => {
    expect(mixRGB(0x000000, 0xffffff, 0.5)).toBe(0x7f7f7f);
    expect(mixRGB(0xff0000, 0x0000ff, 0)).toBe(0xff0000);
    expect(mixRGB(0xff0000, 0x0000ff, 1)).toBe(0x0000ff);
  });

  it('speedRamp hits cyan (slow) and amber (fast) endpoints', () => {
    expect(speedRamp(0)).toBe(0x5fd6ff);
    expect(speedRamp(1)).toBe(0xffc46b);
    const mid = speedRamp(0.5);
    const r = (mid >> 16) & 255;
    const b3 = mid & 255;
    expect(r).toBeGreaterThan(0x5f); // warming up
    expect(b3).toBeLessThan(0xff); // cooling down
  });

  it('desat keeps luma-ish gray', () => {
    const g = desat(0xff0000, 1);
    const l = (g >> 8) & 255;
    expect(g >> 16).toBe(l);
    expect(g & 255).toBe(l);
  });
});

describe('texture cache keys', () => {
  it('hashSeed is deterministic and input-sensitive', () => {
    expect(hashSeed('rock:L03')).toBe(hashSeed('rock:L03'));
    expect(hashSeed('rock:L03')).not.toBe(hashSeed('rock:L04'));
    expect(hashSeed('')).toBe(0x811c9dc5); // FNV-1a offset basis
  });

  it('keys differ per material/seed but collapse on identical inputs', () => {
    expect(bodyTextureKey('rock', 1, 128)).toBe(bodyTextureKey('rock', 1, 128));
    expect(bodyTextureKey('rock', 1, 128)).not.toBe(bodyTextureKey('ice', 1, 128));
    expect(bodyTextureKey('rock', 1, 128)).not.toBe(bodyTextureKey('rock', 2, 128));
  });

  it('bucketSize quantizes so near sizes share cache entries', () => {
    expect(bucketSize(70, 32, 64, 1024)).toBe(64);
    expect(bucketSize(90, 32, 64, 1024)).toBe(96);
    expect(bucketSize(9999, 32, 64, 1024)).toBe(1024);
    expect(bucketSize(1, 32, 64, 1024)).toBe(64);
  });
});

describe('per-level background variant', () => {
  const id = (n: number): string => `L${String(n).padStart(2, '0')}`;

  it('is deterministic, pure, and lands inside 0..5', () => {
    for (let n = 1; n <= 24; n++) {
      const v = bgVariantFor(id(n));
      expect(v).toBe(bgVariantFor(id(n))); // stable across calls
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(BG_VARIANT_COUNT);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('never repeats an archetype between consecutive levels', () => {
    for (let n = 2; n <= 24; n++) {
      expect(bgVariantFor(id(n))).not.toBe(bgVariantFor(id(n - 1)));
    }
  });

  it('spreads all 6 archetypes across the 24 levels and is input-sensitive', () => {
    const used = new Set<number>();
    for (let n = 1; n <= 24; n++) used.add(bgVariantFor(id(n)));
    expect(used.size).toBe(BG_VARIANT_COUNT);
    // arbitrary ids (no L## suffix) still resolve deterministically in-range
    const v = bgVariantFor('XYZ');
    expect(v).toBe(bgVariantFor('XYZ'));
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(BG_VARIANT_COUNT);
  });
});

describe('hole beacon pulse', () => {
  const o = { d: 0, a: 0 };

  it('is visible at forced phases (no long between-pulse dead zones)', () => {
    beaconPulse(0, 16, o);
    expect(o.a).toBeCloseTo(0);
    beaconPulse(0.9, 16, o); // mid-expansion
    expect(o.a).toBeCloseTo(0.55, 5);
    expect(o.d).toBeGreaterThan(16 * 3);
    // 50% duty: any screenshot time in [0, 1.8) lands on a lit ring
    beaconPulse(BEACON_DUTY * 0.5, 16, o);
    expect(o.a).toBeGreaterThan(0.4);
    beaconPulse(BEACON_DUTY * 0.95, 16, o);
    expect(o.a).toBeGreaterThan(0.05);
    beaconPulse(2.0, 16, o); // rest window
    expect(o.a).toBe(0);
  });

  it('is exactly periodic and wrap-safe', () => {
    beaconPulse(1.234, 16, o);
    const d = o.d;
    const a = o.a;
    beaconPulse(1.234 + BEACON_PERIOD, 16, o);
    expect(o.d).toBeCloseTo(d, 10);
    expect(o.a).toBeCloseTo(a, 10);
    beaconPulse(-1.234, 16, o); // negative time wraps safely
    expect(o.a).toBeGreaterThanOrEqual(0);
  });
});
