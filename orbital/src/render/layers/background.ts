// layers/background.ts — the "cosmic diorama" depth stack (design §9):
// sky gradient -> optional nebula wash -> starfield -> region sun (glow + core)
// -> 2 parallax silhouette bands -> drifting ambient dust.
//
// PER-LEVEL VARIANTS: every level picks one of 6 background archetypes via
// bgVariantFor(def.id) — L01..L24 -> hash % 6 + block offset, de-collided vs
// the previous level (see core.ts). Archetypes change COMPOSITION and motif
// (starfield character, silhouette band, nebula, sun distance/size); COLOR
// always comes from REGION_PALETTES so the 4 regions keep their identity.
// All variant elements are pre-built in build() (once per level load); the
// per-frame path only does transform/alpha writes, as before.
// Mapping: L01..L24 -> archetype via bgVariantFor (see core.ts).

import { Container, Graphics, Sprite } from 'pixi.js';
import { REGION_PALETTES, type RegionId, type RegionPalette } from '../../levels/palettes';
import { bgVariantFor, col, hashSeed, TAU } from '../core';
import { Camera } from '../camera';
import { TexFactory } from '../textures';
import type { Bounds } from '../camera';

interface DustMote {
  sp: Sprite;
  bx: number;
  by: number;
  phase: number;
  spd: number;
  amp: number;
}

// Bands span this multiple of the bounds half-extents. 1.7 keeps every
// authored feature inside the 1.18-margin framing plus the worst-case
// parallax shift (~0.3 ry) while leaving no hard art edges on screen.
const BAND_EXTENT = 1.7;

/** Starfield character per archetype. */
type StarMode = 'sparse' | 'dense' | 'clustered' | 'streaked';

interface BgVariantCfg {
  motif: string;
  starMode: StarMode;
  nebula: boolean;
  /** Sun distance along its region ray (keeps the light ANGLE — and thus the
   *  baked body terminators — identical; only apparent height/size changes). */
  sunDist: number;
  /** Sun glow size multiplier. */
  sunScale: number;
}

/** The 6 archetypes. Full-tier star counts; 'lite' halves them. */
const VARIANT_CFG: readonly BgVariantCfg[] = [
  { motif: 'celestial arches',   starMode: 'dense',     nebula: false, sunDist: 1.0,  sunScale: 1.0 },
  { motif: 'wreck debris ring',  starMode: 'clustered', nebula: true,  sunDist: 0.86, sunScale: 1.25 },
  { motif: 'crystal spires',     starMode: 'sparse',    nebula: false, sunDist: 0.72, sunScale: 0.85 },
  { motif: 'planet horizon',     starMode: 'sparse',    nebula: true,  sunDist: 0.6,  sunScale: 1.55 },
  { motif: 'aurora curtains',    starMode: 'dense',     nebula: true,  sunDist: 0.92, sunScale: 1.1 },
  { motif: 'megastructure grid', starMode: 'streaked',  nebula: false, sunDist: 0.8,  sunScale: 0.95 },
];

const STAR_COUNT: Record<StarMode, number> = {
  sparse: 56,
  dense: 132,
  clustered: 96,
  streaked: 60,
};

/**
 * World-space position of the region sun (the single key light, §9). Shared
 * with the bodies layer so baked terminators face the actual light source.
 */
export function regionSun(region: RegionId, b: Bounds): { x: number; y: number } {
  const sunAngle = [-1.15, -0.35, -2.05, -1.5][region - 1];
  const sd = 0.82; // sit just inside the framing so the glow overlaps play
  return {
    x: b.cx + Math.cos(sunAngle) * b.rx * sd,
    y: b.cy + Math.sin(sunAngle) * b.ry * sd,
  };
}

export class BackgroundLayer {
  readonly container = new Container();
  private sky = new Sprite();
  private deco = new Container(); // nebula glows + star streaks: static after build
  private stars = new Container();
  private sunGlow = new Sprite();
  private sunCore = new Sprite();
  private bandFar = new Container();
  private bandMid = new Container();
  private dust: DustMote[] = [];
  private starSprites: Sprite[] = [];
  private starPhases: number[] = [];
  private starSpds: number[] = []; // per-star twinkle speed (beauty pass)

