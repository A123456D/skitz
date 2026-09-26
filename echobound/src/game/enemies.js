// Enemies have JOBS, not stats. One damage door: hurt(). Elites are mutations, not stat sticks.
import { G } from './state.js';
import { WEAPONS, playerHurt } from './weapons.js';
import { bossDied } from './bosses.js';
import { FX } from './fx.js';
import { A } from '../core/audio.js';
import { META } from './meta.js';
import { addXp } from './player.js';
import { SpatialHash, TAU, rand, irand, angTo, clamp } from '../core/util.js';

export const ENEMY_DEF = {
  husk:     { hp: 20, spd: 95,  dmg: 8, r: 12, xp: 1, cost: 1, spr: 'husk' },
  lancer:   { hp: 26, spd: 80,  dmg: 7, r: 11, xp: 2, cost: 2, spr: 'lancer' },
  mourner:  { hp: 60, spd: 45,  dmg: 6, r: 14, xp: 5, cost: 4, spr: 'mourner' },
  thief:    { hp: 30, spd: 155, dmg: 4, r: 10, xp: 3, cost: 2, spr: 'thief' },
  leech:    { hp: 24, spd: 110, dmg: 5, r: 10, xp: 2, cost: 3, spr: 'leech' },
  mirror:   { hp: 44, spd: 70,  dmg: 6, r: 11, xp: 4, cost: 4, spr: 'mirror' },
  timeeater:{ hp: 90, spd: 85,  dmg: 8, r: 15, xp: 8, cost: 6, spr: 'timeeater' },
  parasite: { hp: 36, spd: 125, dmg: 6, r: 11, xp: 4, cost: 4, spr: 'parasite' },
  witness:  { hp: 70, spd: 55,  dmg: 0, r: 12, xp: 6, cost: 5, spr: 'witness' },
  counter:  { hp: 80, spd: 70,  dmg: 10, r: 12, xp: 6, cost: 5, spr: 'witness' },
  clockadd: { hp: 14, spd: 175, dmg: 6, r: 9,  xp: 1, cost: 1, spr: 'clockadd' },
};

const ELITES = ['teleport', 'explosive', 'reflective', 'regen', 'split', 'phase', 'echothief'];
export const ELITE_NAMES = { teleport: 'TELEPORTING', explosive: 'EXPLOSIVE', reflective: 'REFLECTIVE', regen: 'REGENERATING', split: 'SPLITTING', phase: 'PHASED', echothief: 'ECHOTHIEF' };

// gib + splat colors per family (visual identity of remains)
const FAMILY = {
  husk: ['#c96a4a', '#43201a'], lancer: ['#b85a40', '#3c1e16'], mourner: ['#8a8f9c', '#23262e'],
  thief: ['#d8a850', '#33260f'], leech: ['#c46a48', '#36180e'], mirror: ['#aab6c8', '#272d3a'],
  timeeater: ['#c9a86b', '#33260f'], parasite: ['#d8a850', '#2c220d'], witness: ['#d8c9a8', '#332c20'],
  counter: ['#ffb454', '#33200f'], clockadd: ['#c9a86b', '#2e2410'],
};

export function hpScale() { const m = G.time / 60; return 1 + m * 0.35 + m * m * 0.045; }
export function dmgScale() { return 1 + (G.time / 60) * 0.055; }

export function spawnEnemy(type, x, y, elite = null, opts = {}) {
  const d = ENEMY_DEF[type];
  const sc = opts.scale ?? 1;
  const eliteMul = elite ? 2.6 : 1;
  const e = {
    id: G.nextId++, type, x, y, vx: 0, vy: 0, kbx: 0, kby: 0,
    r: d.r * (elite ? 1.25 : 1) * sc,
    hp: d.hp * hpScale() * eliteMul * sc * (opts.hpMul || 1),
    spd: d.spd * (elite ? 0.95 : 1) * (opts.spdMul || 1),
    dmg: d.dmg * dmgScale() * (elite ? 1.3 : 1),
    xp: d.xp * (elite ? 4 : 1), cost: d.cost,
    spr: d.spr, scale: (elite ? 1.25 : 1) * sc,
    elite, t: 0, stT: rand(0, 2), state: 'chase', flash: 0, dead: false,
    dots: { burn: 0, bleed: 0, poison: 0 }, dotT: { burn: 0, bleed: 0, poison: 0 }, dotSrc: {},
    marked: 0, buffed: false, facing: 1, observeT: 0, shield: 0, hitT: 0, spawnT: 0.22,
    critRes: 0, echoRes: 0, burnImmune: false, boss: false, stolen: 0,
  };
  e.maxHp = e.hp;
  G.enemies.push(e);
  return e;
}

