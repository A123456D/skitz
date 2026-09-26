// World construction + the fixed-step simulation tick. This is the only file
// allowed to mutate sim state. `ghost` mode (prediction) runs the same physics
// but persists nothing: no events, no pickups/switches, no RNG consumption.

import { mulberry32 } from './rng';
import { pathPos, buildSegLens, advancePath } from './path';
import { makeFieldSample, sampleField, type FieldSample } from './gravity';
import type {
  BodyState,
  DebrisState,
  LevelDef,
  PinState,
  SimEvent,
  StrokeEndReason,
  World,
  ZoneState,
} from './types';

export const STEP_DT = 1 / 60;
export const BALL_R = 10;
export const RESTITUTION = 0.55;
export const TANGENT_DAMP = 0.92;
export const SINK_SPEED = 340;
export const SETTLE_SPEED = 8;
export const SETTLE_TIME = 2;
export const BOUNDS_GRACE = 1.5;
export const PIN_MU = 1.2e6;
export const PIN_INFLUENCE_R = 260;
export const MAX_LAUNCH_SPEED = 900;
export const HOLE_CAPTURE_R = 30;

const f1: FieldSample = makeFieldSample();
const f2: FieldSample = makeFieldSample();

// ----------------------------------------------------------------- creation

export function createWorld(def: LevelDef, seed: number, gravityScale = 1): World {
  const bodies: BodyState[] = def.bodies.map((b) => {
    const s: BodyState = {
      ...b,
      cx: b.x,
      cy: b.y,
      active: !b.gate,
      muCurrent: b.mu,
      latched: false,
      pathDir: 1,
      pathT: 0,
    };
    if (b.path && 'points' in b.path) {
      const { segLens, total } = buildSegLens(b.path.points);
      s.segLens = segLens;
      s.pathTotal = total;
    }
    if (b.kind === 'unstable') {
      s.unstableTarget = b.mu;
      s.unstableT = b.wanderT ?? 1.2;
    }
    return s;
  });

  const zones: ZoneState[] = (def.zones ?? []).map((z) => ({ ...z, active: !z.gate, latched: false }));

  let holeSegLens: number[] | null = null;
  let holeSegTotal = 0;
  if (def.hole.path) {
    const { segLens, total } = buildSegLens(def.hole.path.points);
    holeSegLens = segLens;
    holeSegTotal = total;
  }

  const w: World = {
    def,
    seed,
    rng: mulberry32(seed),
    gravityScale,
    t: 0,
    ball: {
      x: def.tee.x, y: def.tee.y, vx: 0, vy: 0,
      flying: false, settled: false, dead: false, sunk: false,
      spin: 0, orbitBody: null, orbitAngleAcc: 0,
      slowTime: 0, outOfBoundsT: 0, wormCool: 0, hazardTouched: false, bounces: 0,
    },
    bodies,
    zones,
    hazards: (def.hazards ?? []).map((h) => ({ def: h, id: h.id })),
    debris: (def.debris ?? []).map((d): DebrisState => ({
      x: d.x, y: d.y, r: d.r, vx: d.vx ?? 0, vy: d.vy ?? 0, alive: true,
    })),
    pins: [] as PinState[],
    switches: (def.switches ?? []).map((s) => ({ def: s, hit: false, on: false })),
    seqProgress: 0,
    wormholes: (def.wormholes ?? []).map((wh) => ({ def: wh, cool: 0 })),
    fragments: (def.fragments ?? []).map((f) => ({ x: f.x, y: f.y, taken: false })),
    holeX: def.hole.x,
    holeY: def.hole.y,
    holeT: 0,
    holeDir: 1,
    holeSegLens,
    holeSegTotal,
    strokes: 0,
    pinsUsedTotal: 0,
    orbits: 0,
    strokeEnded: null,
    events: [],
    orbitPrevAngle: null,
    touchedIds: [],
    nextPinId: 1,
  };
  return w;
}