  private bounds: Bounds = { cx: 0, cy: 0, rx: 800, ry: 600 };
  private palette: RegionPalette = REGION_PALETTES[1];
  private variant = 0;
  private sunX = 0;
  private sunY = 0;
  private sunScale = 1;
  private starBase: number[] = []; // world x,y per star (flat)
  private t = 0;
  private quality: 'full' | 'lite' = 'full';
  private screenPt = { x: 0, y: 0 };

  constructor(private tex: TexFactory) {
    this.container.addChild(this.sky, this.deco, this.stars, this.sunGlow, this.sunCore, this.bandFar, this.bandMid);
    this.sky.anchor.set(0, 0);
    this.sunGlow.anchor.set(0.5);
    this.sunGlow.blendMode = 'add';
    this.sunCore.anchor.set(0.5);
    this.sunCore.blendMode = 'add';
  }

  /** Build everything region+variant dependent. Called on level load. */
  build(region: RegionId, bounds: Bounds, levelId = ''): void {
    this.bounds = bounds;
    this.palette = REGION_PALETTES[region];
    this.variant = bgVariantFor(levelId);
    const cfg = VARIANT_CFG[this.variant];
    const p = this.palette;

    // One seeded RNG for the whole build — mixed with the variant and level id
    // so the same archetype still lays out slightly differently per level.
    let sr = (1234567 ^ hashSeed(`${levelId}|v${this.variant}`)) >>> 0;
    const rnd = (): number => {
      sr = (Math.imul(sr, 1664525) + 1013904223) >>> 0;
      return sr / 4294967296;
    };

    // sky (texture swapped; sprite stretched on resize)
    this.sky.texture = this.tex.sky(p.sky[0], p.sky[1]);

    // region sun — a fixed world-space key light. The angle per region is
    // preserved (bodies bake light from this direction via regionSun); the
    // variant only slides the sun ALONG its ray (apparent height) and scales
    // the glow (apparent size), never the direction.
    const sun = regionSun(region, bounds);
    const slide = cfg.sunDist / 0.82; // ratio vs the canonical 0.82 placement
    this.sunX = bounds.cx + (sun.x - bounds.cx) * slide;
    this.sunY = bounds.cy + (sun.y - bounds.cy) * slide;
    this.sunScale = cfg.sunScale;
    this.sunGlow.texture = this.tex.glow(256);
    this.sunCore.texture = this.tex.core(96);
    this.sunGlow.tint = col(p.sun);
    this.sunCore.tint = 0xffffff;

    // static deco: nebula wash + star streaks ("shimmer layers" — skipped in
    // lite tier). Built once here; the frame loop moves the container only.
    this.deco.removeChildren().forEach((c) => c.destroy());
    if (cfg.nebula && this.quality === 'full') this.buildNebula(bounds, rnd);
    if (cfg.starMode === 'streaked' && this.quality === 'full') this.buildStreaks(bounds, rnd);

    // starfield (world-anchored, tiny parallax) — character per archetype
    this.stars.removeChildren();
    this.starSprites.length = 0;
    this.starPhases.length = 0;
    this.starSpds.length = 0;
    this.starBase.length = 0;
    const starTex = this.tex.dot(12);
    let starCount = STAR_COUNT[cfg.starMode];
    if (this.quality === 'lite') starCount >>= 1; // lite: half the stars
    // cluster centers for the 'clustered' mode (2 gaussian blobs off-center)
    const clusters: number[] = [];
    if (cfg.starMode === 'clustered') {
      for (let c = 0; c < 2; c++) {
        clusters.push(
          bounds.cx + (rnd() - 0.5) * bounds.rx * 1.6,
          bounds.cy + (rnd() - 0.5) * bounds.ry * 1.6,
        );
      }
    }
    for (let i = 0; i < starCount; i++) {
      const s = new Sprite(starTex);
      s.anchor.set(0.5);
      let x: number;
      let y: number;
      if (clusters.length > 0 && rnd() < 0.55) {
        // gaussian-ish cluster member (sum of 2 uniforms approximates it)
        const c = (i % (clusters.length / 2)) * 2;
        const sg = bounds.rx * 0.16;
        x = clusters[c] + ((rnd() + rnd()) - 1) * sg;
        y = clusters[c + 1] + ((rnd() + rnd()) - 1) * sg * 0.8;
      } else {
        x = bounds.cx + (rnd() - 0.5) * bounds.rx * BAND_EXTENT * 2;
        y = bounds.cy + (rnd() - 0.5) * bounds.ry * BAND_EXTENT * 2;
      }
      this.starBase.push(x, y);
      s.scale.set(0.08 + rnd() * 0.22);
      s.alpha = 0.25 + rnd() * 0.5;
      s.tint = 0xffffff;
      this.stars.addChild(s);
      this.starSprites.push(s);
      this.starPhases.push(rnd() * TAU);
      this.starSpds.push(0.55 + rnd() * 0.9); // gentle speed variance per star
    }

    // silhouette bands — hand-authored per ARCHETYPE (palette gives the color)
    this.bandFar.removeChildren().forEach((c) => c.destroy());
    this.bandMid.removeChildren().forEach((c) => c.destroy());
    const farG = buildVariantBand(this.variant, true, bounds, hashSeed(`${levelId}|far`));
    const midG = buildVariantBand(this.variant, false, bounds, hashSeed(`${levelId}|mid`));
    farG.tint = col(p.far);
    midG.tint = col(p.mid);
    this.bandFar.addChild(farG);
    this.bandMid.addChild(midG);

    // ambient dust
    for (const d of this.dust) d.sp.destroy();
    this.dust.length = 0;
    const dustTex = this.tex.glow(32);
    const dustCount = this.quality === 'lite' ? 16 : 42;
    for (let i = 0; i < dustCount; i++) {
      const sp = new Sprite(dustTex);
      sp.anchor.set(0.5);
      sp.tint = col(p.dust);
      sp.alpha = 0.1 + rnd() * 0.16;
      sp.scale.set(0.1 + rnd() * 0.3);
      this.container.addChild(sp);
      this.dust.push({
        sp,
        bx: bounds.cx + (rnd() - 0.5) * bounds.rx * 2.2,
        by: bounds.cy + (rnd() - 0.5) * bounds.ry * 2.2,
        phase: rnd() * TAU,
        spd: 3 + rnd() * 9,
        amp: 4 + rnd() * 14,
      });
    }
  }