export function spawnEnemyBullet(x, y, ang, spd, dmg, sprite = 'orb', r = 5, life = 3.2, o = {}) {
  G.bullets.push({
    x, y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
    r, dmg, team: 1, src: 'e', echo: null, life, pierce: 0, hit: [],
    sprite, size: o.size || 1, rot: ang, kb: 0, crit: false, returnT: 0, echoRef: null,
  });
}

const qout = [];
export function updateEnemies(dt) {
  const tscale = (G.hourActive > 0 || G.fractureT > 0) ? 0.4 : 1;
  if (!G.eh) G.eh = new SpatialHash(80);
  G.eh.clear();
  for (const e of G.enemies) if (!e.dead) G.eh.insert(e, e.x, e.y, e.r + 10);

  for (let i = G.enemies.length - 1; i >= 0; i--) {
    const e = G.enemies[i];
    if (e.dead) { G.enemies.splice(i, 1); continue; }
    e.t += dt;
    e.flash = Math.max(0, e.flash - dt);
    e.marked = Math.max(0, e.marked - dt);
    e.hitT = Math.max(0, e.hitT - dt);
    if (e.spawnT > 0) e.spawnT -= dt;
    // dots
    for (const k of ['burn', 'bleed', 'poison']) {
      if (e.dotT[k] > 0) {
        e.dotT[k] -= dt;
        hurt(e, e.dots[k] * dt, { src: e.dotSrc[k] || 'player', silent: true, dot: k });
        if (e.dead) break;
      } else e.dots[k] = 0;
    }
    if (e.dead) continue;
    if (e.elite === 'regen') e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.02 * dt);
    if (e.elite === 'teleport') {
      e.stT += dt;
      if (e.stT > 2.4) { e.stT = 0; const a = angTo(e.x, e.y, G.player.x, G.player.y); FX.burst(e.x, e.y, 6, { col: '#b08aff', spd: 100, life: 0.3 }); e.x = clamp(e.x + Math.cos(a) * 150, -G.env.half, G.env.half); e.y = clamp(e.y + Math.sin(a) * 150, -G.env.half, G.env.half); FX.burst(e.x, e.y, 6, { col: '#b08aff', spd: 100, life: 0.3 }); }
    }
    if (e.elite === 'phase') {
      e.stT += dt;
      if (e.state === 'chase' && e.stT > 4) { e.state = 'phaseup'; e.stT = 0; }
      if (e.state === 'phaseup' && e.stT > 0.6) { e.state = 'phasego'; e.stT = 0; FX.ring(e.x, e.y, 30, '#ffb454', 0.2); }
      if (e.state === 'phasego' && e.stT > 0.8) { e.state = 'chase'; e.stT = 0; }
    }
    const P = G.player;
    const toP = angTo(e.x, e.y, P.x, P.y);
    const dP = Math.hypot(P.x - e.x, P.y - e.y);
    processPending(e, dt);
    let vx = 0, vy = 0;
    const bleedSlow = e.dotT.bleed > 0 ? 0.85 : 1;

    switch (e.type) {
      case 'husk': {
        if (e.state === 'windup') { e.stT += dt; if (e.stT > 0.5) { e.state = 'lunge'; e.stT = 0; e.lungeA = toP; } }
        else if (e.state === 'lunge') { e.stT += dt; vx = Math.cos(e.lungeA) * 340; vy = Math.sin(e.lungeA) * 340; if (e.stT > 0.35) { e.state = 'chase'; e.stT = -rand(0, 2); } }
        else { vx = Math.cos(toP) * e.spd; vy = Math.sin(toP) * e.spd; e.stT += dt; if (e.stT > 3.5 && dP < 240) { e.state = 'windup'; e.stT = 0; } }
        break;
      }
      case 'lancer': {
        const band = 300;
        const dir = dP > band + 40 ? 1 : dP < band - 40 ? -1 : 0;
        vx = Math.cos(toP) * e.spd * dir + Math.cos(toP + Math.PI / 2) * e.spd * 0.4 * Math.sin(e.t * 1.3);
        vy = Math.sin(toP) * e.spd * dir + Math.sin(toP + Math.PI / 2) * e.spd * 0.4 * Math.sin(e.t * 1.3);
        e.stT += dt;
        if (e.stT > 2.4) {
          e.stT = 0;
          const lead = 0.15;
          const a = angTo(e.x, e.y, P.x + P.vx * lead, P.y + P.vy * lead) + (G.owned.theMirror ? rand(-0.4, 0.4) : 0);
          for (let k = 0; k < 3; k++) setTimeoutShots(e, a, k);
        }
        break;
      }
      case 'mourner': {
        const dir = dP > 200 ? 1 : -0.5;
        vx = Math.cos(toP) * e.spd * dir; vy = Math.sin(toP) * e.spd * dir;
        break;
      }
      case 'thief': {
        if (e.state === 'chase') {
          vx = Math.cos(toP) * e.spd; vy = Math.sin(toP) * e.spd;
          if (dP < 42) {
            e.state = 'flee';
            const steal = Math.min(15, Math.floor(P.xp));
            if (steal > 0) { P.xp -= steal; e.stolen = steal; A.sfx('steal'); FX.num(P.x, P.y - 30, steal, false); META.event('thief'); }
            else e.stolen = 4;
            FX.flash(0.1, '#ffd75e');
          }
        } else {
          const a = angTo(e.x, e.y, 0, 0) + Math.PI; // to nearest edge
          const ea = Math.abs(e.x) > Math.abs(e.y) ? (e.x > 0 ? 0 : Math.PI) : (e.y > 0 ? Math.PI / 2 : -Math.PI / 2);
          vx = Math.cos(ea) * e.spd * 1.15; vy = Math.sin(ea) * e.spd * 1.15;
          if (Math.abs(e.x) > G.env.half + 30 || Math.abs(e.y) > G.env.half + 30) e.dead = true;
        }
        break;
      }
      case 'leech': {
        let host = null, bd = 400 * 400;
        for (const o of G.enemies) { if (o === e || o.dead || (o.elite === null && !o.boss)) continue; const d = (o.x - e.x) ** 2 + (o.y - e.y) ** 2; if (d < bd) { bd = d; host = o; } }
        if (host) {
          e.host = host; host.buffed = true; host.leechT = 1;
          const a = e.t * 2 + e.id;
          e.x = host.x + Math.cos(a) * (host.r + 12); e.y = host.y + Math.sin(a) * (host.r + 12);
          host.hp = Math.min(host.maxHp, host.hp + host.maxHp * 0.02 * dt);
        } else {
          vx = Math.cos(toP) * e.spd; vy = Math.sin(toP) * e.spd;
        }
        break;
      }
      case 'mirror': {
        const band = 250;
        const dir = dP > band + 30 ? 1 : dP < band - 30 ? -1 : 0;
        vx = Math.cos(toP) * e.spd * dir + Math.cos(toP + Math.PI / 2) * e.spd * 0.5;
        vy = Math.sin(toP) * e.spd * dir + Math.sin(toP + Math.PI / 2) * e.spd * 0.5;
        e.stT += dt;
        if (e.stT > 2.2 && dP < 420) {
          e.stT = 0;
          const w = P.weapon;
          if (w === 'sun') { for (let k = -2; k <= 2; k++) spawnEnemyBullet(e.x, e.y, toP + k * 0.25, 300, e.dmg * 0.8, 'bolt', 5); }
          else if (w === 'widow') { for (let k = 0; k < 5; k++) setTimeoutShots(e, toP + rand(-0.15, 0.15), k); }
          else spawnEnemyBullet(e.x, e.y, toP, 260, e.dmg * 1.6, 'gcball', 8, 4, { size: 1.2 });
          A.sfx('shoot_widow');
        }
        break;
      }
      case 'timeeater': {
        vx = Math.cos(toP) * e.spd; vy = Math.sin(toP) * e.spd;
        break;
      }
      case 'parasite': {
        if (!e.host) {
          vx = Math.cos(toP) * e.spd; vy = Math.sin(toP) * e.spd;
          const out = [];
          G.eh.query(e.x, e.y, 60, out);
          for (const o of out) {
            if (o === e || o.dead || o.boss || o.type === 'parasite' || o.buffed) continue;
            if (Math.hypot(o.x - e.x, o.y - e.y) < 50) {
              e.host = o; o.buffed = true; o.leechT = 1;
              o.hp = o.maxHp = o.maxHp * 1.5; o.spd *= 1.25; o.dmg *= 1.3;
              FX.burst(o.x, o.y, 12, { col: '#c8a0ff', spd: 150, life: 0.4 });
              e.dead = true; A.sfx('crack');
              break;
            }
          }
        }
        break;
      }
      case 'witness': {
        const dir = dP > 240 ? 1 : dP < 200 ? -1 : 0;
        vx = Math.cos(toP) * e.spd * dir; vy = Math.sin(toP) * e.spd * dir;
        e.observeT += dt;
        if (e.observeT > 8) {
          e.type = 'counter'; e.spr = 'witness'; e.dmg = ENEMY_DEF.counter.dmg * dmgScale();
          const p = G.profile;
          const dom = Math.max(
            ['crit', p.crit], ['burn', p.burn], ['echo', p.echo]
          )[0];
          if (dom === 'crit') { e.critRes = 0.75; e.adaptTxt = 'CRIT RESIST'; }
          else if (dom === 'burn') { e.burnImmune = true; e.adaptTxt = 'FIREPROOF'; }
          else { e.echoRes = 0.5; e.adaptTxt = 'ECHO RESIST'; }
          G.stats.adapt++;
          META.event('witness');
          A.sfx('adapt'); FX.flash(0.2, '#ffb454'); FX.shake(0.3);
          FX.ring(e.x, e.y, 80, '#ffb454');
          banner('THE WITNESS ADAPTS', e.adaptTxt);
        }
        break;
      }
      case 'counter': {
        vx = Math.cos(toP) * e.spd; vy = Math.sin(toP) * e.spd;
        break;
      }
      case 'clockadd': {
        vx = Math.cos(toP + Math.sin(e.t * 3) * 0.8) * e.spd;
        vy = Math.sin(toP + Math.sin(e.t * 3) * 0.8) * e.spd;
        break;
      }
      default: {
        if (e.boss) break;
        vx = Math.cos(toP) * e.spd; vy = Math.sin(toP) * e.spd;
      }
    }
    if (e.elite === 'echothief') {
      let ne = null, bd = 300 * 300;
      for (const ec of G.echoes) {
        if (ec.dead || ec.hostile) continue;
        const d2 = (ec.x - e.x) ** 2 + (ec.y - e.y) ** 2;
        if (d2 < bd) { bd = d2; ne = ec; }
      }
      if (ne) { const a = angTo(e.x, e.y, ne.x, ne.y); vx = Math.cos(a) * e.spd * 1.4; vy = Math.sin(a) * e.spd * 1.4; if (Math.hypot(ne.x - e.x, ne.y - e.y) < 34) { ne.dead = true; ne.fade = 0.2; e.shield += 120; e.maxHp += 120; e.hp += 120; FX.flash(0.1, '#ff5a5a'); A.sfx('adapt'); } }
    }
    // time-eater aura: itself immune to hourglass
    const ts = e.type === 'timeeater' ? 1 : tscale;
    let mvx = vx * ts * bleedSlow, mvy = vy * ts * bleedSlow;
    if (e.state === 'phasego') { mvx *= 4; mvy *= 4; }
    if (e.state === 'windup') { mvx *= 0.1; mvy *= 0.1; }
    e.x += (mvx + e.kbx) * dt; e.y += (mvy + e.kby) * dt;
    const kd = Math.max(0, 1 - 7 * dt); e.kbx *= kd; e.kby *= kd;
    e.x = clamp(e.x, -G.env.half, G.env.half); e.y = clamp(e.y, -G.env.half, G.env.half);
    if (Math.abs(mvx) > 4) e.facing = mvx > 0 ? 1 : -1;
    // separation
    if (!e.boss) {
      G.eh.query(e.x, e.y, e.r + 14, qout);
      for (const o of qout) {
        if (o === e || o.dead) continue;
        const d = Math.hypot(e.x - o.x, e.y - o.y);
        const rr = e.r + o.r;
        if (d < rr && d > 0.01) { const push = (rr - d) * 0.4; e.x += ((e.x - o.x) / d) * push; e.y += ((e.y - o.y) / d) * push; }
      }
    }
    // contact damage
    if (e.dmg > 0 && P.alive && P.iT <= 0 && !e.host) {
      if (Math.hypot(P.x - e.x, P.y - e.y) < P.r + e.r) playerHurt(e.dmg * (e.buffed ? 1.2 : 1));
    }
  }
  // leech buff decay
  for (const e of G.enemies) {
    if (e.leechT !== undefined) { e.leechT -= dt; if (e.leechT <= 0) e.buffed = false; }
  }
  updateWisps(dt);
  updateWells(dt);
}
function setTimeoutShots(e, ang, k) {
  // staggered burst without setTimeout: store pending shots on enemy
  (e.pending = e.pending || []).push({ t: k * 0.13, ang });
  // processed in draw loop below via e.pendingTick
}
export function processPending(e, dt) {
  if (!e.pending) return;
  for (let i = e.pending.length - 1; i >= 0; i--) {
    const p = e.pending[i]; p.t -= dt;
    if (p.t <= 0) { spawnEnemyBullet(e.x, e.y, p.ang, 320, e.dmg, 'orb', 5); e.pending.splice(i, 1); }
  }
}

