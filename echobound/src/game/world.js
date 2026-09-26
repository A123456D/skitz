// The Collapsed City: districts, boundary walls, ground variety, props, hazards
import { G } from './state.js';
import { explode } from './weapons.js';
import { hurt } from './enemies.js';
import { playerHurt } from './weapons.js';
import { FX } from './fx.js';
import { A } from '../core/audio.js';
import { rand, irand, TAU, RNG } from '../core/util.js';
import { L } from '../render/renderer.js';

const DECALS = ['concrete', 'dirt', 'debris', 'crossing', 'puddle', 'paint', 'grate', 'cables'];
const BOUND = 1500 - 46;

export function genWorld() {
  G.props = [];
  G.gdecals = [];
  const rng = new RNG(G.seed);
  const h = G.env.half - 140;

  // --- ground patches: large decals that break tile repetition ---
  const stamp = (spr, x, y, rot) => G.gdecals.push({ spr, x, y, rot: rot ?? rng.f() * TAU, rs: rng.f() });
  for (let i = 0; i < 46; i++) {
    const x = rng.range(-h, h), y = rng.range(-h, h);
    if (Math.hypot(x, y) < 240) continue;
    const r = rng.f();
    stamp(r < 0.3 ? 'concrete' : r < 0.55 ? 'dirt' : r < 0.75 ? 'debris' : r < 0.85 ? 'crossing' : r < 0.93 ? 'puddle' : 'paint', x, y);
  }
  // small scatter
  for (let i = 0; i < 30; i++) {
    const x = rng.range(-h, h), y = rng.range(-h, h);
    if (Math.hypot(x, y) < 200) continue;
    const r = rng.f();
    G.props.push({ kind: 'scrap', spr: r < 0.35 ? 'trash' : r < 0.6 ? 'grate' : r < 0.8 ? 'cables' : 'cone', x, y, dead: false, t: 0, lit: 0, hp: 1, r: 0, solid: false, deco: true, rs: rng.f() });
  }

  const prop = (kind, spr, x, y, o = {}) => G.props.push({
    kind, spr: spr || kind, x, y, dead: false, t: 0, lit: 0,
    hp: o.hp ?? 1, r: o.r ?? 20, solid: !!o.solid, deco: !!o.deco, rs: rng.f(),
  });

  // --- districts: composed set-pieces so the arena reads as places, not a room ---
  const distKinds = ['store', 'yard', 'ruin', 'lot', 'yard2'];
  for (let d = 0; d < 5; d++) {
    const a = (d / 5) * TAU + rng.range(-0.3, 0.3);
    const R = rng.range(480, 1050);
    const cx = Math.cos(a) * R, cy = Math.sin(a) * R;
    const kind = distKinds[d];
    if (kind === 'store') {
      prop('storefront', 'storefront', cx, cy, { r: 40, hp: 999, solid: true });
      stamp('concrete', cx, cy + 60, 0);
      prop('crate', 'crate', cx - 55, cy + 34, { r: 14, solid: true });
      prop('crate', 'crate', cx - 38, cy + 44, { r: 14, solid: true });
      prop('ebox', 'ebox', cx + 52, cy + 10);
      prop('trash', 'trash', cx + 30, cy + 48, { r: 0, deco: true });
      if (rng.f() < 0.7) prop('barrel', 'barrel', cx + 66, cy + 40, { r: 12 });
    } else if (kind === 'yard') {
      prop('machinery', 'machinery', cx, cy, { r: 32, hp: 999, solid: true });
      stamp('concrete', cx - 70, cy + 50, 0.2);
      prop('pipes', 'pipes', cx - 70, cy + 62, { r: 18, solid: true });
      prop('vent', 'vent', cx + 58, cy + 30);
      prop('barrel', 'barrel', cx + 50, cy - 44, { r: 12 });
      prop('barrel', 'barrel', cx + 66, cy - 30, { r: 12 });
      prop('gen', 'generator', cx - 80, cy - 50, { r: 18 });
      prop('fence', 'fence', cx + 10, cy + 76, { r: 22, solid: true });
    } else if (kind === 'ruin') {
      prop('wall2', 'wall2', cx, cy, { r: 26, solid: true });
      prop('wall1', 'wall1', cx - 66, cy + 26, { r: 26, solid: true });
      stamp('dirt', cx + 40, cy + 40, 0);
      stamp('debris', cx + 60, cy - 20, 0);
      prop('rubble', 'rubble', cx + 44, cy + 52, { r: 14 });
      prop('rubble', 'rubble', cx - 30, cy - 44, { r: 14 });
    } else if (kind === 'lot') {
      prop('car', 'car', cx, cy, { r: 34, hp: 90, solid: true });
      stamp('crossing', cx + 80, cy, 0);
      stamp('paint', cx - 70, cy + 40, 0);
      prop('fence', 'fence', cx - 80, cy - 40, { r: 22, solid: true });
      prop('cone', 'cone', cx + 50, cy + 50, { r: 0, deco: true });
      prop('cone', 'cone', cx + 64, cy + 36, { r: 0, deco: true });
    } else {
      prop('subway', 'subway', cx, cy, { r: 30, solid: true });
      stamp('puddle', cx + 60, cy + 50, 0);
      prop('crate', 'crate', cx + 60, cy - 40, { r: 14, solid: true });
      prop('trash', 'trash', cx - 50, cy + 40, { r: 0, deco: true });
      prop('billboard', 'billboard', cx - 80, cy - 30, { r: 10 });
    }
  }

  // --- free-standing props ---
  const place = (kind, n, o = {}) => {
    for (let i = 0; i < n; i++) {
      let x, y, ok = false, tries = 0;
      while (!ok && tries++ < 20) {
        x = rng.range(-h, h); y = rng.range(-h, h);
        ok = Math.hypot(x, y) > 220;
        if (ok) for (const p of G.props) if (Math.hypot(p.x - x, p.y - y) < 90) { ok = false; break; }
      }
      if (!ok) continue;
      prop(kind, o.spr || kind, x, y, o);
    }
  };
  place('oil', 6, { r: 34 });
  place('barrel', 16, { r: 12 });
  place('gen', 3, { r: 18 });
  place('car', 4, { r: 34, hp: 90, solid: true });
  place('barr', 6, { r: 26, hp: 50, solid: true });
  place('rubble', 8, { r: 16 });
  place('statue', 3, { r: 12, solid: true });
  place('billboard', 3, { r: 10 });
  place('ebox', 3, {});
  place('crackdec', 20, { r: 0, deco: true });

  // --- arena boundary: a RUINED perimeter — wall clusters with gaps and rubble chokes ---
  const edgeWall = (x, y, vert) => {
    const broken = rng.f();
    const sk = broken < 0.5 ? 'wall0' : broken < 0.78 ? 'wall1' : 'wall2';
    prop('wallb', sk, x, y, { r: 30, hp: 999, solid: true, vert });
  };
  for (let s = -BOUND; s <= BOUND;) {
    const gap = rng.f() < 0.3; // ruined gaps: the wall is broken, not fenced
    if (!gap) {
      const run = 1 + rng.int(0, 2); // clusters of 1-3 segments
      for (let k = 0; k < run; k++) {
        edgeWall(s + k * 50 + rng.range(-6, 6), -BOUND + rng.range(-8, 8), false);
        edgeWall(s + k * 50 + rng.range(-6, 6), BOUND + rng.range(-8, 8), false);
        edgeWall(-BOUND + rng.range(-8, 8), s + k * 50 + rng.range(-6, 6), true);
        edgeWall(BOUND + rng.range(-8, 8), s + k * 50 + rng.range(-6, 6), true);
      }
      s += run * 50;
    } else {
      // rubble choke fills some gaps
      if (rng.f() < 0.5) {
        prop('rubble', 'rubble', s + rng.range(-10, 10), -BOUND + rng.range(0, 14), { r: 16 });
        prop('rubble', 'rubble', BOUND + rng.range(-10, 10), s, { r: 16, rs: rng.f() });
        prop('rubble', 'rubble', -BOUND, s + rng.range(-10, 10), { r: 16, rs: rng.f() });
        prop('rubble', 'rubble', s, BOUND + rng.range(-10, 10), { r: 16, rs: rng.f() });
      }
      s += rng.range(50, 120);
    }
  }

  // --- arc-node hazards: exposed transformers that charge and discharge ---
  G.arcs = [];
  for (let i = 0; i < 6; i++) {
    let x, y, tries = 0;
    do { x = rng.range(-h, h); y = rng.range(-h, h); } while (Math.hypot(x, y) < 300 && tries++ < 20);
    G.arcs.push({ x, y, st: 'idle', t: rng.range(2, 6) });
  }
  G.barrelRespawnT = 20;
}

