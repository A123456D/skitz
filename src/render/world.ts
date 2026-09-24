/** Pixi world renderer: 3/4 pseudo-3D projection + fx. Mirrors the SoA sim into pooled sprites. */
import { Container, Graphics, Sprite, TilingSprite, Texture } from 'pixi.js';
import { Rng } from '../engine/rng';
import { GROUND_TILT } from '../engine/camera';
import type { Atlas } from './atlas';
import { ParticleSys } from './particles';
import { damageNumberLayer, installDamageFont, spawnNumber, updateNumbers } from './damageNumbers';
import type { Run, FxSink } from '../game/run';
import { ENEMY_DEFS, ENEMY } from '../game/data/enemies';
import { OBST_CRATE, OBST_CHEST, OBST_PILLAR, ARENA_H, ARENA_W, type World } from '../game/state';
import { trailNodesForRender } from '../game/weapons';
import { WEAPONS } from '../game/data/weapons';
import { BallRig } from './ballRig';
import { METEOR_FALL_T, METEOR_RADIUS } from '../game/runEvents';
import { ZONES } from '../game/data/zones';
import { BIOMES, type Biome } from '../game/data/biomes';
import { ELITE_MODS } from '../game/data/eliteMods';
import type { AttackKind } from '../game/events';

const BIOME_FALLBACK: Biome = BIOMES[0];

// palette
const CYAN = 0x4de1ff;
const YELLOW = 0xffd23f;
const RED = 0xff5470;
const WHITE = 0xffffff;
const ORANGE = 0xffa63f;
const STEEL = 0x9fb4d8;
const VOLT = 0x8fb7ff;

interface Flash { s: Sprite; t: number; maxT: number; scale: number }

interface GhostPop { s: Sprite; t: number; maxT: number; vx: number; sway: number }

const cssHex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

const skyCache = new Map<string, Texture>();
function skyTexture(b: Biome): Texture {
  let tex = skyCache.get(b.id);
  if (tex) return tex;
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, cssHex(b.skyTop));
  grad.addColorStop(1, cssHex(b.skyBottom));
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  tex = Texture.from(c);
  skyCache.set(b.id, tex);
  return tex;
}

let glowTex: Texture | null = null;
function glowTexture(): Texture {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  const s = 128;
  c.width = s;
  c.height = s;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.32)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  glowTex = Texture.from(c);
  return glowTex;
}

let fogTexCache: Texture | null = null;
function fogTexture(): Texture {
  if (fogTexCache) return fogTexCache;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 96;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 96);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 96);
  fogTexCache = Texture.from(c);
  return fogTexCache;
}

/** types of enemy that get the comedic rising-ghost death pop */
const GHOSTABLE = new Set<number>([ENEMY.swarmie, ENEMY.splitter, ENEMY.splitterHalf, ENEMY.imp, ENEMY.spitter, ENEMY.exploder]);

/**
 * Render-space conventions: x is world x; render y = world y * GROUND_TILT - z.
 * Everything inside `root` lives in render space; the camera scales root.
 */
export class WorldRenderer implements FxSink {
  root = new Container();
  layers!: {
    sky: Sprite;
    bgFar: Container;
    bgMid: Container;
    bgNear: Container;
    fog: Container;
    zoneFloors: Container;
    scenery: Container;
    terraces: Graphics;
    patches: Graphics;
    walls: Container;
    wallSegs: Graphics;
    shadows: Container;
    trail: Container;
    ghosts: Container;
    orbitPath: Sprite;
    gems: Container;
    rewards: Container;
    actors: Container; // y-sorted: obstacles + enemies + the player
    bolts: Container;
    vbullets: Container;
    spikes: Container;
    rings: Container;
    flashes: Container;
    particles: Container;
    zaps: Graphics;
    meteors: Graphics;
    meteorPool: Container;
    numbers: Container;
  };

  private atlas: Atlas;
  private rng: () => number = Math.random;

  private enemySprites: Sprite[] = [];
  private enemyShadows: Sprite[] = [];
  private enemyAuras: Array<Sprite | undefined> = [];
  private enemyEgz: number[] = []; // eased ground height per slot (visual)
  private obstacleSprites: Sprite[] = [];
  private gemSprites: Sprite[] = [];
  private boltSprites: Sprite[] = [];
  private boltPrevX: number[] = [];
  private boltPrevY: number[] = [];
  private vBulletSprites: Sprite[] = [];
  private spikeSprites: Sprite[] = [];
  private trailSprites: Sprite[] = [];
  private ringSprites: Array<{ s: Sprite; t: number; maxT: number; from: number; to: number }> = [];
  private flashSprites: Flash[] = [];
  private ghostSprites: Flash[] = [];
  private zaps: Array<{ x1: number; y1: number; x2: number; y2: number; t: number }> = [];
  private meteorSprites: Sprite[] = [];

  private particles!: ParticleSys;
  private shards!: ParticleSys;
  private rewardSprites: Sprite[] = [];
  private lastEnemyType: number[] = [];
  private impactFxAcc = 0;
  private hitFxAcc = 0;
  private ghostAcc = 0;
  private ambientAcc = 0;
  private slamAnimT = 0;
  private recoilT = 0;
  private recoilDirX = 1;
  private recoilDirY = 0;
  private playerShadow!: Sprite;
  private glowSprites: Sprite[] = [];
  private fogBands: Sprite[] = [];
  private bgWindows: Graphics[] = [];
  private ghostPops: GhostPop[] = [];
  private glowBaseAlpha: number[] = [];
  private mapCenterX = 0;
  private mapCenterY = 0;

  /** the ball + its mounted weapon parts (the player as seen on screen) */
  ballRig!: BallRig;
  private lastPx = 0;
  private lastPy = 0;