  /** 3 large additive fog glows behind the stars. Alphas stay low (<= 0.18)
   *  and biased off-center so the lit green pad always stays dominant. */
  private buildNebula(b: Bounds, rnd: () => number): void {
    const p = this.palette;
    const tints = [col(p.fog), col(p.accent), col(p.far)];
    const tex = this.tex.glow(256);
    for (let i = 0; i < 3; i++) {
      const sp = new Sprite(tex);
      sp.anchor.set(0.5);
      sp.blendMode = 'add';
      // off-center bias: keep |offset| >= 0.25 half-extents from the middle
      const ox = (0.25 + rnd() * 0.75) * (rnd() > 0.5 ? 1 : -1);
      const oy = (0.2 + rnd() * 0.8) * (rnd() > 0.5 ? 1 : -1);
      sp.x = b.cx + ox * b.rx;
      sp.y = b.cy + oy * b.ry;
      const size = b.rx * (0.9 + rnd() * 0.6);
      sp.width = size;
      sp.height = size * (0.7 + rnd() * 0.5);
      sp.alpha = i === 1 ? 0.1 : 0.16; // accent tint dimmest (readability)
      sp.tint = tints[i];
      this.deco.addChild(sp);
    }
  }

  /** Cometary stream: long thin streak sprites for the 'streaked' sky. */
  private buildStreaks(b: Bounds, rnd: () => number): void {
    const tex = this.tex.streak(64, 10);
    for (let i = 0; i < 7; i++) {
      const sp = new Sprite(tex);
      sp.anchor.set(0.5);
      sp.x = b.cx + (rnd() - 0.5) * b.rx * BAND_EXTENT * 1.8;
      sp.y = b.cy + (rnd() - 0.5) * b.ry * BAND_EXTENT * 1.8;
      sp.rotation = (rnd() - 0.5) * 0.5;
      sp.width = b.rx * (0.1 + rnd() * 0.14);
      sp.height = 3 + rnd() * 3;
      sp.alpha = 0.16 + rnd() * 0.18;
      sp.tint = 0xffffff;
      this.deco.addChild(sp);
    }
  }