export function updateWorld(dt) {
  G.barrelRespawnT -= dt;
  if (G.barrelRespawnT <= 0) {
    G.barrelRespawnT = 20;
    const alive = G.props.filter((p) => p.kind === 'barrel' && !p.dead).length;
    if (alive < 22) {
      const h = G.env.half - 120;
      G.props.push({ kind: 'barrel', spr: 'barrel', x: rand(-h, h), y: rand(-h, h), dead: false, t: 0, lit: 0, hp: 1, r: 12, solid: false, deco: false, rs: Math.random() });
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
          hurt(best, 14, { src: 'world', kb: 60 });
          FX.burst(best.x, best.y, 4, { col: '#ffe98a', spd: 150, life: 0.2 });
          A.sfx('zap');
        }
      }
      if (Math.random() < 0.3) FX.burst(p.x + rand(-12, 12), p.y - 18, 1, { col: '#ffe98a', spd: 60, life: 0.3, size: 1.4 });
    }
  }
  // arc nodes: idle -> warning sparks -> discharge
  for (const a of G.arcs) {
    a.t -= dt;
    if (a.st === 'idle' && a.t <= 0) { a.st = 'warn'; a.t = 0.9; A.sfx('zap'); }
    else if (a.st === 'warn' && a.t <= 0) {
      a.st = 'idle'; a.t = rand(3.5, 7);
      FX.ring(a.x, a.y, 130, '#ffe98a');
      FX.burst(a.x, a.y, 14, { col: '#ffe98a', spd: 260, life: 0.35 });
      A.sfx('zap'); FX.shake(0.12);
      const P = G.player;
      if (P.alive && Math.hypot(P.x - a.x, P.y - a.y) < 130 + P.r) playerHurt(12);
      for (const e of G.enemies) if (!e.dead && Math.hypot(e.x - a.x, e.y - a.y) < 130 + e.r) hurt(e, 20, { src: 'world', kb: 100 });
    } else if (a.st === 'warn' && Math.random() < 0.35) {
      FX.burst(a.x + rand(-10, 10), a.y - 24 + rand(-6, 6), 1, { col: '#ffe98a', spd: 70, life: 0.2, size: 1.4 });
    }
  }
}

