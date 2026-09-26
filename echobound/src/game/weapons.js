// Weapons: Gravecaster / Widow / Sunspike + evolution paths. All bullets flow through here.
import { G } from './state.js';
import { hurt } from './enemies.js';
import { FX } from './fx.js';
import { A } from '../core/audio.js';
import { rand, TAU, angTo, clamp } from '../core/util.js';

export const WEAPONS = {
  grave: {
    name: 'GRAVECASTER', tag: 'Slow cannon · enormous shells', mode: 'shot',
    cd: 0.95, dmg: 26, spd: 520, r: 7, kb: 240, sprite: 'gcball', size: 1,
  },
  widow: {
    name: 'WIDOW', tag: 'Automatic SMG · hold the trigger', mode: 'shot',
    cd: 0.125, dmg: 7, spd: 700, r: 4, kb: 30, sprite: 'widowr', size: 0.75,
  },
  sun: {
    name: 'SUNSPIKE', tag: 'Searing beam · pierces all', mode: 'beam',
    dps: 52, range: 340, width: 9,
  },
};

// aggregated stats for a weapon given rank state
export function stats(w) {
  const st = G.weapState[w], s = { ...WEAPONS[w] };
  if (w === 'grave') {
    if (st.siege > 0) { s.dmg *= 1.35; s.size *= 1.25; s.kb *= 1.4; }
    if (st.siege > 1) { s.dmg *= 1.35; s.size *= 1.3; s.expl = 64; s.cd *= 1.15; }
    if (st.exec > 0) { s.crit = (s.crit || 0) + 0.2; }
    if (st.exec > 1) { s.crit += 0.15; s.pierce = (s.pierce || 0) + 2; s.eliteDmg = 1.5; }
    if (st.sing > 0) { s.every = 4; }
    if (st.sing > 1) { s.every = 3; s.wellPow = 1.6; }
  } else if (w === 'widow') {
    if (st.swarm > 0) { s.count = (s.count || 1) + 2; s.dmg *= 0.8; s.spread = 0.16; }
    if (st.swarm > 1) { s.count += 2; s.cd *= 0.8; }
    if (st.venom > 0) { s.venom = 1; }
    if (st.venom > 1) { s.venom = 2; }
    if (st.predator > 0) { s.mark = 10; }
    if (st.predator > 1) { s.mark = 7; s.home = 1; }
  } else if (w === 'sun') {
    if (st.solar > 0) { s.burn = 1; }
    if (st.solar > 1) { s.burn = 2; }
    if (st.prism > 0) { s.beams = 3; }
    if (st.prism > 1) { s.beams = 5; s.width *= 1.3; }
    if (st.corona > 0) { s.corona = 1; }
    if (st.eclipse > 0) { s.eclipse = 1; }
  }
  if (G.owned.twin && s.mode === 'shot') { s.count = (s.count || 1) + 1; s.dmg *= 0.85; }
  if (G.owned.overclock && s.mode === 'shot') s.cd *= 0.77;
  return s;
}

function spawnBullet(sh, s, ang, o = {}) {
  G.bullets.push({
    x: sh.x + Math.cos(ang) * 16, y: sh.y + Math.sin(ang) * 16,
    vx: Math.cos(ang) * (o.spd || s.spd), vy: Math.sin(ang) * (o.spd || s.spd),
    r: (s.r || 5) * (o.size || 1), dmg: (o.dmg ?? s.dmg) * sh.mul,
    team: (sh.src === 'e' || sh.src === 'ehost') ? 1 : 0, src: sh.src, echo: sh.echo || null,
    life: o.life || 1.6, pierce: o.pierce ?? s.pierce ?? 0, hit: [],
    sprite: s.sprite || 'widowr', size: (o.size || 1) * (s.size || 1), rot: ang,
    kb: (s.kb || 60) * (sh.src === 'echo' ? 0.5 : 1),
    crit: o.crit || false, venom: s.venom || 0, mark: o.mark || false,
    explodes: o.explodes || false, returnT: o.returnT || 0, echoRef: sh.echo || null,
    well: o.well || false, grav: o.grav || false, light: o.light || false,
  });
}

