/**
 * World state: struct-of-arrays pools with swap-remove, zero allocation per tick.
 * The sim mutates this; the render layer reads it and mirrors into sprites.
 */
import { Rng } from '../engine/rng';
import { SpatialHash } from '../engine/spatialHash';
import { ENEMY_DEFS, type EnemyId } from './data/enemies';
import type { CharacterDef } from './data/characters';
import { type Biome } from './data/biomes';
import { META_UPGRADES } from './data/metaShop';
import { ITEMS, type ItemMods } from './data/items';
import type { WeaponId, PassiveId } from './data/weapons';
import { PASSIVES } from './data/weapons';
import {
  ZONES, WALL_SEGS, ZONE_FEATURES, SPAWN_X, SPAWN_Y,
  MAP_W, MAP_H, ZONE_SIZE,
  type ZoneDef, type WallSeg, type PatchKind, type BoostPadDef,
} from './data/zones';

export const ARENA_W = MAP_W;
export const ARENA_H = MAP_H;

/** item id -> stat mods, resolved once for computeStats */
const ITEM_MODS = new Map<string, ItemMods>(Object.values(ITEMS).map((d) => [d.id, d.mods]));

export const GEM_XP = 0;
export const GEM_GOLD = 1;

export const OBST_PILLAR = 0;
export const OBST_CRATE = 1;
export const OBST_CHEST = 2;

export type RewardKind = 'cache' | 'shrine_might' | 'shrine_regen' | 'shrine_magnet';

export interface Stats {
  maxHp: number;
  speed: number;
  mass: number;
  magnetR: number;
  knockMult: number;
  impactDmg: number;
  dmgMult: number;
  cooldownMult: number;
  areaMult: number;
  luck: number;
  ricochet: number;
  regen: number;
  xpMult: number;
  goldMult: number;
  contactDps: number; // Spiker aura
}

export interface RunStats {
  kills: number;
  time: number;
  level: number;
  goldEarned: number;
  damageDealt: number;
}

export interface PendingChoice {
  kind: 'weapon' | 'passive' | 'item' | 'evolution';
  id: string;
  isNew: boolean;
  toLevel: number;
  rarity: string;
}

export type RunEndState = 'playing' | 'dead' | 'won';

export class World {
  rng: Rng;
  char: CharacterDef;
  seed: number;

  // ---- player ----
  px = SPAWN_X;
  py = SPAWN_Y;
  pvx = 0;
  pvy = 0;
  facingX = 1;
  facingY = 0;
  hp = 100;
  hurtIframe = 0;
  dashT = 0;      // remaining dash time
  dashDx = 0;
  dashDy = 0;
  rolling = 0;    // spin accumulator for visual roll
  // ---- verticality (z = height above the ground plane, px) ----
  pz = 0;         // player height
  pvz = 0;        // vertical velocity (positive = up)
  egz = 0;        // eased ground height under the player (smooth terrace stepping)
  slamming = false; // true while fast-falling for a body slam
  airborneT = 0;  // time since last grounded (for anim/fx)

  // ---- enemies (SoA) ----
  eCap: number;
  eCount = 0;
  ex: Float32Array; ey: Float32Array;
  evx: Float32Array; evy: Float32Array;
  ehp: Float32Array; emaxhp: Float32Array;
  eradius: Float32Array;
  emass: Float32Array;
  etype: Uint8Array;
  eflash: Float32Array;      // hit flash timer
  echarge: Float32Array;     // "charged" — impacts deal damage while > 0
  eorbIframe: Float32Array;  // per-enemy cooldown for orbit/trail hits
  eelite: Uint8Array;        // 0/1
  eexploding: Float32Array;  // fuse timer for exploders (>0 = about to pop)
  erangeCd: Float32Array;    // spitter attack cooldown
  eatkCd: Float32Array;      // special attack cooldown (counts down)
  ewindup: Float32Array;     // >0 = winding up attack (telegraph)
  eactive: Float32Array;     // >0 = attack in progress (lunge/charge hit window)
  edirX: Float32Array;       // attack direction locked at windup start
  edirY: Float32Array;
  emod: Uint8Array;          // elite modifier id (0 = none, see data/eliteMods)
  emodCd: Float32Array;      // modifier ability cooldown (storm zaps, vampiric ticks)
  eslow: Float32Array;       // >0 = slowed (Tesla Web / Stormcaller)