  constructor(atlas: Atlas, particleCap: number) {
    this.atlas = atlas;
    installDamageFont();

    const zoneFloors = new Container();
    for (const zone of ZONES) {
      const t = new TilingSprite({ texture: atlas.tile1, width: zone.w, height: zone.h });
      t.position.set(zone.x, zone.y * GROUND_TILT);
      t.scale.set(1, GROUND_TILT);
      t.tint = zone.biome.floorTint;
      zoneFloors.addChild(t);
    }

    // atmosphere: sky gradient + 3 parallax silhouette rings with lit windows
    const MAPCX = ARENA_W / 2;
    const MAPCY = ARENA_H * GROUND_TILT / 2;
    const sky = new Sprite(Texture.WHITE);
    sky.texture = skyTexture(BIOME_FALLBACK);
    sky.position.set(MAPCX - 6400, MAPCY - 6400);
    sky.width = 12800;
    sky.height = 12800;
    this.mapCenterX = MAPCX;
    this.mapCenterY = MAPCY;

    const buildSilhouettes = (seed: number, opts: { count: number; hMin: number; hMax: number; wMin: number; wMax: number; windows: boolean }): { shapes: Graphics; windows: Graphics } => {
      const shapes = new Graphics();
      const wins = new Graphics();
      const rng = new Rng(seed);
      const spanX = ARENA_W + 4400;
      const spanY = ARENA_H * GROUND_TILT + 4400;
      for (let i = 0; i < opts.count; i++) {
        const bw = opts.wMin + rng.next() * (opts.wMax - opts.wMin);
        const bh = opts.hMin + rng.next() * (opts.hMax - opts.hMin);
        const side = rng.int(0, 3);
        let bx = 0;
        let by = 0;
        if (side === 0) { bx = MAPCX - spanX / 2 + rng.next() * spanX; by = MAPCY - spanY / 2 - rng.next() * 700; }
        else if (side === 1) { bx = MAPCX - spanX / 2 + rng.next() * spanX; by = MAPCY + spanY / 2 + bh * 0.2 + rng.next() * 700; }
        else if (side === 2) { bx = MAPCX - spanX / 2 - rng.next() * 700; by = MAPCY - spanY / 2 + rng.next() * spanY; }
        else { bx = MAPCX + spanX / 2 + rng.next() * 700; by = MAPCY - spanY / 2 + rng.next() * spanY; }
        shapes.rect(bx, by - bh, bw, bh).fill(0xffffff);
        if (opts.windows) {
          const cols = Math.max(1, Math.floor(bw / 26));
          const rows = Math.max(1, Math.floor(bh / 34));
          for (let cx = 0; cx < cols; cx++) {
            for (let cy = 0; cy < rows; cy++) {
              if (rng.next() > 0.34) continue;
              wins.rect(bx + 8 + cx * 26, by - bh + 12 + cy * 34, 5, 7).fill(0xffffff);
            }
          }
        }
      }
      return { shapes, windows: wins };
    };

    const farRigs = buildSilhouettes(0xa11ce, { count: 46, hMin: 120, hMax: 420, wMin: 60, wMax: 160, windows: false });
    const midRigs = buildSilhouettes(0xb0b, { count: 34, hMin: 180, hMax: 560, wMin: 70, wMax: 190, windows: true });
    const nearRigs = buildSilhouettes(0xc0de, { count: 22, hMin: 260, hMax: 720, wMin: 90, wMax: 230, windows: true });

    // drifting ground fog (two bands, opposite directions)
    const fog = new Container();
    for (let i = 0; i < 2; i++) {
      const f = new Sprite(fogTexture());
      f.anchor.set(0.5);
      f.alpha = 0.05;
      f.scale.set(14, 5);
      fog.addChild(f);
      this.fogBands.push(f);
    }

    // additive glow decals (light pools) — positioned per run in initRun
    const glowPool = new Container();
    this.glowSprites = [];
    for (let i = 0; i < 56; i++) {
      const s = new Sprite(glowTexture());
      s.anchor.set(0.5);
      s.blendMode = 'add';
      s.visible = false;
      glowPool.addChild(s);
      this.glowSprites.push(s);
    }

    // 3/4 border walls: the far edge shows its tall face, others are bands
    const walls = new Container();
    const farWall = new TilingSprite({ texture: atlas.wall, width: ARENA_W, height: 50 });
    farWall.position.set(0, -30 * GROUND_TILT);
    farWall.scale.set(1, GROUND_TILT);
    walls.addChild(farWall);
    const mk = (x: number, y: number, w: number, h: number) => {
      const t = new TilingSprite({ texture: atlas.wall, width: w, height: h });
      t.position.set(x, y);
      walls.addChild(t);
    };
    mk(0, ARENA_H * GROUND_TILT - 12, ARENA_W, 28);
    mk(0, 16 * GROUND_TILT, 16, ARENA_H * GROUND_TILT - 28 * GROUND_TILT);
    mk(ARENA_W - 16, 16 * GROUND_TILT, 16, ARENA_H * GROUND_TILT - 28 * GROUND_TILT);
    // interior wall segments get their own Graphics (drawn per run in initRun)
    const wallSegs = new Graphics();
    walls.addChild(wallSegs);

    const terraces = new Graphics();
    const patches = new Graphics();
    const scenery = new Container();
    const shadows = new Container();
    // y-sorted actor layer: obstacles + enemies + the player share one depth order
    const actors = new Container();
    actors.sortableChildren = true;
    for (let i = 0; i < 48; i++) {
      const s = new Sprite(atlas.crate);
      s.anchor.set(0.5, 1); // base-anchored for 3/4 projection
      s.visible = false;
      actors.addChild(s);
      this.obstacleSprites.push(s);
    }
    // rewards: coin piles, shrines
    const rewards = new Container();
    for (let i = 0; i < 12; i++) {
      const s = new Sprite(atlas.coin);
      s.anchor.set(0.5, 1);
      s.visible = false;
      rewards.addChild(s);
      this.rewardSprites.push(s);
    }
    this.playerShadow = new Sprite(atlas.shadow);
    this.playerShadow.anchor.set(0.5, 0.5);
    this.playerShadow.alpha = 0.45;
    shadows.addChild(this.playerShadow);

    const trail = new Container();
    for (let i = 0; i < 90; i++) {
      const s = new Sprite(atlas.spark);
      s.anchor.set(0.5);
      s.visible = false;
      trail.addChild(s);
      this.trailSprites.push(s);
    }

    // dash afterimages
    const ghosts = new Container();
    for (let i = 0; i < 12; i++) {
      const s = new Sprite(atlas.ball_wrecker);
      s.anchor.set(0.5);
      s.visible = false;
      ghosts.addChild(s);
      this.ghostSprites.push({ s, t: 0, maxT: 0.22, scale: 1 });
    }

    const orbitPath = new Sprite(atlas.ring);
    orbitPath.anchor.set(0.5);
    orbitPath.tint = STEEL;
    orbitPath.alpha = 0.12;
    orbitPath.visible = false;

    const gems = new Container();
    const bolts = new Container();
    const vbullets = new Container();
    const spikes = new Container();
    const rings = new Container();
    const flashes = new Container();
    for (let i = 0; i < 8; i++) {
      const s = new Sprite(atlas.muzzle);
      s.anchor.set(0.5);
      s.visible = false;
      flashes.addChild(s);
      this.flashSprites.push({ s, t: 0, maxT: 0.1, scale: 1 });
    }
    // comedic rising ghosts for small-enemy deaths
    for (let i = 0; i < 12; i++) {
      const s = new Sprite(atlas.ghost);
      s.anchor.set(0.5, 0.5);
      s.tint = 0xd8e6ff;
      s.visible = false;
      flashes.addChild(s);
      this.ghostPops.push({ s, t: 0, maxT: 0.8, vx: 0, sway: 0 });
    }
    this.particles = new ParticleSys(atlas.spark, particleCap);
    this.shards = new ParticleSys(atlas.shard, Math.floor(particleCap * 0.6));
    const zaps = new Graphics();
    // meteor telegraph rings + falling rocks (METEOR SHOWER event)
    const meteors = new Graphics();
    const meteorPool = new Container();
    for (let i = 0; i < 48; i++) {
      const s = new Sprite(atlas.rubble);
      s.anchor.set(0.5);
      s.tint = 0xff8a5a;
      s.visible = false;
      meteorPool.addChild(s);
      this.meteorSprites.push(s);
    }
    const numbers = damageNumberLayer();

    this.root.addChild(sky, farRigs.shapes, farRigs.windows, midRigs.shapes, midRigs.windows, nearRigs.shapes, nearRigs.windows, fog, glowPool, zoneFloors, scenery, patches, terraces, walls, wallSegs, shadows, trail, ghosts, orbitPath, gems, rewards, actors, rings, spikes, bolts, vbullets, this.particles.container, this.shards.container, flashes, zaps, numbers);
    this.root.addChildAt(meteors, this.root.getChildIndex(shadows));
    this.root.addChild(meteorPool);

    this.layers = { sky, bgFar: farRigs.shapes, bgMid: midRigs.shapes, bgNear: nearRigs.shapes, fog, zoneFloors, scenery, patches, terraces, walls, wallSegs, shadows, trail, ghosts, orbitPath, gems, rewards, actors, rings, flashes, particles: this.particles.container, zaps, numbers, bolts, vbullets, spikes, meteors, meteorPool };
    this.bgWindows = [farRigs.windows, midRigs.windows, nearRigs.windows];
  }

  get particleCount(): number {
    return this.particles.activeCount + this.shards.activeCount;
  }

  initPlayerSprite(): void {
    this.ballRig = new BallRig(this.atlas, (tint) => this.equipFx(tint));
    this.layers.actors.addChild(this.ballRig);
  }

