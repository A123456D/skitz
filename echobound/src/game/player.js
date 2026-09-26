// The Warden (and The Runner): movement, dash, firing, xp, pickups
import { G } from './state.js';
import { I } from '../core/input.js';
import { WEAPONS, fireOnce, beamTick, playerHurt } from './weapons.js';
import { spawnEcho } from './echo.js';
import { hurt } from './enemies.js';
import { FX } from './fx.js';
import { A } from '../core/audio.js';
import { META } from './meta.js';
import { clamp, TAU, angTo } from '../core/util.js';
import { L } from '../render/renderer.js';

export function playerShooter() {
  const P = G.player;
  return { x: P.x, y: P.y, aim: P.aim, weapon: P.weapon, mul: playerMul(), src: 'p', shotN: P.shotCount };
}
export function playerMul() {
  const P = G.player;
  let m = 1;
  if (P.coinBuff > 0) m *= 1.5;
  if (G.owned.mirror) m *= 0.9;
  if (G.ascension === 'thunder') m *= 1.15;
  return m;
}

export function updatePlayer(dt) {
  const P = G.player;
  if (!P.alive) return;
  // aim
  if (META.d.set.auto) {
    let best = null, bd = 1e9;
    for (const e of G.enemies) { if (e.dead) continue; const d = (e.x - P.x) ** 2 + (e.y - P.y) ** 2; if (d < bd) { bd = d; best = e; } }
    if (best) P.aim = angTo(P.x, P.y, best.x, best.y);
    else P.aim = I.aimWorld(G);
  } else {
    P.aim = I.aimWorld(G);
  }
  // move
  const [mx, my] = I.moveAxis();
  const slowZ = zoneSlowPlayer(P);
  let spd = P.speed * slowZ;
  if (P.dashT > 0) {
    P.dashT -= dt;
    spd = P.speed * 3.6 * slowZ;
    P.vx = Math.cos(P.dashA) * spd; P.vy = Math.sin(P.dashA) * spd;
    FX.trailDot(P.x, P.y - 6, '#7de6ff', 3, 0.3);
    if (G.syn.dashburn && Math.random() < 0.6) G.wells.push({ x: P.x, y: P.y, t: 2, dur: 2, r: 24, pull: 0, dps: 12, fire: true, src: 'player' });
  } else {
    P.vx = mx * spd; P.vy = my * spd;
  }
  const ox = P.x, oy = P.y;
  P.x += P.vx * dt; P.y += P.vy * dt;
  if (P.dashT <= 0 && (mx || my)) {
    P.travel += Math.hypot(P.x - ox, P.y - oy);
    if (mx < -0.1) G.profile.left += dt; else if (mx > 0.1) G.profile.right += dt;
  }
  // runner: velocity echo every 450u
  if (P.char === 'runner' && P.travel - P.runnerEchoT > 450) {
    P.runnerEchoT = P.travel;
    spawnRunnerEcho();
  }
  // bounds + solids
  const h = G.env.half;
  P.x = clamp(P.x, -h, h); P.y = clamp(P.y, -h, h);
  pushOutOfSolids(P);
  // dash trigger
  if (I.dashPressed() && P.dashCd <= 0 && (mx || my || true)) {
    P.dashA = (mx || my) ? Math.atan2(my, mx) : P.aim;
    P.dashT = 0.22; P.dashCd = P.char === 'runner' ? 1.0 : 1.6; P.iT = Math.max(P.iT, 0.4);
    A.sfx('dash'); FX.burst(P.x, P.y, 8, { col: '#7de6ff', spd: 120, life: 0.3 });
    if (G.owned.longstride) {
      const out = [];
      G.eh.query(P.x, P.y, 60, out);
      for (const e of out) if (!e.dead && Math.hypot(e.x - P.x, e.y - P.y) < 60 + e.r) hurt(e, 45, { src: 'player', kb: 120 });
    }
  }
  P.dashCd = Math.max(0, P.dashCd - dt);
  P.iT = Math.max(0, P.iT - dt);
  P.hurtFlash = Math.max(0, P.hurtFlash - dt);
  // fire
  if (I.firing()) {
    const s = WEAPONS[P.weapon];
    if (s.mode === 'beam') {
      P.beamOn = true;
      beamTick(playerShooter(), dt);
    } else {
      P.cd = (P.cd || 0) - dt;
      if (P.cd <= 0) {
        P.cd = s.cd;
        P.shotCount++;
        P.firedThisTick++;
        fireOnce(playerShooter());
      }
    }
  } else P.cd = Math.min((P.cd || 0), 0.06); // ready quickly when releasing
  // hourglass relic
  if (G.owned.hourglass) {
    G.hourT = (G.hourT ?? 24) - dt;
    if (G.hourT <= 0) { G.hourT = 30; G.hourActive = 3; FX.flash(0.2, '#9fd8ff'); A.sfx('echo'); FX.ring(P.x, P.y, 200, '#9fd8ff'); }
    G.hourActive = Math.max(0, (G.hourActive || 0) - dt);
  }
  // coin relic
  P.coinBuff = (G.owned.coin && P.hp < P.maxHp * 0.25) ? 1 : 0;
  // profile: distance band to nearest enemy
  let nd = 1e9;
  for (const e of G.enemies) { if (e.dead) continue; const d = (e.x - P.x) ** 2 + (e.y - P.y) ** 2; if (d < nd) nd = d; }
  nd = Math.sqrt(nd);
  if (nd < 120) G.profile.near += dt; else if (nd < 300) G.profile.mid += dt; else G.profile.far += dt;
  // pickups
  collectPickups(dt);
}

