// Gravity field evaluation. One reusable output object — zero allocation in
// the hot path. Sources (bodies + pins + corridors) sum, then zones modify
// in deterministic id order (see docs/design.md §3).

import type { World } from './types';

export const SOFTENING = 400;
/** Circular-orbit speed at r=150 for a standard planet (mu 5.0e6) is ~183 u/s. */
export const EDGE_FADE = 0.15; // fraction of influenceR smoothed at the rim
export const FLIPPER_FACTOR = -0.85;

export interface FieldSample {
  ax: number;
  ay: number;
  /** Body id with the strongest local pull (orbit tracking / hum). */
  dominant: string | null;
  dominantA: number;
}

export function makeFieldSample(): FieldSample {
  return { ax: 0, ay: 0, dominant: null, dominantA: 0 };
}

function edgeFade(dist: number, influenceR: number): number {
  if (dist >= influenceR) return 0;
  const inner = influenceR * (1 - EDGE_FADE);
  if (dist <= inner) return 1;
  const t = 1 - (dist - inner) / (influenceR * EDGE_FADE);
  return t * t * (3 - 2 * t);
}

/** Sum all gravity acceleration at a point into `out`. Includes zones (both
 *  additive corridors and multiplicative modifiers) and active pins. */
export function sampleField(w: World, x: number, y: number, out: FieldSample): void {
  out.ax = 0;
  out.ay = 0;
  out.dominant = null;
  out.dominantA = 0;

  for (const b of w.bodies) {
    if (!b.active || b.muCurrent === 0) continue;
    const dx = b.cx - x;
    const dy = b.cy - y;
    const d2 = dx * dx + dy * dy;
    const d = Math.sqrt(d2);
    if (d > b.influenceR) continue;
    const aMag = ((b.muCurrent * w.gravityScale) / (d2 + SOFTENING)) * edgeFade(d, b.influenceR);
    if (aMag <= 0) continue;
    const inv = aMag / (d === 0 ? 1 : d);
    if (b.kind === 'repulsor') {
      out.ax -= dx * inv;
      out.ay -= dy * inv;
    } else {
      out.ax += dx * inv;
      out.ay += dy * inv;
    }
    if (aMag > out.dominantA) {
      out.dominantA = aMag;
      out.dominant = b.id;
    }
  }

  for (const p of w.pins) {
    const dx = p.x - x;
    const dy = p.y - y;
    const d2 = dx * dx + dy * dy;
    const d = Math.sqrt(d2);
    if (d > p.influenceR) continue;
    const aMag = (p.mu * w.gravityScale) / (d2 + SOFTENING) * edgeFade(d, p.influenceR);
    const inv = aMag / (d === 0 ? 1 : d);
    out.ax += dx * inv;
    out.ay += dy * inv;
    if (aMag > out.dominantA) {
      out.dominantA = aMag;
      out.dominant = 'pin';
    }
  }

  // Corridors add force (a tunnel, not a modifier).
  for (const z of w.zones) {
    if (z.kind !== 'corridor' || !z.active || !z.a || !z.b || !z.accel) continue;
    const abx = z.b.x - z.a.x;
    const aby = z.b.y - z.a.y;
    const len2 = abx * abx + aby * aby;
    if (len2 === 0) continue;
    const t = Math.max(0, Math.min(1, ((x - z.a.x) * abx + (y - z.a.y) * aby) / len2));
    const px = z.a.x + abx * t;
    const py = z.a.y + aby * t;
    const dxAxis = x - px;
    const dyAxis = y - py;
    const distAxis = Math.hypot(dxAxis, dyAxis);
    if (distAxis > (z.corridorR ?? 60)) continue;
    const fall = 1 - distAxis / (z.corridorR ?? 60);
    const dir = z.dir ?? 1;
    const il = Math.sqrt(len2);
    // toward axis (spring) + along axis
    out.ax += (-dxAxis * 2.0 + (abx / il) * dir * (z.accel * 100)) * fall;
    out.ay += (-dyAxis * 2.0 + (aby / il) * dir * (z.accel * 100)) * fall;
  }

  // Area modifiers compose in id order.
  for (const z of w.zones) {
    if (!z.active || z.kind === 'corridor') continue;
    if (z.x === undefined || z.y === undefined || z.radius === undefined) continue;
    const dx = x - z.x;
    const dy = y - z.y;
    if (dx * dx + dy * dy > z.radius * z.radius) continue;
    let m: number;
    switch (z.kind) {
      case 'void':
        m = 1 - (z.strength ?? 1);
        break;
      case 'flipper':
        m = FLIPPER_FACTOR;
        break;
      case 'amp':
        m = z.strength ?? 2;
        break;
      case 'damp':
        m = z.strength ?? 0.5;
        break;
    }
    out.ax *= m;
    out.ay *= m;
  }
}