  // ---- projectiles (player bolts) ----
  bCap = 1500;
  bCount = 0;
  bx: Float32Array; by: Float32Array;
  bvx: Float32Array; bvy: Float32Array;
  blife: Float32Array;
  bdmg: Float32Array;
  bknock: Float32Array;
  bbounces: Int8Array;
  bkind: Uint8Array;         // 0 = bolt, 1 = saw (Sawring)

  // ---- enemy bullets ----
  vCap = 400;
  vCount = 0;
  vx: Float32Array; vy: Float32Array;
  vvx: Float32Array; vvy: Float32Array;
  vlife: Float32Array;
  vdmg: Float32Array;

  // ---- pickups (xp gems / gold) ----
  gCap = 380;
  gCount = 0;
  gx: Float32Array; gy: Float32Array;
  gvx: Float32Array; gvy: Float32Array;
  gkind: Uint8Array;
  gvalue: Float32Array;
  gmagnet: Uint8Array; // flying to player

  // ---- explosion fx events (consumed by render each frame) ----
  fxSlams: number[] = [];
  fxExplodes: number[] = [];
  fxZaps: number[] = []; // x1,y1,x2,y2 tuples flattened
  fxImpacts: number[] = []; // x,y,force triples for bonk fx

  // ---- run meta ----
  stats: Stats;
  weapons: Map<WeaponId, number> = new Map(); // id -> level
  passives: Map<PassiveId, number> = new Map();
  items: Map<string, number> = new Map();     // item id -> copies
  /** evolved weapon ids (weapon transformed by its evolution) */
  evolved: Set<WeaponId> = new Set();
  /** card keys banished for this run */
  banished: Set<string> = new Set();
  /** card currently locked in the draft */
  locked: PendingChoice | null = null;
  /** frozen on level-up so the player can commit before picking */
  frozenChoices: PendingChoice[] | null = null;
  weaponCds: Map<WeaponId, number> = new Map();
  trailAcc = 0;
  orbitAngle = 0;
  chainCd = 0;
  sawAcc = 0;         // Sawring launch timer
  juggTremorAcc = 0;  // Juggernaut tremor timer
  playerSlowT = 0;    // Frostbound aura slow

  // ---- run events (director in runEvents.ts) ----
  eventId = -1;       // index into RUN_EVENTS, -1 = none
  eventT = 0;         // remaining seconds of the active event
  eventCd = 70;       // countdown to the next event roll
  eventAcc = 0;       // meteor spawner accumulator
  frenzyT = 0;        // >0: spawn rate x3, enemies take +50% damage
  goldrushT = 0;      // >0: kills rain gold
  evDmgMult = 1;      // damage-enemies multiplier (frenzy 1.5 / overcharge 1.4)
  evCdBoost = 1;      // weapon cooldown-rate multiplier (overcharge 1.33)
  /** pending meteors: telegraph countdown then detonate */
  mCap = 48;
  mCount = 0;
  mx: Float32Array;
  my: Float32Array;
  mt: Float32Array;

  // ---- boss phase 2 + endless ----
  bossEnraged = false;  // BONZAR hit half hp: faster, meaner
  descendLevel = 0;     // 0 = normal run; 1+ = endless DESCEND depth
  descendBossAcc = 0;   // seconds since the last DESCEND boss
  wonRun = false;       // the arena was cleared (stays true through DESCEND)
  spawnAcc = 0;
  runStats: RunStats = { kills: 0, time: 0, level: 1, goldEarned: 0, damageDealt: 0 };
  xp = 0;
  xpNeed = 6;
  endState: RunEndState = 'playing';
  bossAlive = false;
  /** sim-time accumulated; used for camera/anim */
  time = 0;