function hurtProxy(e, dmg) {
  // small local import-cycle break: use weapons.hurt lazily
  import('./enemies.js').then((m) => m.hurt(e, dmg, { src: 'player', kb: 120 }));
}
export function updateOrbit(dt) {
  if (!G.owned.orbit || !G.player.alive) { G.orbPos = null; return; }
  G.orbA = (G.orbA || 0) + dt * 2.6;
  G.orbPos = [];
  for (let i = 0; i < 3; i++) {
    const a = G.orbA + i * TAU / 3;
    const ox = G.player.x + Math.cos(a) * 54, oy = G.player.y + Math.sin(a) * 54;
    G.orbPos.push({ x: ox, y: oy });
    const out = [];
    G.eh.query(ox, oy, 20, out);
    for (const e of out) {
      if (e.dead) continue;
      if (Math.hypot(e.x - ox, e.y - oy) < e.r + 8 && (!e.orbT || G.time - e.orbT > 0.3)) {
        e.orbT = G.time;
        hurt(e, 16, { src: 'player', kb: 100 });
      }
    }
  }
}
function zoneSlowPlayer(P) {
  for (const z of G.zones) if (z.active && Math.abs(P.x - z.x) < z.w / 2 && Math.abs(P.y - z.y) < z.h / 2) return 0.45;
  return 1;
}
export function pushOutOfSolids(o) {
  for (const pr of G.props) {
    if (!pr.solid || pr.dead) continue;
    const d = Math.hypot(o.x - pr.x, o.y - pr.y), rr = pr.r + (o.r || 10);
    if (d < rr && d > 0.001) {
      const push = (rr - d);
      o.x += ((o.x - pr.x) / d) * push; o.y += ((o.y - pr.y) / d) * push;
    }
  }
}

function spawnRunnerEcho() {
  const frames = G.rec.frames.slice(-180);
  if (frames.length < 30) return;
  G.echoes.push({
    frames, t: 0, dur: frames.length, weapon: G.player.weapon,
    mods: { dmgMul: 0.45, speedMul: 2.2, reversed: false, permanent: false, trailFire: !!G.syn.afterburn, trailShock: G.ascension === 'thunder', rhythm: false, returnShot: false },
    rhythm: { count: 0 }, trailT: 0, paraT: 0, hostile: false, hp: 0, dead: false, glitch: Math.random(), age: 0, vel: true,
  });
  G.stats.echoes++;
  FX.ring(G.player.x, G.player.y, 70, '#ff5ad2');
  A.sfx('echo');
}

