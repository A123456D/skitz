// The Clockwork Saint (mini, 6:30) and The Hollow King (final, 12:30)
import { G } from './state.js';
import { spawnEnemy, spawnEnemyBullet, ENEMY_DEF } from './enemies.js';
import { convertHostile } from './echo.js';
import { playerHurt } from './weapons.js';
import { FX } from './fx.js';
import { A } from '../core/audio.js';
import { META } from './meta.js';
import { TAU, rand, angTo, clamp, lerp } from '../core/util.js';

let bannerRef = null;
export function setBanner(fn) { bannerRef = fn; }
const banner = (t, s) => bannerRef && bannerRef(t, s);

function bossBase(type, x, y, hp) {
  const e = {
    id: G.nextId++, boss: true, type, x, y, vx: 0, vy: 0, kbx: 0, kby: 0,
    r: type === 'saint' ? 34 : 38, hp, maxHp: hp, spd: 60, dmg: 18,
    xp: 40, cost: 0, spr: type, scale: 1, elite: null,
    t: 0, stT: 0, atkT: 0, atk2T: 0, flash: 0, dead: false,
    dots: { burn: 0, bleed: 0, poison: 0 }, dotT: { burn: 0, bleed: 0, poison: 0 },
    marked: 0, buffed: false, facing: 1, shield: 0, critRes: 0, echoRes: 0, burnImmune: false,
    phase: 1, orbA: 0, stolen: 0, slam: null,
  };
  G.enemies.push(e);
  return e;
}

export function spawnSaint() {
  const e = bossBase('saint', G.player.x + Math.cos(rand(0, TAU)) * 500, G.player.y + Math.sin(rand(0, TAU)) * 500, 4200);
  G.boss = e;
  banner('THE CLOCKWORK SAINT', 'IT REMEMBERS EVERY LOOP');
  A.sfx('boss'); A.setBoss(true);
  FX.shake(0.6); FX.flash(0.3, '#ffd75e');
  return e;
}

export function spawnHK() {
  const e = bossBase('hk', G.player.x + Math.cos(rand(0, TAU)) * 520, G.player.y + Math.sin(rand(0, TAU)) * 520, 3400);
  e.res = 0;
  G.boss = e;
  banner('THE HOLLOW KING', '"YOU HAVE KILLED ME HUNDREDS OF TIMES."');
  META.event('hk_seen');
  A.sfx('boss'); A.setBoss(true);
  FX.shake(0.7); FX.flash(0.35, '#ff5a5a');
  return e;
}