// ------------------------------------------------------------- stroke control

export function startStroke(w: World, toTee = false): void {
  const b = w.ball;
  if (toTee) {
    b.x = w.def.tee.x;
    b.y = w.def.tee.y;
  }
  b.vx = 0;
  b.vy = 0;
  b.flying = false;
  b.settled = false;
  b.dead = false;
  b.sunk = false;
  b.slowTime = 0;
  b.outOfBoundsT = 0;
  b.wormCool = 0;
  b.hazardTouched = false;
  b.bounces = 0;
  b.orbitBody = null;
  b.orbitAngleAcc = 0;
  w.orbitPrevAngle = null;
  w.strokeEnded = null;
  w.pins.length = 0;
}

export function launch(w: World, nx: number, ny: number, speed: number): void {
  if (w.ball.flying || w.strokeEnded !== null) return;
  const l = Math.hypot(nx, ny) || 1;
  const s = Math.min(speed, MAX_LAUNCH_SPEED);
  w.ball.vx = (nx / l) * s;
  w.ball.vy = (ny / l) * s;
  w.ball.flying = true;
  w.strokes++;
  w.pinsUsedTotal += w.pins.length;
  w.orbitPrevAngle = null;
  w.events.push({ type: 'launch', x: w.ball.x, y: w.ball.y, vx: w.ball.vx, vy: w.ball.vy });
}

export function placePin(w: World, x: number, y: number): boolean {
  if (w.ball.flying) return false;
  const deny = (): boolean => {
    w.events.push({ type: 'pinDeny', x, y });
    return false;
  };
  if (w.pins.length >= w.def.pinBudget) return deny();
  if (!inBounds(w, x, y, -20)) return deny();
  if (Math.hypot(x - w.holeX, y - w.holeY) < 30) return deny();
  for (const b of w.bodies) {
    if (b.radius > 0 && Math.hypot(x - b.cx, y - b.cy) < b.radius + 24) return deny();
  }
  for (const p of w.pins) {
    if (Math.hypot(x - p.x, y - p.y) < 40) return deny();
  }
  w.pins.push({ id: w.nextPinId++, x, y, mu: PIN_MU, influenceR: PIN_INFLUENCE_R });
  w.events.push({ type: 'pinPlace', x, y });
  return true;
}

export function undoPin(w: World): void {
  w.pins.pop();
}

export function drainEvents(w: World): SimEvent[] {
  const e = w.events;
  w.events = [];
  return e;
}

function inBounds(w: World, x: number, y: number, pad = 0): boolean {
  const b = w.def.bounds;
  const nx = (x - b.cx) / (b.rx + pad);
  const ny = (y - b.cy) / (b.ry + pad);
  return nx * nx + ny * ny <= 1;
}

// ------------------------------------------------------------------ switches

function fireTargets(w: World, ids: string[], on: boolean): void {
  for (const id of ids) {
    const body = w.bodies.find((b) => b.id === id);
    if (body) {
      body.latched = on;
      if (on) body.active = true;
      else if (body.gate?.switchId) body.active = false;
      continue;
    }
    const zone = w.zones.find((z) => z.id === id);
    if (zone) {
      zone.latched = on;
      zone.active = on;
    }
  }
}

function touchSwitch(w: World, switchId: string, ghost: boolean): void {
  const s = w.switches.find((x) => x.def.id === switchId);
  if (!s) return;
  const seq = w.def.sequence;
  if (seq && s.def.mode === 'once') {
    if (seq[w.seqProgress] !== switchId) {
      w.seqProgress = 0;
      if (!ghost) w.events.push({ type: 'sequenceReset' }, { type: 'switch', switchId, ok: false });
      return;
    }
    w.seqProgress++;
  }
  if (s.def.mode === 'once') {
    if (s.hit) return;
    s.hit = true;
    fireTargets(w, s.def.targets, true);
  } else {
    s.on = !s.on;
    fireTargets(w, s.def.targets, s.on);
  }
  if (!ghost) w.events.push({ type: 'switch', switchId, ok: true });
}