// one trigger pull (or one echo replayed shot)
export function fireOnce(sh) {
  const s = stats(sh.weapon);
  const crit = Math.random() < (s.crit || 0) + (sh.src === 'p' ? (G.player.critBonus || 0) : 0);
  const dmgMul = crit ? 2 : 1;
  if (s.mode === 'beam') return; // beams are continuous
  let n = s.count || 1;
  for (let i = 0; i < n; i++) {
    let ang = sh.aim;
    if (n > 1) ang += (i - (n - 1) / 2) * (s.spread || 0.09) * 2;
    else ang += rand(-0.02, 0.02);
    const isWellShot = s.every && (sh.shotN = (sh.shotN || 0) + 1, sh.shotN % s.every === 0);
    const isMark = s.mark && (sh.shotN % s.mark === 0);
    spawnBullet(sh, s, ang, {
      dmg: s.dmg * dmgMul,
      crit: crit || (isWellShot && false),
      mark: isMark,
      well: isWellShot, grav: isWellShot,
      explodes: sh.echoRhythm ? sh.echoRhythm.count % 3 === 2 : false,
      size: isWellShot ? 1.2 : 1,
      pierce: s.pierce || 0,
    });
  }
  if (sh.src === 'p') {
    FX.flashSpr(sh.x + Math.cos(sh.aim) * 26, sh.y + Math.sin(sh.aim) * 26, 'muzzle', sh.aim, 1.7, '#fff8e0', 0.08);
    A.sfx(sh.weapon === 'grave' ? 'shoot_gc' : 'shoot_widow');
  } else if (sh.src === 'echo') A.sfx('shoot_widow');
  G.profile.shots += n;
  if (crit) G.profile.crit++;
}

// continuous beam tick (player or echo). returns nothing; applies damage + visuals
export function beamTick(sh, dt) {
  const s = stats(sh.weapon);
  const beams = s.beams || 1;
  for (let bi = 0; bi < beams; bi++) {
    const spreadA = beams > 1 ? (bi - (beams - 1) / 2) * 0.42 : 0;
    const ang = sh.aim + spreadA + (sh.src === 'p' && s.corona ? Math.sin(G.time * 1.4) * 0.8 : 0);
    castBeam(sh, s, ang, dt);
  }
  if (sh.src === 'p') { if ((sh.sfxT = (sh.sfxT || 0) - dt) <= 0) { A.sfx('beam'); sh.sfxT = 0.09; } }
}
function castBeam(sh, s, ang, dt) {
  const range = s.range * (sh.rangeMul || 1);
  const dx = Math.cos(ang), dy = Math.sin(ang);
  let end = range;
  const out = [];
  G.eh.query(sh.x + dx * range / 2, sh.y + dy * range / 2, range / 2 + 40, out);
  for (const e of out) {
    if (e.dead) continue;
    // distance from enemy center to ray
    const ex = e.x - sh.x, ey = e.y - sh.y;
    const t = clamp(ex * dx + ey * dy, 0, range);
    const px = sh.x + dx * t, py = sh.y + dy * t;
    const dd = Math.hypot(e.x - px, e.y - py);
    if (dd < e.r + s.width / 2) {
      end = Math.min(end, Math.max(t, 10));
      const eclipseLight = s.eclipse && Math.floor(G.time * 2) % 2 === 0;
      const dmul = (s.eclipse ? (eclipseLight ? 1.25 : 0.85) : 1) * (sh.mul);
      let dmg = s.dps * dt * dmul;
      if (s.burn && Math.random() < dt * 2.5) applyDot(e, 'burn', 3 * (s.burn), 2);
      if (s.eclipse && !eclipseLight && Math.random() < dt * 3) pullEnemy(e, sh.x + dx * Math.min(t, 200), sh.y + dy * Math.min(t, 200), 120);
      hurt(e, dmg, { src: sh.src === 'echo' ? 'echo' : 'player', crit: Math.random() < 0.05, kb: 0 });
      if (Math.random() < dt * 8) FX.burst(px, py, 1, { col: '#ffd75e', spd: 90, life: 0.2, size: 1.5 });
    }
  }
  G.beams.push({ x: sh.x, y: sh.y, ang, len: end, w: s.width * (sh.src === 'echo' ? 0.7 : 1) * (1 + Math.sin(G.time * 40) * 0.08), col: sh.src === 'echo' ? (sh.echo && sh.echo.hostile ? '#ff5a5a' : '#9fe8ff') : '#fff4c9' });
}

export function applyDot(e, kind, dps, dur) {
  if (e.dots[kind] === undefined) return;
  if (kind === 'burn' && e.burnImmune) return;
  e.dots[kind] = Math.max(e.dots[kind], dps); e.dotT[kind] = Math.max(e.dotT[kind], dur);
  if (kind === 'burn') G.profile.burn++;
}
export function pullEnemy(e, x, y, force) {
  const d = Math.hypot(x - e.x, y - e.y) || 1;
  if (d > 24) { e.kbx += ((x - e.x) / d) * force * 0.06; e.kby += ((y - e.y) / d) * force * 0.06; }
}

