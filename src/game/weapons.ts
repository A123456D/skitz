/** Weapon activation + projectile stepping. Data-driven from data/weapons.ts. */
import { WEAPONS, type WeaponId } from './data/weapons';
import { ARENA_W, ARENA_H, OBST_CRATE } from './state';
import { ENEMY } from './data/enemies';
import { damageEnemy, damageObstacle, obstacleAlive } from './physics';
import type { World } from './state';
import type { Events } from './events';

type WeaponLevel = (typeof WEAPONS)[WeaponId]['levels'][number];

export function stepWeapons(w: World, dt: number, ev: Events): void {
  w.time += dt;

  for (const [id, lvl] of w.weapons) {
    const def = WEAPONS[id];
    const L = def.levels[Math.min(lvl, def.maxLevel) - 1];
    switch (id) {
      case 'orbit':
        stepOrbit(w, L, dt, ev);
        break;
      case 'trail':
        stepTrail(w, L, dt, ev);
        break;
      case 'chain':
        break; // fires from impact hook (run.ts)
      default: {
        let cd = (w.weaponCds.get(id) ?? 0) - dt * w.stats.cooldownMult;
        if (cd <= 0) {
          fire(w, id, L, ev);
          cd = L.cd;
        }
        w.weaponCds.set(id, cd);
        break;
      }
    }
  }

  stepBolts(w, dt, ev);
  stepEnemyBullets(w, dt, ev);
}

function fire(w: World, id: WeaponId, L: WeaponLevel, ev: Events): void {
  const s = w.stats;
  switch (id) {
    case 'slam': {
      const evolved = w.evolved.has('slam');
      const radius = (L.radius ?? 90) * s.areaMult * (evolved ? 1.15 : 1);
      // Gravity Crush: drag everything inward and prime it before the hit
      if (evolved) {
        const pullR = radius * 1.7;
        w.hash.queryCircle(w.px, w.py, pullR, (i) => {
          if (w.etype[i] === ENEMY.boss) return true; // BONZAR is not moved
          const dx = w.px - w.ex[i];
          const dy = w.py - w.ey[i];
          const d = Math.hypot(dx, dy) || 1;
          if (d < radius * 0.4) return true;
          w.evx[i] += (dx / d) * 460 / Math.max(1, w.emass[i] * 0.6);
          w.evy[i] += (dy / d) * 460 / Math.max(1, w.emass[i] * 0.6);
          w.echarge[i] = Math.max(w.echarge[i], 1.3);
          return true;
        });
        ev.gravityPull(w.px, w.py, pullR);
      }
      const dmgMul = s.dmgMult * (evolved ? 1.25 : 1);
      const hit: number[] = [];
      w.hash.queryCircle(w.px, w.py, radius + 16, (i) => {
        const dx = w.ex[i] - w.px;
        const dy = w.ey[i] - w.py;
        const rr = radius + w.eradius[i];
        if (dx * dx + dy * dy <= rr * rr) hit.push(i);
        return true;
      });
      for (const i of hit) {
        damageEnemy(w, i, L.dmg * dmgMul, L.knock * s.knockMult, null, ev, true);
      }
      // slams also crack crates
      w.obstHash.queryCircle(w.px, w.py, radius + 18, (i) => {
        if (w.otype[i] !== OBST_CRATE || w.ohp[i] <= 0) return true;
        const dx = w.ox[i] - w.px;
        const dy = w.oy[i] - w.py;
        const rr = radius + w.oradius[i];
        if (dx * dx + dy * dy <= rr * rr) damageObstacle(w, i, L.dmg * dmgMul * 1.5, ev);
        return true;
      });
      if (hit.length > 0 || evolved) {
        ev.slam(w.px, w.py, radius);
        ev.playerAttack('slam');
      }
      break;
    }
    case 'shot': {
      const count = L.count ?? 1;
      const targets = nearestEnemies(w, w.px, w.py, count + 2, 560);
      for (let c = 0; c < count; c++) {
        const t = targets.length > 0 ? targets[c % targets.length] : -1;
        let ax: number;
        let ay: number;
        if (t >= 0) {
          const dx = w.ex[t] - w.px;
          const dy = w.ey[t] - w.py;
          const d = Math.hypot(dx, dy) || 1;
          ax = dx / d;
          ay = dy / d;
        } else {
          ax = w.facingX;
          ay = w.facingY;
        }
        const fan = (c - (count - 1) / 2) * 0.18;
        const cos = Math.cos(fan);
        const sin = Math.sin(fan);
        const rx = ax * cos - ay * sin;
        const ry = ax * sin + ay * cos;
        const sp = L.speed ?? 300;
        const pinball = w.evolved.has('shot');
        w.spawnBolt(w.px + rx * 10, w.py + ry * 10, rx * sp, ry * sp, L.dmg * s.dmgMult, L.knock * s.knockMult, (L.bounces ?? 2) + s.ricochet, 0, pinball ? 4 : 1.6);
      }
      ev.playerAttack('shot');
      break;
    }
    case 'dash': {
      if (w.dashT <= 0 && (Math.abs(w.pvx) > 5 || Math.abs(w.pvy) > 5)) {
        const sp = Math.hypot(w.pvx, w.pvy) || 1;
        w.dashT = 0.24;
        w.dashDx = w.pvx / sp;
        w.dashDy = w.pvy / sp;
        ev.playerAttack('dash');
      }
      break;
    }
    default:
      break;
  }
}