function markTouched(w: World, id: string): void {
  if (!w.touchedIds.includes(id)) w.touchedIds.push(id);
}

function endStroke(w: World, reason: StrokeEndReason): void {
  if (w.strokeEnded !== null) return;
  w.strokeEnded = reason;
  w.ball.flying = false;
  w.pins.length = 0;
  w.events.push({ type: 'strokeEnd', reason });
}

function killBall(w: World, reason: StrokeEndReason, ghost: boolean): void {
  w.ball.dead = true;
  if (!ghost) endStroke(w, reason);
}

// ------------------------------------------------------------------ body ticks

function tickBodies(w: World, ghost: boolean): void {
  for (const b of w.bodies) {
    if (b.kind === 'pulse') {
      const T = b.pulsePeriod ?? 3;
      const min = b.pulseMin ?? 0.35;
      b.muCurrent = b.mu * (min + (1 - min) * (0.5 + 0.5 * Math.sin((2 * Math.PI * w.t) / T + (b.pulsePhase ?? 0))));
    } else if (b.kind === 'unstable' && !ghost) {
      b.unstableT = (b.unstableT ?? 0) - STEP_DT;
      if ((b.unstableT ?? 0) <= 0) {
        b.unstableT = b.wanderT ?? 1.2;
        const lo = b.muMin ?? b.mu * 0.4;
        const hi = b.muMax ?? b.mu * 1.6;
        b.unstableTarget = lo + w.rng() * (hi - lo);
      }
      const k = 1 - Math.exp(-3 * STEP_DT);
      b.muCurrent += ((b.unstableTarget ?? b.mu) - b.muCurrent) * k;
    }

    if (b.path) {
      const op = b.path;
      if ('points' in op) {
        const adv = advancePath(op, b.pathT ?? 0, b.pathDir ?? 1, STEP_DT, b.pathTotal ?? 0);
        b.pathT = adv.pathT;
        b.pathDir = adv.dir;
        if (b.segLens) {
          const p = pathPos(op.points, b.segLens, b.pathT ?? 0, op.mode);
          b.cx = p.x;
          b.cy = p.y;
        }
      } else {
        const p = w.bodies.find((o) => o.id === op.parent);
        if (p) {
          b.orbitAngle = (b.orbitAngle ?? op.phase) + op.speed * STEP_DT;
          b.cx = p.cx + Math.cos(b.orbitAngle) * op.r;
          b.cy = p.cy + Math.sin(b.orbitAngle) * op.r;
        }
      }
    }

    if (b.gate) {
      let active = b.latched === true;
      if (b.gate.timer) {
        const tt = w.t - b.gate.timer.delay;
        if (tt >= 0) active = tt % b.gate.timer.period < b.gate.timer.on;
      }
      if (b.gate.proximity !== undefined) {
        active = Math.hypot(w.ball.x - b.cx, w.ball.y - b.cy) < b.gate.proximity;
      }
      b.active = active;
    }
  }

  for (const z of w.zones) {
    if (z.gate) {
      let active = z.latched === true;
      if (z.gate.timer) {
        const tt = w.t - z.gate.timer.delay;
        if (tt >= 0) active = tt % z.gate.timer.period < z.gate.timer.on;
      }
      if (z.gate.proximity !== undefined && z.x !== undefined && z.y !== undefined) {
        active = Math.hypot(w.ball.x - z.x, w.ball.y - z.y) < z.gate.proximity;
      }
      z.active = active;
    }
  }
}

// ------------------------------------------------------------------ collision