// explosions: one door for barrels, bullets, deaths
import { hitProps, tryGenerator } from './world.js';
export function explode(x, y, r, dmg, o = {}) {
  FX.burst(x, y, 22, { col: o.col || '#ffb454', spd: 300, life: 0.5, size: 3 });
  FX.burst(x, y, 10, { col: '#3a4254', spd: 120, life: 0.9, size: 4, add: false });
  FX.ring(x, y, r, o.col || '#ffb454');
  FX.shake(Math.min(0.5, r / 300)); FX.hitstop(r > 90 ? 0.05 : 0.02);
  A.sfx('boom');
  if (G.syn.collapse) pullWave(x, y, r * 1.6);
  const out = [];
  G.eh.query(x, y, r, out);
  for (const e of out) {
    if (e.dead) continue;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d < r + e.r) hurt(e, dmg, { src: o.src || 'player', kb: 160, fire: true });
  }
  if (G.ascension === 'supernova') G.wells.push({ x, y, t: 2, dur: 2, r: 70, pull: 260, dps: 20, star: true });
}
function pullWave(x, y, r) {
  const out = [];
  G.eh.query(x, y, r, out);
  for (const e of out) if (!e.dead) pullEnemy(e, x, y, 300);
}

// bullet simulation — runs in main loop
export function updateBullets(dt) {
  const B = G.bullets;
  for (let i = B.length - 1; i >= 0; i--) {
    const b = B[i];
    b.life -= dt;
    // mirror shot: return to echo then burst
    if (b.returnT > 0) {
      b.returnT -= dt;
      if (b.returnT <= 0 && b.echoRef && !b.echoRef.dead) {
        const a = angTo(b.x, b.y, b.echoRef.x, b.echoRef.y);
        const sp = Math.hypot(b.vx, b.vy);
        b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp; b.returning = true; b.hit.length = 0;
      }
    } else if (b.returning && b.echoRef) {
      const a = angTo(b.x, b.y, b.echoRef.x, b.echoRef.y);
      if (Math.hypot(b.echoRef.x - b.x, b.echoRef.y - b.y) < 20) {
        for (let k = 0; k < 6; k++) {
          const a2 = k / 6 * TAU;
          G.bullets.push({ ...b, x: b.x, y: b.y, vx: Math.cos(a2) * 380, vy: Math.sin(a2) * 380, dmg: b.dmg * 0.4, life: 0.5, pierce: 0, returning: false, returnT: 0, hit: [], r: b.r * 0.8 });
        }
        FX.ring(b.echoRef.x, b.echoRef.y, 40, '#9fe8ff', 0.25);
        killBullet(i, b); continue;
      }
      const sp = Math.hypot(b.vx, b.vy);
      const ca = angTo(b.x, b.y, b.echoRef.x, b.echoRef.y);
      b.vx = Math.cos(ca) * sp; b.vy = Math.sin(ca) * sp;
    }
    // predator homing toward marked
    if (b.home && b.team === 0) {
      let best = null, bd = 260 * 260;
      for (const e of G.enemies) { if (e.dead || e.marked <= 0) continue; const d = (e.x - b.x) ** 2 + (e.y - b.y) ** 2; if (d < bd) { bd = d; best = e; } }
      if (best) { const a = angTo(b.x, b.y, best.x, best.y), sp = Math.hypot(b.vx, b.vy); b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp; }
    }
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.sprite === 'gcball') b.rot += 7 * dt;
    if (b.life <= 0) { killBullet(i, b); continue; }
    if (Math.abs(b.x) > G.env.half + 60 || Math.abs(b.y) > G.env.half + 60) { killBullet(i, b); continue; }
    if (Math.random() < 0.2) FX.trailDot(b.x, b.y, b.src === 'echo' ? '#54e6ff' : b.team ? '#ff8a5a' : '#bfe9ff', b.r * 0.35, 0.14);

    if (b.team === 0) {
      // environment: barrels/cars/barricades soak the shot; lightning can overload generators
      if (hitProps(b)) { killBullet(i, b); continue; }
      if (b.grav || G.owned.static || G.syn.stormshot || G.ascension === 'thunder') tryGenerator(b);
      const out = [];
      G.eh.query(b.x, b.y, b.r + 30, out);
      for (const e of out) {
        if (e.dead || b.hit.includes(e)) continue;
        if (Math.hypot(e.x - b.x, e.y - b.y) < e.r + b.r) {
          b.hit.push(e);
          const dmg = b.dmg * (b.crit ? 2 : 1);
          hurt(e, dmg, { src: b.src, crit: b.crit, kb: b.kb, kba: Math.atan2(b.vy, b.vx), bullet: b });
          if (b.venom) applyDot(e, 'poison', 4 * b.venom, 3);
          if (b.mark) e.marked = Math.max(e.marked, 4);
          if (b.well) G.wells.push({ x: b.x, y: b.y, t: 1.2, dur: 1.2, r: 110, pull: 420, dps: 8, pop: b.dmg * 0.8 });
          if (b.explodes) explode(b.x, b.y, 60, b.dmg * 0.8, { src: b.src });
          if (b.pierce > 0) b.pierce--;
          else { killBullet(i, b); break; }
        }
      }
    } else {
      const p = G.player;
      if (p.alive && p.iT <= 0 && Math.hypot(p.x - b.x, p.y - b.y) < p.r + b.r) {
        playerHurt(b.dmg); killBullet(i, b);
      }
    }
  }
}
function killBullet(i, b) { const B = G.bullets; B[i] = B[B.length - 1]; B.pop(); }