  /** Called at run start: applies zone palettes, scatters scenery, draws terrain. */
  initRun(w: World): void {
    this.ballRig.setBall(this.atlas[w.char.sprite]);
    // per-zone floor tints
    for (let i = 0; i < w.zones.length; i++) {
      (this.layers.zoneFloors.children[i] as TilingSprite).tint = w.zones[i].biome.floorTint;
    }
    for (const child of this.layers.walls.children) child.tint = 0xd8dce8;

    // backdrop atmosphere: silhouette tints + lit windows per zone biome mix
    const tints = this.zoneBiomeMix(w);
    const farB = tints[0];
    const midB = tints[1];
    const nearB = tints[2];
    this.layers.bgFar.tint = farB.silhouetteFar;
    (this.bgWindows[0]).tint = farB.windowColor;
    (this.bgWindows[0]).alpha = 0.4;
    this.layers.bgMid.tint = midB.silhouetteMid;
    (this.bgWindows[1]).tint = midB.windowColor;
    (this.bgWindows[1]).alpha = 0.62;
    this.layers.bgNear.tint = nearB.silhouetteNear;
    (this.bgWindows[2]).tint = nearB.windowColor;
    (this.bgWindows[2]).alpha = 0.85;
    this.layers.sky.texture = skyTexture(nearB);
    for (const f of this.fogBands) f.tint = nearB.fogColor;
    this.layers.wallSegs.clear();
    for (const seg of w.wallSegs) {
      const x = seg.x;
      const y = seg.y * GROUND_TILT;
      const skirt = 26 * GROUND_TILT;
      this.layers.wallSegs.rect(x, y + seg.h * GROUND_TILT - 2, seg.w, skirt + 2).fill({ color: 0x000000, alpha: 0.45 });
      this.layers.wallSegs.rect(x, y, seg.w, seg.h * GROUND_TILT).fill({ color: 0xc9cfdd, alpha: 0.28 });
      this.layers.wallSegs.rect(x, y, seg.w, 3).fill({ color: 0xffffff, alpha: 0.5 });
    }

    // movement-terrain decals
    const pg = this.layers.patches;
    pg.clear();
    for (const p of w.patches) {
      const tint = p.kind === 'ice' ? 0xbfe8ff : 0x8a6a3a;
      const alpha = p.kind === 'ice' ? 0.3 : 0.34;
      pg.circle(p.x, p.y * GROUND_TILT, p.r).fill({ color: tint, alpha });
      pg.circle(p.x, p.y * GROUND_TILT, p.r).stroke({ width: 2, color: tint, alpha: alpha + 0.2 });
    }
    for (const p of w.boostPads) {
      pg.rect(p.x, p.y * GROUND_TILT, p.w, p.h * GROUND_TILT).fill({ color: 0xffd23f, alpha: 0.16 });
      const cx = p.x + p.w / 2;
      const cy = p.y * GROUND_TILT + (p.h * GROUND_TILT) / 2;
      const chevrons = Math.max(2, Math.floor(Math.max(p.w, p.h) / 34));
      for (let c = 0; c < chevrons; c++) {
        const t = (c + 0.5) / chevrons;
        const ax = cx - p.dx * (p.w / 2) + p.dx * p.w * t;
        const ay = cy - p.dy * (p.h / 2) * GROUND_TILT + p.dy * p.h * t * GROUND_TILT;
        const sz = 9;
        pg.moveTo(ax - (p.dy !== 0 ? sz : sz * 0.4), ay - (p.dx !== 0 ? sz * GROUND_TILT : sz));
        pg.lineTo(ax + (p.dx !== 0 ? sz : 0), ay + (p.dy !== 0 ? sz * GROUND_TILT : 0));
        pg.lineTo(ax - (p.dy !== 0 ? sz : sz * 0.4), ay + (p.dx !== 0 ? sz * GROUND_TILT : sz));
        pg.stroke({ width: 3, color: 0xffd23f, alpha: 0.75 });
      }
    }
    for (const j of w.jumpPads) {
      pg.circle(j.x, j.y * GROUND_TILT, 24).fill({ color: 0x57e389, alpha: 0.22 });
      pg.circle(j.x, j.y * GROUND_TILT, 24).stroke({ width: 2, color: 0x57e389, alpha: 0.7 });
      pg.circle(j.x, j.y * GROUND_TILT, 10).fill({ color: 0x57e389, alpha: 0.5 });
    }
    for (const b of w.bumpers) {
      pg.circle(b.x, b.y * GROUND_TILT, b.r).fill({ color: 0xff5470, alpha: 0.3 });
      pg.circle(b.x, b.y * GROUND_TILT, b.r).stroke({ width: 3, color: 0xff7a9a, alpha: 0.85 });
    }

    // seeded scenery scatter per zone (side rng keeps the sim sequence untouched)
    const rng = new Rng((w.seed ^ 0x9e3779b9) >>> 0);
    this.layers.scenery.removeChildren();
    const glowSpots: Array<{ x: number; ry: number; tint: number; scale: number; alpha: number }> = [];
    for (const zone of w.zones) {
      const count = Math.floor(34 * zone.biome.deco);
      const decos = ['crack', 'crack', 'plate', 'grate', 'rubble', 'glowcrack'] as const;
      for (let i = 0; i < count; i++) {
        const name = decos[Math.floor(rng.next() * decos.length)];
        const s = new Sprite(this.atlas[name]);
        s.anchor.set(0.5);
        const x = zone.x + 60 + rng.next() * (zone.w - 120);
        const y = zone.y + 60 + rng.next() * (zone.h - 120);
        s.position.set(Math.round(x), Math.round(y * GROUND_TILT));
        s.rotation = Math.floor(rng.next() * 4) * (Math.PI / 2);
        if (name === 'glowcrack') {
          s.tint = zone.biome.accent;
          s.alpha = 0.55;
          s.scale.set(1 + rng.next() * 1.6, (1 + rng.next() * 1.6) * GROUND_TILT);
          glowSpots.push({ x, ry: y * GROUND_TILT, tint: zone.biome.accent, scale: 46 + rng.next() * 44, alpha: 0.1 + rng.next() * 0.08 });
        } else {
          s.tint = zone.biome.decoTint;
          s.alpha = 0.5 + rng.next() * 0.4;
          s.scale.set(0.8 + rng.next() * 1.8);
        }
        this.layers.scenery.addChild(s);
      }
      // two standing lamps per zone: light pool + bloom bait
      for (let l = 0; l < 2; l++) {
        const lx = zone.x + 180 + rng.next() * (zone.w - 360);
        const ly = zone.y + 180 + rng.next() * (zone.h - 360);
        glowSpots.push({ x: lx, ry: ly * GROUND_TILT, tint: zone.biome.accent, scale: 95 + rng.next() * 55, alpha: 0.12 });
      }
    }
    // glow pools under bumpers, jump pads, shrines
    for (const b of w.bumpers) glowSpots.push({ x: b.x, ry: b.y * GROUND_TILT, tint: 0xff7a9a, scale: b.r * 3.4, alpha: 0.16 });
    for (const j of w.jumpPads) glowSpots.push({ x: j.x, ry: j.y * GROUND_TILT, tint: 0x57e389, scale: 78, alpha: 0.15 });
    for (const r of w.rewards) {
      if (r.kind !== 'cache') glowSpots.push({ x: r.x, ry: r.y * GROUND_TILT, tint: w.zoneAt(r.x, r.y).biome.accent, scale: 88, alpha: 0.18 });
    }
    for (let i = 0; i < this.glowSprites.length; i++) {
      const s = this.glowSprites[i];
      const spot = glowSpots[i % Math.max(1, glowSpots.length)];
      if (!spot || i >= glowSpots.length) {
        s.visible = false;
        continue;
      }
      s.position.set(spot.x, spot.ry);
      s.tint = spot.tint;
      s.scale.set(spot.scale / 64, (spot.scale / 64) * GROUND_TILT);
      s.alpha = spot.alpha;
      s.visible = true;
    }
    this.glowBaseAlpha = this.glowSprites.map((s) => (s.visible ? s.alpha : 0));

    // terraces: raised top face + south-facing skirt + accent edge
    const tg = this.layers.terraces;
    tg.clear();
    for (const t of w.terraces) {
      const x = t.x;
      const y = t.y * GROUND_TILT;
      const tw = t.w;
      const th = t.h * GROUND_TILT;
      const skirt = t.z * GROUND_TILT;
      tg.rect(x, y + th - 2, tw, skirt + 2).fill({ color: 0x000000, alpha: 0.4 });
      tg.rect(x, y, tw, th).fill({ color: 0xffffff, alpha: 0.13 });
      tg.rect(x, y, tw, 2).fill({ color: 0x9fb4d8, alpha: 0.55 });
      tg.rect(x, y, 2, th).fill({ color: 0x9fb4d8, alpha: 0.3 });
      tg.rect(x + tw - 2, y, 2, th).fill({ color: 0x9fb4d8, alpha: 0.3 });
      tg.rect(x, y + th, tw, 2).fill({ color: 0x9fb4d8, alpha: 0.5 });
    }

    // obstacle sprites: assign texture + tint per run
    for (let i = 0; i < w.oCount; i++) {
      const s = this.obstacleSprites[i];
      s.texture = this.atlas[w.otype[i] === OBST_PILLAR ? 'pillar' : 'crate'];
      s.tint = w.otype[i] === OBST_CHEST ? 0xffd76a : 0xffffff;
      s.visible = false;
    }

    // reward sprites: coin piles for caches, glowing markers for shrines
    for (let i = 0; i < this.rewardSprites.length; i++) this.rewardSprites[i].visible = false;
    let ri = 0;
    for (const r of w.rewards) {
      if (ri >= this.rewardSprites.length) break;
      const s = this.rewardSprites[ri++];
      s.texture = r.kind === 'cache' ? this.atlas.coin : this.atlas.spike;
      s.tint = r.kind === 'cache' ? 0xffffff : w.zoneAt(r.x, r.y).biome.accent;
      s.visible = true;
    }
  }