// ==================== THE DAMAGE DOOR ====================
export function hurt(e, amt, o = {}) {
  if (e.dead || amt <= 0) return;
  if (e.invulnT > 0) return;
  if (!e.dots) { e.dots = { burn: 0, bleed: 0, poison: 0 }; e.dotT = { burn: 0, bleed: 0, poison: 0 }; e.dotSrc = {}; }
  let a = amt;
  if (o.crit && e.critRes) a *= 1 - e.critRes;
  if (o.src === 'echo' && e.echoRes) a *= 1 - e.echoRes;
  if (o.fire && e.burnImmune) a *= 0.4;
  if (e.shield > 0) { const abs = Math.min(e.shield, a); e.shield -= abs; a -= abs; }
  // reflective elite
  if (e.elite === 'reflective' && o.bullet && Math.random() < 0.3) {
    const b = o.bullet;
    spawnEnemyBullet(b.x, b.y, Math.atan2(b.vy, b.vx) + Math.PI, Math.hypot(b.vx, b.vy), b.dmg * 0.6, 'orb', 5);
    a *= 0.15;
  }
  e.hp -= a; e.flash = 0.09; e.hitT = 0.11;
  if (o.src === 'echo') { G.stats.dmgE += a; G.profile.echo += a; } else G.stats.dmgP += a;
  if (!o.silent) {
    FX.num(e.x, e.y - e.r - 8, a, o.crit);
    if (o.crit) { A.sfx('crit'); G.profile.crit++; FX.burst(e.x, e.y, 3, { col: '#ffd75e', spd: 150, life: 0.25, size: 1.6 }); }
    else A.sfx('hit');
  }
  if (o.kb && !e.boss) {
    const ka = o.kba ?? rand(0, TAU);
    e.kbx += Math.cos(ka) * o.kb * 2.4 / e.r;
    e.kby += Math.sin(ka) * o.kb * 2.4 / e.r;
  }
  // mutations from upgrades
  if (o.bullet && G.owned.hollow) { e.dots.bleed = Math.max(e.dots.bleed, 3); e.dotT.bleed = 2; e.dotSrc.bleed = o.src; }
  if (o.bullet && G.owned.graviton) { e.kbx -= Math.cos(o.kba || 0) * 8; e.kby -= Math.sin(o.kba || 0) * 8; }
  if (o.bullet && G.owned.ember) { e.dots.burn = Math.max(e.dots.burn, 4); e.dotT.burn = 3; e.dotSrc.burn = o.src; }
  // chains: static mutation, stormshot synergy, thunder-god echoes
  let chains = 0, chainMul = 0;
  if (o.bullet && G.owned.static) { chains += 2; chainMul = Math.max(chainMul, 0.35); }
  if (o.bullet && G.syn.stormshot) { chains += 2; chainMul = Math.max(chainMul, 0.3); }
  if (o.src === 'echo' && G.ascension === 'thunder') { chains += 3; chainMul = Math.max(chainMul, 0.5); }
  if (chains > 0) chainLightning(e, a * chainMul, chains, o.src);
  if (e.hp <= 0) die(e, o);
}
const chainOut = [];
function chainLightning(from, dmg, n, src) {
  chainOut.length = 0;
  G.eh.query(from.x, from.y, 130, chainOut);
  let done = 0;
  for (const t of chainOut) {
    if (t === from || t.dead) continue;
    hurt(t, dmg, { src, kb: 0 });
    FX.burst(t.x, t.y, 2, { col: '#ffe98a', spd: 120, life: 0.15, size: 1.4 });
    if (++done >= n) break;
  }
}