function collideBodies(w: World, ghost: boolean): void {
  const b = w.ball;
  for (const body of w.bodies) {
    if (body.radius <= 0) continue;
    const dx = b.x - body.cx;
    const dy = b.y - body.cy;
    const d = Math.hypot(dx, dy);
    const minD = body.radius + BALL_R;
    if (d >= minD || d === 0) continue;
    if (body.deadly) {
      if (!ghost) w.events.push({ type: 'hazard', x: b.x, y: b.y });
      killBall(w, 'hazard', ghost);
      return;
    }
    const nx = dx / d;
    const ny = dy / d;
    b.x = body.cx + nx * minD;
    b.y = body.cy + ny * minD;
    const vn = b.vx * nx + b.vy * ny;
    if (vn < 0) {
      // resting-contact kill: slow contacts land dead instead of buzzing
      const rest = -vn < 40 ? 0 : RESTITUTION;
      const vtx = b.vx - vn * nx;
      const vty = b.vy - vn * ny;
      b.vx = vtx * TANGENT_DAMP - vn * rest * nx;
      b.vy = vty * TANGENT_DAMP - vn * rest * ny;
      b.bounces++;
      if (!ghost) w.events.push({ type: 'bounce', x: b.x, y: b.y, speed: -vn });
    }
    if (!ghost) markTouched(w, body.id);
  }
}

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const abx = bx - ax;
  const aby = by - ay;
  const l2 = abx * abx + aby * aby;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / l2)) : 0;
  return Math.hypot(px - (ax + abx * t), py - (ay + aby * t));
}

function collideHazards(w: World, ghost: boolean): void {
  const b = w.ball;
  for (const h of w.hazards) {
    const d = h.def;
    if (d.kind === 'barrier') {
      if (segDist(b.x, b.y, d.a.x, d.a.y, d.b.x, d.b.y) < BALL_R) {
        if (!ghost) w.events.push({ type: 'hazard', x: b.x, y: b.y });
        killBall(w, 'hazard', ghost);
        return;
      }
    } else if (d.kind === 'beam') {
      const ang = (d.phase ?? 0) + d.spin * w.t;
      const ex = d.x + Math.cos(ang) * d.len;
      const ey = d.y + Math.sin(ang) * d.len;
      if (segDist(b.x, b.y, d.x, d.y, ex, ey) < d.r + BALL_R) {
        if (!ghost) w.events.push({ type: 'hazard', x: b.x, y: b.y });
        killBall(w, 'hazard', ghost);
        return;
      }
    } else if (d.kind === 'bumper') {
      const dx = b.x - d.x;
      const dy = b.y - d.y;
      const dist = Math.hypot(dx, dy);
      const minD = d.r + BALL_R;
      if (dist < minD && dist > 0) {
        const nx = dx / dist;
        const ny = dy / dist;
        b.x = d.x + nx * minD;
        b.y = d.y + ny * minD;
        const vn = b.vx * nx + b.vy * ny;
        const vtx = b.vx - vn * nx;
        const vty = b.vy - vn * ny;
        const reflect = Math.abs(vn) * 0.9 + d.boost;
        b.vx = vtx * 0.95 + nx * reflect;
        b.vy = vty * 0.95 + ny * reflect;
        if (!ghost) {
          w.events.push({ type: 'bounce', x: b.x, y: b.y, speed: reflect });
          markTouched(w, d.id);
        }
      }
    }
  }
}

// ------------------------------------------------------------------ main tick

