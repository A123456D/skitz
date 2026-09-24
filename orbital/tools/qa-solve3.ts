import { LEVELS } from '../src/levels';
import { createWorld, startStroke, predict } from '../src/sim';

const def = LEVELS[0];
const sinks: { deg: number; pow: number }[] = [];
let bestPass: { deg: number; pow: number; dist: number; speed: number } | null = null;
for (let deg = 346; deg <= 358; deg += 0.5) {
  for (let pow = 500; pow <= 660; pow += 8) {
    const rad = (deg * Math.PI) / 180;
    const w = createWorld(def, 7, 1);
    startStroke(w, true);
    const res = predict(w, Math.cos(rad) * pow, Math.sin(rad) * pow, 14);
    if (res.end === 'sunk') { sinks.push({ deg, pow }); continue; }
    for (const p of res.points) {
      const d = Math.hypot(p.x - w.holeX, p.y - w.holeY);
      if (d < 60 && p.speed < 260 && (!bestPass || d < bestPass.dist)) {
        bestPass = { deg, pow, dist: d, speed: p.speed };
      }
    }
  }
}
console.log('SINKS:', sinks.slice(0, 10));
console.log('BEST SLOW PASS:', bestPass);
