// THE ECHO SYSTEM: record the last N seconds, replay them as fighting ghosts.
import { G, ECHO_PERIOD } from './state.js';
import { fireOnce, beamTick } from './weapons.js';
import { hurt } from './enemies.js';
import { FX } from './fx.js';
import { A } from '../core/audio.js';
import { META } from './meta.js';
import { lerp, rand, angTo } from '../core/util.js';

export function echoSlots() { return 3 + (G.owned.overflow ? 1 : 0) + (G.owned.chrono ? 1 : 0); }
export function echoPeriod() { return G.owned.twinEcho ? 420 : G.owned.chrono ? 480 : ECHO_PERIOD; }
export function echoDur() { return G.owned.chrono ? 720 : echoPeriod(); }

export function tickRecorder() {
  const P = G.player;
  G.rec.frames.push({ x: P.x, y: P.y, aim: P.aim, f: P.firedThisTick, b: P.beamOn ? 1 : 0 });
  while (G.rec.frames.length > echoPeriod()) G.rec.frames.shift();
  P.firedThisTick = 0; P.beamOn = false;
  // cadence: every period ticks, the last recording comes back as an Echo
  G.rec.n = (G.rec.n || 0) + 1;
  if (G.rec.n >= echoPeriod()) {
    G.rec.n = 0;
    spawnEcho();
  }
}

function echoMods() {
  return {
    dmgMul: 0.6 * (1 + (G.owned.predMemory || 0) * 0.18) * (1 + (G.owned.overflow ? 0.1 : 0)) * (1 + (G.owned.theMirror ? 0.25 : 0)) * (1 + synVelocityBonus()),
    speedMul: (G.syn.velocity ? 1.3 : 1) * (G.owned.chrono ? echoPeriod() / echoDur() : 1),
    reversed: !!G.owned.rewind,
    permanent: !!G.owned.redbutton,
    trailFire: !!G.syn.afterburn || G.ascension === 'thunder',
    trailShock: G.ascension === 'thunder',
    rhythm: !!G.owned.brokenRhythm,
    returnShot: !!G.owned.mirrorShot,
  };
}
function synVelocityBonus() { return G.syn.velocity ? Math.min(0.3, (G.player.speed - 240) / 240 * 0.3 + 0.1) : 0; }

let bannerRef = null;
export function setBanner(fn) { bannerRef = fn; }

export function spawnEcho(framesOverride) {
  if (G.flags.dead || G.flags.won) return;
  const frames = framesOverride || G.rec.frames.slice();
  if (frames.length < 30) return;
  // slot cap: recycle oldest non-hostile
  const mine = G.echoes.filter((e) => !e.hostile && !e.dead);
  if (mine.length >= echoSlots()) {
    const old = mine[0];
    old.dead = true; old.fade = 0.25;
    FX.burst(old.x, old.y, 8, { col: '#54e6ff', spd: 80, life: 0.4, size: 2 });
  }
  G.echoes.push({
    frames, t: 0, dur: frames.length, weapon: G.player.weapon,
    mods: echoMods(), rhythm: { count: 0 }, trailT: 0, paraT: 0,
    hostile: false, hp: 0, dead: false, glitch: rand(0, 1), age: 0,
  });
  G.stats.echoes++;
  A.sfx('echo');
  FX.ring(G.player.x, G.player.y, 90, '#54e6ff');
  FX.burst(G.player.x, G.player.y, 14, { col: '#54e6ff', spd: 140, life: 0.5, size: 2 });
  if (G.stats.echoes === 1) { META.event('echo_first'); bannerRef && bannerRef('YOUR PAST JOINS THE FIGHT', 'IT REPEATS YOUR LAST 10 SECONDS'); }
  if (G.stats.echoes === 10) { META.event('echo_ten'); }
}

export function convertHostile(e, buff = 1) {
  if (e.hostile || e.dead) return;
  e.hostile = true; e.hp = 260 * buff; e.maxHp = e.hp; e.fade = 0;
  FX.flash(0.15, '#ff5a5a');
  FX.ring(e.x, e.y, 60, '#ff5a5a');
  A.sfx('adapt');
}

function shooterFor(e, frame) {
  return {
    x: e.x, y: e.y,
    aim: e.hostile ? angTo(e.x, e.y, G.player.x, G.player.y) : frame.aim,
    weapon: e.weapon, mul: e.mods.dmgMul, src: e.hostile ? 'ehost' : 'echo', echo: e, echoRhythm: e.mods.rhythm ? e.rhythm : null, shotN: e.rhythm.count,
  };
}