export function stepTick(w: World, ghost = false): void {
  w.t += STEP_DT;
  tickBodies(w, ghost);

  // moving hole
  if (w.def.hole.path && w.holeSegLens) {
    const hp = w.def.hole.path;
    const adv = advancePath(hp, w.holeT, w.holeDir, STEP_DT, w.holeSegTotal);
    w.holeT = adv.pathT;
    w.holeDir = adv.dir;
    const p = pathPos(hp.points, w.holeSegLens, w.holeT, hp.mode);
    w.holeX = p.x;
    w.holeY = p.y;
  }

  const ball = w.ball;
  if (!ball.flying || ball.dead || ball.sunk) return;

  // velocity Verlet
  sampleField(w, ball.x, ball.y, f1);
  ball.x += ball.vx * STEP_DT + 0.5 * f1.ax * STEP_DT * STEP_DT;
  ball.y += ball.vy * STEP_DT + 0.5 * f1.ay * STEP_DT * STEP_DT;
  sampleField(w, ball.x, ball.y, f2);
  ball.vx += 0.5 * (f1.ax + f2.ax) * STEP_DT;
  ball.vy += 0.5 * (f1.ay + f2.ay) * STEP_DT;

  collideBodies(w, ghost);
  if (!ball.dead) collideHazards(w, ghost);

  // visual-only roll
  ball.spin += (ball.vx >= 0 ? 1 : -1) * Math.hypot(ball.vx, ball.vy) * STEP_DT * 0.05;

  // wormholes
  if (!ball.dead) {
    if (ball.wormCool > 0) ball.wormCool -= STEP_DT;
    for (const wh of w.wormholes) {
      if (wh.cool > 0) {
        wh.cool -= STEP_DT;
        continue;
      }
      if (Math.hypot(ball.x - wh.def.x, ball.y - wh.def.y) < wh.def.r) {
        const exit = w.wormholes.find((o) => o.def.id === wh.def.exitId);
        if (exit) {
          ball.x = exit.def.x;
          ball.y = exit.def.y;
          if (wh.def.angleDelta) {
            const c = Math.cos(wh.def.angleDelta);
            const s = Math.sin(wh.def.angleDelta);
            const nvx = ball.vx * c - ball.vy * s;
            const nvy = ball.vx * s + ball.vy * c;
            ball.vx = nvx;
            ball.vy = nvy;
          }
          ball.wormCool = 0.5;
          exit.cool = 0.5;
          if (!ghost) w.events.push({ type: 'wormhole', x: ball.x, y: ball.y });
        }
      }
    }
  }

  // debris — same field, lightweight Euler, same determinism
  for (const db of w.debris) {
    if (!db.alive) continue;
    sampleField(w, db.x, db.y, f1);
    db.vx += f1.ax * STEP_DT;
    db.vy += f1.ay * STEP_DT;
    db.x += db.vx * STEP_DT;
    db.y += db.vy * STEP_DT;
    for (const body of w.bodies) {
      if (body.radius <= 0) continue;
      const dx = db.x - body.cx;
      const dy = db.y - body.cy;
      const d = Math.hypot(dx, dy);
      const minD = body.radius + db.r;
      if (d < minD && d > 0) {
        const nx = dx / d;
        const ny = dy / d;
        db.x = body.cx + nx * minD;
        db.y = body.cy + ny * minD;
        const vn = db.vx * nx + db.vy * ny;
        if (vn < 0) {
          db.vx -= 1.5 * vn * nx;
          db.vy -= 1.5 * vn * ny;
          db.vx *= 0.9;
          db.vy *= 0.9;
        }
      }
    }
    // debris can trip switches (THE CASCADE) — physics is honest: always on
    if (!ghost) {
      for (const s of w.switches) {
        if (s.def.mode === 'once' && s.hit) continue;
        if (Math.hypot(db.x - s.def.x, db.y - s.def.y) < s.def.r + db.r) {
          touchSwitch(w, s.def.id, ghost);
        }
      }
    }
  }

  // switches (ball contact) — ghost runs physics only
  if (!ghost && !ball.dead) {
    for (const s of w.switches) {
      if (s.def.mode === 'once' && s.hit) continue;
      if (Math.hypot(ball.x - s.def.x, ball.y - s.def.y) < s.def.r + BALL_R) {
        touchSwitch(w, s.def.id, ghost);
        markTouched(w, s.def.id);
      }
    }
  }

  // fragments
  if (!ghost) {
    for (let i = 0; i < w.fragments.length; i++) {
      const fr = w.fragments[i];
      if (!fr.taken && Math.hypot(ball.x - fr.x, ball.y - fr.y) < 16) {
        fr.taken = true;
        w.events.push({ type: 'fragment', index: i, x: fr.x, y: fr.y });
      }
    }
  }

  // hole
  if (!ball.dead) {
    const hd = Math.hypot(ball.x - w.holeX, ball.y - w.holeY);
    const capture = w.def.hole.captureR ?? HOLE_CAPTURE_R;
    if (hd < capture) {
      const speed = Math.hypot(ball.vx, ball.vy);
      if (speed < SINK_SPEED) {
        ball.sunk = true;
        if (!ghost) {
          w.events.push({ type: 'sink', x: ball.x, y: ball.y });
          endStroke(w, 'sunk');
        } else {
          w.strokeEnded = w.strokeEnded ?? 'sunk';
        }
      } else {
        // rattle-out: a real cup eats the energy — the ball hops clear but
        // dies nearby, leaving a tap-in instead of rocketing away
        const nx = (ball.x - w.holeX) / (hd || 1);
        const ny = (ball.y - w.holeY) / (hd || 1);
        const vn = ball.vx * nx + ball.vy * ny;
        if (vn < 0) {
          const rvx = ball.vx - 2 * vn * nx;
          const rvy = ball.vy - 2 * vn * ny;
          const rl = Math.hypot(rvx, rvy) || 1;
          const outSpeed = Math.min(220, Math.max(40, -vn * 0.35 + 25));
          ball.vx = (rvx / rl) * outSpeed;
          ball.vy = (rvy / rl) * outSpeed;
          // clear the capture zone along the exit line, or the slow exit
          // re-qualifies as a sink on the very next tick
          ball.x = w.holeX + (rvx / rl) * (capture + 2);
          ball.y = w.holeY + (rvy / rl) * (capture + 2);
          if (!ghost) w.events.push({ type: 'lipout', x: ball.x, y: ball.y, speed });
        }
      }
    }
  }

  if (ball.dead) return;

  // orbit tracking against the dominant body
  if (f2.dominant && f2.dominant !== 'pin') {
    const body = w.bodies.find((b) => b.id === f2.dominant);
    if (body) {
      const rel = Math.atan2(ball.y - body.cy, ball.x - body.cx);
      if (ball.orbitBody === body.id && w.orbitPrevAngle !== null) {
        let d = rel - w.orbitPrevAngle;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        ball.orbitAngleAcc += d;
        if (Math.abs(ball.orbitAngleAcc) >= 2 * Math.PI) {
          ball.orbitAngleAcc = 0;
          w.orbits++;
          if (!ghost) w.events.push({ type: 'orbit', bodyId: body.id });
        }
      } else {
        ball.orbitBody = body.id;
        ball.orbitAngleAcc = 0;
      }
      w.orbitPrevAngle = rel;
    }
  } else {
    ball.orbitBody = null;
    w.orbitPrevAngle = null;
  }

  // bounds
  if (!inBounds(w, ball.x, ball.y)) {
    ball.outOfBoundsT += STEP_DT;
    if (ball.outOfBoundsT > BOUNDS_GRACE) {
      if (!ghost) w.events.push({ type: 'voided', x: ball.x, y: ball.y });
      killBall(w, 'voided', ghost);
      return;
    }
  } else {
    ball.outOfBoundsT = 0;
  }

  // settle
  if (Math.hypot(ball.vx, ball.vy) < SETTLE_SPEED) {
    ball.slowTime += STEP_DT;
    if (ball.slowTime > SETTLE_TIME) {
      ball.settled = true;
      if (!ghost) {
        w.events.push({ type: 'settled', x: ball.x, y: ball.y });
        endStroke(w, 'settled');
      } else {
        w.strokeEnded = w.strokeEnded ?? 'settled';
      }
    }
  } else {
    ball.slowTime = 0;
  }
}
