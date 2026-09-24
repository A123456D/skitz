// Waypoint path traversal. Smooth (Catmull-Rom) position at an arc-length
// offset; loop wraps, pingpong reflects. All pure functions, no allocation.

import type { PathDef, Vec2 } from './types';

export function buildSegLens(points: Vec2[]): { segLens: number[]; total: number } {
  const segLens: number[] = [];
  let total = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    segLens.push(l);
    total += l;
  }
  return { segLens, total };
}

function catmull(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number, out: Vec2): void {
  const t2 = t * t;
  const t3 = t2 * t;
  out.x =
    0.5 *
    (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
  out.y =
    0.5 *
    (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
}

const tmp: Vec2 = { x: 0, y: 0 };

/** Position at arc-length `dist` along a closed smooth loop (writes a fresh
 *  object — call sites are per-body-per-tick, not per-particle). */
export function pathPos(points: Vec2[], segLens: number[], dist: number, mode: 'loop' | 'pingpong'): Vec2 {
  const n = points.length;
  let total = 0;
  for (let i = 0; i < segLens.length; i++) total += segLens[i];
  let d = dist;
  if (mode === 'pingpong') {
    const span = total * 2;
    d = ((d % span) + span) % span;
    if (d > total) d = span - d;
  } else {
    d = ((d % total) + total) % total;
  }
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const l = segLens[i];
    if (d <= acc + l || i === n - 1) {
      const t = l > 0 ? (d - acc) / l : 0;
      const p0 = points[(i - 1 + n) % n];
      const p1 = points[i];
      const p2 = points[(i + 1) % n];
      const p3 = points[(i + 2) % n];
      catmull(p0, p1, p2, p3, t, tmp);
      return { x: tmp.x, y: tmp.y };
    }
    acc += l;
  }
  return { x: points[0].x, y: points[0].y };
}

/** Advance a path distance by one tick. `total` = precomputed path length. */
export function advancePath(
  def: PathDef,
  pathT: number,
  dir: 1 | -1,
  dt: number,
  total: number,
): { pathT: number; dir: 1 | -1 } {
  let d = pathT + def.speed * dir * dt;
  let nd: 1 | -1 = dir;
  if (def.mode === 'pingpong') {
    if (d >= total) {
      d = total;
      nd = -1;
    } else if (d <= 0) {
      d = 0;
      nd = 1;
    }
  }
  return { pathT: d, dir: nd };
}