const bigSet = new Set(['timeeater', 'mourner', 'witness', 'counter']);
function die(e, o = {}) {
  if (e.dead) return;
  e.dead = true;
  G.stats.kills++;
  if (e.elite) G.stats.elites++;
  // drops
  const n = Math.min(14, Math.max(1, Math.round(e.xp)));
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU), sp = rand(30, 110);
    G.pickups.push({ kind: 'shard', x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, v: Math.max(1, Math.round(e.xp / n)), t: 0, pull: false });
  }
  if (e.stolen > 0) for (let i = 0; i < Math.ceil(e.stolen / 2); i++) G.pickups.push({ kind: 'shard', x: e.x, y: e.y, vx: rand(-80, 80), vy: rand(-80, 80), v: 2, t: 0, pull: false });
  if (Math.random() < (e.elite ? 0.25 : 0.03)) G.pickups.push({ kind: 'heart', x: e.x, y: e.y, vx: 0, vy: 0, t: 0, pull: false });
  if ((e.elite && Math.random() < 0.18) || (e.type === 'witness' && Math.random() < 0.4)) G.pickups.push({ kind: 'story', x: e.x, y: e.y, vx: 0, vy: 0, t: 0, pull: false });
  // feedback
  const big = e.boss || e.elite || bigSet.has(e.type);
  const fam = FAMILY[e.type] || ['#c96a4a', '#43201a'];
  FX.gibs(e.x, e.y - 6, big ? 14 : 6, fam[0]);
  FX.splat(e.x, e.y + 4, fam[1], big ? 1.5 : 1);
  FX.burst(e.x, e.y, big ? 20 : 9, { col: big ? '#ff8a4a' : '#c96a4a', spd: big ? 260 : 150, life: 0.45, size: big ? 3 : 2 });
  FX.puff(e.x, e.y, big ? 8 : 4);
  A.sfx(big ? 'crack' : 'pop');
  if (big) { FX.shake(0.3); FX.hitstop(0.04); }
  // on-death mechanics
  if (e.elite === 'explosive') {
    FX.ring(e.x, e.y, 110, '#ff8a4a'); A.sfx('boom'); FX.shake(0.35);
    const out = [];
    G.eh.query(e.x, e.y, 110, out);
    for (const t of out) if (!t.dead && t !== e && Math.hypot(t.x - e.x, t.y - e.y) < 110) hurt(t, 25 * dmgScale(), { src: 'world' });
    const P = G.player;
    if (P.alive && Math.hypot(P.x - e.x, P.y - e.y) < 110) playerHurt(14 * dmgScale());
  }
  if (e.elite === 'split') {
    for (let i = 0; i < 2; i++) spawnEnemy(e.type, e.x + rand(-20, 20), e.y + rand(-20, 20), null, { scale: 0.6, hpMul: 0.35 });
  }
  if (e.dotT.poison > 0 && G.weapState[G.player.weapon].venom >= 2) {
    const out = [];
    G.eh.query(e.x, e.y, 80, out);
    for (const t of out) if (!t.dead && Math.hypot(t.x - e.x, t.y - e.y) < 80) { t.dots.poison = Math.max(t.dots.poison, 4); t.dotT.poison = 3; t.dotSrc.poison = o.src; }
    FX.burst(e.x, e.y, 10, { col: '#7dff9b', spd: 120, life: 0.4 });
  }
  if (G.owned.killbreaker && o.bullet) explodeK(e.x, e.y, 60, 20 * (1 + G.time / 240), o.src);
  if (G.syn.memleak && o.src === 'echo') G.wisps.push({ x: e.x, y: e.y, vx: 0, vy: 0, t: 6, dmg: 10 });
  if (e.type === 'mirror') META.event('mirror');
  if (e.boss) bossDied(e);
}
function explodeK(x, y, r, dmg, src) {
  FX.ring(x, y, r, '#ffb454'); A.sfx('boom');
  const out = [];
  G.eh.query(x, y, r, out);
  for (const t of out) if (!t.dead && Math.hypot(t.x - x, t.y - y) < r) hurt(t, dmg, { src });
}

