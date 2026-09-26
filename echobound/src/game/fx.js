// particles, damage numbers, screen feedback
import { L, } from '../render/renderer.js';
import { G } from './state.js';
import { rand, TAU } from '../core/util.js';

const MAXP = 3000;
const parts = [];
const nums = [];
let flashA = 0, flashCol = '#ffffff';
let slowmoT = 0;

export const FX = {
  burst(x, y, n, o = {}) {
    const col = o.col || '#ffb454', spd = o.spd || 160, life = o.life || 0.5, size = o.size || 2.2, drag = o.drag ?? 3;
    for (let i = 0; i < n; i++) {
      if (parts.length >= MAXP) parts.shift();
      const a = o.ang !== undefined ? o.ang + rand(-o.arc ?? -1, o.arc ?? 1) : rand(0, TAU);
      const v = spd * rand(0.3, 1);
      parts.push({ x, y, vx: Math.cos(a) * v + (o.vx || 0), vy: Math.sin(a) * v + (o.vy || 0), t: life * rand(0.6, 1.3), T: life, col, size: size * rand(0.6, 1.5), drag, add: o.add ?? true, grav: o.grav || 0 });
    }
  },
  ring(x, y, r, col = '#54e6ff', life = 0.35) { parts.push({ ring: 1, x, y, r0: r * 0.2, r1: r, t: life, T: life, col, add: true }); },
  puff(x, y, n, col = '#3a4254') { this.burst(x, y, n, { col, spd: 60, life: 0.9, size: 3.2, add: false, drag: 1.5 }); },
  trailDot(x, y, col, size = 2, life = 0.3) { if (parts.length >= MAXP) parts.shift(); parts.push({ x, y, vx: 0, vy: 0, t: life, T: life, col, size, drag: 0, add: true }); },
  num(x, y, v, crit = false) {
    if (nums.length > 50) nums.shift();
    nums.push({ x: x + rand(-8, 8), y, v: Math.round(v), t: 0.7, crit });
  },
  shake(a) { G.cam.trauma = Math.min(1, G.cam.trauma + a); },
  hitstop(t) { G.hitstop = Math.max(G.hitstop, t); },
  flash(a, col = '#ffffff') { flashA = Math.max(flashA, a); flashCol = col; },
  slowmo(t) { slowmoT = Math.max(slowmoT, t); },
  slowFactor() { return slowmoT > 0 ? 0.25 : 1; },
  update(dt) {
    slowmoT = Math.max(0, slowmoT - dt);
    flashA = Math.max(0, flashA - dt * 3);
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.t -= dt;
      if (p.t <= 0) { parts[i] = parts[parts.length - 1]; parts.pop(); continue; }
      if (!p.ring) {
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.drag) { const d = Math.max(0, 1 - p.drag * dt); p.vx *= d; p.vy *= d; }
        p.vy += (p.grav || 0) * dt;
      }
    }
    for (let i = nums.length - 1; i >= 0; i--) { const n = nums[i]; n.t -= dt; n.y -= 40 * dt; if (n.t <= 0) nums.splice(i, 1); }
  },
  camOffset() {
    const t = G.cam.trauma;
    if (t <= 0) return [0, 0];
    const m = t * t * 14;
    return [rand(-m, m), rand(-m, m)];
  },
  draw(R) {
    R.layer(L.FX);
    for (const p of parts) {
      const a = Math.min(1, p.t / p.T * 1.4);
      if (p.ring) {
        const rad = p.r0 + (p.r1 - p.r0) * (1 - p.t / p.T);
        const s = rad * 2 / (64 * 3);
        R.q('ring', p.x, p.y, { sx: s, sy: s, tint: p.col, alpha: a * 0.8, layer: L.FX });
      } else {
        R.q('trail', p.x, p.y, { sx: p.size / 1.2, sy: p.size / 1.2, tint: p.col, alpha: a, layer: L.FX });
      }
    }
    for (const n of nums) {
      const a = Math.min(1, n.t / 0.4);
      R.text('' + n.v, n.x, n.y, { s: n.crit ? 3 : 2, col: n.crit ? '#ffd75e' : '#e8ecf4', alpha: a, align: 'center', layer: L.FX });
    }
  },
  drawFlash(R) { if (flashA > 0.003) R.flash(flashA, flashCol); },
  reset() { parts.length = 0; nums.length = 0; flashA = 0; slowmoT = 0; },
};