function inSuppress(x, y) {
  for (const m of G.enemies) {
    if (m.type !== 'mourner' || m.dead) continue;
    if ((m.x - x) ** 2 + (m.y - y) ** 2 < 150 * 150) return true;
  }
  return false;
}
function zoneSlowAt(x, y) {
  for (const z of G.zones) {
    if (z.active && Math.abs(x - z.x) < z.w / 2 && Math.abs(y - z.y) < z.h / 2) return 0.35;
  }
  return 1;
}

export function updateEchoes(dt) {
  for (let i = G.echoes.length - 1; i >= 0; i--) {
    const e = G.echoes[i];
    if (e.dead) {
      e.fade = (e.fade ?? 0.3) - dt;
      if (e.fade <= 0) G.echoes.splice(i, 1);
      continue;
    }
    e.age += dt;
    const sup = !e.hostile && inSuppress(e.x, e.y);
    const zs = zoneSlowAt(e.x, e.y);
    e.suppressed = sup;
    if (!sup) e.t += dt * 60 * e.mods.speedMul * zs;
    // afterimage buffer
    e.trailT2 = (e.trailT2 || 0) - dt;
    if (e.trailT2 <= 0) {
      e.trailT2 = 0.05;
      e.hist = e.hist || [];
      e.hist.push({ x: e.x, y: e.y });
      if (e.hist.length > 5) e.hist.shift();
    }
    const fr = e.frames;
    const idx = e.mods.reversed ? fr.length - 1 - e.t : e.t;
    const i0 = Math.max(0, Math.min(fr.length - 1, Math.floor(idx)));
    const i1 = Math.min(fr.length - 1, i0 + 1);
    const tt = Math.min(1, idx - i0);
    const f0 = fr[i0], f1 = fr[i1];
    e.x = lerp(f0.x, f1.x, tt); e.y = lerp(f0.y, f1.y, tt); e.aim = f0.aim;
    e.moving = Math.hypot(f1.x - f0.x, f1.y - f0.y) > 0.4;
    if (!e.spawnFx && e.age > 0.02) { e.spawnFx = 1; }
    // trail pools
    if ((e.mods.trailFire || e.mods.trailShock) && e.moving) {
      e.trailT -= dt;
      if (e.trailT <= 0) {
        e.trailT = 0.5;
        if (e.mods.trailFire) G.wells.push({ x: e.x, y: e.y, t: 2.5, dur: 2.5, r: 26, pull: 0, dps: 14, fire: true, src: 'echo' });
        else G.wells.push({ x: e.x, y: e.y, t: 1.6, dur: 1.6, r: 30, pull: 0, dps: 22, shock: true, src: 'echo' });
      }
    }
    // attacks
    if (!sup && !e.dead) {
      if (f0.f > 0) {
        for (let k = 0; k < f0.f; k++) {
          e.rhythm.count++;
          const sh = shooterFor(e, f0);
          const saveMul = e.mods.dmgMul;
          fireOnce({ ...sh, shotN: e.rhythm.count });
          // mirror shot: last bullet spawned gains return behavior
          if (e.mods.returnShot && G.bullets.length) {
            const b = G.bullets[G.bullets.length - 1];
            if (b.echo === e) b.returnT = 0.4;
          }
          if (e.hostile) break; // hostiles fire slower (once per tick max)
        }
      }
      if (f0.b) beamTick(shooterFor(e, f0), dt);
    }
    // hostile echoes are killable
    if (e.hostile) {
      if (e.hp <= 0) {
        e.dead = true; e.fade = 0.3;
        FX.burst(e.x, e.y, 18, { col: '#ff5a5a', spd: 200, life: 0.5 });
        FX.shake(0.25); A.sfx('pop');
      }
    }
    // expiry
    if (e.t >= e.dur) {
      e.dead = true; e.fade = 0.3;
      if (G.owned.secondDeath) {
        explodeEcho(e);
      } else {
        FX.burst(e.x, e.y, 10, { col: e.hostile ? '#ff5a5a' : '#54e6ff', spd: 90, life: 0.4, size: 2 });
      }
    }
  }
  // paradox: overlapping echoes merge
  if (G.owned.paradox) {
    const live = G.echoes.filter((e) => !e.dead && !e.hostile);
    for (let a = 0; a < live.length; a++) for (let b = a + 1; b < live.length; b++) {
      const ea = live[a], eb = live[b];
      if (ea.dead || eb.dead) continue;
      if ((ea.x - eb.x) ** 2 + (ea.y - eb.y) ** 2 < 30 * 30) {
        ea.paraT = (ea.paraT || 0) + 1 / 60; eb.paraT = ea.paraT;
        if (ea.paraT > 0.8) {
          ea.paraT = 0;
          eb.dead = true; eb.fade = 0.2;
          ea.mods = { ...ea.mods, dmgMul: ea.mods.dmgMul + eb.mods.dmgMul * 0.9, speedMul: Math.max(ea.mods.speedMul, eb.mods.speedMul) * 1.15 };
          ea.t = Math.min(ea.t, eb.t); ea.dur = Math.max(ea.dur, eb.dur);
          FX.flash(0.2, '#ff5ad2'); FX.ring(ea.x, ea.y, 90, '#ff5ad2');
          FX.burst(ea.x, ea.y, 24, { col: '#ff5ad2', spd: 220, life: 0.6 });
          A.sfx('ascend');
          FX.shake(0.3);
        }
      }
    }
  }
}
function explodeEcho(e) {
  const out = [];
  G.eh.query(e.x, e.y, 130, out);
  for (const t of out) if (!t.dead && Math.hypot(t.x - e.x, t.y - e.y) < 130 + t.r) hurt(t, 60 * e.mods.dmgMul * 2, { src: 'echo', kb: 200 });
  FX.ring(e.x, e.y, 130, '#54e6ff');
  FX.burst(e.x, e.y, 26, { col: '#54e6ff', spd: 300, life: 0.6 });
  FX.shake(0.4); A.sfx('boom');
}