export function bossDied(e) {
  if (e.type === 'saint') {
    G.boss = null;
    A.setBoss(false);
    banner('THE SAINT WINDS DOWN', 'RELIC CHOICE INCOMING');
    META.event('saint_dead');
    G.pendingRelic = true;
    FX.slowmo(1.2); FX.flash(0.5, '#ffd75e'); FX.shake(0.8);
    for (let i = 0; i < 5; i++) FX.burst(e.x + rand(-30, 30), e.y + rand(-30, 30), 20, { col: '#ffd75e', spd: 300, life: 0.8 });
  } else if (e.type === 'hk') {
    if ((e.res || 0) < 2) {
      // resurrection
      e.res++;
      e.dead = false;
      e.maxHp = 3400 * (1 + e.res * 0.45);
      e.hp = e.maxHp;
      e.phase = 1 + e.res;
      e.iT = 1; e.invulnT = 1.2;
      dialogue();
      FX.flash(0.4, '#ff5a5a'); FX.shake(0.7); A.sfx('boss');
      FX.ring(e.x, e.y, 200, '#ff5a5a');
      if (e.res === 2) { for (let i = 0; i < 2; i++) spawnEnemy('mirror', e.x + rand(-120, 120), e.y + rand(-120, 120)); banner('THE HOLLOW KING RISES', '"I HAVE STARTED LEAVING NOTES."'); }
      return;
    }
    // final death -> victory
    G.boss = null;
    A.setBoss(false);
    G.flags.won = true;
    META.event('victory');
    banner('THE FRACTURE HOLDS ITS BREATH', 'THE FIRST MOMENT AWAITS');
    FX.slowmo(2.5); FX.flash(0.8, '#ffffff'); FX.shake(1);
    for (let i = 0; i < 8; i++) FX.burst(e.x + rand(-40, 40), e.y + rand(-40, 40), 24, { col: '#e8ecf4', spd: 340, life: 1.2 });
  }
}
function dialogue() {
  const p = G.profile;
  const lines = [];
  if (p.left / p.right > 1.5) lines.push('"YOU ALWAYS STRAFE LEFT."');
  else if (p.right / p.left > 1.5) lines.push('"YOU ALWAYS STRAFE RIGHT."');
  if (p.near / (p.mid + p.far) > 1.2) lines.push('"YOU HUG ME. DAREDEVIL."');
  if (p.far / (p.near + p.mid) > 1.2) lines.push('"KEEP YOUR DISTANCE. COWARD\'S RHYTHM."');
  if (p.echo > p.shots) lines.push('"EVEN YOUR PAST IS LOUDER THAN YOU."');
  const pick = lines.length ? lines[(Math.random() * lines.length) | 0] : '"AGAIN. IT IS ALWAYS AGAIN WITH YOU."';
  banner('THE HOLLOW KING RISES · x' + (G.boss && G.boss.res ? G.boss.res : 1), pick);
  G.hkDialog = { txt: pick, t: 4 };
}