// player damage entry (imported by enemies/bosses too)
export function playerHurt(dmg) {
  const P = G.player;
  if (!P.alive || P.iT > 0 || G.Q.has('god')) return;
  if (P.coinBuff > 0) dmg *= 0.6;
  P.hp -= dmg; P.iT = 0.5; P.hurtFlash = 0.3;
  FX.shake(0.35); FX.flash(0.12, '#ff5a5a'); A.sfx('hurt');
  FX.burst(P.x, P.y, 8, { col: '#ff5a5a', spd: 140, life: 0.4 });
  if (P.hp <= 0) {
    if (P.secondWind) { P.secondWind = false; P.hp = P.maxHp * 0.5; P.iT = 1.5; FX.flash(0.4, '#7dff9b'); FX.ring(P.x, P.y, 120, '#7dff9b'); A.sfx('levelup'); }
    else {
      P.hp = 0; P.alive = false;
      // death sequence: the Warden comes apart
      FX.gibs(P.x, P.y - 8, 22, '#7de6ff');
      FX.burst(P.x, P.y, 24, { col: '#54e6ff', spd: 320, life: 0.8 });
      FX.ring(P.x, P.y, 140, '#54e6ff');
      FX.flash(0.5, '#54e6ff'); FX.shake(0.9); FX.slowmo(1.4); FX.hitstop(0.12);
      A.sfx('boom');
    }
  }
}

export function drawBeams(R) {
  for (const bm of G.beams) {
    const mx = bm.x + Math.cos(bm.ang) * bm.len / 2, my = bm.y + Math.sin(bm.ang) * bm.len / 2;
    R.q('beam', mx, my, { rot: bm.ang, sx: bm.len / (32 * 3), sy: bm.w / (8 * 3), tint: bm.col, alpha: 0.85, layer: 9 });
    R.q('beam', mx, my, { rot: bm.ang, sx: bm.len / (32 * 3), sy: bm.w * 2.4 / (8 * 3), tint: bm.col, alpha: 0.25, layer: 9 });
  }
}

// layered projectiles: motion trail -> glow -> readable core
export function drawBullets(R) {
  for (const b of G.bullets) {
    const enemy = b.team === 1;
    const col = enemy ? '#ff8a5a' : b.src === 'echo' ? '#54e6ff' : '#bfe9ff';
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > 40) {
      const tx = b.x - b.vx / sp * b.r * 2.4, ty = b.y - b.vy / sp * b.r * 2.4;
      R.q('beam', (b.x + tx) / 2, (b.y + ty) / 2, { rot: Math.atan2(b.vy, b.vx), sx: b.r * 2.4 / (32 * 3) + 0.08, sy: b.r / (10 * 3), tint: col, alpha: 0.3, layer: 8 });
    }
    R.q('glow', b.x, b.y, { sx: b.r * 1.7 / (64 * 3), sy: b.r * 1.7 / (64 * 3), tint: enemy ? '#ff5a3a' : col, alpha: enemy ? 0.22 : 0.15, layer: 9 });
    const pulse = enemy ? 1 + Math.sin(G.time * 20 + b.x) * 0.12 : 1;
    R.q(b.sprite, b.x, b.y, { rot: b.rot || 0, sx: b.size * pulse, sy: b.size * pulse, layer: 8 });
  }
}
