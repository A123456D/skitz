/**
 * Physics: player ball movement, enemy steering, enemy-enemy bonk collisions
 * (the core mechanic), contact damage, wall ricochets. All via spatial hash.
 */
import { clamp } from '../engine/math';
import { ARENA_W, ARENA_H, OBST_CRATE, OBST_CHEST, World } from './state';
import { ENEMY_DEFS, ENEMY, type EnemyDef, type EnemyId } from './data/enemies';
import { ELITE_MOD } from './data/eliteMods';
import type { Events } from './events';

/** impact speed (px/s) above which a bonk deals damage */
export const IMPACT_THRESHOLD = 150;
/** enemies beyond this distance from the player teleport back onto the spawn ring */
const RECYCLE_DIST = 1100;
/** damage per (px/s) of impact speed above threshold, scaled by attacker charge */
const IMPACT_DMG_PER_SPEED = 0.055;
/** min |v| for an enemy to be considered "flying" for fx purposes */
const FLYING_SPEED = 190;

/** Jump feel: asymmetric gravity (snappy up, heavy down) + soft apex hang. */
export const JUMP_V = 330;
const G_UP = 900;
const G_DOWN = 1450;
const G_APEX = 480;
const SLAM_V = -560;
/** player is dodge-airborne above this height */
export const DODGE_Z = 26;

export function stepPlayer(w: World, inputX: number, inputY: number, dt: number, ev: Events, jumpQueued: boolean): void {
  const s = w.stats;
  // eased ground height under the player (smooth terrace stepping)
  w.egz = World.easeGroundZ(w.egz, w.groundHeightAt(w.px, w.py), dt);
  const groundZ = w.egz;
  const grounded = w.pz <= groundZ + 0.5 && w.pvz <= 0;

  // shrine buff countdown + zone tracking
  if (w.buff) {
    w.buff.t -= dt;
    if (w.buff.t <= 0) {
      w.buff = null;
      w.refreshStats();
    }
  }
  const zoneNameNow = w.zoneName(w.px, w.py);
  if (zoneNameNow !== w.lastZoneName) {
    w.lastZoneName = zoneNameNow;
    ev.zoneChange(zoneNameNow);
  }

  // terrain patches under the ball
  const patch = w.patchAt(w.px, w.py);
  const onIce = patch === 'ice';
  const onGoo = patch === 'goo';
  if (w.playerSlowT > 0) w.playerSlowT -= dt;
  const slowed = w.playerSlowT > 0 ? 0.72 : 1;

  // ---- jump / body slam ----
  if (jumpQueued) {
    if (grounded) {
      w.pvz = JUMP_V * (1 + Math.min(0.25, (s.speed / s.mass) * 0.0006)); // heavier balls jump a touch lower
      w.pz = Math.max(w.pz, groundZ);
      ev.playerJump();
    } else if (!w.slamming) {
      w.slamming = true;
      w.pvz = SLAM_V;
      ev.playerSlamStart(w.px, w.py);
    }
  }

  // ---- vertical physics ----
  if (w.pz > groundZ || w.pvz > 0) {
    const rising = w.pvz > 40;
    const falling = w.pvz < -40;
    const g = rising ? G_UP : falling ? G_DOWN : G_APEX;
    if (w.slamming) w.pvz -= G_DOWN * 1.15 * dt;
    else w.pvz -= g * dt;
    w.pz += w.pvz * dt;
    w.airborneT += dt;
    if (w.pz <= groundZ && w.pvz <= 0) {
      // landing
      const slamLanding = w.slamming;
      w.pz = groundZ;
      w.pvz = 0;
      w.slamming = false;
      w.airborneT = 0;
      if (slamLanding) {
        bodySlam(w, ev);
      } else {
        ev.playerLand(w.px, w.py);
      }
    }
  } else {
    w.pz = groundZ;
    w.airborneT = 0;
  }

  // ---- boost pad surge ----
  if (w.playerBoostT > 0) {
    w.playerBoostT -= dt;
    w.pvx += (w.playerBoostDx * s.speed * 2.1 - w.pvx) * Math.min(1, 10 * dt);
    w.pvy += (w.playerBoostDy * s.speed * 2.1 - w.pvy) * Math.min(1, 10 * dt);
  }

  if (w.dashT > 0) {
    w.dashT -= dt;
    w.pvx = w.dashDx * s.speed * 4.4;
    w.pvy = w.dashDy * s.speed * 4.4;
  } else {
    // rolling ball: accelerate toward input, keep a little drift
    const accel = onIce ? 2.4 : 9; // ice: drift
    const speedMul = (onGoo ? 0.72 : 1) * slowed; // goo: sluggish; Frostbound auras chill
    const tx = inputX * s.speed * speedMul;
    const ty = inputY * s.speed * speedMul;
    const k = 1 - Math.exp(-accel * dt);
    w.pvx += (tx - w.pvx) * k;
    w.pvy += (ty - w.pvy) * k;
  }

  const sp = Math.hypot(w.pvx, w.pvy);
  if (sp > 12) {
    w.facingX = w.pvx / sp;
    w.facingY = w.pvy / sp;
    w.rolling += sp * dt * 0.05;
  }

  w.px += w.pvx * dt;
  w.py += w.pvy * dt;
  bounceWallsPlayer(w);
  collidePlayerObstacles(w, ev);
  collidePlayerWalls(w, ev);
  collidePlayerBumpers(w, ev);
  collidePlayerPads(w, dt, ev);

  // regen + contact aura
  if (s.regen > 0 && w.hp < s.maxHp) w.hp = Math.min(s.maxHp, w.hp + s.regen * dt);
  if (s.contactDps > 0) {
    const r = 22 * s.areaMult;
    w.hash.queryCircle(w.px, w.py, r + 16, (i) => {
      const dx = w.ex[i] - w.px;
      const dy = w.ey[i] - w.py;
      const rr = r + w.eradius[i];
      if (dx * dx + dy * dy <= rr * rr && w.eorbIframe[i] <= 0) {
        w.eorbIframe[i] = 0.4;
        damageEnemy(w, i, s.contactDps * 0.4, 0, 0, ev);
      }
      return true;
    });
  }

  if (w.hurtIframe > 0) w.hurtIframe -= dt;
}

