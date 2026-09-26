// particles, gibs, ground splats, damage numbers, screen feedback
import { L } from '../render/renderer.js';
import { G } from './state.js';
import { rand, TAU, clamp } from '../core/util.js';

const MAXP = 3000;
const parts = [];
const splats = []; // ground decals that record the battle
const nums = [];
let flashA = 0, flashCol = '#ffffff';
let slowmoT = 0;

export const FX = {
  burst(x, y, n, o = {}) {
    const col = o.col || '#ffb454', spd = o.spd || 160, life = o.life || 0.5, size = o.size || 2.2, drag = o.drag ?? 3;
    for (let i = 0; i < n; i++) {
      if (parts.length >= MAXP) parts.shift();
      const a = o.ang !== undefined ? o.ang + rand(-(o.arc ?? 1), o.arc ?? 1) : rand(0, TAU);
      const v = spd * rand(0.3, 1);
      parts.push({ x, y, vx: Math.cos(a) * v + (o.vx || 0), vy: Math.sin(a) * v + (o.vy || 0), t: life * rand(0.6, 1.3), T: life, col, size: size * rand(0.6, 1.5), drag, add: o.add ?? true, grav: o.grav || 0 });
    }
  },
  ring(x, y, r, col = '#54e6ff', life = 0.35) { parts.push({ ring: 1, x, y, r0: r * 0.2, r1: r, t: life, T: life, col, add: true }); },
  puff(x, y, n, col = '#3a4254') { this.burst(x, y, n, { col, spd: 60, life: 0.9, size: 3.2, add: false, drag: 1.5 }); },
  trailDot(x, y, col, size = 2, life = 0.3) { if (parts.length >= MAXP) parts.shift(); parts.push({ x, y, vx: 0, vy: 0, t: life, T: life, col, size, drag: 0, add: true }); },
  // ambient drifting motes: the city air is never empty
  dust(x, y) {
    if (parts.length >= MAXP) return;
    parts.push({ x, y, vx: rand(-9, 9), vy: rand(-20, -6), t: rand(1.6, 3), T: 3, col: Math.random() < 0.85 ? '#7d95b5' : '#d8a86b', size: rand(0.8, 1.5), drag: 0, add: true });
  },
  // one-frame sprite flash (muzzle etc)
  flashSpr(x, y, spr, rot = 0, size = 1, col = '#ffffff', life = 0.07) {
    if (parts.length >= MAXP) parts.shift();
    parts.push({ x, y, spr, rot, size, col, vx: 0, vy: 0, t: life, T: life, add: true, drag: 0 });
  },
  // physical-feeling chunks with spin
  gibs(x, y, n, col = '#8a4a3a', o = {}) {
    for (let i = 0; i < n; i++) {
      if (parts.length >= MAXP) parts.shift();
      const a = rand(0, TAU), v = rand(80, 300);
      parts.push({ x, y, spr: 'gib', rot: rand(0, TAU), vr: rand(-14, 14), vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, t: rand(0.35, 0.7), T: 0.7, col, size: rand(0.8, 2), drag: 2.5, add: false, grav: 420 });
    }
  },
  splat(x, y, col = '#3a2020', size = 1) {
    if (splats.length > 26) splats.shift();
    splats.push({ x: x + rand(-6, 6), y: y + rand(-4, 6), rot: rand(0, TAU), col, size: Math.min(1.05, size) * rand(0.7, 1), t: 6 });
  },
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
        if (p.vr) p.rot += p.vr * dt;
        if (p.grav && p.y > 14 && p.vy > 0) { p.vy *= -0.35; p.vx *= 0.6; } // bounce
      }
    }
    for (let i = splats.length - 1; i >= 0; i--) { splats[i].t -= dt; if (splats[i].t <= 0) splats.splice(i, 1); }
    for (let i = nums.length - 1; i >= 0; i--) { const n = nums[i]; n.t -= dt; n.y -= 40 * dt; if (n.t <= 0) nums.splice(i, 1); }
  },
  camOffset() {
    const t = G.cam.trauma;
    if (t <= 0) return [0, 0];
    const m = t * t * 14;
    return [rand(-m, m), rand(-m, m)];
  },
  drawDecals(R) {
    R.layer(L.DECAL);
    for (const s of splats) {
      const a = clamp(s.t / 2, 0, 1) * 0.28;
      R.q('splat', s.x, s.y, { rot: s.rot, sx: s.size, sy: s.size * 0.6, tint: s.col, alpha: a, layer: L.DECAL });
    }
  },
  draw(R) {
    R.layer(L.FX);
    for (const p of parts) {
      const a = Math.min(1, p.t / p.T * 1.4);
      if (p.ring) {
        const rad = p.r0 + (p.r1 - p.r0) * (1 - p.t / p.T);
        const s = rad * 2 / (64 * 3);
        R.q('ring', p.x, p.y, { sx: s, sy: s, tint: p.col, alpha: a * 0.8, layer: L.FX });
      } else if (p.spr) {
        R.q(p.spr, p.x, p.y, { rot: p.rot, sx: p.size, sy: p.size, tint: p.col, alpha: a, layer: L.FX });
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
  reset() { parts.length = 0; nums.length = 0; splats.length = 0; flashA = 0; slowmoT = 0; },
};