function updateWisps(dt) {
  for (let i = G.wisps.length - 1; i >= 0; i--) {
    const w = G.wisps[i];
    w.t -= dt;
    if (w.t <= 0) { G.wisps.splice(i, 1); continue; }
    let best = null, bd = 500 * 500;
    for (const e of G.enemies) { if (e.dead) continue; const d = (e.x - w.x) ** 2 + (e.y - w.y) ** 2; if (d < bd) { bd = d; best = e; } }
    if (best) {
      const a = angTo(w.x, w.y, best.x, best.y);
      w.vx += (Math.cos(a) * 400 - w.vx) * 3 * dt; w.vy += (Math.sin(a) * 400 - w.vy) * 3 * dt;
      if (Math.hypot(best.x - w.x, best.y - w.y) < best.r + 8) hurt(best, w.dmg * dt, { src: 'echo', silent: Math.random() > 0.2 });
    }
    w.x += w.vx * dt; w.y += w.vy * dt;
    if (Math.random() < 0.3) FX.trailDot(w.x, w.y, '#bfe9ff', 1.6, 0.3);
  }
}

function updateWells(dt) {
  for (let i = G.wells.length - 1; i >= 0; i--) {
    const w = G.wells[i];
    w.t -= dt;
    if (w.t <= 0) {
      if (w.pop) explodeK(w.x, w.y, 90, w.pop, 'player');
      G.wells.splice(i, 1); continue;
    }
    if (w.pull) {
      const out = [];
      G.eh.query(w.x, w.y, w.r + 60, out);
      for (const e of out) {
        if (e.dead || e.boss) continue;
        const d = Math.hypot(w.x - e.x, w.y - e.y);
        if (d < w.r + e.r) { const a = angTo(e.x, e.y, w.x, w.y); e.kbx += Math.cos(a) * w.pull * dt * 2; e.kby += Math.sin(a) * w.pull * dt * 2; }
      }
      if (w.hostile && G.player.alive) {
        const P = G.player;
        const d = Math.hypot(P.x - w.x, P.y - w.y);
        if (d < w.r + P.r) {
          const a = angTo(P.x, P.y, w.x, w.y);
          P.x += Math.cos(a) * w.pull * 0.5 * dt; P.y += Math.sin(a) * w.pull * 0.5 * dt;
          if (w.dps) playerHurt(w.dps * dt * 1.5);
        }
      }
    }
    if (w.dps) {
      const out = [];
      G.eh.query(w.x, w.y, w.r + 20, out);
      for (const e of out) {
        if (e.dead) continue;
        if (Math.hypot(e.x - w.x, e.y - w.y) < w.r + e.r) {
          hurt(e, w.dps * dt, { src: w.src || 'player', silent: Math.random() > 0.25, fire: w.fire });
          if (w.fire) { e.dots.burn = Math.max(e.dots.burn, 3); e.dotT.burn = 1.5; e.dotSrc.burn = w.src; }
        }
      }
      if (w.fire) for (const p of G.props) { if (p.kind === 'oil' && !p.dead && Math.hypot(p.x - w.x, p.y - w.y) < 50) import('./world.js').then((m) => m.igniteOil(p)); }
    }
  }
}