/** Body slam landing: AoE damage + launch, scaled by mass and impact stats. */
function bodySlam(w: World, ev: Events): void {
  const s = w.stats;
  const radius = 84 * s.areaMult + s.mass * 8;
  const dmg = (14 + 10 * s.mass) * s.impactDmg * s.dmgMult;
  const knock = 300 * s.knockMult;
  ev.groundSlam(w.px, w.py, radius);
  const hit: number[] = [];
  w.hash.queryCircle(w.px, w.py, radius + 16, (i) => {
    const dx = w.ex[i] - w.px;
    const dy = w.ey[i] - w.py;
    const rr = radius + w.eradius[i];
    if (dx * dx + dy * dy <= rr * rr) hit.push(i);
    return true;
  });
  for (const i of hit) {
    damageEnemy(w, i, dmg, knock, null, ev, true);
  }
  // slam also cracks crates
  w.obstHash.queryCircle(w.px, w.py, radius + 18, (i) => {
    if (w.otype[i] !== OBST_CRATE || w.ohp[i] <= 0) return true;
    const dx = w.ox[i] - w.px;
    const dy = w.oy[i] - w.py;
    const rr = radius + w.oradius[i];
    if (dx * dx + dy * dy <= rr * rr) damageObstacle(w, i, dmg * 1.4, ev);
    return true;
  });
}

function bounceWallsPlayer(w: World): void {
  const r = 9;
  if (w.px < r) { w.px = r; w.pvx = Math.abs(w.pvx) * 0.5; }
  if (w.py < r) { w.py = r; w.pvy = Math.abs(w.pvy) * 0.5; }
  if (w.px > ARENA_W - r) { w.px = ARENA_W - r; w.pvx = -Math.abs(w.pvx) * 0.5; }
  if (w.py > ARENA_H - r) { w.py = ARENA_H - r; w.pvy = -Math.abs(w.pvy) * 0.5; }
}

/** Live-obstacle check for query callbacks. */
export function obstacleAlive(w: World, i: number): boolean {
  if (w.otype[i] === OBST_CRATE || w.otype[i] === OBST_CHEST) return w.ohp[i] > 0;
  return true;
}

/** Circle vs interior wall segment: push out and slide. */
function collideWallsEntity(w: World, pos: { x: number; y: number }, vel: { x: number; y: number }, r: number, restitution: number): void {
  for (const seg of w.wallSegs) {
    const cx = Math.max(seg.x, Math.min(pos.x, seg.x + seg.w));
    const cy = Math.max(seg.y, Math.min(pos.y, seg.y + seg.h));
    let dx = pos.x - cx;
    let dy = pos.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    if (d2 < 1e-6) {
      // center inside the rect: push along the least-penetration axis
      const left = pos.x - seg.x;
      const right = seg.x + seg.w - pos.x;
      const top = pos.y - seg.y;
      const bottom = seg.y + seg.h - pos.y;
      const m = Math.min(left, right, top, bottom);
      if (m === left) { pos.x = seg.x - r; if (vel.x > 0) vel.x *= -restitution; }
      else if (m === right) { pos.x = seg.x + seg.w + r; if (vel.x < 0) vel.x *= -restitution; }
      else if (m === top) { pos.y = seg.y - r; if (vel.y > 0) vel.y *= -restitution; }
      else { pos.y = seg.y + seg.h + r; if (vel.y < 0) vel.y *= -restitution; }
      continue;
    }
    const d = Math.sqrt(d2);
    const nx = dx / d;
    const ny = dy / d;
    pos.x = cx + nx * r;
    pos.y = cy + ny * r;
    const vn = vel.x * nx + vel.y * ny;
    if (vn < 0) {
      vel.x -= (1 + restitution) * vn * nx;
      vel.y -= (1 + restitution) * vn * ny;
    }
  }
}

function collidePlayerWalls(w: World, ev: Events): void {
  const pos = { x: w.px, y: w.py };
  const vel = { x: w.pvx, y: w.pvy };
  collideWallsEntity(w, pos, vel, 9, 0.55);
  w.px = pos.x;
  w.py = pos.y;
  w.pvx = vel.x;
  w.pvy = vel.y;
  void ev;
}

function collidePlayerBumpers(w: World, ev: Events): void {
  for (const b of w.bumpers) {
    if (b.flash > 0) {
      b.flash -= 1 / 60;
      continue;
    }
    const dx = w.px - b.x;
    const dy = w.py - b.y;
    const rr = b.r + 9;
    const d2 = dx * dx + dy * dy;
    if (d2 > rr * rr) continue;
    const d = Math.sqrt(d2) || 1;
    const nx = dx / d;
    const ny = dy / d;
    const exit = Math.max(Math.hypot(w.pvx, w.pvy), 430);
    w.pvx = nx * exit;
    w.pvy = ny * exit;
    w.px = b.x + nx * (rr + 2);
    w.py = b.y + ny * (rr + 2);
    b.flash = 0.22;
    ev.bumperHit(b.x, b.y);
  }
}