export function addXp(v) {
  const P = G.player;
  P.xp += v;
  G.stats.shards += v;
  while (P.xp >= P.xpNext) {
    P.xp -= P.xpNext;
    P.level++;
    P.xpNext = Math.round(5 + P.level * 3 + P.level * P.level * 0.35);
    G.pendingLevels++;
  }
}

function collectPickups(dt) {
  const P = G.player;
  const mag = 90 * (1 + (G.owned.magnet ? 0.6 : 0));
  for (let i = G.pickups.length - 1; i >= 0; i--) {
    const k = G.pickups[i];
    const d = Math.hypot(P.x - k.x, P.y - k.y);
    if (d < mag || k.pull) {
      const a = angTo(k.x, k.y, P.x, P.y);
      const f = k.pull ? 900 : 700 * (1 - d / mag);
      k.x += Math.cos(a) * f * dt; k.y += Math.sin(a) * f * dt;
    }
    if (d < 20) {
      if (k.kind === 'shard') { addXp(k.v); A.sfx('pickup'); }
      else if (k.kind === 'heart') { P.hp = Math.min(P.maxHp, P.hp + 25); A.sfx('levelup'); FX.ring(P.x, P.y, 50, '#7dff9b', 0.3); }
      else if (k.kind === 'story') { const msg = META.event('story_found') || 'MEMORY FRAGMENT'; META.lastStory = msg; A.sfx('levelup'); FX.flash(0.15, '#ffd75e'); }
      G.pickups[i] = G.pickups[G.pickups.length - 1]; G.pickups.pop();
    }
  }
}

export function drawPlayer(R) {
  const P = G.player;
  if (!P.alive) return;
  const invisible = !!G.owned.theMirror;
  const alpha = invisible ? 0.16 : 1;
  R.q('shadow', P.x, P.y + 10, { sx: 0.75, sy: 0.75, alpha: 0.26, layer: L.SHADOW });
  R.q('ring', P.x, P.y + 6, { sx: 30 * 2 / (64 * 3), sy: 30 * 2 / (64 * 3), tint: '#54e6ff', alpha: 0.14, layer: L.DECAL });
  // dash trail ghosts
  if (P.dashT > 0) R.q('ghost', P.x - Math.cos(P.dashA) * 18, P.y - Math.sin(P.dashA) * 18, { tint: '#7de6ff', alpha: 0.3, ay: 0.92, layer: L.ENT });
  const spr = P.char === 'runner' ? 'runner' : 'warden';
  const bob = (P.vx || P.vy) && P.dashT <= 0 ? Math.sin(G.time * 14) * 1.5 : 0;
  const flip = Math.cos(P.aim) < 0 ? -1 : 1;
  R.q(spr, P.x, P.y + bob, { sx: flip, ay: 0.92, alpha, layer: L.ENT, tint: P.hurtFlash > 0 ? '#ff8a8a' : '#ffffff' });
  R.q('glow', P.x, P.y - 12, { sx: 0.9, sy: 0.9, tint: '#54e6ff', alpha: 0.34, layer: L.GLOW });
  // aim line
  if (META.d.set.aimline && !invisible) {
    for (let i = 1; i <= 3; i++) {
      const d = 34 + i * 22;
      R.q('trail', P.x + Math.cos(P.aim) * d, P.y + Math.sin(P.aim) * d, { sx: 0.8, sy: 0.8, tint: '#54e6ff', alpha: 0.25 - i * 0.05, layer: L.OVER });
    }
  }
  if (P.iT > 0 && Math.floor(G.time * 20) % 2 === 0) {
    R.q('ring', P.x, P.y, { sx: 34 * 2 / (64 * 3), sy: 34 * 2 / (64 * 3), tint: '#bfe9ff', alpha: 0.5, layer: L.OVER });
  }
  if (P.coinBuff) R.q('glow', P.x, P.y, { sx: 1.4, sy: 1.4, tint: '#ff5a5a', alpha: 0.12, layer: L.GLOW });
}
