// Run director: pacing, unlock table, events, boss schedule, arena growth, music intensity
import { G } from './state.js';
import { spawnEnemy, ENEMY_DEF } from './enemies.js';
import { spawnSaint, spawnHK } from './bosses.js';
import { FX } from './fx.js';
import { A } from '../core/audio.js';
import { META } from './meta.js';
import { rand, TAU, angTo } from '../core/util.js';

let bannerRef = null;
export function setBanner(fn) { bannerRef = fn; }
const banner = (t, s, c) => bannerRef && bannerRef(t, s, c);

const TABLE = [
  ['husk', 10, 0],
  ['lancer', 6, 1.2],
  ['thief', 3, 2.5],
  ['mourner', 3, 3.5],
  ['mirror', 3, 3.5],
  ['leech', 3, 4.5],
  ['parasite', 3, 5.5],
  ['timeeater', 2, 7.5],
];

function pickType(min) {
  let total = 0;
  const av = TABLE.filter(([, , t]) => min >= t);
  for (const [, w] of av) total += w;
  let r = Math.random() * total;
  for (const [type, w] of av) { r -= w; if (r <= 0) return type; }
  return 'husk';
}

function spawnAtPlayer(type, elite) {
  const dist = (G.viewR || 700) * 0.62 + 140 + rand(0, 80);
  const a = rand(0, TAU);
  let x = G.player.x + Math.cos(a) * dist, y = G.player.y + Math.sin(a) * dist;
  const h = G.env.half - 40;
  x = Math.max(-h, Math.min(h, x)); y = Math.max(-h, Math.min(h, y));
  return spawnEnemy(type, x, y, elite);
}

const EVENTS = ['surge', 'storm', 'witness', 'fracture'];

export function updateDirector(dt) {
  const D = G.director;
  const min = G.time / 60;

  // arena growth relic
  if (G.owned.unfinishedmap && G.env.half < 2400) G.env.half += 3.5 * dt;
  G.fractureT = Math.max(0, (G.fractureT || 0) - dt);

  // boss schedule
  if (!D.boss1Done && G.time >= D.saintDue && !G.boss) {
    D.boss1Done = true; spawnSaint();
  }
  if (D.boss1Done && !D.boss2Done && G.time >= D.hkDue && !G.boss) {
    D.boss2Done = true; spawnHK();
  }

  // intensity + music
  let inten = min < 1.5 ? 1 : min < 3.5 ? 2 : min < 6 ? 3 : min < 10 ? 3.5 : 4;
  if (G.boss) inten = 4;
  if (inten !== D.intensity) { D.intensity = inten; A.setIntensity(Math.round(inten)); }

  // spawns
  if (G.boss || D.nospawn || G.flags.won) return;
  const rate = 1.2 + min * 0.7 + min * min * 0.05;
  D.budget += rate * dt;
  const eliteChance = min > 4 ? Math.min(0.22, (min - 4) * 0.04) : 0;
  let guard = 0;
  while (D.budget >= 1 && G.enemies.length < 130 && guard++ < 24) {
    const type = pickType(min);
    const cost = ENEMY_DEF[type].cost;
    if (D.budget < cost) break;
    D.budget -= cost;
    const elite = Math.random() < eliteChance ? randEl() : null;
    spawnAtPlayer(type, elite);
  }
  // events
  D.eventT -= dt;
  if (D.eventT <= 0 && min > 2) {
    D.eventT = 42 + rand(0, 20);
    runEvent(EVENTS[(Math.random() * EVENTS.length) | 0], min);
  }
}
function randEl() {
  const all = ['teleport', 'explosive', 'reflective', 'regen', 'split', 'phase', 'echothief'];
  return all[(Math.random() * all.length) | 0];
}

function runEvent(ev, min) {
  switch (ev) {
    case 'surge': {
      banner('ELITE SURGE', 'THEY REMEMBER YOU');
      const n = 2 + Math.floor(min / 4);
      for (let i = 0; i < n; i++) spawnAtPlayer(pickType(min), randEl());
      break;
    }
    case 'storm': {
      banner('MEMORY STORM', 'COLLECT');
      for (let i = 0; i < 34; i++) {
        const a = rand(0, TAU), d = rand(60, 340);
        G.pickups.push({ kind: 'shard', x: G.player.x + Math.cos(a) * d, y: G.player.y + Math.sin(a) * d, vx: 0, vy: 0, v: 2, t: 0, pull: true });
      }
      A.sfx('levelup');
      break;
    }
    case 'witness': {
      banner('A WITNESS ARRIVES', 'IT IS WATCHING HOW YOU FIGHT');
      spawnAtPlayer('witness', null);
      break;
    }
    case 'fracture': {
      banner('FRACTURE SURGE', 'TIME STUTTERS');
      G.fractureT = 4.5;
      FX.flash(0.25, '#b08aff');
      A.sfx('echo');
      break;
    }
  }
}
