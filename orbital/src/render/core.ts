// core.ts — pure math / color / cache-key helpers for the renderer.
// Deliberately Pixi-free and DOM-free so it runs headless under vitest and
// can be inlined by JIT in hot paths. Zero allocation: functions either
// return numbers or write into caller-provided out objects.

export const TAU = Math.PI * 2;

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smoothstep(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

/**
 * Frame-rate independent exponential approach. Splitting the same dt into two
 * calls yields (within float error) the same result as one call with the full
 * dt — this is why we never use `v += (t - v) * k` with a raw constant.
 */
export function expDamp(current: number, target: number, rate: number, dt: number): number {
  return target + (current - target) * Math.exp(-rate * dt);
}

/** FNV-1a — stable across sessions/platforms (never use Math.random for seeds). */
export function hashSeed(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// --------------------------------------------------------------------- color

const colCache = new Map<string, number>();

/** Parse '#rrggbb' (or '#rgb') into a Pixi-compatible 0xRRGGBB number. Cached. */
export function col(hex: string): number {
  const hit = colCache.get(hex);
  if (hit !== undefined) return hit;
  let s = hex;
  if (s.charCodeAt(0) === 0x23 /* # */) s = s.slice(1);
  let n: number;
  if (s.length === 3) {
    n =
      (parseInt(s.charAt(0), 16) * 17) << 16 |
      (parseInt(s.charAt(1), 16) * 17) << 8 |
      (parseInt(s.charAt(2), 16) * 17);
  } else {
    n = parseInt(s, 16);
  }
  colCache.set(hex, n);
  return n;
}

/** Component-wise lerp between two packed RGB colors. */
export function mixRGB(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (
    (((ar + (br - ar) * t) | 0) << 16) |
    (((ag + (bg - ag) * t) | 0) << 8) |
    ((ab + (bb - ab) * t) | 0)
  );
}

/** Desaturate toward a gray of the same luma (used for dormant bodies). */
export function desat(c: number, t: number): number {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  const l = (r * 0.299 + g * 0.587 + b * 0.114) | 0;
  return mixRGB(c, (l << 16) | (l << 8) | l, t);
}

// Milo orbit trail / preview speed ramp: slow = cyan (gravity color),
// fast = amber (energy). Both endpoints come from the design readability
// contract (§11): gravity cyan, interactive amber.
export const RAMP_SLOW = 0x5fd6ff;
export const RAMP_FAST = 0xffc46b;

export function speedRamp(t01: number): number {
  return mixRGB(RAMP_SLOW, RAMP_FAST, smoothstep(clamp(t01, 0, 1)));
}

// ------------------------------------------------- per-level bg variants

/** Number of distinct background archetypes (see layers/background.ts). */
export const BG_VARIANT_COUNT = 6;

/**
 * Per-level background archetype, 0..BG_VARIANT_COUNT-1, derived purely from
 * the level id (no level-data changes needed): FNV hash % 6, offset by the
 * level's six-level block index (a cheap region-ish rotation), then walked
 * forward until it differs from the PREVIOUS level's variant — so consecutive
 * levels, including block boundaries, never repeat an archetype. (Regions hold
 * 7/7/7/3 levels, so with 6 archetypes a strict within-region bijection is
 * impossible; consecutive-uniqueness is the strongest guarantee available.)
 */
export function bgVariantFor(levelId: string): number {
  const n = parseInt(levelId.slice(-2), 10);
  const block = Number.isFinite(n) && n >= 1 ? Math.floor((n - 1) / BG_VARIANT_COUNT) : 0;
  let v = (hashSeed(levelId) + block) % BG_VARIANT_COUNT;
  if (Number.isFinite(n) && n > 1) {
    const prevId = levelId.slice(0, -2) + String(n - 1).padStart(2, '0');
    if (bgVariantFor(prevId) === v) v = (v + 1) % BG_VARIANT_COUNT; // de-collide
  }
  return v;
}

// ------------------------------------------------------------- camera math

/**
 * Uniform scale that fits an ellipse of half-extents (rx, ry) into the viewport
 * with a unitless margin (1.0 = touches edges). The margin is applied to the
 * level, not the viewport, so UI chrome never gets extra zoom drift.
 */
export function fitScale(viewW: number, viewH: number, rx: number, ry: number, margin: number): number {
  const effR = margin <= 0 ? 1 : margin;
  const sx = viewW / (2 * rx * effR);
  const sy = viewH / (2 * ry * effR);
  return clamp(Math.min(sx, sy), 0.22, 2.0);
}

export interface PtOut { x: number; y: number }

/**
 * Clamp an offset (from the ellipse center) so its direction is kept but its
 * magnitude stays inside a shrunken ellipse (keepX/keepY fractions). Used to
 * let the camera drift toward the ball during flight without ever unframing
 * the level. Writes into `out`, returns it.
 */
export function capToEllipse(dx: number, dy: number, rx: number, ry: number, out: PtOut): PtOut {
  const nx = dx / rx;
  const ny = dy / ry;
  const d2 = nx * nx + ny * ny;
  if (d2 <= 1) {
    out.x = dx;
    out.y = dy;
    return out;
  }
  const inv = 1 / Math.sqrt(d2);
  out.x = nx * inv * rx;
  out.y = ny * inv * ry;
  return out;
}

/** Exponential decay for screen shake magnitude; snaps to 0 below epsilon. */
export function decayShake(mag: number, dt: number): number {
  const m = mag * Math.exp(-5.5 * dt);
  return m < 0.05 ? 0 : m;
}

// --------------------------------------------------------- texture caching

/**
 * Quantize a pixel size into a bucket so near-identical bodies share one
 * canvas texture (GPU memory bound) while detail still scales with radius.
 */
export function bucketSize(px: number, step: number, min: number, max: number): number {
  return clamp(Math.round(px / step) * step, min, max);
}

/** Stable cache key for a procedurally generated body texture. */
export function bodyTextureKey(material: string, seed: number, bucketPx: number): string {
  return `body|${material}|${seed}|${bucketPx}`;
}

// --------------------------------------------------------- hole beacon pulse

export const BEACON_PERIOD = 3.6;
/** 50% duty — screenshots/attention must never land in a long dark window. */
export const BEACON_DUTY = 1.8;

/**
 * Pure beacon state for sim time `t`: ring diameter `d` (world) and opacity
 * `a` (0..1). Shared by the renderer and tests so the phase is assertable.
 * Writes into `out`; zero allocation.
 */
export function beaconPulse(t: number, capR: number, out: { d: number; a: number }): void {
  const c = ((t % BEACON_PERIOD) + BEACON_PERIOD) % BEACON_PERIOD;
  if (c >= BEACON_DUTY) {
    out.d = capR * 6.4;
    out.a = 0;
    return;
  }
  const f = c / BEACON_DUTY;
  out.d = capR * (2.5 + f * 3.9); // expands from the cup ring outward
  out.a = 0.55 * Math.sin(Math.PI * f);
}