function collidePlayerPads(w: World, dt: number, ev: Events): void {
  // boost pads
  for (const p of w.boostPads) {
    if (p.flash > 0) {
      p.flash -= dt;
      continue;
    }
    if (w.px > p.x && w.px < p.x + p.w && w.py > p.y && w.py < p.y + p.h) {
      w.playerBoostT = 0.35;
      w.playerBoostDx = p.dx;
      w.playerBoostDy = p.dy;
      p.flash = 0.6;
      ev.boostPad(p.x + p.w / 2, p.y + p.h / 2);
    }
  }
  // jump pads: launch higher than a normal jump
  if (w.pz <= w.egz + 0.5) {
    for (const j of w.jumpPads) {
      if (j.flash > 0) {
        j.flash -= dt;
        continue;
      }
      const dx = w.px - j.x;
      const dy = w.py - j.y;
      if (dx * dx + dy * dy < 30 * 30) {
        w.pvz = 470;
        w.pz = Math.max(w.pz, w.egz);
        j.flash = 0.8;
        ev.jumpPad(j.x, j.y);
      }
    }
  }
}

/** Player bounces off pillars/crates; hard rams smash crates. */
function collidePlayerObstacles(w: World, ev: Events): void {
  w.obstHash.queryCircle(w.px, w.py, 34, (i) => {
    if (!obstacleAlive(w, i)) return true;
    const rr = 9 + w.oradius[i];
    let dx = w.px - w.ox[i];
    let dy = w.py - w.oy[i];
    const d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr) return true;
    const d = Math.sqrt(d2) || 0.01;
    const nx = dx / d;
    const ny = dy / d;
    w.px = w.ox[i] + nx * rr;
    w.py = w.oy[i] + ny * rr;
    const vn = w.pvx * nx + w.pvy * ny;
    if (vn < 0) {
      const impact = -vn;
      w.pvx -= 1.6 * vn * nx; // restitution 0.6
      w.pvy -= 1.6 * vn * ny;
      if (impact > IMPACT_THRESHOLD) {
        if (w.otype[i] === OBST_CRATE) {
          damageObstacle(w, i, (impact - IMPACT_THRESHOLD) * 0.16 * w.stats.impactDmg, ev);
        }
        ev.impact(w.px, w.py, Math.min(1, impact / 480));
      }
    }
    return true;
  });
}

/** Static obstacles for enemies: bounce + high-speed impacts hurt the enemy. */
function collideEnemyObstacles(w: World, i: number, ev: Events): void {
  w.obstHash.queryCircle(w.ex[i], w.ey[i], w.eradius[i] + 22, (j) => {
    if (!obstacleAlive(w, j)) return true;
    const rr = w.eradius[i] + w.oradius[j];
    let dx = w.ex[i] - w.ox[j];
    let dy = w.ey[i] - w.oy[j];
    const d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr || d2 < 1e-6) return true;
    const d = Math.sqrt(d2);
    const nx = dx / d;
    const ny = dy / d;
    w.ex[i] = w.ox[j] + nx * rr;
    w.ey[i] = w.oy[j] + ny * rr;
    const vn = w.evx[i] * nx + w.evy[i] * ny;
    if (vn < 0) {
      const impact = -vn;
      w.evx[i] -= 1.55 * vn * nx;
      w.evy[i] -= 1.55 * vn * ny;
      if (impact > IMPACT_THRESHOLD + 40) {
        // enemies can wreck themselves on the scenery — on brand
        damageEnemy(w, i, (impact - IMPACT_THRESHOLD) * 0.05 * (w.echarge[i] > 0 ? 2 : 1), 0, null, ev);
        if (w.otype[j] === OBST_CRATE) damageObstacle(w, j, (impact - IMPACT_THRESHOLD) * 0.06, ev);
      }
    }
    return true;
  });
}

/** Applies damage to a crate/chest; pillars are indestructible. Safe mid-walk (no hash rebuild). */
export function damageObstacle(w: World, i: number, dmg: number, ev: Events): void {
  if (w.otype[i] !== OBST_CRATE && w.otype[i] !== OBST_CHEST) return;
  if (w.ohp[i] <= 0) return;
  w.ohp[i] -= dmg;
  w.oflash[i] = 0.12;
  ev.crateHit(w.ox[i], w.oy[i]);
  if (w.ohp[i] <= 0) {
    if (w.otype[i] === OBST_CHEST) {
      ev.chestOpened(w.ox[i], w.oy[i]);
      for (let g = 0; g < 5; g++) w.spawnGem(w.ox[i], w.oy[i], 1, 3);
      for (let g = 0; g < 4; g++) w.spawnGem(w.ox[i] + w.rng.range(-8, 8), w.oy[i] + w.rng.range(-8, 8), 0, 8);
    } else {
      ev.obstacleBreak(w.ox[i], w.oy[i]);
      if (w.rng.chance(0.2)) w.spawnGem(w.ox[i], w.oy[i], 1, 2);
    }
    w.destroyObstacle(i);
  }
}