export function updateBoss(dt) {
  const e = G.boss;
  if (!e || e.dead) { updateZones(dt); updateLances(dt); return; }
  if (e.invulnT > 0) e.invulnT -= dt;
  e.t += dt; e.flash = Math.max(0, e.flash - dt);
  const P = G.player;
  const toP = angTo(e.x, e.y, P.x, P.y);
  const frac = e.hp / e.maxHp;
  // movement: strafe orbit
  e.orbA += dt * 0.5;
  const want = 280;
  const a = toP + Math.PI + Math.sin(e.orbA) * 0.7;
  e.x += (Math.cos(a) * e.spd + Math.cos(toP) * (Math.hypot(P.x - e.x, P.y - e.y) - want) * 0.8) * dt;
  e.y += (Math.sin(a) * e.spd + Math.sin(toP) * (Math.hypot(P.x - e.x, P.y - e.y) - want) * 0.8) * dt;
  if (Math.abs(Math.cos(toP)) > 0.1) e.facing = Math.cos(toP) > 0 ? 1 : -1;

  if (e.type === 'saint') {
    const ph = frac > 0.75 ? 1 : frac > 0.5 ? 2 : frac > 0.25 ? 3 : 4;
    if (ph !== e.phase) {
      e.phase = ph;
      banner('THE SAINT · PHASE ' + ph, ['IT SUMMONS THE WORKS', 'TIME STOPS FOR YOU, NOT IT', 'IT COPIES YOUR ECHOES', 'IT TAKES WHAT IS YOURS'][ph - 1]);
      FX.flash(0.25, '#ffd75e'); A.sfx('boss');
    }
    e.atkT += dt; e.atk2T += dt;
    if (ph === 1) {
      if (e.atkT > 3.2) { e.atkT = 0; radial(e, 12, 240, e.dmg * 0.6, 'gear'); }
      if (e.atk2T > 6) { e.atk2T = 0; for (let i = 0; i < 3; i++) spawnEnemy('clockadd', e.x + rand(-60, 60), e.y + rand(-60, 60)); }
    } else if (ph === 2) {
      if (e.atkT > 3.4) {
        e.atkT = 0;
        for (let i = 0; i < 2; i++) G.zones.push({ x: P.x + rand(-220, 220), y: P.y + rand(-220, 220), w: 240, h: 240, t: 0.8, warn: 0.8, dur: 3 });
      }
      if (e.atk2T > 0.16) { e.atk2T = 0; e.spiral = (e.spiral || 0) + 0.5; spawnEnemyBullet(e.x, e.y, e.spiral, 190, e.dmg * 0.5, 'gear', 6); spawnEnemyBullet(e.x, e.y, e.spiral + Math.PI, 190, e.dmg * 0.5, 'gear', 6); }
    } else if (ph === 3) {
      if (e.atkT > 3) { e.atkT = 0; fan(e, toP, 5, 0.22, 300, e.dmg * 0.6, 'orb'); }
      if (e.atk2T > 5) {
        e.atk2T = 0;
        const mine = G.echoes.filter((x) => !x.dead && !x.hostile).slice(0, 3);
        for (const src of mine) {
          G.echoes.push({ frames: src.frames.slice(), t: src.t, dur: src.dur, weapon: src.weapon, mods: { ...src.mods, dmgMul: 0.35, permanent: false }, rhythm: { count: 0 }, trailT: 0, paraT: 0, hostile: true, hp: 300, maxHp: 300, dead: false, glitch: Math.random(), age: 0 });
        }
        if (mine.length) { banner('', 'YOUR ECHOES, TURNED'); A.sfx('adapt'); }
      }
    } else {
      if (e.atkT > 4 && !e.slam) {
        e.atkT = 0;
        const mine = G.echoes.filter((x) => !x.dead && !x.hostile);
        if (mine.length) { convertHostile(mine[mine.length - 1], 1.4); }
        e.slam = { x: e.x, y: e.y, ang: toP, t: 0.9 };
        banner('', 'IT TAKES WHAT IS YOURS');
      }
      if (e.atk2T > 3) { e.atk2T = 0; radial(e, 16, 220, e.dmg * 0.5, 'orb'); }
    }
    // slam execution
    if (e.slam) {
      e.slam.t -= dt;
      if (e.slam.t <= 0) {
        const s = e.slam; e.slam = null;
        e.slamV = { ang: s.ang, t: 0.4 };
        FX.ring(e.x, e.y, 80, '#ffd75e');
      }
    }
    if (e.slamV) {
      e.slamV.t -= dt;
      e.x += Math.cos(e.slamV.ang) * 700 * dt; e.y += Math.sin(e.slamV.ang) * 700 * dt;
      FX.burst(e.x, e.y, 2, { col: '#ffd75e', spd: 60, life: 0.3 });
      if (Math.hypot(P.x - e.x, P.y - e.y) < e.r + P.r + 6) playerHurt(e.dmg * 1.5);
      if (e.slamV.t <= 0) e.slamV = null;
    }
  } else {
    // HOLLOW KING
    const spdMul = 1 + (e.res || 0) * 0.3;
    e.atkT += dt; e.atk2T += dt; e.atk3T = (e.atk3T || 0) + dt;
    if (e.atkT > 6.5 / spdMul) {
      e.atkT = 0;
      for (let i = 0; i < 5 + e.res * 2; i++) spawnEnemy(Math.random() < 0.5 ? 'husk' : 'clockadd', e.x + rand(-140, 140), e.y + rand(-140, 140));
      banner('', 'THE PROCESSION MARCHES');
    }
    if (e.atk2T > 4 / spdMul) {
      e.atk2T = 0;
      const n = 3 + e.res;
      for (let i = 0; i < n; i++) {
        const ang = toP + (i - (n - 1) / 2) * 0.3;
        G.lances.push({ x: e.x, y: e.y, ang, w: 64, len: 560, t: 0.9, warn: 0.9 });
      }
      A.sfx('crack');
    }
    if (e.atk3T > 7 / spdMul) {
      e.atk3T = 0;
      if (Math.random() < 0.5) {
        // crown: contracting ring
        for (let i = 0; i < 22; i++) {
          const a = i / 22 * TAU;
          spawnEnemyBullet(e.x + Math.cos(a) * 380, e.y + Math.sin(a) * 380, a + Math.PI + Math.PI / 2 * 0.12, 170, e.dmg * 0.5, 'orb', 5, 4);
        }
        A.sfx('shoot_widow');
      } else {
        // grave pull: hostile wells
        for (let i = 0; i < 2 + e.res; i++) G.wells.push({ x: P.x + rand(-260, 260), y: P.y + rand(-260, 260), t: 2.4, dur: 2.4, r: 130, pull: 420, dps: 6, hostile: true });
        A.sfx('echo');
      }
    }
  }
  // contact
  if (P.alive && P.iT <= 0 && Math.hypot(P.x - e.x, P.y - e.y) < P.r + e.r) playerHurt(e.dmg * 0.8);
  updateZones(dt);
  updateLances(dt);
}

