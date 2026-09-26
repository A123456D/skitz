// Level-design audit: plays every hole with a beam search and reports whether
// it is sinkable within par (+1). Machinery levels work because prediction
// now fires switches in ghost mode. Run: npx tsx tools/level-audit.ts [region]
import { LEVELS } from '../src/levels';
import { createWorld, startStroke, placePin, undoPin, predict } from '../src/sim';
import type { LevelDef } from '../src/sim';

interface Vec { x: number; y: number }

interface SpecNode extends Node { spec?: number }

interface Node {
  x: number;
  y: number;
  strokes: number;
  spec?: number;
}

const ANGLES = 24;
const POWERS = [140, 210, 280, 350, 420, 500, 600, 720, 850];
const BEAM = 22;
const HORIZON = 11; // seconds per simulated stroke (orbits need room)

function quantize(x: number, y: number): string {
  return `${Math.round(x / 24)}:${Math.round(y / 24)}`;
}

function sweepFrom(
  def: LevelDef,
  seed: number,
  gravityScale: number,
  node: Node,
  usePins: boolean,
): { sunk: number | null; children: Node[]; bestDist: number } {
  let sunk: number | null = null;
  const children = new Map<string, Node>();
  let bestDist = Infinity;
  const base = Math.atan2(node.y - def.hole.y, node.x - def.hole.x); // memory: aim bias toward hole
  for (let a = 0; a < ANGLES; a++) {
    const deg = -180 + (360 / ANGLES) * a;
    // bias the grid toward the hole direction: half the rays hug it
    const ray = a % 2 === 0 ? base + ((a / 2) * Math.PI * 2) / ANGLES : (deg * Math.PI) / 180;
    for (const pow of POWERS) {
      const w = createWorld(def, seed, gravityScale);
      startStroke(w, true);
      if (node.strokes > 0) {
        w.strokes = node.strokes;
        w.ball.x = node.x;
        w.ball.y = node.y;
      }
      const attempts: (Vec | null)[] = [null];
      if (usePins && def.pinBudget > 0) {
        // a small pin grid on the corridor ball→hole
        // mid-course pins only — a pin next to the cup vacuums the ball in and
        // fakes a solution that defeats the level concept. Grid: corridor × lateral.
        for (const t of [0.3, 0.45, 0.6]) {
          for (const lat of [0, -90, 90]) {
            const mx = node.x + (w.holeX - node.x) * t;
            const my = node.y + (w.holeY - node.y) * t;
            const dxh = w.holeX - node.x;
            const dyh = w.holeY - node.y;
            const l = Math.hypot(dxh, dyh) || 1;
            attempts.push({ x: mx + (-dyh / l) * lat, y: my + (dxh / l) * lat });
          }
        }
      }
      for (const pin of attempts) {
        if (pin) placePin(w, pin.x, pin.y);
        const res = predict(w, Math.cos(ray) * pow, Math.sin(ray) * pow, HORIZON, 6);
        if (pin) undoPin(w);
        const last = res.points[res.points.length - 1];
        if (!last) continue;
        const d = Math.hypot(last.x - w.holeX, last.y - w.holeY);
        if (res.end === 'sunk') {
          if (sunk === null || node.strokes + 1 < sunk) sunk = node.strokes + 1;
          continue;
        }
        if (res.end === 'dead') continue; // wasted stroke (returns to tee — predict maps voided here)
        // 'settled' children are honest; 'timeout' children are speculative —
        // the ball is still moving at horizon, so the next-stroke assumption
        // is approximate. Cap speculative hops at 2 to bound the lies.
        const speculative = res.end === 'timeout' ? 1 : 0;
        const strokes = node.strokes + 1;
        const spec = ((node as SpecNode).spec ?? 0) + speculative;
        if (strokes > def.par + 1 || spec > 2) continue;
        bestDist = Math.min(bestDist, d);
        const key = quantize(last.x, last.y);
        const prev = children.get(key);
        if (!prev || d < Math.hypot(prev.x - w.holeX, prev.y - w.holeY)) {
          children.set(key, { x: last.x, y: last.y, strokes, spec });
        }
      }
    }
  }
  const sorted = [...children.values()].sort(
    (a, b) => Math.hypot(a.x - def.hole.x, a.y - def.hole.y) - Math.hypot(b.x - def.hole.x, b.y - def.hole.y),
  );
  return { sunk, children: sorted.slice(0, BEAM), bestDist };
}

function solveLevel(
  def: LevelDef,
  seed: number,
  gravityScale: number,
  maxStrokes: number,
  usePins: boolean,
): number | null {
  const frontier: Node[] = [{ x: def.tee.x, y: def.tee.y, strokes: 0 }];
  let best: number | null = null;
  for (let depth = 0; depth < maxStrokes && best === null; depth++) {
    const next: Node[] = [];
    for (const node of frontier) {
      const { sunk, children } = sweepFrom(def, seed, gravityScale, node, usePins);
      if (sunk !== null && (best === null || sunk < best)) best = sunk;
      if (best !== null) return best;
      next.push(...children);
    }
    frontier.length = 0;
    frontier.push(...next);
  }
  return best;
}

const regionArg = process.argv[2] ? Number(process.argv[2]) : 0;
const results: string[] = [];

for (const def of LEVELS) {
  if (regionArg && def.region !== regionArg) continue;
  const mods = 1; // gravity scale
  const plain = solveLevel(def, 7, mods, def.par + 1, false);
  const withPins = plain === null ? solveLevel(def, 7, mods, def.par + 1, true) : plain;
  const strokes = plain ?? withPins;
  const verdict =
    strokes === null ? 'UNSOLVED' : strokes <= def.par ? 'OK' : `PAR+${strokes - def.par}`;
  results.push(
    `${def.id} ${def.name.padEnd(16)} par ${def.par}  solver ${String(strokes).padEnd(4)} ${verdict}${plain === null && strokes !== null ? ' (needs pins)' : ''}`,
  );
}

console.log(results.join('\n'));
const unsolved = results.filter((r) => r.includes('UNSOLVED'));
const overPar = results.filter((r) => r.includes('PAR+'));
console.log(`\n${results.length} levels · unsolved: ${unsolved.length} · over-par-only: ${overPar.length}`);