export function stepEnemies(w: World, dt: number, ev: Events): void {
  let n = w.eCount;
  if (w.obstDirty) {
    w.rebuildObstHash();
    w.obstDirty = false;
  }

  // recycle strays: anyone too far from the fight re-enters on the spawn ring
  for (let i = 0; i < n; i++) {
    if (w.ewindup[i] > 0 || w.eexploding[i] > 0) continue;
    const dx = w.ex[i] - w.px;
    const dy = w.ey[i] - w.py;
    if (dx * dx + dy * dy > RECYCLE_DIST * RECYCLE_DIST) {
      const a = Math.atan2(dy, dx) + (Math.random() - 0.5) * 1.2;
      const d = 560 + Math.random() * 80;
      w.ex[i] = clampArenaCoord(w.px + Math.cos(a) * d, ARENA_W);
      w.ey[i] = clampArenaCoord(w.py + Math.sin(a) * d, ARENA_H);
      w.evx[i] = 0;
      w.evy[i] = 0;
    }
  }

  // rebuild hash
  w.hash.clear(n);
  for (let i = 0; i < n; i++) w.hash.insert(i, w.ex[i], w.ey[i]);

  for (let i = 0; i < n; i++) {
    const def = ENEMY_DEFS[w.etype[i]];

    // fuse for primed exploders
    if (w.eexploding[i] > 0) {
      w.eexploding[i] -= dt;
      if (w.eexploding[i] <= 0) {
        detonate(w, i, ev);
        n = w.eCount; // pool shrank
        i--;
        continue;
      }
    }

    if (w.eflash[i] > 0) w.eflash[i] -= dt;
    if (w.echarge[i] > 0) w.echarge[i] -= dt;
    if (w.eorbIframe[i] > 0) w.eorbIframe[i] -= dt;
    if (w.eactive[i] > 0) w.eactive[i] -= dt;

    // ---- special attack: cooldown -> windup (telegraph) -> act ----
    const atk = def.attack;
    if (atk && w.eexploding[i] <= 0) {
      if (w.ewindup[i] > 0) {
        w.ewindup[i] -= dt;
        if (w.ewindup[i] <= 0) executeAttack(w, i, atk, ev);
      } else if (w.eactive[i] <= 0) {
        w.eatkCd[i] -= dt;
        if (w.eatkCd[i] <= 0) {
          const adx = w.px - w.ex[i];
          const ady = w.py - w.ey[i];
          const ad = Math.hypot(adx, ady);
          if (ad <= atk.range && ad > 1) {
            w.ewindup[i] = atk.windup * (def.boss && w.bossEnraged ? 0.7 : 1);
            w.edirX[i] = adx / ad;
            w.edirY[i] = ady / ad;
            w.eatkCd[i] = atk.cd * (def.boss && w.bossEnraged ? 0.6 : 1);
            ev.enemyAttack(w.ex[i], w.ey[i], atk.kind);
          } else {
            w.eatkCd[i] = 0.4; // out of range — retry soon
          }
        }
      }
    }
    // steering: velocity relaxes toward seek direction; knockback decays naturally
    let dx = w.px - w.ex[i];
    let dy = w.py - w.ey[i];
    const d = Math.hypot(dx, dy) || 1;
    dx /= d;
    dy /= d;
    // Greedy elites flee when you get close — catch your treasure
    if (w.emod[i] === ELITE_MOD.greedy && d < 320 && w.eactive[i] <= 0 && w.ewindup[i] <= 0) {
      dx = -dx;
      dy = -dy;
    }
    const ePatch = w.patchAt(w.ex[i], w.ey[i]);
    let spd = def.speed * (w.eelite[i] ? 1.15 : 1);
    if (def.boss) spd *= (1 + Math.min(0.5, w.runStats.time / 600)) * bossEnrageSpeedMult(w, i);
    if (w.emod[i] === ELITE_MOD.juggernaut) spd *= 1.15;
    if (w.ewindup[i] > 0) spd *= 0.06; // brace during telegraph
    if (ePatch === 'goo') spd *= 0.7;
    if (w.eslow[i] > 0) {
      w.eslow[i] -= dt;
      spd *= 0.45; // Tesla Web / Stormcaller static
    }
    const steerRate = ePatch === 'ice' ? 1.0 : 3.2; // ice: everything slides
    const k = 1 - Math.exp(-steerRate * dt);
    w.evx[i] += (dx * spd - w.evx[i]) * k;
    w.evy[i] += (dy * spd - w.evy[i]) * k;

    w.ex[i] += w.evx[i] * dt;
    w.ey[i] += w.evy[i] * dt;

    // interior walls: push out and slide
    const epos = { x: w.ex[i], y: w.ey[i] };
    const evel = { x: w.evx[i], y: w.evy[i] };
    collideWallsEntity(w, epos, evel, w.eradius[i], 0.6);
    w.ex[i] = epos.x;
    w.ey[i] = epos.y;
    w.evx[i] = evel.x;
    w.evy[i] = evel.y;

    // pinball bumpers fling enemies too
    for (const b of w.bumpers) {
      if (b.flash > 0) continue;
      const bdx = w.ex[i] - b.x;
      const bdy = w.ey[i] - b.y;
      const brr = b.r + w.eradius[i];
      const bd2 = bdx * bdx + bdy * bdy;
      if (bd2 <= brr * brr) {
        const bd = Math.sqrt(bd2) || 1;
        const exit = Math.max(Math.hypot(w.evx[i], w.evy[i]), 380);
        w.evx[i] = (bdx / bd) * exit;
        w.evy[i] = (bdy / bd) * exit;
        w.ex[i] = b.x + (bdx / bd) * (brr + 2);
        w.ey[i] = b.y + (bdy / bd) * (brr + 2);
        b.flash = 0.22;
        ev.bumperHit(b.x, b.y);
      }
    }

    // walls — ricochet identity
    const r = w.eradius[i];
    const speed2 = w.evx[i] * w.evx[i] + w.evy[i] * w.evy[i];
    if (w.ex[i] < r) { w.ex[i] = r; if (w.evx[i] < 0) w.evx[i] *= -0.65; }
    else if (w.ex[i] > ARENA_W - r) { w.ex[i] = ARENA_W - r; if (w.evx[i] > 0) w.evx[i] *= -0.65; }
    if (w.ey[i] < r) { w.ey[i] = r; if (w.evy[i] < 0) w.evy[i] *= -0.65; }
    else if (w.ey[i] > ARENA_H - r) { w.ey[i] = ARENA_H - r; if (w.evy[i] > 0) w.evy[i] *= -0.65; }
    if (speed2 > FLYING_SPEED * FLYING_SPEED) {
      const wx = w.ex[i] < r || w.ex[i] > ARENA_W - r;
      const wy = w.ey[i] < r || w.ey[i] > ARENA_H - r;
      if (wx || wy) ev.wallBonk(w.ex[i], w.ey[i], Math.min(1, Math.sqrt(speed2) / 420));
    }

    // obstacles — enemies bonk off pillars and can wreck themselves
    collideEnemyObstacles(w, i, ev);
  }

  // enemy-enemy bonks
  solveEnemyCollisions(w, ev);

  // player contact — airborne players dodge everything grounded
  for (let i = 0; i < w.eCount; i++) {
    if (w.hurtIframe > 0) break;
    const def = ENEMY_DEFS[w.etype[i]];
    const egz = w.groundHeightAt(w.ex[i], w.ey[i]);
    if (w.pz - egz >= DODGE_Z) continue; // sailed over them
    const dx = w.ex[i] - w.px;
    const dy = w.ey[i] - w.py;
    const rr = w.eradius[i] + 9;
    if (dx * dx + dy * dy <= rr * rr) {
      if (def.explodes && w.eexploding[i] <= 0) {
        w.eexploding[i] = def.explodes.fuse;
        continue;
      }
      if (def.boss) {
        // boss knockback shoves the player instead
        const d = Math.hypot(dx, dy) || 1;
        w.pvx -= (dx / d) * 260;
        w.pvy -= (dy / d) * 260;
      } else if (w.eactive[i] > 0 && (def.attack?.kind === 'lunge' || def.attack?.kind === 'charge')) {
        // mid-attack: the lunge connects and hurts the player even if the player is also moving
        hurtPlayer(w, def.contactDmg * (w.eelite[i] ? 1.4 : 1), ev);
        const d = Math.hypot(dx, dy) || 1;
        w.pvx += (dx / d) * -200;
        w.pvy += (dy / d) * -200;
      } else {
        // physical shove both ways
        const d = Math.hypot(dx, dy) || 1;
        const rel = (w.pvx - w.evx[i]) * (-dx / d) + (w.pvy - w.evy[i]) * (-dy / d);
        if (rel > IMPACT_THRESHOLD) {
          // player rams enemy — that's a hit, not a hurt
          impactBonk(w, i, rel, true, ev);
        } else {
          hurtPlayer(w, def.contactDmg * (w.eelite[i] ? 1.4 : 1), ev);
          w.pvx += (dx / d) * -160;
          w.pvy += (dy / d) * -160;
        }
      }
      w.hurtIframe = 0.35;
    }
  }
}