/** Damage enemies the player overlaps while dashing; dashes smash crates hard. */
export function stepDashDamage(w: World, ev: Events): void {
  if (w.dashT <= 0) return;
  const jugg = w.evolved.has('dash');
  const L = WEAPONS.dash.levels[(w.weapons.get('dash') ?? 1) - 1];
  const s = w.stats;
  const hit: number[] = [];
  w.hash.queryCircle(w.px, w.py, jugg ? 40 : 30, (i) => {
    const dx = w.ex[i] - w.px;
    const dy = w.ey[i] - w.py;
    const rr = (jugg ? 26 : 20) + w.eradius[i];
    if (dx * dx + dy * dy <= rr * rr) hit.push(i);
    return true;
  });
  for (const i of hit) {
    const a = Math.atan2(w.pvy, w.pvx);
    damageEnemy(w, i, L.dmg * s.dmgMult * s.impactDmg * 0.5 * (jugg ? 1.15 : 1), L.knock * s.knockMult * (jugg ? 1.25 : 1), a, ev, true);
  }
  w.obstHash.queryCircle(w.px, w.py, jugg ? 44 : 34, (i) => {
    if (w.otype[i] !== OBST_CRATE || w.ohp[i] <= 0) return true;
    const dx = w.ox[i] - w.px;
    const dy = w.oy[i] - w.py;
    const rr = 16 + w.oradius[i];
    if (dx * dx + dy * dy <= rr * rr) damageObstacle(w, i, L.dmg * s.dmgMult * 2.5, ev);
    return true;
  });
  // Juggernaut: the ground trembles in your wake
  if (jugg) {
    w.juggTremorAcc += 1 / 60;
    if (w.juggTremorAcc >= 0.14) {
      w.juggTremorAcc = 0;
      ev.tremor(w.px, w.py, 40);
      w.hash.queryCircle(w.px, w.py, 46, (i) => {
        if (w.eorbIframe[i] > 0) return true;
        const dx = w.ex[i] - w.px;
        const dy = w.ey[i] - w.py;
        const rr = 40 + w.eradius[i];
        if (dx * dx + dy * dy <= rr * rr) {
          w.eorbIframe[i] = 0.3;
          damageEnemy(w, i, L.dmg * 0.18 * s.dmgMult, 60 * s.knockMult, Math.atan2(dy, dx), ev, true);
        }
        return true;
      });
    }
  }
}

