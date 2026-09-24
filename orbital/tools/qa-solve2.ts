import { LEVELS } from '../src/levels';
import { createWorld, startStroke, predict } from '../src/sim';

const def = LEVELS[0];

// Stroke 1: find a shot from the tee that SETTLES closest to the hole
let best: { deg: number; pow: number; dist: number; x: number; y: number } | null = null;
for (let deg = 0; deg < 360; deg += 3) {
  for (let pow = 150; pow <= 900; pow += 25) {
    const rad = (deg * Math.PI) / 180;
    const w = createWorld(def, 7, 1);
    startStroke(w, true);
    const res = predict(w, Math.cos(rad) * pow, Math.sin(rad) * pow, 20);
    if (res.end !== 'settled') continue;
    const last = res.points[res.points.length - 1];
    const dist = Math.hypot(last.x - w.holeX, last.y - w.holeY);
    if (!best || dist < best.dist) best = { deg, pow, dist, x: last.x, y: last.y };
  }
}
console.log('BEST SETTLING APPROACH:', best);

if (best) {
  // Stroke 2: putt from the exact rest point
  let putt: { deg: number; pow: number; dist: number } | null = null;
  for (let deg = 0; deg < 360; deg += 2) {
    for (let pow = 30; pow <= 320; pow += 10) {
      const rad = (deg * Math.PI) / 180;
      const w = createWorld(def, 7, 1);
      startStroke(w, true);
      w.ball.x = best.x;
      w.ball.y = best.y;
      const res = predict(w, Math.cos(rad) * pow, Math.sin(rad) * pow, 8);
      if (res.end !== 'sunk') continue;
      putt = { deg, pow, dist: 0 };
      break;
    }
    if (putt) break;
  }
  console.log('SINKING PUTT:', putt);
}