function solveEnemyCollisions(w: World, ev: Events): void {
  const zone = 700 * 700; // only solve pairs near the fight — far enemies just steer
  for (let i = 0; i < w.eCount; i++) {
    const dxi = w.ex[i] - w.px;
    const dyi = w.ey[i] - w.py;
    if (dxi * dxi + dyi * dyi > zone) continue;
    const ri = w.eradius[i];
    w.hash.queryCircle(w.ex[i], w.ey[i], ri + 14, (j) => {
      if (j <= i) return true;
      const rj = w.eradius[j];
      let dx = w.ex[j] - w.ex[i];
      let dy = w.ey[j] - w.ey[i];
      const rr = ri + rj;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr || d2 < 1e-6) return true;
      const d = Math.sqrt(d2);
      dx /= d;
      dy /= d;

      // positional correction split by inverse mass
      const overlap = rr - d;
      const im1 = 1 / w.emass[i];
      const im2 = 1 / w.emass[j];
      const tot = im1 + im2;
      w.ex[i] -= dx * overlap * (im1 / tot);
      w.ey[i] -= dy * overlap * (im1 / tot);
      w.ex[j] += dx * overlap * (im2 / tot);
      w.ey[j] += dy * overlap * (im2 / tot);

      // impulse along normal
      const rvx = w.evx[j] - w.evx[i];
      const rvy = w.evy[j] - w.evy[i];
      const rel = rvx * dx + rvy * dy;
      if (rel < 0) {
        const e = 0.55; // bounce
        const jImp = -(1 + e) * rel / tot;
        w.evx[i] -= dx * jImp * im1;
        w.evy[i] -= dy * jImp * im1;
        w.evx[j] += dx * jImp * im2;
        w.evy[j] += dy * jImp * im2;

        const impactSpeed = -rel;
        if (impactSpeed > IMPACT_THRESHOLD) {
          // whoever is charged / faster deals impact damage to the other
          const iCharged = w.echarge[i] > 0;
          const jCharged = w.echarge[j] > 0;
          if (iCharged || w.etype[i] === ENEMY.boss) impactBonk(w, j, impactSpeed * (iCharged ? 1 : 0.4), iCharged, ev);
          if (jCharged || w.etype[j] === ENEMY.boss) impactBonk(w, i, impactSpeed * (jCharged ? 1 : 0.4), jCharged, ev);
          if (!iCharged && !jCharged) {
            // mundane collisions still ping at high speed (no damage)
            ev.impact(w.ex[i], w.ey[i], Math.min(0.7, impactSpeed / 500));
          }
        }
      }
      return true;
    });
  }
}