  // ================= per-frame sync =================

  sync(run: Run, dt: number, viewL: number, viewT: number, viewR: number, viewB: number): void {
    const w = run.w;
    this.impactFxAcc = Math.max(0, this.impactFxAcc - dt * 90);
    this.hitFxAcc = Math.max(0, this.hitFxAcc - dt * 60);
    const py = (wy: number) => wy * GROUND_TILT;
    // ground-unit view bounds (z lifts sprites up to ~90px above the plane)
    const inView = (x: number, wy: number, m = 40) =>
      x > viewL - m && x < viewR + m && wy > viewT - 150 && wy < viewB + 60;

    // parallax backdrop drifts against the camera, deepest layer slowest
    const cx = (viewL + viewR) / 2;
    const cy = (viewT + viewB) / 2;
    const px = (f: number) => -(cx - this.mapCenterX) * f;
    const pyv = (f: number) => -(cy - this.mapCenterY) * f * GROUND_TILT;
    this.layers.sky.position.set(px(0.02) + this.mapCenterX - this.layers.sky.width / 2, pyv(0.02) + this.mapCenterY - this.layers.sky.height / 2);
    this.layers.bgFar.position.set(px(0.05), pyv(0.05));
    this.layers.bgMid.position.set(px(0.12), pyv(0.12));
    this.layers.bgNear.position.set(px(0.2), pyv(0.2));

    // fog bands drift across the lower view, tinted by the current zone
    const curBiome = w.zoneAt(w.px, w.py).biome;
    const fogY1 = viewB * GROUND_TILT * 0.78;
    const fogY2 = viewB * GROUND_TILT * 0.98;
    this.fogBands[0].position.set(cx + Math.sin(w.time * 0.11) * 420, fogY1);
    this.fogBands[1].position.set(cx + Math.cos(w.time * 0.07) * 520 + 260, fogY2);
    for (const f of this.fogBands) {
      if (f.tint !== curBiome.fogColor) f.tint = curBiome.fogColor;
    }

    // glow decals breathe softly
    for (let i = 0; i < this.glowSprites.length; i++) {
      const s = this.glowSprites[i];
      if (!s.visible) continue;
      const base = this.glowBaseAlpha[i] ?? 0;
      s.alpha = base * (0.86 + Math.sin(w.time * 1.7 + i * 1.3) * 0.14);
    }

    // comedic death ghosts rise and fade
    for (const gp of this.ghostPops) {
      if (gp.t <= 0) {
        if (gp.s.visible) gp.s.visible = false;
        continue;
      }
      gp.t -= dt;
      const t = Math.max(0, gp.t / gp.maxT);
      gp.s.y -= 44 * dt;
      gp.s.x += gp.vx * dt + Math.sin((1 - t) * 9 + gp.sway) * 12 * dt;
      gp.s.alpha = Math.min(0.75, t * 1.6);
      gp.s.scale.set(0.8 + (1 - t) * 0.25, (1.25 - (1 - t) * 0.3) * 1);
      gp.s.rotation = Math.sin((1 - t) * 6 + gp.sway) * 0.08;
    }

    // --- obstacles (y-sorted, base-anchored) ---
    for (let i = 0; i < w.oCount; i++) {
      const s = this.obstacleSprites[i];
      const alive = !(w.otype[i] === OBST_CRATE && w.ohp[i] <= 0);
      s.visible = alive && inView(w.ox[i], w.oy[i], 60);
      if (!s.visible || !alive) continue;
      const baseScale = (w.oradius[i] * 2) / s.texture.width;
      s.scale.set(baseScale);
      s.position.set(Math.round(w.ox[i]), Math.round(py(w.oy[i]) + 4));
      s.zIndex = w.oy[i];
      if (w.oflash[i] > 0) {
        w.oflash[i] -= dt;
        s.tint = 0xfff2c8;
      } else if (w.otype[i] === OBST_CRATE) {
        const ratio = Math.max(0, w.ohp[i]) / w.omaxhp[i];
        s.tint = ratio > 0.66 ? WHITE : ratio > 0.33 ? 0xd8c2a8 : 0xb09478;
      } else {
        s.tint = WHITE;
      }
    }

    // --- enemies (idle/attack animation + z lift + y-sort) ---
    for (let i = 0; i < w.eCount; i++) {
      let s = this.enemySprites[i];
      if (!s) {
        s = new Sprite(this.atlas.swarmie);
        s.anchor.set(0.5, 0.5);
        this.layers.actors.addChild(s);
        this.enemySprites[i] = s;
        this.lastEnemyType[i] = -1;
        this.enemyEgz[i] = 0;
      }
      const type = w.etype[i];
      if (this.lastEnemyType[i] !== type) {
        s.texture = this.atlas[ENEMY_DEFS[type].sprite];
        this.lastEnemyType[i] = type;
      }
      const vis = inView(w.ex[i], w.ey[i], 60);
      s.visible = vis;
      if (!vis) continue;

      // eased ground height (terrace stepping)
      const target = w.groundHeightAt(w.ex[i], w.ey[i]);
      this.enemyEgz[i] += (target - this.enemyEgz[i]) * Math.min(1, dt * 8);
      const egz = this.enemyEgz[i];
      s.position.set(Math.round(w.ex[i]), Math.round(py(w.ey[i]) - egz));

      // drop shadow (always on the true ground plane)
      const sh = this.enemyShadows[i] ?? this.makeEnemyShadow(i);
      sh.visible = true;
      sh.position.set(s.x, py(w.ey[i]) + w.eradius[i] * 0.9 * GROUND_TILT);
      sh.scale.set((w.eradius[i] * 1.5) / 9, 1);

      // elite modifier aura (drawn under the actor layer)
      const modDef = w.emod[i] ? ELITE_MODS[w.emod[i]] : undefined;
      if (modDef) {
        const aura = this.makeAura(i);
        aura.visible = true;
        aura.position.set(sh.x, sh.y);
        const ar = (w.eradius[i] * 2.9) / 14;
        aura.scale.set(ar, ar * GROUND_TILT);
        aura.tint = modDef.auraTint;
        aura.alpha = 0.14 + Math.sin(w.time * 3 + i) * 0.04;
      } else if (this.enemyAuras[i]?.visible) {
        this.enemyAuras[i]!.visible = false;
      }

      const baseScale = (w.eradius[i] * 2) / s.texture.width;
      let sx = 1;
      let sy = 1;
      let yOffset = 0;
      let stretchRot: number | null = null;
      const ph = i * 1.73;

      switch (type) {
        case ENEMY.swarmie: {
          const hop = Math.abs(Math.sin(w.time * 7 + ph));
          yOffset = -hop * 3;
          sy = 0.92 + hop * 0.16;
          break;
        }
        case ENEMY.splitter:
        case ENEMY.splitterHalf: {
          const wob = Math.sin(w.time * 5 + ph);
          sx = 1 + wob * 0.12;
          sy = 1 - wob * 0.12;
          break;
        }
        case ENEMY.tank: {
          const stomp = Math.abs(Math.sin(w.time * 3 + ph));
          yOffset = -stomp * 2;
          sx = sy = 1 + stomp * 0.05;
          break;
        }
        case ENEMY.spitter: {
          sy = sx = 1 + Math.sin(w.time * 4 + ph) * 0.06;
          break;
        }
        case ENEMY.imp: {
          s.rotation = Math.sin(w.time * 10 + ph) * 0.09;
          break;
        }
        default:
          s.rotation = 0;
      }

      // attack windup telegraph
      const atk = ENEMY_DEFS[type].attack;
      if (atk && w.ewindup[i] > 0) {
        const r = 1 - w.ewindup[i] / atk.windup;
        sx *= 1 + r * 0.35;
        sy *= 1 + r * 0.35;
        yOffset -= r * 2;
        s.tint = Math.sin(w.time * 24) > 0 ? 0xffb14b : 0xff5a4d;
        s.scale.set(baseScale * sx, baseScale * sy);
        s.zIndex = w.ey[i];
        continue;
      }

      // lunge/charge stretch
      if (w.eactive[i] > 0 && (atk?.kind === 'lunge' || atk?.kind === 'charge')) {
        stretchRot = Math.atan2(w.evy[i], w.evx[i]);
        sx *= 1.35;
        sy *= 0.8;
      } else if (w.eactive[i] > 0 && atk?.kind === 'spit') {
        sy = sx = 0.85;
      }

      if (w.eexploding[i] > 0) {
        const fuseT = 1 - w.eexploding[i] / (ENEMY_DEFS[type].explodes?.fuse ?? 0.45);
        sx *= 1 + fuseT * 0.6;
        sy *= 1 + fuseT * 0.6;
        s.tint = Math.sin(w.time * 40) > 0 ? RED : WHITE;
      } else if (type === ENEMY.boss && w.bossEnraged) {
        // phase-2 BONZAR pulses molten
        s.tint = Math.sin(w.time * 10) > 0 ? 0xff5a4d : 0xffb14b;
        const rage = 1 + Math.sin(w.time * 8) * 0.04;
        s.scale.set(baseScale * sx * rage, baseScale * sy * rage);
        s.zIndex = w.ey[i];
        continue;
      } else {
        s.tint = w.eflash[i] > 0 ? 0xff6a5a
          : w.eelite[i] && modDef ? modDef.tint
          : w.eelite[i] ? 0xffd9a0
          : w.echarge[i] > 0 ? 0xffc966
          : WHITE;
      }

      s.scale.set(baseScale * sx, baseScale * sy);
      if (stretchRot !== null) s.rotation = stretchRot;
      else if (type !== ENEMY.imp) s.rotation = 0;
      s.y += yOffset;
      s.zIndex = w.ey[i];
    }
    for (let i = w.eCount; i < this.enemySprites.length; i++) {
      if (this.enemySprites[i].visible) this.enemySprites[i].visible = false;
      if (this.enemyShadows[i]?.visible) this.enemyShadows[i].visible = false;
      if (this.enemyAuras[i]?.visible) this.enemyAuras[i]!.visible = false;
    }

    // --- gems/coins ---
    for (let i = 0; i < w.gCount; i++) {
      let s = this.gemSprites[i];
      if (!s) {
        s = new Sprite(this.atlas.gem);
        s.anchor.set(0.5);
        this.layers.gems.addChild(s);
        this.gemSprites[i] = s;
      }
      s.texture = w.gkind[i] === 0 ? this.atlas.gem : this.atlas.coin;
      s.visible = inView(w.gx[i], w.gy[i], 30);
      s.position.set(Math.round(w.gx[i]), Math.round(py(w.gy[i]) + Math.sin(w.time * 6 + i) * 1.5 - 4));
      s.tint = WHITE;
    }
    for (let i = w.gCount; i < this.gemSprites.length; i++) this.gemSprites[i].visible = false;

    // --- rewards (caches bob; shrines glow) ---
    let ri = 0;
    for (const r of w.rewards) {
      if (ri >= this.rewardSprites.length) break;
      const rs = this.rewardSprites[ri++];
      if (r.taken) { rs.visible = false; continue; }
      rs.visible = inView(r.x, r.y, 30);
      rs.position.set(Math.round(r.x), Math.round(py(r.y) - 4 + Math.sin(w.time * 4 + ri) * 2));
      rs.alpha = 0.75 + Math.sin(w.time * 6 + ri) * 0.25;
    }

    // --- bolts (tracer trails; sawring bolts spin) ---
    for (let i = 0; i < w.bCount; i++) {
      let s = this.boltSprites[i];
      const isSaw = w.bkind[i] === 1;
      if (!s) {
        s = new Sprite(this.atlas.shot);
        s.anchor.set(0.5);
        this.layers.bolts.addChild(s);
        this.boltSprites[i] = s;
        this.boltPrevX[i] = w.bx[i];
        this.boltPrevY[i] = w.by[i];
      }
      const wantTex = isSaw ? this.atlas.spike : this.atlas.shot;
      if (s.texture !== wantTex) s.texture = wantTex;
      if (isSaw) s.rotation += dt * 18;
      const moved = Math.abs(w.bx[i] - this.boltPrevX[i]) + Math.abs(w.by[i] - this.boltPrevY[i]);
      if (moved > 5 && !isSaw) {
        const ang = Math.atan2((w.by[i] - this.boltPrevY[i]) * GROUND_TILT, w.bx[i] - this.boltPrevX[i]);
        this.shards.spawn(
          this.boltPrevX[i], py(this.boltPrevY[i]) - 10,
          -Math.cos(ang) * 30, -Math.sin(ang) * 30,
          0.18, 1.1, 0xffe27a, 0, 6, ang, 0,
        );
        this.boltPrevX[i] = w.bx[i];
        this.boltPrevY[i] = w.by[i];
      }
      s.visible = inView(w.bx[i], w.by[i], 30);
      s.position.set(Math.round(w.bx[i]), Math.round(py(w.by[i]) - 10));
      s.rotation = Math.atan2(w.bvy[i] * GROUND_TILT, w.bvx[i]);
    }
    for (let i = w.bCount; i < this.boltSprites.length; i++) this.boltSprites[i].visible = false;

    // --- enemy bullets ---
    for (let i = 0; i < w.vCount; i++) {
      let s = this.vBulletSprites[i];
      if (!s) {
        s = new Sprite(this.atlas.gem);
        s.anchor.set(0.5);
        s.tint = 0xc77dff;
        s.scale.set(1.2);
        this.layers.vbullets.addChild(s);
        this.vBulletSprites[i] = s;
      }
      s.visible = inView(w.vx[i], w.vy[i], 30);
      s.position.set(Math.round(w.vx[i]), Math.round(py(w.vy[i]) - 12));
      s.rotation += dt * 6;
    }
    for (let i = w.vCount; i < this.vBulletSprites.length; i++) this.vBulletSprites[i].visible = false;

    // --- player rig (z lift + attack animations) ---
    this.lastPx = w.px;
    this.lastPy = w.py;
    const rig = this.ballRig;
    rig.zIndex = w.py + 20;
    rig.position.set(Math.round(w.px), Math.round(py(w.py) - w.pz));
    let pScaleX = 1;
    let pScaleY = 1;
    const dash = w.dashT > 0;

    if (this.slamAnimT > 0) {
      this.slamAnimT -= dt;
      const t = 1 - this.slamAnimT / 0.26;
      if (t < 0.45) {
        const u = t / 0.45;
        pScaleY = 1 + 0.35 * Math.sin(u * Math.PI);
        pScaleX = 1 - 0.15 * Math.sin(u * Math.PI);
      } else {
        const u = (t - 0.45) / 0.55;
        pScaleY = 1 - 0.3 * Math.sin(u * Math.PI);
        pScaleX = 1 + 0.3 * Math.sin(u * Math.PI);
      }
    }
    if (this.recoilT > 0) {
      this.recoilT -= dt;
      const u = this.recoilT / 0.09;
      this.recoilDirX = w.facingX;
      this.recoilDirY = w.facingY;
      rig.x = Math.round(w.px - this.recoilDirX * 4 * u);
      rig.y = Math.round(py(w.py) - w.pz - this.recoilDirY * 4 * u * GROUND_TILT);
      pScaleX *= 1 - 0.12 * u;
      pScaleY *= 1 + 0.08 * u;
    }
    // slight stretch while rising, squash while falling fast
    if (w.pz > 0) {
      if (w.pvz > 60) { pScaleY *= 1.08; pScaleX *= 0.95; }
      else if (w.pvz < -120) { pScaleY *= 0.94; pScaleX *= 1.06; }
    }
    const stretch = dash ? 1.25 : 1;
    pScaleX *= stretch;
    pScaleY *= stretch;
    const flashing = w.hurtIframe > 0 && Math.sin(w.time * 50) > 0;
    rig.scale.set(flashing ? 0.92 * pScaleX : pScaleX, flashing ? 0.92 * pScaleY : pScaleY);
    rig.tint = flashing ? RED : WHITE;
    rig.visible = true;
    rig.sync(w, dt, w.time, w.rolling * (w.facingX >= 0 ? 1 : -1));

    // player shadow: stays on the ground plane, shrinks/fades with height
    const airborne = dash || this.slamAnimT > 0;
    const hRatio = Math.min(1, w.pz / 160);
    this.playerShadow.visible = true;
    this.playerShadow.position.set(Math.round(w.px), Math.round(py(w.py) + 7 * GROUND_TILT));
    this.playerShadow.scale.set((airborne ? 0.55 : 0.95) * (1 - hRatio * 0.45), (airborne ? 0.4 : 0.85) * (1 - hRatio * 0.45));
    this.playerShadow.alpha = 0.45 * (1 - hRatio * 0.6);

    // dash afterimages + speed lines
    if (dash) {
      this.ghostAcc -= dt;
      if (this.ghostAcc <= 0) {
        this.ghostAcc = 0.035;
        this.spawnGhost(w.px, py(w.py) - w.pz, this.ballRig.ball.rotation, 0xff8d7a);
        const a = Math.atan2(w.pvy * GROUND_TILT, w.pvx);
        for (let k = 0; k < 2; k++) {
          const off = (Math.random() - 0.5) * 14;
          this.shards.spawn(
            w.px - Math.cos(a) * 10 + Math.cos(a + Math.PI / 2) * off,
            py(w.py) - w.pz - Math.sin(a) * 10 + Math.sin(a + Math.PI / 2) * off,
            -w.pvx * 0.4, -w.pvy * 0.4 * GROUND_TILT,
            0.16, 1.3, WHITE, 0, 4, a, 0,
          );
        }
      }
    }

    // --- orbit path ring (ground-plane ellipse) + spikes ---
    const orbitLvl = w.weapons.get('orbit') ?? 0;
    if (orbitLvl > 0) {
      const def = WEAPONS.orbit.levels[orbitLvl - 1];
      const count = def.count ?? 2;
      const radius = (def.radius ?? 48) * w.stats.areaMult;
      this.layers.orbitPath.visible = true;
      this.layers.orbitPath.position.set(Math.round(w.px), Math.round(py(w.py)));
      this.layers.orbitPath.scale.set(radius / 14, (radius / 14) * GROUND_TILT);
      for (let c = 0; c < count; c++) {
        let s = this.spikeSprites[c];
        if (!s) {
          s = new Sprite(this.atlas.spike);
          s.anchor.set(0.5);
          this.layers.spikes.addChild(s);
          this.spikeSprites[c] = s;
        }
        const a = w.orbitAngle + (Math.PI * 2 * c) / count;
        s.visible = true;
        s.position.set(
          Math.round(w.px + Math.cos(a) * radius),
          Math.round(py(w.py + Math.sin(a) * radius) - 8),
        );
        s.rotation = a + Math.PI / 2;
      }
      for (let c = count; c < this.spikeSprites.length; c++) this.spikeSprites[c].visible = false;
    } else {
      this.layers.orbitPath.visible = false;
      for (const s of this.spikeSprites) s.visible = false;
    }

    // --- shock trail nodes ---
    const nodes = trailNodesForRender();
    for (let i = 0; i < nodes.length && i < this.trailSprites.length; i++) {
      const s = this.trailSprites[i];
      const n = nodes[nodes.length - 1 - i];
      s.visible = inView(n.x, n.y, 20);
      s.position.set(n.x, py(n.y));
      s.tint = n.armed ? CYAN : 0x2a6a8a;
      s.alpha = Math.max(0, Math.min(0.7, n.t));
      s.scale.set(n.armed ? 6 + Math.sin(w.time * 20 + i) : 3, (n.armed ? 6 + Math.sin(w.time * 20 + i) : 3) * GROUND_TILT);
    }
    for (let i = nodes.length; i < this.trailSprites.length; i++) this.trailSprites[i].visible = false;

    // --- rings (ground-plane ellipses: expand or shrink telegraphs) ---
    for (const r of this.ringSprites) {
      if (r.t <= 0) {
        r.s.visible = false;
        continue;
      }
      r.t -= dt;
      const t = Math.max(0, r.t / r.maxT);
      const scale = (r.from + (r.to - r.from) * (1 - t)) / 14;
      r.s.visible = true;
      r.s.scale.set(scale, scale * GROUND_TILT);
      r.s.alpha = Math.min(0.9, t * 1.4) * 0.9;
    }

    // --- muzzle flashes & ghosts fade ---
    for (const f of this.flashSprites) {
      if (f.t <= 0) {
        f.s.visible = false;
        continue;
      }
      f.t -= dt;
      const t = Math.max(0, f.t / f.maxT);
      f.s.visible = true;
      f.s.alpha = t;
      f.s.scale.set(f.scale * (0.6 + 0.6 * t));
      f.s.rotation += dt * 2;
    }
    for (const gh of this.ghostSprites) {
      if (gh.t <= 0) {
        gh.s.visible = false;
        continue;
      }
      gh.t -= dt;
      gh.s.alpha = Math.max(0, gh.t / gh.maxT) * 0.55;
    }

    // --- meteor telegraphs + falling rocks (METEOR SHOWER) ---
    const mg = this.layers.meteors;
    mg.clear();
    for (let i = 0; i < w.mCount; i++) {
      const gy2 = py(w.my[i]);
      const u = Math.max(0, Math.min(1, w.mt[i] / METEOR_FALL_T)); // 1 = just spawned
      mg.circle(w.mx[i], gy2, METEOR_RADIUS).stroke({ width: 2, color: 0xff8a5a, alpha: 0.3 + (1 - u) * 0.5 });
      mg.circle(w.mx[i], gy2, METEOR_RADIUS * (1 - u * 0.85)).fill({ color: 0xff5a3f, alpha: 0.12 + (1 - u) * 0.22 });
    }
    for (let i = 0; i < this.meteorSprites.length; i++) {
      const s = this.meteorSprites[i];
      if (i >= w.mCount) {
        s.visible = false;
        continue;
      }
      const u = Math.max(0, Math.min(1, w.mt[i] / METEOR_FALL_T));
      s.visible = true;
      s.position.set(w.mx[i], py(w.my[i]) - u * 230);
      s.alpha = 1 - u * 0.55;
      const sc = 1.6 - u * 0.5;
      s.scale.set(sc, sc * (1 + u * 1.2));
      s.rotation = w.time * 9 + i;
    }

    // --- lightning (glow + core, projected) ---
    const g = this.layers.zaps;
    g.clear();
    for (let i = this.zaps.length - 1; i >= 0; i--) {
      const z = this.zaps[i];
      z.t -= dt;
      if (z.t <= 0) {
        this.zaps.splice(i, 1);
        continue;
      }
      const alpha = Math.min(1, z.t * 4);
      const y1 = py(z.y1) - 8;
      const y2 = py(z.y2) - 8;
      const pts: Array<{ x: number; y: number }> = [{ x: z.x1, y: y1 }];
      const segs = 5;
      for (let s2 = 1; s2 < segs; s2++) {
        const t = s2 / segs;
        pts.push({
          x: z.x1 + (z.x2 - z.x1) * t + (Math.random() - 0.5) * 18,
          y: y1 + (y2 - y1) * t + (Math.random() - 0.5) * 18,
        });
      }
      pts.push({ x: z.x2, y: y2 });
      g.moveTo(pts[0].x, pts[0].y);
      for (let p = 1; p < pts.length; p++) g.lineTo(pts[p].x, pts[p].y);
      g.stroke({ width: 5, color: VOLT, alpha: alpha * 0.3 });
      g.moveTo(pts[0].x, pts[0].y);
      for (let p = 1; p < pts.length; p++) g.lineTo(pts[p].x, pts[p].y);
      g.stroke({ width: 2, color: WHITE, alpha });
      if (Math.random() < 0.5) {
        this.shards.spawn(z.x2, y2, (Math.random() - 0.5) * 120, (Math.random() - 0.5) * 120, 0.2, 1.2, YELLOW, 0, 4, Math.random() * Math.PI, 6);
      }
    }

    this.particles.update(dt);
    this.shards.update(dt);
    updateNumbers(dt);

    // --- ambient zone particles ---
    this.ambientAcc += dt;
    const b = w.zoneAt(w.px, w.py).biome;
    while (this.ambientAcc > 1 / 12) {
      this.ambientAcc -= 1 / 12;
      const x = viewL + this.rng() * (viewR - viewL);
      const ry = py(viewT) + this.rng() * ((viewB - viewT) * GROUND_TILT);
      if (b.ambient === 'ember') {
        this.particles.spawn(x, viewB * GROUND_TILT - 10, (this.rng() - 0.5) * 24, -28 - this.rng() * 42, 4, 0.9, b.accent, -8, 0);
      } else if (b.ambient === 'snow') {
        this.particles.spawn(x, viewT * GROUND_TILT - 10, (this.rng() - 0.5) * 26, 24 + this.rng() * 22, 5, 0.8, 0xdff4ff, 0, 0);
      } else {
        this.particles.spawn(x, ry, (this.rng() - 0.5) * 16, (this.rng() - 0.5) * 10, 4, 0.7, 0x9aa4c8, 0, 0);
      }
    }
  }

