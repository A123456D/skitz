// The Collapsed City: props, destructibles, environmental interactions
import { G } from './state.js';
import { explode } from './weapons.js';
import { FX } from './fx.js';
import { A } from '../core/audio.js';
import { rand, TAU, RNG } from '../core/util.js';

export function genWorld() {
  G.props = [];
  const rng = new RNG(G.seed);
  const h = G.env.half - 120;
  const place = (kind, n, o = {}) => {
    for (let i = 0; i < n; i++) {
      let x, y, ok = false, tries = 0;
      while (!ok && tries++ < 20) {
        x = rng.range(-h, h); y = rng.range(-h, h);
        ok = Math.hypot(x, y) > 180;
        if (ok) for (const p of G.props) if (Math.hypot(p.x - x, p.y - y) < 90) { ok = false; break; }
      }
      if (!ok) continue;
      G.props.push({ kind, x, y, dead: false, t: 0, lit: 0, hp: o.hp ?? 1, r: o.r ?? 20, solid: !!o.solid, spr: o.spr || kind, deco: !!o.deco, rs: rng.f() });
    }
  };
  place('crackdec', 26, { r: 0, deco: true });
  place('oil', 6, { r: 34 });
  place('barrel', 24, { r: 12, hp: 1 });
  place('gen', 4, { r: 18 });
  place('car', 8, { r: 34, hp: 90, solid: true });
  place('barr', 10, { r: 26, hp: 50, solid: true });
  place('rubble', 14, { r: 16 });
  place('statue', 4, { r: 12, solid: true });
  place('subway', 3, { r: 30, deco: true });
  place('billboard', 5, { r: 10 });
  G.barrelRespawnT = 20;
}

export function updateWorld(dt) {
  // barrel trickle respawn
  G.barrelRespawnT -= dt;
  if (G.barrelRespawnT <= 0) {
    G.barrelRespawnT = 20;
    const alive = G.props.filter((p) => p.kind === 'barrel' && !p.dead).length;
    if (alive < 24) {
      const h = G.env.half - 120;
      G.props.push({ kind: 'barrel', x: rand(-h, h), y: rand(-h, h), dead: false, t: 0, lit: 0, hp: 1, r: 12, solid: false, spr: 'barrel', deco: false, rs: Math.random() });
    }
  }
  // generators: zap while lit
  for (const p of G.props) {
    if (p.kind === 'gen' && p.lit > 0) {
      p.lit -= dt;
      p.zapT = (p.zapT || 0) - dt;
      if (p.zapT <= 0) {
        p.zapT = 0.35;
        let best = null, bd = 280 * 280;
        for (const e of G.enemies) { if (e.dead) continue; const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2; if (d < bd) { bd = d; best = e; } }
        if (best) {
          import('./enemies.js').then((m) => m.hurt(best, 14, { src: 'world', kb: 60 }));
          FX.burst(best.x, best.y, 4, { col: '#ffe98a', spd: 150, life: 0.2 });
          A.sfx('zap');
        }
      }
      if (Math.random() < 0.3) FX.burst(p.x + rand(-12, 12), p.y - 18, 1, { col: '#ffe98a', spd: 60, life: 0.3, size: 1.4 });
    }
  }
}

// player bullets vs interactive props. returns true if bullet consumed
export function hitProps(b) {
  if (b.team !== 0) return false;
  for (const p of G.props) {
    if (p.dead || p.deco) continue;
    const d = Math.hypot(p.x - b.x, p.y - b.y);
    if (d > p.r + b.r) continue;
    switch (p.kind) {
      case 'barrel':
        p.dead = true;
        explode(p.x, p.y, 95, 45, { src: b.src });
        FX.burst(p.x, p.y, 6, { col: '#8a4a3a', spd: 120, life: 0.4 });
        return true;
      case 'car':
        p.hp -= b.dmg;
        FX.burst(b.x, b.y, 3, { col: '#9aa3b5', spd: 90, life: 0.2 });
        if (p.hp <= 0) { p.dead = true; explode(p.x, p.y, 110, 55, { src: b.src }); FX.burst(p.x, p.y, 10, { col: '#4a5568', spd: 160, life: 0.5 }); }
        return true;
      case 'barr':
        p.hp -= b.dmg;
        FX.burst(b.x, b.y, 2, { col: '#7a5c3f', spd: 70, life: 0.3 });
        if (p.hp <= 0) { p.dead = true; FX.puff(p.x, p.y, 6); A.sfx('crack'); }
        return true;
    }
  }
  return false;
}