/** Enemy i gets bonked with `speed` impact; deals impact damage scaled by charge/knock stats. */
function impactBonk(w: World, i: number, speed: number, charged: boolean, ev: Events): void {
  const dmg = (speed - IMPACT_THRESHOLD) * IMPACT_DMG_PER_SPEED * w.stats.impactDmg * (charged ? 2.2 : 1) * w.stats.knockMult;
  ev.impact(w.ex[i], w.ey[i], Math.min(1, speed / 500));
  if (dmg > 0.5) damageEnemy(w, i, dmg, speed * 0.25 * w.stats.knockMult / w.emass[i], 0, ev, charged);
}

/** The windup finished — perform the attack. Never mutates the enemy pool. */
function executeAttack(w: World, i: number, atk: NonNullable<EnemyDef['attack']>, ev: Events): void {
  const x = w.ex[i];
  const y = w.ey[i];
    switch (atk.kind) {
    case 'lunge':
    case 'charge': {
      const power = atk.power * (ENEMY_DEFS[w.etype[i]].boss && w.bossEnraged ? BOSS_ENRAGE_CHARGE : 1);
      w.evx[i] += w.edirX[i] * power;
      w.evy[i] += w.edirY[i] * power;
      w.eactive[i] = atk.kind === 'charge' ? 0.6 : 0.4;
      break;
    }
    case 'spit': {
      const ranged = ENEMY_DEFS[w.etype[i]].ranged;
      if (ranged) {
        let dx = w.px - x;
        let dy = w.py - y;
        const d = Math.hypot(dx, dy) || 1;
        dx /= d;
        dy /= d;
        w.spawnEnemyBullet(x + dx * 8, y + dy * 8, dx * ranged.speed, dy * ranged.speed, ranged.dmg);
        // recoil kick backwards
        w.evx[i] -= dx * 130;
        w.evy[i] -= dy * 130;
        w.eactive[i] = 0.18;
      }
      break;
    }
    case 'pound': {
      const radius = atk.power;
      ev.pound(x, y, radius);
      const pdx = w.px - x;
      const pdy = w.py - y;
      const pd2 = pdx * pdx + pdy * pdy;
      if (pd2 < (radius + 9) * (radius + 9)) {
        hurtPlayer(w, atk.dmg ?? 15, ev);
        const pd = Math.sqrt(pd2) || 1;
        w.pvx += (pdx / pd) * 320;
        w.pvy += (pdy / pd) * 320;
      }
      // the shockwave shoves other enemies outward (no damage)
      w.hash.queryCircle(x, y, radius + 14, (j) => {
        if (j === i) return true;
        const jdx = w.ex[j] - x;
        const jdy = w.ey[j] - y;
        const jd = Math.hypot(jdx, jdy) || 1;
        if (jd < radius + w.eradius[j]) {
          w.evx[j] += (jdx / jd) * 280 / w.emass[j];
          w.evy[j] += (jdy / jd) * 280 / w.emass[j];
        }
        return true;
      });
      break;
    }
  }
}

export function damageEnemy(w: World, i: number, dmg: number, knock: number, knockAngle: number | null, ev: Events, charged = false): boolean {
  if (w.ehp[i] <= 0) return false;
  const d = ENEMY_DEFS[w.etype[i]];
  dmg *= w.evDmgMult; // ENEMY FRENZY takes +50%, OVERCHARGE deals +40%
  w.ehp[i] -= dmg;
  w.eflash[i] = 0.12;
  w.runStats.damageDealt += dmg;
  if (knock > 0) {
    const a = knockAngle ?? Math.atan2(w.ey[i] - w.py, w.ex[i] - w.px);
    let resist = d.knockMult * (w.eelite[i] ? 0.6 : 1);
    if (w.emod[i] === ELITE_MOD.juggernaut) resist *= 0.15; // barely moves
    const k = knock * resist;
    w.evx[i] += Math.cos(a) * k;
    w.evy[i] += Math.sin(a) * k;
  }
  if (charged) w.echarge[i] = Math.max(w.echarge[i], 0.9);
  ev.hitEnemy(w.ex[i], w.ey[i], dmg);
  if (w.ehp[i] <= 0) {
    killEnemyByIndex(w, i, ev);
    return true;
  }
  if (d.boss && !w.bossEnraged && w.ehp[i] <= w.emaxhp[i] * 0.5) {
    enrageBoss(w, i, ev);
  }
  return false;
}

const BOSS_ENRAGE_SPEED = 1.45;
const BOSS_ENRAGE_CHARGE = 1.3;