  hash: SpatialHash;

  // ---- obstacles (static; rebuilt hash only when one is destroyed) ----
  oCap = 48;
  oCount = 0;
  ox: Float32Array;
  oy: Float32Array;
  oradius: Float32Array;
  ohp: Float32Array;
  omaxhp: Float32Array;
  otype: Uint8Array;
  oflash: Float32Array;
  obstHash: SpatialHash;
  obstDirty = false;
  biome: Biome;
  /** raised regions: x, y, w, h in world px, z = ground height */
  terraces: Array<{ x: number; y: number; w: number; h: number; z: number }> = [];

  // ---- multi-zone world ----
  zones: ZoneDef[] = ZONES;
  wallSegs: WallSeg[] = WALL_SEGS;
  patches: Array<{ x: number; y: number; r: number; kind: PatchKind }> = [];
  bumpers: Array<{ x: number; y: number; r: number; flash: number }> = [];
  boostPads: Array<BoostPadDef & { flash: number }> = [];
  jumpPads: Array<{ x: number; y: number; flash: number }> = [];
  rewards: Array<{ x: number; y: number; kind: RewardKind; taken: boolean }> = [];
  /** active shrine buff: kind + remaining seconds */
  buff: { kind: 'might' | 'regen' | 'magnet'; t: number } | null = null;
  playerBoostT = 0;
  playerBoostDx = 0;
  playerBoostDy = 0;
  currentZone = -1;
  lastZoneName = '';

  zoneAt(x: number, y: number): ZoneDef {
    const zx = Math.min(1, Math.max(0, Math.floor(x / ZONE_SIZE)));
    const zy = Math.min(1, Math.max(0, Math.floor(y / ZONE_SIZE)));
    return this.zones[zy * 2 + zx];
  }

  zoneName(x: number, y: number): string {
    return this.zoneAt(x, y).name;
  }

  /** ground-movement patch (ice/goo) under a position, else null */
  patchAt(x: number, y: number): PatchKind | null {
    for (const p of this.patches) {
      const dx = x - p.x;
      const dy = y - p.y;
      if (dx * dx + dy * dy <= p.r * p.r) return p.kind;
    }
    return null;
  }