// player bullets vs interactive props. returns true if bullet consumed
export function hitProps(b) {
  if (b.team !== 0) return false;
  for (const p of G.props) {
    if (p.dead || p.deco || p.kind === 'wallb') continue;
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
        if (p.hp <= 0) { p.dead = true; FX.puff(p.x, p.y, 6); FX.gibs(p.x, p.y, 5, '#7a5c3f'); A.sfx('crack'); }
        return true;
      case 'storefront':
      case 'machinery':
        FX.burst(b.x, b.y, 2, { col: '#5a6a86', spd: 80, life: 0.2 });
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
  // ground variety decals sit directly on the tile layer
  for (const d of G.gdecals) {
    if (d.spr === 'concrete') R.q('concrete', d.x, d.y, { rot: d.rot, alpha: 0.85, layer: L.DECAL });
    else if (d.spr === 'dirt') R.q('dirt', d.x, d.y, { rot: d.rot, alpha: 0.9, layer: L.DECAL });
    else if (d.spr === 'debris') R.q('debris', d.x, d.y, { rot: d.rot, alpha: 0.9, layer: L.DECAL });
    else if (d.spr === 'crossing') R.q('crossing', d.x, d.y, { rot: d.rot, alpha: 0.8, layer: L.DECAL });
    else if (d.spr === 'puddle') R.q('puddle', d.x, d.y, { alpha: 0.9, layer: L.DECAL });
    else if (d.spr === 'paint') R.q('paint', d.x, d.y, { rot: d.rot, alpha: 0.9, layer: L.DECAL });
  }
  // arc-node ground warning rings
  for (const a of G.arcs) {
    if (a.st === 'warn') {
      const pu = 0.25 + Math.sin(G.time * 18) * 0.15;
      R.q('ring', a.x, a.y, { sx: 130 * 2 / (64 * 3), sy: 130 * 2 / (64 * 3), tint: '#ffe98a', alpha: pu, layer: L.DECAL });
    }
  }
  // props (y-sorted)
  const list = [];
  for (const p of G.props) if (!p.dead && !p.deco && p.kind !== 'oil') list.push(p);
  list.sort((a, b) => a.y - b.y);
  for (const p of list) {
    const y = p.y;
    if (p.kind !== 'rubble' && p.kind !== 'wallb' && p.kind !== 'ebox' && p.kind !== 'vent') {
      R.q('shadow', p.x, y + 8, { sx: p.r * 1.7 / 44, sy: p.r / 26, alpha: 0.2, layer: L.SHADOW });
    }
    switch (p.kind) {
      case 'barrel': R.q('barrel', p.x, y, { ay: 0.92, layer: L.ENT }); break;
      case 'gen': R.q(p.lit > 0 ? 'generator1' : 'generator0', p.x, y, { ay: 0.92, layer: L.ENT }); if (p.lit > 0) R.q('glow', p.x, y - 14, { sx: 1, sy: 1, tint: '#ffe98a', alpha: 0.25, layer: L.GLOW }); break;
      case 'car': R.q('car', p.x, y, { ay: 0.92, layer: L.ENT, sx: p.rs > 0.5 ? 1 : -1 }); break;
      case 'barr': R.q('barricade', p.x, y, { ay: 0.92, layer: L.ENT, rot: (p.rs - 0.5) * 0.3 }); break;
      case 'rubble': R.q('rubble', p.x, y, { ay: 0.9, layer: L.ENT, rot: p.rs * TAU }); break;
      case 'statue': R.q('statue', p.x, y, { ay: 0.95, layer: L.ENT }); break;
      case 'subway': R.q('subway', p.x, y, { ay: 0.95, layer: L.ENT, sx: p.rs > 0.5 ? 1 : -1 }); break;
      case 'billboard': {
        const lit = Math.sin(G.time * 0.8 + p.rs * 9) > 0.65;
        R.q(lit ? 'billboard1' : 'billboard0', p.x, y, { ay: 0.95, layer: L.ENT, sx: p.rs > 0.5 ? 1 : -1 });
        if (lit) R.q('glow', p.x, y - 20, { sx: 1.4, sy: 1.1, tint: '#ff5ad2', alpha: 0.12, layer: L.GLOW });
        break;
      }
      case 'wallb': R.q(p.spr, p.x, y, { ay: 0.9, layer: L.ENT, rot: p.vert ? Math.PI / 2 : 0 }); break;
      case 'wall0': case 'wall1': case 'wall2': R.q(p.spr, p.x, y, { ay: 0.9, layer: L.ENT }); break;
      case 'storefront': R.q('storefront', p.x, y, { ay: 0.92, layer: L.ENT, sx: p.rs > 0.5 ? 1 : -1 }); break;
      case 'machinery': R.q('machinery', p.x, y, { ay: 0.92, layer: L.ENT, sx: p.rs > 0.5 ? 1 : -1 }); R.q('glow', p.x - 10, y - 16, { sx: 0.5, sy: 0.4, tint: '#54e6ff', alpha: 0.1, layer: L.GLOW }); break;
      case 'pipes': R.q('pipes', p.x, y, { ay: 0.9, layer: L.ENT, rot: p.vert ? Math.PI / 2 : 0 }); break;
      case 'ebox': R.q('ebox', p.x, y, { ay: 0.92, layer: L.ENT }); break;
      case 'vent': R.q('vent', p.x, y, { ay: 0.9, layer: L.ENT }); break;
      case 'fence': R.q('fence', p.x, y, { ay: 0.92, layer: L.ENT, rot: p.rs > 0.5 ? 0 : Math.PI / 2 }); break;
      case 'crate': R.q('crate', p.x, y, { ay: 0.92, layer: L.ENT, rot: (p.rs - 0.5) * 0.4 }); break;
    }
  }
  // small scatter (non-solid, drawn flat)
  for (const p of G.props) {
    if (p.dead || !p.deco || p.kind !== 'scrap') continue;
    R.q(p.spr, p.x, p.y, { ay: 0.85, layer: L.DECAL, rot: p.spr === 'cone' ? 0 : (p.rs - 0.5) * 0.6 });
  }
  // arc nodes (tall, drawn with props ideally; simple overlay fine)
  for (const a of G.arcs) {
    const warn = a.st === 'warn';
    R.q(warn && Math.floor(G.time * 16) % 2 === 0 ? 'arc1' : 'arc0', a.x, a.y, { ay: 0.95, layer: L.ENT });
    if (warn) R.q('glow', a.x, a.y - 22, { sx: 0.8, sy: 0.8, tint: '#ffe98a', alpha: 0.3, layer: L.GLOW });
  }
}