// ==================== DRAW ====================
export function drawEnemies(R) {
  // incoming-spawn warning runes
  for (const s of G.spawnQueue) {
    const p = 1 - s.t / 0.65;
    const sc = (20 + p * 16) * 2 / (64 * 3);
    R.q('rune', s.x, s.y, { sx: sc, sy: sc, alpha: 0.35 + p * 0.45 + Math.sin(G.time * 16) * 0.1, layer: 6 });
  }
  for (const e of G.enemies) {
    if (e.dead) continue;
    const y = e.y;
    const spawnA = e.spawnT > 0 ? 1 - e.spawnT / 0.22 : 1;
    R.q('shadow', e.x, y + e.r * 0.85, { sx: e.r * 2 / 40, sy: e.r / 30, alpha: 0.24 * spawnA, layer: 6 });
    let tint = e.buffed ? '#d8b8ff' : '#ffffff';
    if (e.flash > 0) tint = '#ffc8b8';
    // animation language: leg frames for walkers, squash-bob for floaters, hit punch on damage
    let sprName = e.spr;
    if (e.type === 'husk' || e.type === 'lancer' || e.type === 'thief') sprName += Math.floor(e.t * 7 + e.id) % 2;
    const sq = 1 + Math.sin(e.t * 9 + e.id) * 0.05;
    const px = e.hitT > 0 ? 1 + e.hitT * 1.1 : 1;
    const py = e.hitT > 0 ? 1 - e.hitT * 1.6 : sq;
    const bob = Math.sin(e.t * 8 + e.id) * 1.2;
    R.q(sprName, e.x, y + bob, { sx: e.facing * e.scale * px, sy: e.scale * py, ay: 0.9, tint, alpha: spawnA, layer: 7 });
    if (e.flash > 0) R.q('glow', e.x, y - 8, { sx: e.r * 2.4 / 64 / 3, sy: e.r * 2.4 / 64 / 3, tint: '#ffffff', alpha: 0.5, layer: 9 });
    if (e.elite) {
      const pu = 0.5 + Math.sin(G.time * 4) * 0.2;
      R.q('ring', e.x, y + 4, { sx: (e.r * 2.4) * 2 / (64 * 3), sy: (e.r * 2.4) / (64 * 3) * 1, tint: '#ffb454', alpha: pu, layer: 6 });
    }
    if (e.marked > 0) R.text('x', e.x, y - e.r - 20, { s: 2, col: '#ff5ad2', align: 'center', layer: 10 });
    if (e.type === 'counter') {
      R.q('glow', e.x, y - 10, { sx: 0.9, sy: 0.9, tint: '#ffb454', alpha: 0.2, layer: 9 });
      R.text('ADAPT', e.x, y - e.r - 20, { s: 1.5, col: '#ffb454', align: 'center', alpha: 0.7 + Math.sin(G.time * 6) * 0.3, layer: 10 });
    }
    if (e.type === 'witness' && e.observeT > 5) {
      R.text('...', e.x, y - e.r - 18, { s: 2, col: '#ffb454', align: 'center', alpha: 0.4 + Math.sin(G.time * 8) * 0.3, layer: 10 });
    }
    // dots fx
    if (e.dotT.burn > 0 && Math.random() < 0.25) FX.burst(e.x + rand(-6, 6), y - 8, 1, { col: '#ff8a4a', spd: 40, life: 0.4, size: 1.6 });
    if (e.dotT.poison > 0 && Math.random() < 0.15) FX.trailDot(e.x + rand(-6, 6), y - 8, '#7dff9b', 1.4, 0.4);
    // hp bar for tanky stuff
    if ((e.elite || bigSet.has(e.type)) && e.hp < e.maxHp) {
      const w2 = e.r * 2;
      R.q('soft', e.x, y - e.r - 12, { sx: w2 / (64 * 3), sy: 3 / (8 * 3), tint: '#3a1010', alpha: 0.8, layer: 10 });
      R.q('soft', e.x - w2 / 2 + (w2 * e.hp / e.maxHp) / 2, y - e.r - 12, { sx: (w2 * e.hp / e.maxHp) / (64 * 3), sy: 3 / (8 * 3), tint: '#ff5a5a', alpha: 0.9, layer: 10 });
    }
  }
  // wisps
  for (const w of G.wisps) {
    R.q('wisp', w.x, w.y, { ay: 0.9, alpha: Math.min(1, w.t), layer: 7, tint: '#bfe9ff' });
    R.q('glow', w.x, w.y - 6, { sx: 0.5, sy: 0.5, tint: '#54e6ff', alpha: 0.2, layer: 9 });
  }
  // wells
  for (const w of G.wells) {
    const a = Math.min(1, w.t / 0.3);
    if (w.star) R.q('star', w.x, w.y, { sx: w.r * 2 / (48 * 3), sy: w.r * 2 / (48 * 3), alpha: a * 0.9, layer: 9 });
    else if (w.fire) R.q('firepool', w.x, w.y, { sx: w.r * 2.4 / (48 * 3), sy: w.r * 1.2 / (24 * 3), ay: 0.85, alpha: a * 0.9, layer: 5 });
    else if (w.shock) R.q('soft', w.x, w.y, { sx: w.r * 2 / (64 * 3), sy: w.r * 2 / (64 * 3), tint: '#9fd8ff', alpha: a * 0.3, layer: 5 });
    else R.q('well', w.x, w.y, { sx: w.r * 2 / (48 * 3), sy: w.r * 2 / (48 * 3), alpha: a, layer: 5, rot: G.time * 2 });
  }
}

let bannerRef = null;
export function setBanner(fn) { bannerRef = fn; }
function banner(t, s) { if (bannerRef) bannerRef(t, s); }