  /** true when a circle at (x,y) of r overlaps an interior wall segment */
  wallBlocked(x: number, y: number, r: number): boolean {
    for (const s of this.wallSegs) {
      const cx = Math.max(s.x, Math.min(x, s.x + s.w));
      const cy = Math.max(s.y, Math.min(y, s.y + s.h));
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy < r * r) return true;
    }
    return false;
  }

  constructor(char: CharacterDef, seed: number, eCap: number) {
    this.char = char;
    this.rng = new Rng(seed);
    this.seed = seed >>> 0;
    this.eCap = eCap;
    const f = (n: number) => new Float32Array(n);
    this.ex = f(eCap); this.ey = f(eCap);
    this.evx = f(eCap); this.evy = f(eCap);
    this.ehp = f(eCap); this.emaxhp = f(eCap);
    this.eradius = f(eCap);
    this.emass = f(eCap);
    this.etype = new Uint8Array(eCap);
    this.eflash = f(eCap);
    this.echarge = f(eCap);
    this.eorbIframe = f(eCap);
    this.eelite = new Uint8Array(eCap);
    this.eexploding = f(eCap);
    this.erangeCd = f(eCap);
    this.eatkCd = f(eCap);
    this.ewindup = f(eCap);
    this.eactive = f(eCap);
    this.edirX = f(eCap);
    this.edirY = f(eCap);
    this.emod = new Uint8Array(eCap);
    this.emodCd = f(eCap);
    this.eslow = f(eCap);

    this.bx = f(this.bCap); this.by = f(this.bCap);
    this.bvx = f(this.bCap); this.bvy = f(this.bCap);
    this.blife = f(this.bCap);
    this.bdmg = f(this.bCap);
    this.bknock = f(this.bCap);
    this.bbounces = new Int8Array(this.bCap);
    this.bkind = new Uint8Array(this.bCap);

    this.vx = f(this.vCap); this.vy = f(this.vCap);
    this.vvx = f(this.vCap); this.vvy = f(this.vCap);
    this.vlife = f(this.vCap);
    this.vdmg = f(this.vCap);

    this.gx = f(this.gCap); this.gy = f(this.gCap);
    this.gvx = f(this.gCap); this.gvy = f(this.gCap);
    this.gkind = new Uint8Array(this.gCap);
    this.gvalue = f(this.gCap);
    this.gmagnet = new Uint8Array(this.gCap);

    this.mx = f(this.mCap); this.my = f(this.mCap); this.mt = f(this.mCap);

    this.hash = new SpatialHash(ARENA_W, ARENA_H, 64);

    this.ox = f(this.oCap);
    this.oy = f(this.oCap);
    this.oradius = f(this.oCap);
    this.ohp = f(this.oCap);
    this.omaxhp = f(this.oCap);
    this.otype = new Uint8Array(this.oCap);
    this.oflash = f(this.oCap);
    this.obstHash = new SpatialHash(ARENA_W, ARENA_H, 96);

    this.biome = this.zones[0].biome;
    this.generateTerraces();
    this.generateObstacles();
    this.generateZoneFeatures();

    this.stats = this.computeStats(new Map(), new Map());
    this.hp = this.stats.maxHp;
    this.addWeapon(char.startWeapon);
  }

  // ---------- obstacles ----------

  /** Scatter pillars + crates away from the spawn and each other. */
  private generateObstacles(): void {
    const margin = 120;
    const centerX = ARENA_W / 2;
    const centerY = ARENA_H / 2;
    const pillars = 10;
    const crates = 14;
    const tryPlace = (radius: number, minGap: number): { x: number; y: number } | null => {
      for (let attempt = 0; attempt < 24; attempt++) {
        const x = this.rng.range(margin + radius, ARENA_W - margin - radius);
        const y = this.rng.range(margin + radius, ARENA_H - margin - radius);
        if (Math.hypot(x - centerX, y - centerY) < 220 + radius) continue; // keep spawn clear
        if (this.groundHeightAt(x, y) > 0) continue; // keep terraces clear
        let ok = true;
        for (let i = 0; i < this.oCount; i++) {
          const gap = minGap + this.oradius[i];
          if (Math.hypot(x - this.ox[i], y - this.oy[i]) < gap) { ok = false; break; }
        }
        if (ok) return { x, y };
      }
      return null;
    };
    for (let p = 0; p < pillars; p++) {
      const spot = tryPlace(17, 110);
      if (!spot) break;
      const i = this.oCount++;
      this.ox[i] = spot.x;
      this.oy[i] = spot.y;
      this.oradius[i] = 17;
      this.ohp[i] = -1; // indestructible
      this.omaxhp[i] = -1;
      this.otype[i] = OBST_PILLAR;
      this.oflash[i] = 0;
    }
    for (let c = 0; c < crates; c++) {
      const spot = tryPlace(13, 84);
      if (!spot) break;
      const i = this.oCount++;
      this.ox[i] = spot.x;
      this.oy[i] = spot.y;
      this.oradius[i] = 13;
      this.ohp[i] = 30;
      this.omaxhp[i] = 30;
      this.otype[i] = OBST_CRATE;
      this.oflash[i] = 0;
    }
    this.rebuildObstHash();
  }

  rebuildObstHash(): void {
    this.obstHash.clear(this.oCap);
    for (let i = 0; i < this.oCount; i++) {
      if (this.obstAlive(i)) this.obstHash.insert(i, this.ox[i], this.oy[i]);
    }
  }

  /** true for pillars always and for crates/chests while they still stand */
  obstAlive(i: number): boolean {
    if (this.otype[i] === OBST_CRATE || this.otype[i] === OBST_CHEST) return this.ohp[i] > 0;
    return true;
  }

  /** Scatter 2-3 raised terraces (height regions you can jump onto). */
  private generateTerraces(): void {
    const margin = 260;
    for (let n = 0; n < 3; n++) {
      for (let attempt = 0; attempt < 20; attempt++) {
        const wdt = this.rng.range(260, 460);
        const hgt = this.rng.range(220, 400);
        const x = this.rng.range(margin, ARENA_W - margin - wdt);
        const y = this.rng.range(margin, ARENA_H - margin - hgt);
        const cx = x + wdt / 2;
        const cy = y + hgt / 2;
        if (Math.hypot(cx - SPAWN_X, cy - SPAWN_Y) < 700) continue; // keep the crossroads open
        if (this.wallBlocked(x - 40, y - 40, 60) || this.wallBlocked(x + wdt + 40, y + hgt + 40, 60)) continue;
        let ok = true;
        for (const t of this.terraces) {
          if (x < t.x + t.w + 140 && x + wdt + 140 > t.x && y < t.y + t.h + 140 && y + hgt + 140 > t.y) { ok = false; break; }
        }
        if (!ok) continue;
        this.terraces.push({ x, y, w: wdt, h: hgt, z: 30 });
        break;
      }
    }
  }

  /** Seed per-zone terrain features, pads and rewards from the layout tables. */
  private generateZoneFeatures(): void {
    const jit = (n: number) => this.rng.range(-n, n);
    for (const zf of ZONE_FEATURES) {
      const zone = this.zones.find((z) => z.id === zf.zone)!;
      for (const p of zf.patches ?? []) {
        this.patches.push({ x: zone.x + p.x + jit(60), y: zone.y + p.y + jit(60), r: p.r, kind: p.kind });
      }
      for (const b of zf.bumpers ?? []) {
        this.bumpers.push({ x: zone.x + b.x + jit(70), y: zone.y + b.y + jit(70), r: b.r, flash: 0 });
      }
      for (const pd of zf.pads ?? []) {
        this.boostPads.push({ x: zone.x + pd.x, y: zone.y + pd.y, w: pd.w, h: pd.h, dx: pd.dx, dy: pd.dy, flash: 0 });
      }
      for (const jp of zf.jumpPads ?? []) {
        this.jumpPads.push({ x: zone.x + jp.x + jit(60), y: zone.y + jp.y + jit(60), flash: 0 });
      }
      for (const r of zf.rewards ?? []) {
        let x = zone.x + r.x + jit(50);
        let y = zone.y + r.y + jit(50);
        if (this.wallBlocked(x, y, 46)) { x = zone.x + r.x; y = zone.y + r.y; }
        if (r.kind === 'chest') this.placeChest(x, y);
        else this.rewards.push({ x, y, kind: r.kind, taken: false });
      }
    }
  }

  private placeChest(x: number, y: number): void {
    if (this.oCount >= this.oCap) return;
    const i = this.oCount++;
    this.ox[i] = x;
    this.oy[i] = y;
    this.oradius[i] = 14;
    this.ohp[i] = 90;
    this.omaxhp[i] = 90;
    this.otype[i] = OBST_CHEST;
    this.oflash[i] = 0;
  }

  /** Ground height (0 or terrace top) at a world position. */
  groundHeightAt(x: number, y: number): number {
    for (const t of this.terraces) {
      if (x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h) return t.z;
    }
    return 0;
  }

  /** Eased ground height used for smooth stepping on/off terraces. */
  static easeGroundZ(current: number, target: number, dt: number): number {
    const rate = 8;
    const k = 1 - Math.exp(-rate * dt);
    return current + (target - current) * k;
  }

  /** True when a circle at (x,y) of `r` overlaps a live obstacle. */
  blocked(x: number, y: number, r: number): boolean {
    for (let i = 0; i < this.oCount; i++) {
      if (!this.obstAlive(i)) continue;
      const rr = r + this.oradius[i] + 6;
      const dx = x - this.ox[i];
      const dy = y - this.oy[i];
      if (dx * dx + dy * dy < rr * rr) return true;
    }
    return false;
  }

  /** obstacle + interior-wall check for spawns and teleports */
  isBlockedForSpawn(x: number, y: number, r: number): boolean {
    return this.blocked(x, y, r) || this.wallBlocked(x, y, r);
  }

  /** test helper: place a chest at an arbitrary position */
  placeChestForTest(x: number, y: number): void {
    this.ox[this.oCount] = x;
    this.oy[this.oCount] = y;
    this.oradius[this.oCount] = 14;
    this.ohp[this.oCount] = 10;
    this.omaxhp[this.oCount] = 10;
    this.otype[this.oCount] = OBST_CHEST;
    this.oflash[this.oCount] = 0;
    this.oCount++;
    this.rebuildObstHash();
  }

  destroyObstacle(i: number): void {
    this.ohp[i] = 0;
    this.obstDirty = true; // hash rebuilt at the next sim tick (never mid-walk)
  }

  // ---------- stats ----------

  computeStats(weapons: Map<WeaponId, number>, passives: Map<PassiveId, number>, items: Map<string, number> = new Map()): Stats {
    const c = this.char;
    const meta = getMetaRanks();
    let pct = { dmg: 1, hp: 1, speed: 1, knock: 1, magnet: 1, gold: 1, xp: 1, impact: 1 };
    for (const def of META_UPGRADES) {
      const rank = meta[def.id] ?? 0;
      if (rank <= 0) continue;
      pct.dmg += def.perRank.dmgPct ?? 0;
      pct.hp += def.perRank.hpPct ?? 0;
      pct.speed += def.perRank.speedPct ?? 0;
      pct.knock += def.perRank.knockPct ?? 0;
      pct.magnet += def.perRank.magnetPct ?? 0;
      pct.gold += def.perRank.goldPct ?? 0;
      pct.xp += def.perRank.xpPct ?? 0;
      pct.impact += def.perRank.impactPct ?? 0;
    }

    const s: Stats = {
      maxHp: c.stats.maxHp * pct.hp,
      speed: c.stats.speed * pct.speed,
      mass: c.stats.mass,
      magnetR: 64 * pct.magnet,
      knockMult: c.stats.knockMult * pct.knock,
      impactDmg: c.stats.impactDmg * pct.impact * pct.dmg,
      dmgMult: pct.dmg,
      cooldownMult: 1,
      areaMult: 1,
      luck: 0,
      ricochet: c.stats.ricochet,
      regen: 0,
      xpMult: pct.xp,
      goldMult: pct.gold,
      contactDps: 0,
    };

    const pl = (id: PassiveId) => passives.get(id) ?? 0;
    s.mass *= 1 + 0.3 * pl('mass');
    s.speed *= 1 + 0.10 * pl('velocity');
    s.maxHp += 25 * pl('vitality');
    s.magnetR *= 1 + 0.4 * pl('magnet');
    s.impactDmg *= 1 + 0.35 * pl('impact');
    s.regen += 0.9 * pl('regen');
    s.ricochet += pl('ricochet');
    s.luck += pl('luck');
    s.goldMult *= 1 + 0.15 * pl('luck');
    if (c.id === 'spiker') s.contactDps = 10 + 4 * (weapons.get('orbit') ?? 0);

    // item layer — multiplicative pcts are additive across copies (linear scaling)
    for (const [itemId, copies] of items) {
      if (copies <= 0) continue;
      const im = ITEM_MODS.get(itemId);
      if (!im) continue;
      s.dmgMult += (im.dmgPct ?? 0) * copies;
      s.maxHp *= 1 + (im.hpPct ?? 0) * copies;
      s.maxHp += (im.hpFlat ?? 0) * copies;
      s.speed *= 1 + (im.speedPct ?? 0) * copies;
      s.knockMult += (im.knockPct ?? 0) * copies;
      s.impactDmg += (im.impactPct ?? 0) * copies;
      s.cooldownMult += (im.cdPct ?? 0) * copies;
      s.areaMult += (im.areaPct ?? 0) * copies;
      s.mass *= 1 + (im.massPct ?? 0) * copies;
      s.magnetR *= 1 + (im.magnetPct ?? 0) * copies;
      s.goldMult += (im.goldPct ?? 0) * copies;
      s.xpMult += (im.xpPct ?? 0) * copies;
      s.regen += (im.regenFlat ?? 0) * copies;
      s.luck += (im.luckFlat ?? 0) * copies;
      s.ricochet += (im.ricochetFlat ?? 0) * copies;
      s.contactDps += (im.contactDpsFlat ?? 0) * copies;
    }

    // shrine buff
    if (this.buff) {
      if (this.buff.kind === 'might') {
        s.dmgMult *= 1.3;
        s.impactDmg *= 1.3;
      } else if (this.buff.kind === 'regen') {
        s.regen += 1.2;
      } else if (this.buff.kind === 'magnet') {
        s.magnetR *= 1.6;
      }
    }
    return s;
  }

  refreshStats(): void {
    const oldMax = this.stats.maxHp;
    this.stats = this.computeStats(this.weapons, this.passives, this.items);
    if (this.stats.maxHp > oldMax) this.hp += this.stats.maxHp - oldMax;
    this.hp = Math.min(this.hp, this.stats.maxHp);
  }

  addWeapon(id: WeaponId): void {
    this.weapons.set(id, 1);
    this.weaponCds.set(id, 0.5);
  }

  // ---------- spawns ----------

  spawnEnemy(type: EnemyId, x: number, y: number, elite: boolean, hpScale: number, mod = 0): number {
    if (this.eCount >= this.eCap) return -1;
    const i = this.eCount++;
    const d = ENEMY_DEFS[type];
    this.etype[i] = type;
    this.ex[i] = x; this.ey[i] = y;
    this.evx[i] = 0; this.evy[i] = 0;
    this.emaxhp[i] = d.hp * hpScale * (elite ? 3.2 : 1);
    this.ehp[i] = this.emaxhp[i];
    this.eradius[i] = d.radius * (elite ? 1.35 : 1);
    this.emass[i] = d.mass * (elite ? 2 : 1);
    this.eflash[i] = 0;
    this.echarge[i] = 0;
    this.eorbIframe[i] = 0;
    this.eelite[i] = elite ? 1 : 0;
    this.eexploding[i] = 0;
    this.erangeCd[i] = d.ranged ? this.rng.range(0.5, d.ranged.cd) : 0;
    this.eatkCd[i] = d.attack ? this.rng.range(d.attack.cd * 0.5, d.attack.cd) : 0;
    this.ewindup[i] = 0;
    this.eactive[i] = 0;
    this.edirX[i] = 0;
    this.edirY[i] = 0;
    this.emod[i] = mod;
    this.emodCd[i] = mod ? this.rng.range(0.8, 1.6) : 0;
    this.eslow[i] = 0;
    if (d.boss) this.bossAlive = true;
    return i;
  }

  spawnBolt(x: number, y: number, vx: number, vy: number, dmg: number, knock: number, bounces: number, kind = 0, life = 1.6): void {
    if (this.bCount >= this.bCap) return;
    const i = this.bCount++;
    this.bx[i] = x; this.by[i] = y;
    this.bvx[i] = vx; this.bvy[i] = vy;
    this.blife[i] = life;
    this.bdmg[i] = dmg;
    this.bknock[i] = knock;
    this.bbounces[i] = bounces;
    this.bkind[i] = kind;
  }

  spawnEnemyBullet(x: number, y: number, vx: number, vy: number, dmg: number): void {
    if (this.vCount >= this.vCap) return;
    const i = this.vCount++;
    this.vx[i] = x; this.vy[i] = y;
    this.vvx[i] = vx; this.vvy[i] = vy;
    this.vlife[i] = 4;
    this.vdmg[i] = dmg;
  }

  spawnGem(x: number, y: number, kind: number, value: number): void {
    if (this.gCount >= this.gCap) {
      // overflow: vacuum the oldest gem into the player instead of dropping
      this.gmagnet[0] = 1;
      return;
    }
    const i = this.gCount++;
    this.gx[i] = x; this.gy[i] = y;
    const a = this.rng.angle();
    const s = this.rng.range(20, 70);
    this.gvx[i] = Math.cos(a) * s;
    this.gvy[i] = Math.sin(a) * s;
    this.gkind[i] = kind;
    this.gvalue[i] = value;
    this.gmagnet[i] = 0;
  }

  // ---------- swap-remove pools ----------

  killEnemy(i: number, onDeath: (idx: number) => void): void {
    const last = --this.eCount;
    onDeath(i);
    if (i !== last) {
      this.ex[i] = this.ex[last]; this.ey[i] = this.ey[last];
      this.evx[i] = this.evx[last]; this.evy[i] = this.evy[last];
      this.ehp[i] = this.ehp[last]; this.emaxhp[i] = this.emaxhp[last];
      this.eradius[i] = this.eradius[last]; this.emass[i] = this.emass[last];
      this.etype[i] = this.etype[last];
      this.eflash[i] = this.eflash[last];
      this.echarge[i] = this.echarge[last];
      this.eorbIframe[i] = this.eorbIframe[last];
      this.eelite[i] = this.eelite[last];
      this.eexploding[i] = this.eexploding[last];
      this.erangeCd[i] = this.erangeCd[last];
      this.eatkCd[i] = this.eatkCd[last];
      this.ewindup[i] = this.ewindup[last];
      this.eactive[i] = this.eactive[last];
      this.edirX[i] = this.edirX[last];
      this.edirY[i] = this.edirY[last];
      this.emod[i] = this.emod[last];
      this.emodCd[i] = this.emodCd[last];
      this.eslow[i] = this.eslow[last];
    }
    if (this.eCount === 0) this.bossAlive = false;
  }

  removeBolt(i: number): void {
    const last = --this.bCount;
    if (i !== last) {
      this.bx[i] = this.bx[last]; this.by[i] = this.by[last];
      this.bvx[i] = this.bvx[last]; this.bvy[i] = this.bvy[last];
      this.blife[i] = this.blife[last];
      this.bdmg[i] = this.bdmg[last];
      this.bknock[i] = this.bknock[last];
      this.bbounces[i] = this.bbounces[last];
      this.bkind[i] = this.bkind[last];
    }
  }

  removeEnemyBullet(i: number): void {
    const last = --this.vCount;
    if (i !== last) {
      this.vx[i] = this.vx[last]; this.vy[i] = this.vy[last];
      this.vvx[i] = this.vvx[last]; this.vvy[i] = this.vvy[last];
      this.vlife[i] = this.vlife[last];
      this.vdmg[i] = this.vdmg[last];
    }
  }

  removeGem(i: number): void {
    const last = --this.gCount;
    if (i !== last) {
      this.gx[i] = this.gx[last]; this.gy[i] = this.gy[last];
      this.gvx[i] = this.gvx[last]; this.gvy[i] = this.gvy[last];
      this.gkind[i] = this.gkind[last];
      this.gvalue[i] = this.gvalue[last];
      this.gmagnet[i] = this.gmagnet[last];
    }
  }
}

// ---------- meta save integration (set by save module to avoid cycles) ----------

let metaRankGetter: () => Record<string, number> = () => ({});
export function setMetaRankGetter(fn: () => Record<string, number>): void {
  metaRankGetter = fn;
}
export function getMetaRanks(): Record<string, number> {
  return metaRankGetter();
}

export function passiveLevel(w: World, id: PassiveId): number {
  return w.passives.get(id) ?? 0;
}

export function passiveName(id: PassiveId): string {
  return PASSIVES[id].name;
}