export function igniteOil(p) {
  if (p.dead) return;
  p.dead = true;
  G.wells.push({ x: p.x, y: p.y, t: 6, dur: 6, r: 50, pull: 0, dps: 16, fire: true, src: 'player' });
  FX.burst(p.x, p.y, 10, { col: '#ff8a4a', spd: 120, life: 0.5 });
  A.sfx('boom');
}

// lightning-tagged hits can overload generators
export function tryGenerator(b) {
  for (const p of G.props) {
    if (p.kind !== 'gen' || p.dead || p.lit > 0) continue;
    if (Math.hypot(p.x - b.x, p.y - b.y) < p.r + 26) {
      p.lit = 6;
      FX.ring(p.x, p.y, 90, '#ffe98a'); FX.flash(0.12, '#ffe98a'); A.sfx('zap');
      return true;
    }
  }
  return false;
}

export function drawWorld(R) {
  // decals
  for (const p of G.props) {
    if (p.dead || !p.deco && p.kind !== 'oil') continue;
    if (p.kind === 'oil') R.q('oil', p.x, p.y, { alpha: 0.9, layer: 5 });
    else R.q('crackdec', p.x, p.y, { rot: p.rs * TAU, alpha: 0.8, layer: 5 });
  }
  // props (y-sorted)
  const list = [];
  for (const p of G.props) if (!p.dead && !p.deco && p.kind !== 'oil') list.push(p);
  list.sort((a, b) => a.y - b.y);
  for (const p of list) {
    const y = p.y;
    if (p.kind !== 'rubble') R.q('shadow', p.x, y + 8, { sx: p.r * 1.7 / 44, sy: p.r / 26, alpha: 0.2, layer: 6 });
    switch (p.kind) {
      case 'barrel': R.q('barrel', p.x, y, { ay: 0.92, layer: 7 }); break;
      case 'gen': R.q(p.lit > 0 ? 'generator1' : 'generator0', p.x, y, { ay: 0.92, layer: 7 }); if (p.lit > 0) R.q('glow', p.x, y - 14, { sx: 1, sy: 1, tint: '#ffe98a', alpha: 0.25, layer: 9 }); break;
      case 'car': R.q('car', p.x, y, { ay: 0.92, layer: 7, sx: p.rs > 0.5 ? 1 : -1 }); break;
      case 'barr': R.q('barricade', p.x, y, { ay: 0.92, layer: 7, rot: (p.rs - 0.5) * 0.3 }); break;
      case 'rubble': R.q('rubble', p.x, y, { ay: 0.9, layer: 7, rot: p.rs * TAU }); break;
      case 'statue': R.q('statue', p.x, y, { ay: 0.95, layer: 7 }); break;
      case 'subway': R.q('subway', p.x, y, { ay: 0.95, layer: 7, sx: p.rs > 0.5 ? 1 : -1 }); break;
      case 'billboard': {
        const lit = Math.sin(G.time * 0.8 + p.rs * 9) > 0.65;
        R.q(lit ? 'billboard1' : 'billboard0', p.x, y, { ay: 0.95, layer: 7, sx: p.rs > 0.5 ? 1 : -1 });
        if (lit) R.q('glow', p.x, y - 20, { sx: 1.4, sy: 1.1, tint: '#ff5ad2', alpha: 0.12, layer: 9 });
        break;
      }
    }
  }
}