  private makeEnemyShadow(i: number): Sprite {
    const sh = new Sprite(this.atlas.shadow);
    sh.anchor.set(0.5);
    sh.alpha = 0.38;
    this.layers.shadows.addChild(sh);
    this.enemyShadows[i] = sh;
    return sh;
  }

  /** aura ring sprite for modded elites (drawn under actors) */
  private makeAura(i: number): Sprite {
    let a = this.enemyAuras[i];
    if (!a) {
      a = new Sprite(this.atlas.ring);
      a.anchor.set(0.5);
      a.blendMode = 'add';
      a.alpha = 0.16;
      this.layers.shadows.addChild(a);
      this.enemyAuras[i] = a;
    }
    return a;
  }

  // ================= FxSink =================

  hitNumber(x: number, y: number, dmg: number): void {
    spawnNumber(x, y * GROUND_TILT, String(Math.max(1, Math.round(dmg))), WHITE, dmg > 30 ? 1.3 : 1);
    this.hitFxAcc += 1;
    if (this.hitFxAcc <= 24) {
      this.particles.burst(x, y * GROUND_TILT, 2, 70, 0.18, 0.9, WHITE, this.rng);
    }
  }

  deathBurst(x: number, y: number, type: number, elite: boolean): void {
    const d = ENEMY_DEFS[type];
    const tint = d.boss ? RED : elite ? YELLOW : ORANGE;
    const ry = y * GROUND_TILT;
    this.particles.burst(x, ry, d.boss ? 60 : elite ? 26 : 10, d.boss ? 260 : 150, 0.5, 1.4, tint, this.rng);
    for (let i = 0; i < (d.boss ? 14 : elite ? 8 : 4); i++) {
      const a = this.rng() * Math.PI * 2;
      this.shards.spawn(x, ry, Math.cos(a) * 180, Math.sin(a) * 180 * GROUND_TILT, 0.35, 1.2, tint, 0, 4, a, 4);
    }
    // small foes sometimes pop a little ghost (Megabonk-style comedy)
    if (GHOSTABLE.has(type) && this.rng() < 0.45) {
      let gp = this.ghostPops.find((q) => q.t <= 0);
      if (!gp) gp = this.ghostPops[0];
      gp.s.position.set(x, ry - 8);
      gp.s.scale.set(0.8, 1.25);
      gp.s.rotation = 0;
      gp.t = 0.8;
      gp.maxT = 0.8;
      gp.vx = (this.rng() - 0.5) * 26;
      gp.sway = this.rng() * Math.PI * 2;
      gp.s.visible = true;
    }
  }