/** Boss phase 2: shockwave + a type-specific mean streak. */
function enrageBoss(w: World, i: number, ev: Events): void {
  w.bossEnraged = true;
  const x = w.ex[i];
  const y = w.ey[i];
  ev.bossEnrage(x, y, w.etype[i]);
  // shove everything outward — the arena takes a step back
  w.hash.queryCircle(x, y, 320, (j) => {
    if (j >= w.eCount || j === i) return true;
    const dx = w.ex[j] - x;
    const dy = w.ey[j] - y;
    const d = Math.hypot(dx, dy) || 1;
    w.evx[j] += (dx / d) * 340 / w.emass[j];
    w.evy[j] += (dy / d) * 340 / w.emass[j];
    return true;
  });
  const pdx = w.px - x;
  const pdy = w.py - y;
  const pd = Math.hypot(pdx, pdy) || 1;
  if (pd < 340) {
    w.pvx += (pdx / pd) * 380;
    w.pvy += (pdy / pd) * 380;
  }
  if (w.etype[i] === ENEMY.krusher) {
    // KRUSHER calls the pit: summons depth-scaled children in a ring
    const hs = 1 + w.runStats.time / 900;
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2;
      const type = k % 2 === 0 ? ENEMY.imp : ENEMY.exploder;
      const ni = w.spawnEnemy(type, x + Math.cos(a) * 70, y + Math.sin(a) * 70, false, hs);
      if (ni >= 0) {
        w.evx[ni] = Math.cos(a) * 140;
        w.evy[ni] = Math.sin(a) * 140;
      }
    }
  } else {
    // BONZAR: shrapnel ring
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      w.spawnEnemyBullet(x + Math.cos(a) * 18, y + Math.sin(a) * 18, Math.cos(a) * 150, Math.sin(a) * 150, 10);
    }
  }
  w.evx[i] += (w.px - x) / pd * 120;
  w.evy[i] += (w.py - y) / pd * 120;
}

/** true while this enemy is an enraged boss (movement/attack scaling). */
export function bossEnrageSpeedMult(w: World, i: number): number {
  return ENEMY_DEFS[w.etype[i]].boss && w.bossEnraged ? BOSS_ENRAGE_SPEED : 1;
}

export function killEnemyByIndex(w: World, i: number, ev: Events): void {
  const def = ENEMY_DEFS[w.etype[i]];
  const x = w.ex[i];
  const y = w.ey[i];
  const elite = w.eelite[i] === 1;
  const mod = w.emod[i];
  w.runStats.kills++;
  ev.enemyDeath(x, y, w.etype[i], elite);

  // drops
  const xp = def.xp * (elite ? 4 : 1);
  const gemBurst = elite ? 4 : xp > 10 ? 5 : xp > 3 ? 2 : 1;
  const perGem = Math.max(1, Math.round(xp / gemBurst));
  for (let g = 0; g < gemBurst; g++) {
    w.spawnGem(x + w.rng.range(-6, 6), y + w.rng.range(-6, 6), 0, perGem);
  }
  if (mod === ELITE_MOD.greedy) {
    // treasure elite: a whole fortune, in coin form
    for (let g = 0; g < 6; g++) w.spawnGem(x + w.rng.range(-14, 14), y + w.rng.range(-14, 14), 1, 4);
    w.spawnGem(x, y, 1, 6);
    ev.cacheLooted(x, y);
  } else if (w.goldrushT > 0) {
    // GOLD RUSH: every kill rains coins at double value
    w.spawnGem(x, y, 1, (elite ? 5 : 2) * 2);
    if (w.rng.chance(0.3)) w.spawnGem(x + w.rng.range(-12, 12), y + w.rng.range(-12, 12), 1, 2);
  } else if (elite || w.rng.chance(0.02)) {
    w.spawnGem(x, y, 1, elite ? 5 : 1);
  }

  // splitter children
  if (def.splits && !elite) {
    for (let c = 0; c < def.splits.count; c++) {
      const a = w.rng.angle();
      const ni = w.spawnEnemy(def.splits.into, x + Math.cos(a) * 10, y + Math.sin(a) * 10, false, 1);
      if (ni >= 0) {
        w.evx[ni] = Math.cos(a) * 160;
        w.evy[ni] = Math.sin(a) * 160;
      }
    }
  } else if (mod === ELITE_MOD.splitting) {
    // the elite itself splits — children carry no modifier
    for (let c = 0; c < 2; c++) {
      const a = w.rng.angle();
      const ni = w.spawnEnemy(w.etype[i] as EnemyId, x + Math.cos(a) * 14, y + Math.sin(a) * 14, false, 0.6);
      if (ni >= 0) {
        w.evx[ni] = Math.cos(a) * 180;
        w.evy[ni] = Math.sin(a) * 180;
      }
    }
  }

  // Volatile elites pop into charged shrapnel — feed the bonk chains
  if (mod === ELITE_MOD.volatile) {
    volatilePop(w, i, x, y, ev);
    return; // volatilePop performs the kill
  }

  // boss dies: first time = the arena is cleared; during DESCEND it's a payout pit stop
  if (def.boss) {
    w.wonRun = true;
    w.bossAlive = false;
    w.bossEnraged = false;
    if (w.descendLevel > 0) {
      for (let g = 0; g < 12; g++) w.spawnGem(x + w.rng.range(-30, 30), y + w.rng.range(-30, 30), 1, 6);
      w.hp = Math.min(w.stats.maxHp, w.hp + w.stats.maxHp * 0.3);
    } else {
      w.endState = 'won';
    }
  }

  w.killEnemy(i, () => {});
}