export function stepOrbit(w: World, L: WeaponLevel, dt: number, ev: Events): void {
  const s = w.stats;
  const sawring = w.evolved.has('orbit');
  w.orbitAngle += (L.speed ?? 2.6) * dt;
  const count = L.count ?? 2;
  const radius = (L.radius ?? 48) * s.areaMult;
  for (let c = 0; c < count; c++) {
    const a = w.orbitAngle + (Math.PI * 2 * c) / count;
    const ox = w.px + Math.cos(a) * radius;
    const oy = w.py + Math.sin(a) * radius;
    w.hash.queryCircle(ox, oy, 12, (i) => {
      if (w.eorbIframe[i] > 0) return true;
      const dx = w.ex[i] - ox;
      const dy = w.ey[i] - oy;
      const rr = 10 + w.eradius[i];
      if (dx * dx + dy * dy <= rr * rr) {
        w.eorbIframe[i] = 0.35;
        damageEnemy(w, i, L.dmg * s.dmgMult, L.knock * s.knockMult, Math.atan2(dy, dx), ev, false);
      }
      return true;
    });
  }
  // Sawring: fling a spinning saw along the orbit tangent
  if (sawring) {
    w.sawAcc += dt;
    if (w.sawAcc >= 1.5) {
      w.sawAcc = 0;
      const a = w.orbitAngle;
      const px = w.px + Math.cos(a) * radius;
      const py = w.py + Math.sin(a) * radius;
      const sp = 430;
      w.spawnBolt(px, py, Math.cos(a) * sp, Math.sin(a) * sp, L.dmg * 0.8 * s.dmgMult, L.knock * s.knockMult, 3, 1, 2.4);
    }
  }
}

interface TrailNode { x: number; y: number; t: number; armed: boolean }
let trailNodes: TrailNode[] = [];
const TRAIL_MAX = 90;

function stepTrail(w: World, L: WeaponLevel, dt: number, ev: Events): void {
  const s = w.stats;
  const last = trailNodes[trailNodes.length - 1];
  const moved = !last || Math.hypot(w.px - last.x, w.py - last.y) > 26;
  if (moved && (Math.abs(w.pvx) > 20 || Math.abs(w.pvy) > 20)) {
    trailNodes.push({ x: w.px, y: w.py, t: 1.1, armed: false });
    if (trailNodes.length > TRAIL_MAX) trailNodes.shift();
  }
  for (let i = trailNodes.length - 1; i >= 0; i--) {
    const n = trailNodes[i];
    n.t -= dt;
    if (!n.armed && n.t < 0.75) {
      n.armed = true;
      const radius = (L.radius ?? 36) * s.areaMult;
      const tesla = w.evolved.has('trail');
      const hit: number[] = [];
      w.hash.queryCircle(n.x, n.y, radius + 14, (j) => {
        const dx = w.ex[j] - n.x;
        const dy = w.ey[j] - n.y;
        const rr = radius + w.eradius[j];
        if (dx * dx + dy * dy <= rr * rr) hit.push(j);
        return true;
      });
      for (const j of hit) {
        damageEnemy(w, j, L.dmg * s.dmgMult, L.knock * s.knockMult, Math.atan2(w.ey[j] - n.y, w.ex[j] - n.x), ev, true);
        if (tesla) w.eslow[j] = Math.max(w.eslow[j], 1.3);
      }
      // Tesla Web: arc to close-by enemies and slow them
      if (tesla) {
        const near = nearestEnemies(w, n.x, n.y, 2, 100);
        for (const j of near) {
          if (hit.includes(j) || w.ehp[j] <= 0) continue;
          ev.zap(n.x, n.y, w.ex[j], w.ey[j]);
          w.eslow[j] = Math.max(w.eslow[j], 1.3);
          damageEnemy(w, j, L.dmg * 0.6 * s.dmgMult, L.knock * 0.5 * s.knockMult, Math.atan2(w.ey[j] - n.y, w.ex[j] - n.x), ev, true);
        }
      }
      if (hit.length > 0 || (tesla && nearestEnemies(w, n.x, n.y, 1, 100).length > 0)) ev.eruption(n.x, n.y, radius * 0.8);
    }
    if (n.t <= 0) trailNodes.splice(i, 1);
  }
}

export function clearTrail(): void {
  trailNodes = [];
}

export function trailNodesForRender(): TrailNode[] {
  return trailNodes;
}