export function drawEchoes(R) {
  for (const e of G.echoes) {
    if (e.dead && (e.fade ?? 0) <= 0) continue;
    const baseA = e.hostile ? 0.72 : 0.6;
    const tint = e.hostile ? '#ff7070' : '#7de6ff';
    const glowC = e.hostile ? '#ff5a5a' : '#54e6ff';
    e.glitch += 0.016;
    // materialize: stretch up from the ground on spawn; implode on death
    let sy = 1, sx = 1;
    if (e.age < 0.28) { const k = e.age / 0.28; sy = 0.15 + 0.85 * (1 - (1 - k) * (1 - k)); sx = 1.25 - 0.25 * k; }
    if (e.dead) { const k = Math.max(0, (e.fade ?? 0) / 0.3); sx = k; sy = k; }
    // temporal ground sigil
    R.q('ring', e.x, e.y + 8, { sx: 26 * 2 / (64 * 3), sy: 26 * 2 / (64 * 3), tint: glowC, alpha: 0.18 + Math.sin(G.time * 6 + e.glitch * 7) * 0.06, layer: 6 });
    // afterimages
    if (e.hist && e.moving && !e.dead) {
      for (let i = 0; i < e.hist.length; i++) {
        const h = e.hist[i];
        R.q('ghost', h.x, h.y, { tint: glowC, alpha: 0.07 * (i + 1), ay: 0.92, sy, layer: 6 });
      }
    }
    // frame displacement glitch
    const gx = Math.sin(e.glitch * 40) > 0.9 ? rand(-3, 3) : 0;
    const gy = Math.sin(e.glitch * 33) > 0.94 ? rand(-2, 2) : 0;
    const A0 = baseA * (e.suppressed ? 0.35 : 1) * (e.dead ? Math.max(0, (e.fade ?? 0) / 0.3) : 1);
    R.q('ghost' + (e.moving ? 2 + (Math.floor(G.time * 12) % 4) : (Math.floor(G.time * 2) % 2)), e.x + gx, e.y + gy, { tint, alpha: A0, ay: 0.92, sx: sx * (Math.sin(e.glitch * 40) > 0.9 ? 1.08 : 1), sy, layer: 7 });
    // echo weapon rotates to its recorded aim
    if (!e.dead) {
      const wpn = e.weapon === 'widow' ? 'wp_widow' : e.weapon === 'sun' ? 'wp_sun' : 'wp_grave';
      const ef = Math.cos(e.aim) < 0 ? -1 : 1;
      R.q(wpn, e.x + Math.cos(e.aim) * 15, e.y - 5 + Math.sin(e.aim) * 5, { rot: e.aim, sy: ef, alpha: A0, layer: 7, tint: e.hostile ? '#ff9090' : '#9fe8ff' });
    }
    // hologram scanline sweeping the silhouette
    if (!e.dead) {
      const scan = ((G.time * 46 + e.glitch * 60) % 30) - 8;
      R.q('beam', e.x + gx, e.y - 24 + scan, { sx: 26 / (32 * 3), sy: 1.4 / (8 * 3), tint: '#d8f6ff', alpha: 0.34 * A0 * (e.suppressed ? 0.4 : 1), layer: 9 });
    }
    R.q('glow', e.x, e.y - 10, { sx: 1.05, sy: 1.05, tint: glowC, alpha: 0.2 * A0, layer: 9 });
    if (e.suppressed) R.text('X', e.x, e.y - 44, { s: 2, col: '#9aa3b5', alpha: 0.8, align: 'center', layer: 10 });
  }
}
