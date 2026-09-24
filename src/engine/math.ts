export const TAU = Math.PI * 2;

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function len(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}

export function len2(x: number, y: number): number {
  return x * x + y * y;
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return len(bx - ax, by - ay);
}

/** Fast normalize that writes into an out param object-less style via return of packed pair. */
export function norm2(x: number, y: number): { x: number; y: number } {
  const l = len(x, y);
  if (l < 1e-8) return { x: 0, y: 0 };
  return { x: x / l, y: y / l };
}

export function approach(cur: number, target: number, rate: number, dt: number): number {
  const d = target - cur;
  const step = rate * dt;
  if (Math.abs(d) <= step) return target;
  return cur + Math.sign(d) * step;
}

/** Exponential damping factor for a given half-life style decay rate per second. */
export function damp(ratePerSec: number, dt: number): number {
  return Math.exp(-ratePerSec * dt);
}
