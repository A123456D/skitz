// Level solver — the campaign tuning loop. For each level it brute-force sweeps
// the REAL sim (createWorld + startStroke + predict) over a full launch fan and
// reports the closest any raw shot gets to the hole. If a level fails its sweep,
// the LEVEL is wrong (unreachable hole / dead field), not the solver.
//
// Sweep protocol (contract from docs/design.md §7 validation):
//   - 36 angles (full circle) x 10 powers (90..900 u/s) = 360 predicts/level.
//   - No pins — except L06, which places its documented tutorial pin (see the
//     level's own hint text; mirrored in TUTORIAL_PINS below).
//   - predict() runs the identical integrator in ghost mode, so results are
//     exact and the world is restored between shots (unstable bodies freeze
//     during preview — their future is genuinely unknowable).
import { createWorld, startStroke, placePin, predict } from '../src/sim';
import type { LevelDef, Vec2 } from '../src/sim';

export interface SweepResult {
  id: string;
  /** Closest approach to the hole (or its travel path) over the whole fan. */
  minDist: number;
  /** Straight-line tee→hole distance (base hole position). */
  teeHoleDist: number;
  /** Angle (degrees) and power of the best shot found — for tuning feedback. */
  bestAngleDeg: number;
  bestPower: number;
  /** True when the level's documented tutorial pin was placed (L06 only). */
  usedPin: boolean;
}

const NUM_ANGLES = 36;
const NUM_POWERS = 10;
const MIN_POWER = 90;
const MAX_POWER = 900;

// Long arcs across the Giants / Grand Course need more runway than R1–R2.
const SECONDS_BY_REGION: Record<number, number> = { 1: 6, 2: 6, 3: 7.5, 4: 7 };
// Per-level overrides for especially vast fields.
const SECONDS_BY_LEVEL: Record<string, number> = { L20: 8.5 };

// L06's tutorial pin — coordinates are documented in the level's hint text and
// mirrored here so the solver tests the level the way the tutorial teaches it.
const TUTORIAL_PINS: Record<string, Vec2> = { L06: { x: 1560, y: 620 } };

/** All points worth measuring against: the hole itself, plus a densified copy
 *  of its travel path so a pass BETWEEN authored path points still registers. */
function holeTargets(def: LevelDef): Vec2[] {
  const pts: Vec2[] = [{ x: def.hole.x, y: def.hole.y }];
  const path = def.hole.path;
  if (!path) return pts;
  for (let i = 0; i < path.points.length; i++) {
    const a = path.points[i];
    const last = i === path.points.length - 1;
    // loop paths close the ring; pingpong paths do not wrap around.
    if (last && path.mode === 'loop') {
      // fall through to the closing segment below using points[0]
    } else if (last) {
      break;
    }
    const b = path.points[(i + 1) % path.points.length];
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 60));
    for (let s = 1; s <= steps; s++) {
      pts.push({ x: a.x + ((b.x - a.x) * s) / steps, y: a.y + ((b.y - a.y) * s) / steps });
    }
  }
  return pts;
}

const cache = new Map<string, SweepResult>();

/** Sweep one level. Results are memoized per level id — the sweep is expensive
 *  and multiple tests consume the same numbers. */
export function sweepLevel(def: LevelDef): SweepResult {
  const hit = cache.get(def.id);
  if (hit) return hit;

  const w = createWorld(def, 1);
  startStroke(w);
  const pin = TUTORIAL_PINS[def.id];
  const usedPin = pin ? placePin(w, pin.x, pin.y) : false;
  const targets = holeTargets(def);
  const seconds = SECONDS_BY_LEVEL[def.id] ?? SECONDS_BY_REGION[def.region];

  let minDist = Infinity;
  let bestAngleDeg = 0;
  let bestPower = 0;
  for (let ai = 0; ai < NUM_ANGLES; ai++) {
    const ang = (ai * 2 * Math.PI) / NUM_ANGLES;
    const vx = Math.cos(ang);
    const vy = Math.sin(ang);
    for (let pi = 0; pi < NUM_POWERS; pi++) {
      const power = MIN_POWER + ((MAX_POWER - MIN_POWER) * pi) / (NUM_POWERS - 1);
      const res = predict(w, vx * power, vy * power, seconds, 4);
      for (const pt of res.points) {
        for (const t of targets) {
          const dx = pt.x - t.x;
          const dy = pt.y - t.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < minDist) {
            minDist = d;
            bestAngleDeg = Math.round((ang * 180) / Math.PI);
            bestPower = Math.round(power);
          }
        }
      }
    }
  }

  const result: SweepResult = {
    id: def.id,
    minDist,
    teeHoleDist: Math.hypot(def.hole.x - def.tee.x, def.hole.y - def.tee.y),
    bestAngleDeg,
    bestPower,
    usedPin,
  };
  cache.set(def.id, result);
  return result;
}
