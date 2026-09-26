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
  holeEdgeHint,
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

describe('mobile-first framing (phone landscape is canonical)', () => {
  const b = { cx: 0, cy: 0, rx: 1600, ry: 620 };

  it('small viewports use a tighter fit margin so the course fills the screen', () => {
    const phone = new Camera();
    phone.setView(844, 390); // canonical phone landscape
    phone.frame(b, true);
    const desk = new Camera();
    desk.setView(1280, 800);
    desk.frame(b, true);
    expect(phone.fitMargin).toBeCloseTo(1.04, 2);
    expect(desk.fitMargin).toBeCloseTo(1.18, 2);
    expect(phone.fitMargin).toBeLessThan(desk.fitMargin);
    // tighter margin -> the course fills a larger fraction of the viewport
    // (absolute scale is not comparable across different-sized viewports)
    const coverage = (cam: Camera): number => (cam.scale * 2 * b.rx) / cam.viewW;
    expect(coverage(phone)).toBeGreaterThan(coverage(desk));
    expect(phone.scale).toBeCloseTo(fitScale(844, 390, b.rx, b.ry, 1.04), 10);
    // a 740x360 phone is small too
    const tiny = new Camera();
    tiny.setView(740, 360);
    expect(tiny.fitMargin).toBeCloseTo(1.04, 2);
  });

  it('margin and follow derive from the LIVE viewport (setView/frame/refit)', () => {
    const cam = new Camera();
    cam.setView(1280, 800);
    cam.frame(b, true);
    expect(cam.fitMargin).toBeCloseTo(1.18, 2);
    cam.setView(844, 390); // rotate/resize without reconstructing
    cam.refit(b);
    expect(cam.fitMargin).toBeCloseTo(1.04, 2);
    expect(cam.scale).toBeCloseTo(fitScale(844, 390, b.rx, b.ry, 1.04), 10);
    cam.frame(b, true); // frame() picks up the new size too
    expect(cam.scale).toBeCloseTo(fitScale(844, 390, b.rx, b.ry, 1.04), 10);
  });

  it('flight follow cap is larger on phones (camera sticks closer to the ball)', () => {
    const phone = new Camera();
    phone.setView(844, 390);
    phone.frame(b, true);
    const desk = new Camera();
    desk.setView(1280, 800);
    desk.frame(b, true);
    expect(phone.followCapFraction).toBeGreaterThan(desk.followCapFraction);
    expect(phone.followDistFraction).toBeGreaterThan(desk.followDistFraction);

    // behavior: a distant ball ends up closer to screen center on the phone
    const ball = { x: 1200, y: 0 };
    for (let i = 0; i < 240; i++) {
      phone.update(1 / 60, ball, true);
      desk.update(1 / 60, ball, true);
    }
    const onScreenPhone = Math.abs(ball.x - phone.cx) * phone.scale;
    const onScreenDesk = Math.abs(ball.x - desk.cx) * desk.scale;
    expect(onScreenPhone).toBeLessThan(onScreenDesk);
    // and between strokes the desktop contract still holds: eased back home
    for (let i = 0; i < 240; i++) phone.update(1 / 60, ball, false);
    expect(Math.abs(phone.cx)).toBeLessThan(1);
  });
});

describe('off-screen hole hint geometry (pure core math)', () => {
  const st = { show: false, x: 0, y: 0, angle: 0, metres: 0 };
  const PAD = 34;
  // L01-style camera: level center (1140,640), bounds 1600x470, desktop 1280x800
  const S = fitScale(1280, 800, 1600, 470, 1.18);
  const CX = 1140;
  const CY = 640;
  // world point that projects to a given screen position (shake-free inverse)
  const world = (sx: number, sy: number): { hx: number; hy: number } => ({
    hx: (sx - 640) / S + CX,
    hy: (sy - 400) / S + CY,
  });

  it('never shows while the hole is on screen (reported L01 frame: screen 842,458)', () => {
    const { hx, hy } = world(842, 458); // the exact live-play repro coordinates
    holeEdgeHint(CX, CY, S, 1280, 800, hx, hy, 500, 530, PAD, st);
    expect(st.show).toBe(false);
    // anywhere comfortably inside the padded viewport stays hidden too
    const mid = world(640, 400);
    holeEdgeHint(CX, CY, S, 1280, 800, mid.hx, mid.hy, 500, 530, PAD, st);
    expect(st.show).toBe(false);
  });

  it('pins to the edge and points toward the hole when it exits right', () => {
    const { hx, hy } = world(1480, 400); // 234px past the right edge
    const ball = { x: hx - 400, y: hy }; // 400 world units left of the hole
    holeEdgeHint(CX, CY, S, 1280, 800, hx, hy, ball.x, ball.y, PAD, st);
    expect(st.show).toBe(true);
    expect(st.x).toBeCloseTo(1280 - PAD, 6);
    expect(st.y).toBeCloseTo(400, 6);
    expect(st.angle).toBeCloseTo(0, 6); // chevron points right, at the hole
    expect(st.metres).toBe(40); // |ball->hole| = 400 world units / 10
  });

  it('points up-left when the hole exits through the top-left corner', () => {
    const { hx, hy } = world(20, 25);
    holeEdgeHint(CX, CY, S, 1280, 800, hx, hy, CX + 300, CY + 300, PAD, st);
    expect(st.show).toBe(true);
    expect(st.x).toBeCloseTo(PAD, 6);
    expect(st.y).toBeCloseTo(PAD, 6);
    expect(st.angle).toBeLessThan(-Math.PI / 2); // up-left quadrant
    expect(st.angle).toBeGreaterThan(-Math.PI);
  });

  it('distance label is world/10 and never reads 0 while visible', () => {
    const { hx, hy } = world(1500, 400);
    holeEdgeHint(CX, CY, S, 1280, 800, hx, hy, hx - 2, hy, PAD, st); // 2 units apart
    expect(st.show).toBe(true);
    expect(st.metres).toBe(1); // 0.2 rounds to 0 — floored to 1
  });

  it('phone viewport (844x390) hides when hole visible, shows when pushed out', () => {
    const sp = fitScale(844, 390, 1600, 470, 1.04);
    const onScreen = world(700, 200);
    holeEdgeHint(CX, CY, sp, 844, 390, onScreen.hx, onScreen.hy, 500, 530, PAD, st);
    expect(st.show).toBe(false);
    const pushedOut = world(1200, 400); // past the right edge, vertically centered
    holeEdgeHint(CX, CY, sp, 844, 390, pushedOut.hx, pushedOut.hy, 500, 530, PAD, st);
    expect(st.show).toBe(true);
    expect(st.x).toBeCloseTo(844 - PAD, 6);
    expect(st.angle).toBeCloseTo(0, 6);
  });

  it('non-finite input self-hides (NaN comparisons are false)', () => {
    holeEdgeHint(CX, CY, S, 1280, 800, NaN, NaN, 500, 530, PAD, st);
    expect(st.show).toBe(false);
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