function stepBolts(w: World, dt: number, ev: Events): void {
  const pinball = w.evolved.has('shot');
  for (let i = 0; i < w.bCount; i++) {
    w.bx[i] += w.bvx[i] * dt;
    w.by[i] += w.bvy[i] * dt;
    w.blife[i] -= dt;

    let consumed = false;
    const hit = w.hash.queryCircleFind(w.bx[i], w.by[i], 14, (j) => {
      const dx = w.ex[j] - w.bx[i];
      const dy = w.ey[j] - w.by[i];
      const rr = 5 + w.eradius[j];
      return dx * dx + dy * dy <= rr * rr;
    });
    if (hit >= 0) {
      const bounces = w.bbounces[i];
      const isSaw = w.bkind[i] === 1;
      damageEnemy(w, hit, w.bdmg[i], w.bknock[i], Math.atan2(w.bvy[i], w.bvx[i]), ev, false);
      if (pinball && !isSaw) {
        // Pinball Storm: never dies on a hit — accelerate and retarget
        const sp = Math.min(620, (Math.hypot(w.bvx[i], w.bvy[i]) || 300) * 1.05);
        const next = nearestEnemies(w, w.bx[i], w.by[i], 1, 300, hit);
        let ax: number;
        let ay: number;
        if (next.length > 0) {
          const t = next[0];
          const dx = w.ex[t] - w.bx[i];
          const dy = w.ey[t] - w.by[i];
          const d = Math.hypot(dx, dy) || 1;
          ax = dx / d;
          ay = dy / d;
        } else {
          const a = w.rng.angle();
          ax = Math.cos(a);
          ay = Math.sin(a);
        }
        w.bvx[i] = ax * sp;
        w.bvy[i] = ay * sp;
        w.blife[i] = Math.max(w.blife[i], 1.2);
      } else if (bounces > 0) {
        const next = nearestEnemies(w, w.bx[i], w.by[i], 1, 260, hit);
        const sp = Math.hypot(w.bvx[i], w.bvy[i]) || 300;
        if (next.length > 0) {
          const t = next[0];
          const dx = w.ex[t] - w.bx[i];
          const dy = w.ey[t] - w.by[i];
          const d = Math.hypot(dx, dy) || 1;
          w.bvx[i] = (dx / d) * sp;
          w.bvy[i] = (dy / d) * sp;
          w.blife[i] = Math.max(w.blife[i], 0.8);
        } else {
          const a = w.rng.angle();
          w.bvx[i] = Math.cos(a) * sp;
          w.bvy[i] = Math.sin(a) * sp;
          w.blife[i] = Math.max(w.blife[i], 0.5);
        }
        w.bbounces[i] = bounces - 1;
      } else {
        consumed = true;
      }
    }

    // obstacles: bolts shatter crates and ricochet off pillars
    const ohit = w.obstHash.queryCircleFind(w.bx[i], w.by[i], 8, (j) => {
      if (!obstacleAlive(w, j)) return false;
      const dx = w.bx[i] - w.ox[j];
      const dy = w.by[i] - w.oy[j];
      const rr = 4 + w.oradius[j];
      return dx * dx + dy * dy <= rr * rr;
    });
    if (ohit >= 0) {
      if (w.otype[ohit] === OBST_CRATE) {
        damageObstacle(w, ohit, w.bdmg[i], ev);
        if (!pinball && w.bkind[i] === 0) consumed = true;
        if (pinball) {
          // plow through crates: bounce away lightly without dying
          let nx = w.bx[i] - w.ox[ohit];
          let ny = w.by[i] - w.oy[ohit];
          const nd = Math.hypot(nx, ny) || 1;
          const dot = w.bvx[i] * (nx / nd) + w.bvy[i] * (ny / nd);
          if (dot < 0) {
            w.bvx[i] -= 1.8 * dot * (nx / nd);
            w.bvy[i] -= 1.8 * dot * (ny / nd);
            w.bx[i] = w.ox[ohit] + (nx / nd) * (5 + w.oradius[ohit]);
            w.by[i] = w.oy[ohit] + (ny / nd) * (5 + w.oradius[ohit]);
          }
          w.blife[i] = Math.max(w.blife[i], 0.4);
        }
      } else {
        // reflect off the pillar
        let nx = w.bx[i] - w.ox[ohit];
        let ny = w.by[i] - w.oy[ohit];
        const nd = Math.hypot(nx, ny) || 1;
        nx /= nd;
        ny /= nd;
        const dot = w.bvx[i] * nx + w.bvy[i] * ny;
        if (dot < 0) {
          w.bvx[i] -= 2 * dot * nx;
          w.bvy[i] -= 2 * dot * ny;
          w.bx[i] = w.ox[ohit] + nx * (4 + w.oradius[ohit]);
          w.by[i] = w.oy[ohit] + ny * (4 + w.oradius[ohit]);
          if (!pinball) w.bbounces[i] = Math.max(0, w.bbounces[i] - 1);
        }
      }
    }

    if (w.bx[i] < 4 || w.bx[i] > ARENA_W - 4) { w.bvx[i] *= -1; w.bx[i] = Math.max(4, Math.min(ARENA_W - 4, w.bx[i])); }
    if (w.by[i] < 4 || w.by[i] > ARENA_H - 4) { w.bvy[i] *= -1; w.by[i] = Math.max(4, Math.min(ARENA_H - 4, w.by[i])); }

    if (consumed || w.blife[i] <= 0) {
      w.removeBolt(i);
      i--;
    }
  }
}