  setQuality(q: 'full' | 'lite'): void {
    if (q === this.quality) return;
    this.quality = q;
    // NOTE: tier switches re-apply on the next level build (same contract as
    // the bodies layer) — no mid-level rebuild, no hitch.
  }

  /** Re-stretch the sky + vignette-scale sprites on viewport resize. */
  resize(vw: number, vh: number): void {
    this.sky.width = vw;
    this.sky.height = vh;
  }

  update(dt: number, cam: Camera): void {
    this.t += dt;
    const b = this.bounds;
    const sc = cam.scale;

    // stars: near-static parallax + gentle twinkle with per-star phase AND
    // speed variance (skip twinkle writes in lite)
    const twinkle = this.quality === 'full';
    for (let i = 0; i < this.starSprites.length; i++) {
      const s = this.starSprites[i];
      const wx = this.starBase[i * 2];
      const wy = this.starBase[i * 2 + 1];
      s.x = (wx - cam.cx * 0.06) * sc + cam.viewW * 0.5;
      s.y = (wy - cam.cy * 0.06) * sc + cam.viewH * 0.5;
      if (twinkle) s.alpha = 0.22 + 0.3 * (0.5 + 0.5 * Math.sin(this.t * this.starSpds[i] + this.starPhases[i]));
    }

    // sun: soft parallax (it is FAR — moves least)
    const p = this.screenPt;
    cam.parallax(this.sunX, this.sunY, 0.1, p);
    this.sunGlow.x = p.x;
    this.sunGlow.y = p.y;
    this.sunCore.x = p.x;
    this.sunCore.y = p.y;
    const glowSize = b.rx * sc * 1.5 * this.sunScale;
    this.sunGlow.width = glowSize;
    this.sunGlow.height = glowSize;
    this.sunCore.width = glowSize * 0.16;
    this.sunCore.height = glowSize * 0.16;
    this.sunGlow.alpha = 0.5;
    this.sunCore.alpha = 0.9;

    // static deco (nebula + streaks): one transform write for the whole set
    this.placeDeco(this.deco, 0.1, b, sc);

    // bands: mid parallax factor; scale with view so silhouettes stay huge.
    // Far band gets a slow render-only drift (beauty pass, ~5 px amplitude).
    this.placeBand(this.bandFar, 0.22, b, sc, 5);
    this.placeBand(this.bandMid, 0.45, b, sc, 0);

    // dust drift; motes freeze inside void zones ("particles fall still", §3)
    for (const d of this.dust) {
      const px = d.bx + Math.sin(this.t * 0.13 + d.phase) * d.amp;
      const py = d.by + Math.cos(this.t * 0.11 + d.phase * 1.7) * d.amp - this.t * d.spd * 0.15;
      let still = false;
      for (let i = 0; i < voidCount; i++) {
        const dx = px - voidFlat[i * 3];
        const dy = py - voidFlat[i * 3 + 1];
        const rr = voidFlat[i * 3 + 2];
        if (dx * dx + dy * dy < rr * rr) {
          still = true;
          break;
        }
      }
      if (!still) {
        d.bx = px;
        d.by = py;
      }
      // wrap within the extended bounds
      const ex = b.rx * 1.15;
      const ey = b.ry * 1.15;
      if (d.bx < b.cx - ex) d.bx += ex * 2;
      if (d.bx > b.cx + ex) d.bx -= ex * 2;
      if (d.by < b.cy - ey) d.by += ey * 2;
      if (d.by > b.cy + ey) d.by -= ey * 2;
      cam.parallax(d.bx, d.by, 0.55, p);
      d.sp.x = p.x;
      d.sp.y = p.y;
    }
  }

