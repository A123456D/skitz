import { LEVELS } from '../src/levels';
import { createWorld, startStroke, predict } from '../src/sim';

const idx = Number(process.argv[2] ?? 0);
const def = LEVELS[idx];
console.log('level', def.id, def.name, '| tee', def.tee, '| hole', def.hole.x, def.hole.y);
console.log('bodies', def.bodies.map(b => ({ id: b.id, x: b.x, y: b.y, r: b.radius, mu: b.mu })));

const results: { deg: number; pow: number; dist: number }[] = [];
for (let deg = 0; deg < 360; deg += 3) {
  for (let pow = 120; pow <= 900; pow += 30) {
    const rad = (deg * Math.PI) / 180;
    const w = createWorld(def, 7, 1);
    startStroke(w);
    const res = predict(w, Math.cos(rad) * pow, Math.sin(rad) * pow, 12);
    const last = res.points[res.points.length - 1];
    const dist = Math.hypot(last.x - w.holeX, last.y - w.holeY);
    results.push({ deg, pow, dist });
  }
}
results.sort((a, b) => a.dist - b.dist);
console.log('TOP SHOTS (deg, speed, finalDistToHole):');
for (const r of results.slice(0, 8)) console.log(r);