function radial(e, n, spd, dmg, spr) {
  for (let i = 0; i < n; i++) spawnEnemyBullet(e.x, e.y, i / n * TAU + (e.orbA || 0), spd, dmg, spr, 6);
  A.sfx('shoot_gc');
}
function fan(e, aim, n, spread, spd, dmg, spr) {
  for (let i = 0; i < n; i++) spawnEnemyBullet(e.x, e.y, aim + (i - (n - 1) / 2) * spread, spd, dmg, spr, 5);
}

function updateZones(dt) {
  for (let i = G.zones.length - 1; i >= 0; i--) {
    const z = G.zones[i];
    if (!z.active) {
      z.t -= dt;
      if (z.t <= 0) { z.active = true; z.t = z.dur; FX.ring(z.x, z.y, 140, '#9fd8ff'); A.sfx('echo'); }
    } else {
      z.t -= dt;
      if (z.t <= 0) G.zones.splice(i, 1);
    }
  }
}
function updateLances(dt) {
  for (let i = G.lances.length - 1; i >= 0; i--) {
    const l = G.lances[i];
    l.t -= dt;
    if (l.t <= 0) {
      // fire line
      const P = G.player;
      const dx = Math.cos(l.ang), dy = Math.sin(l.ang);
      const rx = P.x - l.x, ry = P.y - l.y;
      const t = clamp(rx * dx + ry * dy, 0, l.len);
      const px = l.x + dx * t, py = l.y + dy * t;
      const dd = Math.hypot(P.x - px, P.y - py);
      if (dd < l.w / 2 + P.r && P.alive) playerHurt(22);
      FX.burst(px, py, 8, { col: '#ff5a5a', spd: 200, life: 0.4 });
      FX.shake(0.2); A.sfx('boom');
      G.lances.splice(i, 1);
    }
  }
}

export function drawBossExtras(R) {
  // time-stop zones
  for (const z of G.zones) {
    const a = z.active ? 0.16 + Math.sin(G.time * 6) * 0.05 : 0.1 + Math.sin(G.time * 10) * 0.08;
    R.q('tele', z.x - z.w / 2, z.y - z.h / 2, { sx: z.w / (64 * 3), sy: z.h / (64 * 3), tint: z.active ? '#9fd8ff' : '#ff8a5a', alpha: a, layer: 8, ax: 0, ay: 0 });
  }
  // hollow lances
  for (const l of G.lances) {
    const mx = l.x + Math.cos(l.ang) * l.len / 2, my = l.y + Math.sin(l.ang) * l.len / 2;
    const w = l.w * (1 - l.t / l.warn * 0.4);
    R.q('beam', mx, my, { rot: l.ang, sx: l.len / (32 * 3), sy: w / (8 * 3), tint: '#ff5a5a', alpha: 0.25 + (1 - l.t / l.warn) * 0.4, layer: 8 });
  }
  // saint slam telegraph
  const e = G.boss;
  if (e && !e.dead && e.slam) {
    R.q('beam', e.x + Math.cos(e.slam.ang) * 240, e.y + Math.sin(e.slam.ang) * 240, { rot: e.slam.ang, sx: 480 / (32 * 3), sy: 60 / (8 * 3), tint: '#ffd75e', alpha: 0.35, layer: 8 });
  }
}