  private placeDeco(band: Container, f: number, b: Bounds, sc: number): void {
    const cam = camRef;
    if (!cam) return;
    band.x = (b.cx - cam.cx * f) * sc + cam.viewW * 0.5;
    band.y = (b.cy - cam.cy * f) * sc + cam.viewH * 0.5;
    band.scale.set(sc);
  }

  private placeBand(band: Container, f: number, b: Bounds, sc: number, drift: number): void {
    const cam = camRef;
    if (!cam) return;
    band.x = (b.cx - cam.cx * f) * sc + cam.viewW * 0.5 + Math.sin(this.t * 0.05) * drift * sc;
    band.y = (b.cy - cam.cy * f) * sc + cam.viewH * 0.5 + Math.cos(this.t * 0.037) * drift * 0.6 * sc;
    band.scale.set(sc);
    band.alpha = band === this.bandFar ? 0.75 : 0.95;
  }
}

// Module-level camera reference, registered once per frame before update()
// (avoids threading the camera through private helpers).
let camRef: Camera | null = null;
export function beginBackgroundFrame(cam: Camera): void {
  camRef = cam;
}

// Void zones feed the dust freeze ("particles fall still"); the renderer
// reports them each frame as flat [cx,cy,r, ...] triples (zero allocation).
const voidFlat: number[] = [];
let voidCount = 0;
export function reportVoids(flat: number[], count: number): void {
  voidCount = count;
  for (let i = 0; i < count * 3; i++) voidFlat[i] = flat[i];
}

// ------------------------------------------------------------- band art

/** Tiny seeded LCG for band layout jitter (same recipe as the star RNG). */
function bandRng(seed: number): () => number {
  let sr = seed >>> 0;
  return (): number => {
    sr = (Math.imul(sr, 1664525) + 1013904223) >>> 0;
    return sr / 4294967296;
  };
}

/**
 * Hand-authored silhouettes, one per BACKGROUND ARCHETYPE (not per region —
 * the region palette tint is what keeps regional identity). Local space is
 * centered on the level, spanning BAND_EXTENT * bounds. Drawn in white; the
 * parent tint applies palette color. `seed` jitters layout ~10% per level so
 * two levels sharing an archetype still place their motifs differently.
 */
