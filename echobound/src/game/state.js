// Central mutable game state. resetRun mutates G in place (modules hold the ref).
import { RNG } from '../core/util.js';

export const STEP = 1 / 60;
export const ECHO_PERIOD = 600; // ticks (10s)

export const G = {
  screen: 'title', // title | select | run | results
  time: 0, hitstop: 0, seed: 1,
  cam: { x: 0, y: 0, zoom: 1, trauma: 0 },
  env: { half: 1500 },
  player: null, rec: null, echoes: [],
  enemies: [], bullets: [], pickups: [], props: [], wisps: [], wells: [], zones: [], beams: [],
  boss: null, director: null,
  weapState: null, owned: null, traits: null, syn: null, ascension: null,
  stats: null, profile: null, pendingLevels: 0,
  flags: { dead: false, won: false },
  eh: null, // enemy spatial hash (rebuilt per tick in enemies.js)
  Q: new URLSearchParams(location.search),
};

export function fastN() { return Math.max(1, Math.min(6, parseInt(G.Q.get('fast') || '1') || 1)); }

export function resetRun(opts = {}) {
  G.time = 0; G.hitstop = 0;
  G.cam.x = 0; G.cam.y = 0; G.cam.trauma = 0;
  G.cam.zoom = Math.max(1.05, Math.min(1.8, Math.min(innerWidth / 1000, innerHeight / 620)));
  G.env.half = 1500;
  G.flags = { dead: false, won: false };
  G.seed = opts.seed ?? ((Math.random() * 0xffffffff) >>> 0);
  G.rng = new RNG(G.seed);

  G.player = {
    x: 0, y: 0, vx: 0, vy: 0, r: 13,
    aim: 0, hp: 100, maxHp: 100, speed: 240,
    char: opts.char ?? 'warden',
    weapon: opts.weapon ?? 'grave',
    dashT: 0, dashCd: 0, iT: 0, hurtFlash: 0,
    level: 1, xp: 0, xpNext: 5,
    alive: true, travel: 0, runnerEchoT: 0,
    secondWind: false, coinBuff: 0,
    firedThisTick: 0, beamOn: false, shotCount: 0,
  };
  G.rec = { frames: [], max: ECHO_PERIOD };
  G.echoes = [];
  G.enemies = []; G.bullets = []; G.pickups = []; G.props = []; G.wisps = []; G.wells = []; G.zones = []; G.beams = []; G.lances = []; G.gdecals = []; G.arcs = []; G.spawnQueue = [];
  G.boss = null;
  G.director = { budget: 0, spawnT: 0, phase: 0, intensity: 1, eventT: 20, event: null, boss1Done: false, boss2Done: false, saintDue: 390, hkDue: 750, nospawn: G.Q.has('nospawn') };
  if (G.Q.get('boss') === 'saint') { G.director.saintDue = 2; G.director.hkDue = 99999; }
  if (G.Q.get('boss') === 'hk') { G.director.saintDue = 99999; G.director.hkDue = 2; G.director.boss1Done = true; }
  G.weapState = { grave: { siege: 0, exec: 0, sing: 0 }, widow: { swarm: 0, venom: 0, predator: 0 }, sun: { solar: 0, prism: 0, corona: 0, eclipse: 0 } };
  G.owned = {}; G.traits = {}; G.syn = {}; G.ascension = null;
  G.stats = { kills: 0, dmgP: 0, dmgE: 0, echoes: 0, shards: 0, elites: 0, adapt: 0 };
  G.nextId = 1;
  G.profile = { left: 0.001, right: 0.001, near: 0.001, mid: 0.001, far: 0.001, crit: 0, burn: 0, echo: 0, shots: 0, bossAngle: 0 };
  G.pendingLevels = 0;
  // debug jumps
  const t = parseFloat(G.Q.get('t') || '0');
  if (t > 0) G.time = t;
  const lv = parseInt(G.Q.get('xp') || '0');
  if (lv > 0) { G.pendingLevels = Math.min(lv, 30); }
}

export function hasTrait(t) { return (G.traits[t] || 0) > 0; }
export function traitCount(...ts) { return ts.reduce((n, t) => n + (G.traits[t] || 0), 0); }
