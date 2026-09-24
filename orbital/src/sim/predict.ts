// Trajectory prediction. Rolls the REAL integrator forward in ghost mode and
// restores every mutable field afterwards — previews can never diverge from
// what the shot will actually do (unstable bodies freeze during preview; their
// future is genuinely unknowable, and the preview must not eat RNG).

import { stepTick, STEP_DT } from './world';
import type { World } from './types';

export interface PredPoint {
  x: number;
  y: number;
  speed: number;
}

export interface PredResult {
  points: PredPoint[];
  end: 'timeout' | 'sunk' | 'dead' | 'settled';
}

interface Snap {
  t: number;
  ball: World['ball'];
  bodies: number[][];
  zones: number[];
  switches: number[];
  seqProgress: number;
  debris: number[][];
  fragments: number[];
  hole: number[];
  counters: number[];
  touchedLen: number;
  events: World['events'];
  prevAngle: number | null;
}

function snap(w: World): Snap {
  return {
    t: w.t,
    ball: { ...w.ball },
    bodies: w.bodies.map((b) => [
      b.cx, b.cy, b.muCurrent, b.active ? 1 : 0, b.latched ? 1 : 0,
      b.pathT ?? 0, b.pathDir ?? 1, b.orbitAngle ?? 0,
      b.unstableTarget ?? 0, b.unstableT ?? 0,
    ]),
    zones: w.zones.map((z) => (z.active ? 2 : 0) + (z.latched ? 1 : 0)),
    switches: w.switches.map((s) => (s.hit ? 2 : 0) + (s.on ? 1 : 0)),
    seqProgress: w.seqProgress,
    debris: w.debris.map((d) => [d.x, d.y, d.vx, d.vy]),
    fragments: w.fragments.map((f) => (f.taken ? 1 : 0)),
    hole: [w.holeX, w.holeY, w.holeT, w.holeDir],
    counters: [w.strokes, w.pinsUsedTotal, w.orbits, w.nextPinId],
    touchedLen: w.touchedIds.length,
    events: w.events,
    prevAngle: w.orbitPrevAngle,
  };
}

function restore(w: World, s: Snap): void {
  w.t = s.t;
  Object.assign(w.ball, s.ball);
  for (let i = 0; i < w.bodies.length; i++) {
    const v = s.bodies[i];
    const b = w.bodies[i];
    b.cx = v[0]; b.cy = v[1]; b.muCurrent = v[2];
    b.active = v[3] === 1; b.latched = v[4] === 1;
    b.pathT = v[5]; b.pathDir = v[6] as 1 | -1; b.orbitAngle = v[7];
    b.unstableTarget = v[8]; b.unstableT = v[9];
  }
  for (let i = 0; i < w.zones.length; i++) {
    w.zones[i].active = (s.zones[i] & 2) !== 0;
    w.zones[i].latched = (s.zones[i] & 1) !== 0;
  }
  for (let i = 0; i < w.switches.length; i++) {
    w.switches[i].hit = (s.switches[i] & 2) !== 0;
    w.switches[i].on = (s.switches[i] & 1) !== 0;
  }
  w.seqProgress = s.seqProgress;
  for (let i = 0; i < w.debris.length; i++) {
    const v = s.debris[i];
    w.debris[i].x = v[0]; w.debris[i].y = v[1]; w.debris[i].vx = v[2]; w.debris[i].vy = v[3];
  }
  for (let i = 0; i < w.fragments.length; i++) w.fragments[i].taken = s.fragments[i] === 1;
  w.holeX = s.hole[0]; w.holeY = s.hole[1]; w.holeT = s.hole[2]; w.holeDir = s.hole[3] as 1 | -1;
  w.strokes = s.counters[0]; w.pinsUsedTotal = s.counters[1]; w.orbits = s.counters[2];
  w.nextPinId = s.counters[3];
  w.touchedIds.length = s.touchedLen;
  w.strokeEnded = null;
  w.orbitPrevAngle = s.prevAngle;
  w.events = s.events;
}

export function predict(w: World, vx: number, vy: number, seconds: number, sampleEvery = 4): PredResult {
  const s = snap(w);
  w.events = [];
  w.strokeEnded = null;
  w.ball.vx = vx;
  w.ball.vy = vy;
  w.ball.flying = true;

  const points: PredPoint[] = [];
  const maxTicks = Math.round(seconds / STEP_DT);
  let end: PredResult['end'] = 'timeout';
  for (let i = 1; i <= maxTicks; i++) {
    stepTick(w, true);
    if (i % sampleEvery === 0) {
      points.push({ x: w.ball.x, y: w.ball.y, speed: Math.hypot(w.ball.vx, w.ball.vy) });
    }
    if (w.strokeEnded) {
      end = w.strokeEnded === 'sunk' ? 'sunk' : w.strokeEnded === 'voided' || w.strokeEnded === 'hazard' ? 'dead' : 'settled';
      break;
    }
  }
  restore(w, s);
  return { points, end };
}