/** Volatile death: explosion, player knockback, and everyone nearby becomes charged shrapnel bait. */
function volatilePop(w: World, i: number, x: number, y: number, ev: Events): void {
  const radius = 110;
  ev.explosion(x, y, radius);
  const pdx = w.px - x;
  const pdy = w.py - y;
  if (pdx * pdx + pdy * pdy < (radius + 9) * (radius + 9)) {
    hurtPlayer(w, 8, ev);
    const d = Math.hypot(pdx, pdy) || 1;
    w.pvx += (pdx / d) * 220;
    w.pvy += (pdy / d) * 220;
  }
  const dead = new Set<number>();
  w.hash.queryCircle(x, y, radius + 12, (j) => {
    if (j === i) return true;
    const dx = w.ex[j] - x;
    const dy = w.ey[j] - y;
    const d2 = dx * dx + dy * dy;
    const rr = radius + w.eradius[j];
    if (d2 < rr * rr) {
      const d = Math.sqrt(d2) || 1;
      w.evx[j] += (dx / d) * 240 / w.emass[j];
      w.evy[j] += (dy / d) * 240 / w.emass[j];
      w.echarge[j] = Math.max(w.echarge[j], 1.3);
      dead.add(j);
    }
    return true;
  });
  const type = w.etype[i];
  const isBoss = ENEMY_DEFS[type].boss;
  w.killEnemy(i, () => {});
  if (isBoss) w.endState = 'won';
  for (const j of dead) {
    if (j < w.eCount) damageEnemy(w, j, 9, 0, null, ev);
  }
}

/**
 * Elite modifier per-tick behaviors (auras + ranged pokes).
 * Called from Run.tick after stepEnemies.
 */
export function stepEliteMods(w: World, dt: number, ev: Events): void {
  for (let i = 0; i < w.eCount; i++) {
    const mod = w.emod[i];
    if (mod === 0) continue;
    const dx = w.px - w.ex[i];
    const dy = w.py - w.ey[i];
    const d2 = dx * dx + dy * dy;
    const dist = Math.sqrt(d2);

    if (mod === ELITE_MOD.frostbound) {
      // icy aura chills the player when close
      if (dist < w.eradius[i] + 85) w.playerSlowT = Math.max(w.playerSlowT, 0.2);
    } else if (mod === ELITE_MOD.vampiric) {
      // drains life into nearby allies
      w.emodCd[i] -= dt;
      if (w.emodCd[i] <= 0) {
        w.emodCd[i] = 0.5;
        w.hash.queryCircle(w.ex[i], w.ey[i], 130, (j) => {
          if (w.ehp[j] > 0 && w.ehp[j] < w.emaxhp[j]) {
            w.ehp[j] = Math.min(w.emaxhp[j], w.ehp[j] + w.emaxhp[j] * 0.012);
            w.eflash[j] = 0.08; // faint drain flicker
          }
          return true;
        });
      }
    } else if (mod === ELITE_MOD.stormtouched) {
      // periodic static bolt at the player
      w.emodCd[i] -= dt;
      if (w.emodCd[i] <= 0) {
        if (dist < 300 && dist > 1) {
          w.emodCd[i] = 3;
          const sp = 250;
          w.spawnEnemyBullet(w.ex[i], w.ey[i], (dx / dist) * sp, (dy / dist) * sp, 7);
          ev.zap(w.ex[i], w.ey[i], w.px, w.py);
        } else {
          w.emodCd[i] = 0.6; // out of range — check again soon
        }
      }
    }
  }
}

function detonate(w: World, i: number, ev: Events): void {
  const def = ENEMY_DEFS[w.etype[i]];
  const x = w.ex[i];
  const y = w.ey[i];
  const radius = (def.explodes?.radius ?? 70) * (w.eelite[i] ? 1.3 : 1);
  const dmg = (def.explodes?.dmg ?? 20) * (w.eelite[i] ? 1.5 : 1);
  ev.explosion(x, y, radius);

  // hurt player if close
  const pdx = w.px - x;
  const pdy = w.py - y;
  if (pdx * pdx + pdy * pdy < (radius + 9) * (radius + 9)) {
    hurtPlayer(w, dmg, ev);
    const d = Math.hypot(pdx, pdy) || 1;
    w.pvx += (pdx / d) * 240;
    w.pvy += (pdy / d) * 240;
  }
  // shove + damage other enemies (chain explosions!)
  const dead = new Set<number>();
  w.hash.queryCircle(x, y, radius + 12, (j) => {
    if (j === i) return true;
    const dx = w.ex[j] - x;
    const dy = w.ey[j] - y;
    const d2 = dx * dx + dy * dy;
    const rr = radius + w.eradius[j];
    if (d2 < rr * rr) {
      const d = Math.sqrt(d2) || 1;
      w.evx[j] += (dx / d) * 260 / w.emass[j];
      w.evy[j] += (dy / d) * 260 / w.emass[j];
      w.echarge[j] = 0.8; // explosion shrapnel is charged
      dead.add(j);
    }
    return true;
  });
  w.killEnemy(i, () => {});
  for (const j of dead) {
    if (j < w.eCount) damageEnemy(w, j, dmg * 0.6, 0, null, ev);
  }
}

export function hurtPlayer(w: World, dmg: number, ev: Events): void {
  if (w.hurtIframe > 0 || w.endState !== 'playing') return;
  w.hp -= dmg;
  w.hurtIframe = 0.35;
  ev.playerHurt(dmg);
  if (w.hp <= 0) {
    w.hp = 0;
    w.endState = 'dead';
  }
}

function clampArenaCoord(v: number, max: number): number {
  return v < 24 ? 24 : v > max - 24 ? max - 24 : v;
}

export function clampToArena(x: number, y: number): { x: number; y: number } {
  return { x: clamp(x, 20, ARENA_W - 20), y: clamp(y, 20, ARENA_H - 20) };
}