  impactFx(x: number, y: number, force: number): void {
    this.impactFxAcc += 1;
    if (this.impactFxAcc > 24) return;
    this.particles.burst(x, y * GROUND_TILT, Math.round(3 + force * 8), 90 + force * 160, 0.3, 1.1, YELLOW, this.rng);
    if (force > 0.45) this.flash(x, y * GROUND_TILT, 1 + force, 0.08, 0xffe9a8);
  }

  explosionFx(x: number, y: number, radius: number): void {
    const ry = y * GROUND_TILT;
    this.particles.burst(x, ry, 26, radius * 3.2, 0.45, 1.8, ORANGE, this.rng);
    this.shards.burst(x, ry, 10, radius * 3, 0.3, 1.4, 0xff7a3f, this.rng);
    this.ring(x, y, radius * 0.3, radius, 0.3, ORANGE);
  }

  slamFx(x: number, y: number, radius: number): void {
    const ry = y * GROUND_TILT;
    this.ring(x, y, radius * 0.25, radius * 1.1, 0.32, ORANGE);
    this.ring(x, y, radius * 0.15, radius * 0.7, 0.22, 0xffd9a0);
    this.particles.burst(x, ry, 16, radius * 2.2, 0.42, 1.5, 0xc9b08a, this.rng);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + this.rng() * 0.3;
      this.shards.spawn(x, ry, Math.cos(a) * (radius * 3), Math.sin(a) * (radius * 3) * GROUND_TILT, 0.24, 1.6, 0xffc27a, 0, 5, a, 0);
    }
    this.flash(x, ry, radius / 10, 0.1, 0xffe9a8);
  }

  eruptionFx(x: number, y: number, radius: number): void {
    const ry = y * GROUND_TILT;
    this.ring(x, y, radius * 0.2, radius, 0.28, CYAN);
    for (let i = 0; i < 8; i++) {
      const a = this.rng() * Math.PI * 2;
      this.particles.spawn(x, ry, Math.cos(a) * 60, -140 - this.rng() * 80, 0.4, 1.2, CYAN, 520, 1);
    }
  }

  poundFx(x: number, y: number, radius: number): void {
    const ry = y * GROUND_TILT;
    this.ring(x, y, radius * 0.2, radius * 1.15, 0.34, 0xff8a5a);
    this.ring(x, y, radius * 0.1, radius * 0.7, 0.24, 0xffd9a0);
    this.particles.burst(x, ry, 22, radius * 2.6, 0.45, 1.7, 0xc9b08a, this.rng);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      this.shards.spawn(x, ry, Math.cos(a) * radius * 3.4, Math.sin(a) * radius * 3.4 * GROUND_TILT, 0.26, 1.8, 0xffc27a, 0, 5, a, 0);
    }
  }

  crateHitFx(x: number, y: number): void {
    const ry = y * GROUND_TILT;
    this.shards.burst(x, ry, 5, 130, 0.28, 1.2, 0xc9a06a, this.rng);
    this.particles.burst(x, ry, 4, 90, 0.25, 1, 0xd9c8a8, this.rng);
  }

  bumperFx(x: number, y: number): void {
    this.ring(x, y, 10, 46, 0.22, 0xff7a9a);
    this.particles.burst(x, y * GROUND_TILT, 6, 140, 0.25, 1.1, 0xffb0c4, this.rng);
  }

  obstacleBreakFx(x: number, y: number): void {
    const ry = y * GROUND_TILT;
    this.shards.burst(x, ry, 14, 240, 0.42, 1.6, 0xc9a06a, this.rng);
    this.particles.burst(x, ry, 14, 190, 0.4, 1.5, 0xd9c8a8, this.rng);
    this.ring(x, y, 4, 34, 0.22, 0xe8d8b8);
    this.flash(x, ry, 1.6, 0.08, 0xfff2c8);
  }

  jumpPuff(x: number, y: number): void {
    this.particles.burst(x, y * GROUND_TILT + 4, 6, 70, 0.3, 1.1, 0xb9c2d8, this.rng);
  }

  landDust(x: number, y: number): void {
    this.particles.burst(x, y * GROUND_TILT + 4, 8, 110, 0.3, 1.2, 0xb9c2d8, this.rng);
  }

  groundSlamFx(x: number, y: number, radius: number): void {
    this.ring(x, y, radius * 0.2, radius * 1.2, 0.32, ORANGE);
    this.ring(x, y, radius * 0.1, radius * 0.75, 0.24, 0xffd9a0);
    this.particles.burst(x, y * GROUND_TILT, 20, radius * 2.4, 0.45, 1.6, 0xc9b08a, this.rng);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      this.shards.spawn(x, y * GROUND_TILT, Math.cos(a) * radius * 3, Math.sin(a) * radius * 3 * GROUND_TILT, 0.26, 1.7, 0xffc27a, 0, 5, a, 0);
    }
    this.flash(x, y * GROUND_TILT, 2, 0.1, 0xffe9a8);
  }

  gravityPullFx(x: number, y: number, radius: number): void {
    // implosion: ring collapses inward while violet sparks spiral in
    this.ring(x, y, radius, radius * 0.15, 0.38, 0xc77dff);
    this.ring(x, y, radius * 0.7, radius * 0.1, 0.3, 0x9a4dff);
    const ry = y * GROUND_TILT;
    for (let i = 0; i < 14; i++) {
      const a = this.rng() * Math.PI * 2;
      const d = radius * (0.7 + this.rng() * 0.3);
      this.particles.spawn(
        x + Math.cos(a) * d, ry + Math.sin(a) * d * GROUND_TILT,
        -Math.cos(a) * 320, -Math.sin(a) * 320 * GROUND_TILT,
        0.34, 1.2, 0xc77dff, 0, 3,
      );
    }
  }

  tremorFx(x: number, y: number, radius: number): void {
    this.ring(x, y, radius * 0.3, radius * 1.1, 0.22, 0xd8b06a);
    this.particles.burst(x, y * GROUND_TILT, 5, 90, 0.26, 1.1, 0xc9b08a, this.rng);
  }

  meteorFx(x: number, y: number, radius: number): void {
    const ry = y * GROUND_TILT;
    this.ring(x, y, radius * 0.25, radius * 1.05, 0.26, 0xff8a5a);
    this.particles.burst(x, ry, 10, radius * 2.2, 0.35, 1.4, ORANGE, this.rng);
    for (let i = 0; i < 5; i++) {
      const a = this.rng() * Math.PI * 2;
      this.shards.spawn(x, ry, Math.cos(a) * 170, Math.sin(a) * 170 * GROUND_TILT, 0.3, 1.4, 0xffc27a, 0, 5, a, 0);
    }
    this.flash(x, ry, 1.8, 0.1, 0xffd9a0);
  }

  bossEnrageFx(x: number, y: number): void {
    this.ring(x, y, 20, 340, 0.55, RED);
    this.ring(x, y, 10, 210, 0.42, 0xff3b3b);
    this.particles.burst(x, y * GROUND_TILT, 36, 300, 0.6, 1.8, RED, this.rng);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      this.shards.spawn(x, y * GROUND_TILT, Math.cos(a) * 260, Math.sin(a) * 260 * GROUND_TILT, 0.4, 1.6, 0xff5a4d, 0, 5, a, 0);
    }
  }

  zapFx(x1: number, y1: number, x2: number, y2: number): void {
    if (this.zaps.length > 10) this.zaps.shift();
    this.zaps.push({ x1, y1, x2, y2, t: 0.16 });
    this.flash(x2, y2 * GROUND_TILT - 8, 1.4, 0.09, 0xe8f2ff);
    // arcs that leave the ball flash its coil
    if (Math.hypot(x1 - this.lastPx, y1 - this.lastPy) < 44) this.ballRig.pulseCoil();
  }

  shake(mag: number, dur: number): void {
    this.onShake?.(mag, dur);
  }
  onShake: ((mag: number, dur: number) => void) | null = null;

  hurtFlash(): void {
    this.onHurtFlash?.();
  }
  onHurtFlash: (() => void) | null = null;

  /** big impact: main wires this to the post stack (chromatic aberration + hitstop) */
  screenImpact(force: number): void {
    this.onScreenImpact?.(force);
  }
  onScreenImpact: ((force: number) => void) | null = null;

  /** boss died: freeze-frame + zoom pulse */
  bossKillFx(): void {
    this.onBossKill?.();
  }
  onBossKill: (() => void) | null = null;

  /** dominant biomes for the backdrop rings: [far, mid, near] */
  private zoneBiomeMix(w: World): [Biome, Biome, Biome] {
    const zones = w.zones;
    const start = w.zoneAt(w.px, w.py);
    const idx = Math.max(0, zones.indexOf(start));
    return [
      zones[(idx + 2) % zones.length].biome,
      zones[(idx + 1) % zones.length].biome,
      start.biome,
    ];
  }

  goldBurst(x: number, y: number): void {
    this.particles.burst(x, y * GROUND_TILT, 8, 120, 0.4, 1.2, YELLOW, this.rng);
  }

  bossWarn(x: number, y: number): void {
    this.ring(x, y, 10, 160, 0.9, RED);
    this.onBossWarn?.();
  }
  onBossWarn: (() => void) | null = null;

  playerAttackFx(kind: 'slam' | 'shot' | 'dash'): void {
    if (kind === 'slam') {
      this.slamAnimT = 0.26;
    } else if (kind === 'shot') {
      this.recoilT = 0.09;
      this.ballRig.pulseCannon();
    }
  }

  telegraph(x: number, y: number, kind: AttackKind): void {
    switch (kind) {
      case 'charge':
        this.ring(x, y, 110, 22, 0.8, 0xff3b3b);
        break;
      case 'pound':
        this.ring(x, y, 12, 118, 0.7, 0xff8a5a);
        break;
      case 'lunge':
        this.ring(x, y, 46, 12, 0.45, 0xffb14b);
        break;
      case 'spit':
        this.ring(x, y, 26, 8, 0.5, 0xc77dff);
        break;
    }
  }

  /** the ball just grew a new part: pop a ring + sparkles in its accent color */
  private equipFx(tint: number): void {
    const x = this.lastPx;
    const y = this.lastPy;
    this.ring(x, y, 6, 40, 0.38, tint);
    this.ring(x, y, 4, 22, 0.26, WHITE);
    this.particles.burst(x, y * GROUND_TILT - 6, 12, 130, 0.32, 1.2, tint, this.rng);
    this.flash(x, y * GROUND_TILT - 8, 1.6, 0.12, WHITE);
  }

  private flash(x: number, ry: number, scale: number, dur: number, tint: number): void {    let f = this.flashSprites.find((q) => q.t <= 0);
    if (!f) f = this.flashSprites[0];
    f.s.texture = this.atlas.muzzle;
    f.s.tint = tint;
    f.s.position.set(x, ry);
    f.s.rotation = this.rng() * Math.PI;
    f.t = dur;
    f.maxT = dur;
    f.scale = scale;
    f.s.visible = true;
  }

  private spawnGhost(x: number, ry: number, rotation: number, tint: number): void {
    let gh = this.ghostSprites.find((q) => q.t <= 0);
    if (!gh) gh = this.ghostSprites[0];
    gh.s.texture = this.ballRig.ball.texture;
    gh.s.position.set(x, ry);
    gh.s.rotation = rotation;
    gh.s.tint = tint;
    gh.s.scale.set(this.ballRig.scale.x, this.ballRig.scale.y);
    gh.t = 0.22;
    gh.maxT = 0.22;
    gh.s.visible = true;
  }

  private ring(x: number, y: number, from: number, to: number, dur: number, tint: number): void {
    let r = this.ringSprites.find((q) => q.t <= 0);
    if (!r) {
      const s = new Sprite(this.atlas.ring);
      s.anchor.set(0.5);
      this.layers.rings.addChild(s);
      r = { s, t: 0, maxT: dur, from, to };
      this.ringSprites.push(r);
    }
    r.s.tint = tint;
    r.s.position.set(x, y * GROUND_TILT);
    r.t = dur;
    r.maxT = dur;
    r.from = from;
    r.to = to;
  }
}

export function makeWorldRenderer(atlas: Atlas, isMobile: boolean): WorldRenderer {
  return new WorldRenderer(atlas, isMobile ? 800 : 1800);
}