function buildVariantBand(variant: number, far: boolean, b: Bounds, seed: number): Graphics {
  const g = new Graphics();
  const W = b.rx * BAND_EXTENT;
  const H = b.ry * BAND_EXTENT;
  const rnd = bandRng(seed);
  const jit = (): number => 1 + (rnd() - 0.5) * 0.2; // +/-10% jitter
  const stroke = (width: number, alpha: number): void => {
    g.stroke({ width, color: 0xffffff, alpha });
  };
  const fill = (alpha: number): void => {
    g.fill({ color: 0xffffff, alpha });
  };

  switch (variant) {
    case 0: {
      // CELESTIAL ARCHES — clean architecture: great ring arcs, marker dots,
      // a stepped arch causeway rising from the bottom.
      const ringA = H * 1.15 * jit();
      const ax = -W * 0.25 * jit();
      g.arc(ax, -H * 0.15, ringA, Math.PI * 0.15, Math.PI * 0.85);
      stroke(far ? 7 : 10, far ? 0.5 : 0.65);
      g.arc(W * 0.35 * jit(), H * 0.05, ringA * 0.55, Math.PI * 1.05, Math.PI * 1.95);
      stroke(far ? 4 : 6, 0.4);
      for (let i = 0; i < 3; i++) {
        const a = Math.PI * (0.3 + i * 0.22);
        g.circle(ax + Math.cos(a) * ringA, -H * 0.15 + Math.sin(a) * ringA, far ? 5 : 8);
        fill(0.8);
      }
      if (!far) {
        for (let i = -2; i <= 2; i++) {
          const x = i * W * 0.34;
          const h = H * (0.16 + Math.abs(Math.sin(i * 1.7)) * 0.12);
          g.roundRect(x - W * 0.06, H - h, W * 0.12, h + H * 0.05, 4);
          fill(0.9);
          g.roundRect(x - W * 0.035, H - h * 1.28, W * 0.07, h * 0.4, 4);
          fill(0.9);
        }
      }
      break;
    }
    case 1: {
      // WRECK DEBRIS RING — shattered ring station, snapped spokes, wrecked
      // satellite husks, jagged chunk field along the bottom.
      const R = (far ? H * 0.95 : H * 0.62) * jit();
      const cx = far ? -W * 0.1 : W * 0.3;
      const cy = far ? -H * 0.3 : -H * 0.12;
      for (let i = 0; i < 9; i++) {
        const a0 = (i / 9) * TAU + (i % 2) * 0.12;
        g.arc(cx, cy, R, a0, a0 + 0.28 + (i % 3) * 0.12);
      }
      stroke(far ? 9 : 13, 0.6);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + 0.4;
        g.moveTo(cx + Math.cos(a) * R * 0.2, cy + Math.sin(a) * R * 0.2);
        g.lineTo(cx + Math.cos(a) * R * 0.62, cy + Math.sin(a) * R * 0.62);
      }
      stroke(far ? 4 : 6, 0.45);
      if (!far) {
        for (let i = 0; i < 4; i++) {
          const x = (i - 1.5) * W * 0.42 + 20;
          const y = -H * 0.1 + (i % 2) * H * 0.22;
          drawWreck(g, x, y, W * 0.07 * (0.7 + (i % 3) * 0.3), i * 1.3 + rnd() * 0.4);
        }
        g.moveTo(-W, H + 4);
        let x = -W;
        while (x < W) {
          const w = W * (0.08 + (x % 3) * 0.02);
          const h = H * (0.05 + Math.abs(Math.sin(x * 0.013 + seed * 1e-6)) * 0.13);
          g.lineTo(x + w * 0.5, H + 4 - h);
          g.lineTo(x + w, H + 4 - h * 0.35);
          x += w;
        }
        g.lineTo(W, H + 4);
        g.closePath();
        fill(0.92);
      }
      break;
    }
    case 2: {
      // CRYSTAL SPIRES — tall faceted prisms growing from the bottom edge,
      // floating shards above them, thin facet strokes down each spine.
      const n = far ? 5 : 4;
      for (let i = 0; i < n; i++) {
        const x = (-0.8 + (1.6 * i) / (n - 1)) * W * jit();
        const h = H * (far ? 0.5 : 0.75) * (0.6 + rnd() * 0.7);
        const w = W * (far ? 0.05 : 0.08) * (0.7 + rnd() * 0.6);
        g.moveTo(x, H + 4);
        g.lineTo(x + w * 0.5, H - h); // apex (slight lean via jittered x)
        g.lineTo(x + w, H + 4);
        g.closePath();
        fill(far ? 0.55 : 0.88);
        // facet line from apex toward the base
        g.moveTo(x + w * 0.5, H - h);
        g.lineTo(x + w * 0.34, H + 4);
        stroke(far ? 1.5 : 2.5, 0.35);
      }
      if (!far) {
        // floating shard cluster mid-air
        for (let i = 0; i < 5; i++) {
          const x = (rnd() - 0.5) * W * 1.4;
          const y = -H * 0.4 + rnd() * H * 0.6;
          const s = W * (0.015 + rnd() * 0.02);
          g.moveTo(x, y - s * 2);
          g.lineTo(x + s, y);
          g.lineTo(x, y + s * 0.6);
          g.lineTo(x - s, y);
          g.closePath();
          fill(0.5);
        }
      }
      break;
    }
    case 3: {
      // PLANET HORIZON — a colossal limb rising from the bottom with a lit
      // atmosphere arc above it, plus a small moon; the sun slides low.
      const R = (far ? H * 2.6 : H * 1.7) * jit();
      const cx = W * (far ? -0.15 : 0.12) * jit();
      const cy = H + R * 0.78; // mostly below the frame: a horizon, not a ball
      g.circle(cx, cy, R);
      fill(far ? 0.5 : 0.85);
      // atmosphere: concentric strokes hugging the limb
      for (let i = 1; i <= 3; i++) {
        g.arc(cx, cy, R + i * (far ? 14 : 22), Math.PI * 1.18, Math.PI * 1.82);
        stroke(far ? 2.5 + i : 3.5 + i, 0.34 - i * 0.08);
      }
      if (far) {
        g.circle(W * 0.55, -H * 0.45, H * 0.05 * jit());
        fill(0.6);
      }
      break;
    }
    case 4: {
      // AURORA CURTAINS — layered translucent ribbons hanging from the top,
      // wave-offset per level; a faint distant arch anchors the composition.
      const layers = far ? 2 : 4;
      for (let i = 0; i < layers; i++) {
        const y0 = -H * (0.25 + i * 0.14);
        const ph = rnd() * TAU;
        const amp = H * (0.06 + rnd() * 0.05);
        g.moveTo(-W, y0);
        for (let x = -W; x <= W; x += W / 6) {
          g.lineTo(x, y0 + Math.sin(x * 0.0022 + ph) * amp);
        }
        for (let x = W; x >= -W; x -= W / 6) {
          g.lineTo(x, y0 + H * (0.22 + i * 0.05) + Math.sin(x * 0.0022 + ph) * amp);
        }
        g.closePath();
        fill(0.14 - i * 0.02);
      }
      const R = H * 0.7 * jit();
      g.arc(0, H * 0.55, R, Math.PI * 1.1, Math.PI * 1.9);
      stroke(far ? 4 : 6, 0.35);
      break;
    }
    default: {
      // MEGASTRUCTURE GRID — concentric arc rings with radial spokes and a
      // lattice of window dots: a distant station seen from far off.
      for (let i = 0; i < 3; i++) {
        const R = H * (0.55 + i * 0.34) * jit();
        g.arc(0, H * (0.4 + i * 0.12), R, Math.PI * 1.08, Math.PI * 1.92);
        stroke(far ? 5 + i * 2 : 8 + i * 2, 0.5 - i * 0.08);
      }
      for (let i = -3; i <= 3; i++) {
        const a = Math.PI / 2 + i * 0.16;
        const R0 = H * 0.6;
        g.moveTo(Math.cos(a) * R0, H * 0.4 + Math.sin(a) * R0);
        g.lineTo(Math.cos(a) * R0 * 1.24, H * 0.4 + Math.sin(a) * R0 * 1.24);
      }
      stroke(far ? 3 : 5, 0.4);
      // window lattice along the outer arc
      for (let i = 0; i < 10; i++) {
        const a = Math.PI * (1.15 + (i / 9) * 0.7);
        const R = H * 1.23;
        g.circle(Math.cos(a) * R, H * 0.64 + Math.sin(a) * R, far ? 3 : 5);
        fill(0.55);
      }
      break;
    }
  }
  return g;
}