function stepEnemyBullets(w: World, dt: number, ev: Events): void {
  for (let i = 0; i < w.vCount; i++) {
    w.vx[i] += w.vvx[i] * dt;
    w.vy[i] += w.vvy[i] * dt;
    w.vlife[i] -= dt;
    const dx = w.vx[i] - w.px;
    const dy = w.vy[i] - w.py;
    let gone = w.vlife[i] <= 0;
    // spit flies at mouth height — jump (pz >= dodge height) sails over it
    if (dx * dx + dy * dy < 14 * 14 && w.pz < 26) {
      if (w.hurtIframe <= 0 && w.endState === 'playing') {
        w.hp -= w.vdmg[i];
        w.hurtIframe = 0.35;
        ev.playerHurt(w.vdmg[i]);
        if (w.hp <= 0) {
          w.hp = 0;
          w.endState = 'dead';
        }
      }
      gone = true;
    }
    if (gone) {
      w.removeEnemyBullet(i);
      i--;
    }
  }
}

/** Indices of up to `count` nearest enemies within `range` of (x,y), optionally excluding one. */
export function nearestEnemies(w: World, x: number, y: number, count: number, range: number, exclude = -1): number[] {
  const best: Array<{ d2: number; i: number }> = [];
  const r2max = range * range;
  w.hash.queryCircle(x, y, range, (i) => {
    if (i === exclude) return true;
    const dx = w.ex[i] - x;
    const dy = w.ey[i] - y;
    const d2 = dx * dx + dy * dy;
    if (d2 > r2max) return true;
    best.push({ d2, i });
    best.sort((a, b) => a.d2 - b.d2);
    if (best.length > count) best.pop();
    return true;
  });
  return best.map((b) => b.i);
}

/** Chain lightning hook: called after impact hits; arcs from (x,y). */
export function tryChain(w: World, x: number, y: number, baseDmg: number, ev: Events): void {
  if (!w.weapons.has('chain')) return;
  if (w.chainCd > 0) return;
  const storm = w.evolved.has('chain');
  const lvl = w.weapons.get('chain')!;
  const def = WEAPONS.chain;
  const L = def.levels[Math.min(lvl, def.maxLevel) - 1];
  const targets = nearestEnemies(w, x, y, (L.count ?? 1) + (storm ? 1 : 0), (L.radius ?? 130) * w.stats.areaMult);
  for (const t of targets) {
    ev.zap(x, y, w.ex[t], w.ey[t]);
    if (storm) w.eslow[t] = Math.max(w.eslow[t], 1.2); // slow before damage — a kill swaps the pool
    damageEnemy(w, t, baseDmg * L.dmg * w.stats.dmgMult, L.knock * w.stats.knockMult, Math.atan2(w.ey[t] - y, w.ex[t] - x), ev, true);
  }
  // Stormcaller: each victim forks the arc once more
  if (storm) {
    for (const t of targets) {
      if (w.ehp[t] <= 0) continue;
      const fork = nearestEnemies(w, w.ex[t], w.ey[t], 1, 120, t);
      for (const f of fork) {
        ev.zap(w.ex[t], w.ey[t], w.ex[f], w.ey[f]);
        if (w.ehp[f] > 0) {
          w.eslow[f] = Math.max(w.eslow[f], 1.2);
          damageEnemy(w, f, baseDmg * L.dmg * 0.5 * w.stats.dmgMult, L.knock * 0.6 * w.stats.knockMult, Math.atan2(w.ey[f] - w.ey[t], w.ex[f] - w.ex[t]), ev, true);
        }
      }
    }
  }
  if (targets.length > 0) w.chainCd = L.cd;
}

export function stepChainCd(w: World, dt: number): void {
  if (w.chainCd > 0) w.chainCd -= dt;
}