/** Small wrecked-satellite husk (panel + snapped mast), used by the wreck band. */
function drawWreck(g: Graphics, x: number, y: number, s: number, rot: number): void {
  const c = Math.cos(rot);
  const sn = Math.sin(rot);
  const pt = (px: number, py: number): [number, number] => [x + px * c - py * sn, y + px * sn + py * c];
  const quad = (a: number[], b: number[], cc: number[], d: number[], alpha: number): void => {
    const pa = pt(a[0], a[1]);
    const pb = pt(b[0], b[1]);
    const pc = pt(cc[0], cc[1]);
    const pd = pt(d[0], d[1]);
    g.moveTo(pa[0], pa[1]);
    g.lineTo(pb[0], pb[1]);
    g.lineTo(pc[0], pc[1]);
    g.lineTo(pd[0], pd[1]);
    g.closePath();
    g.fill({ color: 0xffffff, alpha });
  };
  quad([-s, -s * 0.4], [s, -s * 0.34], [s * 0.9, s * 0.4], [-s * 0.94, s * 0.36], 0.85); // broken panel
  quad([-s * 0.12, -s * 0.8], [s * 0.1, -s * 0.8], [s * 0.08, s * 0.2], [-s * 0.1, s * 0.2], 0.9); // mast stub
  quad([s * 0.9, -s * 0.1], [s * 1.5, -s * 0.22], [s * 1.46, -s * 0.05], [s * 0.92, s * 0.05], 0.6); // torn solar wing
}
