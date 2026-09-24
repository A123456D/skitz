// layers/background.ts — the "cosmic diorama" depth stack (design §9):
// sky gradient -> static starfield -> region sun (glow + core) -> 2 parallax
// silhouette bands (hand-authored per region) -> drifting ambient dust.
// All per-frame work is transform/alpha updates; geometry is built once.

import { Container, Graphics, Sprite } from 'pixi.js';
import { REGION_PALETTES, type RegionId, type RegionPalette } from '../../levels/palettes';
import { col, TAU } from '../core';
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
  private stars = new Container();
  private sunGlow = new Sprite();
  private sunCore = new Sprite();
  private bandFar = new Container();
  private bandMid = new Container();
  private dust: DustMote[] = [];
  private starSprites: Sprite[] = [];
  private starPhases: number[] = [];

  private bounds: Bounds = { cx: 0, cy: 0, rx: 800, ry: 600 };
  private palette: RegionPalette = REGION_PALETTES[1];
  private region: RegionId = 1;
  private sunX = 0;
  private sunY = 0;
  private starBase: number[] = []; // world x,y per star (flat)
  private t = 0;
  private quality: 'full' | 'lite' = 'full';
  private screenPt = { x: 0, y: 0 };

  constructor(private tex: TexFactory) {
    this.container.addChild(this.sky, this.stars, this.sunGlow, this.sunCore, this.bandFar, this.bandMid);
    this.sky.anchor.set(0, 0);
    this.sunGlow.anchor.set(0.5);
    this.sunGlow.blendMode = 'add';
    this.sunCore.anchor.set(0.5);
    this.sunCore.blendMode = 'add';
  }

  /** Build everything region-dependent. Called on level load. */
  build(region: RegionId, bounds: Bounds): void {
    this.region = region;
    this.bounds = bounds;
    this.palette = REGION_PALETTES[region];
    const p = this.palette;

    // sky (texture swapped; sprite stretched on resize)
    this.sky.texture = this.tex.sky(p.sky[0], p.sky[1]);

    // region sun — a fixed world-space key light. Angle per region gives each
    // region its own time-of-day mood; bodies bake light from this direction.
    const sun = regionSun(region, bounds);
    this.sunX = sun.x;
    this.sunY = sun.y;

    // starfield (world-anchored, tiny parallax)
    this.stars.removeChildren();
    this.starSprites.length = 0;
    this.starPhases.length = 0;
    this.starBase.length = 0;
    const starTex = this.tex.dot(12);
    const starCount = this.quality === 'lite' ? 56 : 110;
    let sr = 1234567;
    const rnd = (): number => {
      // deterministic star placement per region+level shape
      sr = (Math.imul(sr, 1664525) + 1013904223) >>> 0;
      return sr / 4294967296;
    };
    for (let i = 0; i < starCount; i++) {
      const s = new Sprite(starTex);
      s.anchor.set(0.5);
      const x = bounds.cx + (rnd() - 0.5) * bounds.rx * BAND_EXTENT * 2;
      const y = bounds.cy + (rnd() - 0.5) * bounds.ry * BAND_EXTENT * 2;
      this.starBase.push(x, y);
      s.scale.set(0.08 + rnd() * 0.22);
      s.alpha = 0.25 + rnd() * 0.5;
      s.tint = 0xffffff;
      this.stars.addChild(s);
      this.starSprites.push(s);
      this.starPhases.push(rnd() * TAU);
    }

    // sun sprites
    this.sunGlow.texture = this.tex.glow(256);
    this.sunCore.texture = this.tex.core(96);
    this.sunGlow.tint = col(p.sun);
    this.sunCore.tint = 0xffffff;

    // silhouette bands — hand-authored per region
    this.bandFar.removeChildren().forEach((c) => c.destroy());
    this.bandMid.removeChildren().forEach((c) => c.destroy());
    const farG = buildBand(this.region, true, bounds);
    const midG = buildBand(this.region, false, bounds);
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

  setQuality(q: 'full' | 'lite'): void {
    if (q === this.quality) return;
    this.quality = q;
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

    // stars: near-static parallax + gentle twinkle (skip in lite)
    const twinkle = this.quality === 'full';
    for (let i = 0; i < this.starSprites.length; i++) {
      const s = this.starSprites[i];
      const wx = this.starBase[i * 2];
      const wy = this.starBase[i * 2 + 1];
      s.x = (wx - cam.cx * 0.06) * sc + cam.viewW * 0.5;
      s.y = (wy - cam.cy * 0.06) * sc + cam.viewH * 0.5;
      if (twinkle) s.alpha = 0.22 + 0.3 * (0.5 + 0.5 * Math.sin(this.t * 0.9 + this.starPhases[i]));
    }

    // sun: soft parallax (it is FAR — moves least)
    const p = this.screenPt;
    cam.parallax(this.sunX, this.sunY, 0.1, p);
    this.sunGlow.x = p.x;
    this.sunGlow.y = p.y;
    this.sunCore.x = p.x;
    this.sunCore.y = p.y;
    const glowSize = b.rx * sc * 1.5;
    this.sunGlow.width = glowSize;
    this.sunGlow.height = glowSize;
    this.sunCore.width = glowSize * 0.16;
    this.sunCore.height = glowSize * 0.16;
    this.sunGlow.alpha = 0.5;
    this.sunCore.alpha = 0.9;

    // bands: mid parallax factor; scale with view so silhouettes stay huge
    this.placeBand(this.bandFar, 0.22, b, sc);
    this.placeBand(this.bandMid, 0.45, b, sc);

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

  private placeBand(band: Container, f: number, b: Bounds, sc: number): void {
    const cam = camRef;
    if (!cam) return;
    band.x = (b.cx - cam.cx * f) * sc + cam.viewW * 0.5;
    band.y = (b.cy - cam.cy * f) * sc + cam.viewH * 0.5;
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

/**
 * Hand-authored silhouettes. Local space is centered on the level, spanning
 * BAND_EXTENT * bounds. Drawn in white; the parent tint applies palette color.
 */
function buildBand(region: RegionId, far: boolean, b: Bounds): Graphics {
  const g = new Graphics();
  const W = b.rx * BAND_EXTENT;
  const H = b.ry * BAND_EXTENT;
  const stroke = (width: number, alpha: number): void => {
    g.stroke({ width, color: 0xffffff, alpha });
  };
  const fill = (alpha: number): void => {
    g.fill({ color: 0xffffff, alpha });
  };

  if (region === 1) {
    // THE PRACTICE ORBIT — clean celestial architecture: great ring arcs,
    // a stepped arch causeway, small perfect circles.
    const ringA = far ? H * 1.15 : H * 0.8;
    g.arc(-W * 0.25, -H * 0.15, ringA, Math.PI * 0.15, Math.PI * 0.85);
    stroke(far ? 7 : 10, far ? 0.5 : 0.65);
    g.arc(W * 0.35, H * 0.05, ringA * 0.55, Math.PI * 1.05, Math.PI * 1.95);
    stroke(far ? 4 : 6, 0.4);
    // orbit marker dots on the big arc
    for (let i = 0; i < 3; i++) {
      const a = Math.PI * (0.3 + i * 0.22);
      g.circle(-W * 0.25 + Math.cos(a) * ringA, -H * 0.15 + Math.sin(a) * ringA, far ? 5 : 8);
      fill(0.8);
    }
    if (!far) {
      // stepped arch silhouettes rising from the bottom edge
      for (let i = -2; i <= 2; i++) {
        const x = i * W * 0.34;
        const h = H * (0.16 + Math.abs(Math.sin(i * 1.7)) * 0.12);
        g.roundRect(x - W * 0.06, H - h, W * 0.12, h + H * 0.05, 4);
        fill(0.9);
        g.roundRect(x - W * 0.035, H - h * 1.28, W * 0.07, h * 0.4, 4);
        fill(0.9);
      }
    }
  } else if (region === 2) {
    // THE GRAVEYARD — a shattered ring station, snapped spokes, wrecked
    // satellite husks, jagged planet chunks along the bottom.
    const R = far ? H * 0.95 : H * 0.62;
    const cx = far ? -W * 0.1 : W * 0.3;
    const cy = far ? -H * 0.3 : -H * 0.12;
    // broken ring: irregular dash segments = shattered megastructure
    for (let i = 0; i < 9; i++) {
      const a0 = (i / 9) * TAU + (i % 2) * 0.12;
      g.arc(cx, cy, R, a0, a0 + 0.28 + (i % 3) * 0.12);
    }
    stroke(far ? 9 : 13, 0.6);
    // snapped spokes
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + 0.4;
      g.moveTo(cx + Math.cos(a) * R * 0.2, cy + Math.sin(a) * R * 0.2);
      g.lineTo(cx + Math.cos(a) * R * 0.62, cy + Math.sin(a) * R * 0.62);
    }
    stroke(far ? 4 : 6, 0.45);
    if (!far) {
      // wrecked satellite husks
      for (let i = 0; i < 4; i++) {
        const x = (i - 1.5) * W * 0.42 + 20;
        const y = -H * 0.1 + (i % 2) * H * 0.22;
        drawWreck(g, x, y, W * 0.07 * (0.7 + (i % 3) * 0.3), i * 1.3);
      }
      // jagged chunk field along the bottom
      g.moveTo(-W, H + 4);
      let x = -W;
      while (x < W) {
        const w = W * (0.08 + (x % 3) * 0.02);
        const h = H * (0.05 + Math.abs(Math.sin(x * 0.013)) * 0.13);
        g.lineTo(x + w * 0.5, H + 4 - h);
        g.lineTo(x + w, H + 4 - h * 0.35);
        x += w;
      }
      g.lineTo(W, H + 4);
      g.closePath();
      fill(0.92);
    }
  } else if (region === 3) {
    // THE GIANTS — colossal planet limbs and horizon curves dwarfing the field.
    const R1 = far ? H * 2.1 : H * 1.35;
    g.circle(-W * 0.72, -H * 0.35, R1);
    fill(far ? 0.5 : 0.85);
    const R2 = H * (far ? 1.7 : 1.05);
    g.circle(W * 0.85, H * 0.9, R2);
    fill(far ? 0.42 : 0.8);
    // thin planetary ring stroke around the first giant (untitled ellipse —
    // v8 Graphics has no ellipse rotation; tilt reads fine at silhouette scale)
    g.ellipse(-W * 0.72, -H * 0.35, R1 * 1.25, R1 * 0.3);
    stroke(far ? 3.5 : 5, 0.4);
    g.ellipse(W * 0.85, H * 0.9, R2 * 1.18, R2 * 0.26);
    stroke(far ? 3 : 4, 0.32);
    if (far) {
      // tiny distant moons
      g.circle(W * 0.2, -H * 0.42, H * 0.035);
      fill(0.6);
      g.circle(W * 0.52, H * 0.12, H * 0.02);
      fill(0.5);
    }
  } else {
    // THE GRAND COURSE — megastructure arcs, radial spires, aurora wash.
    for (let i = 0; i < 3; i++) {
      const R = H * (0.55 + i * 0.34);
      g.arc(0, H * (0.4 + i * 0.12), R, Math.PI * 1.08, Math.PI * 1.92);
      stroke(far ? 5 + i * 2 : 8 + i * 2, 0.5 - i * 0.08);
    }
    // radial spires from the arc hub
    for (let i = -3; i <= 3; i++) {
      const a = Math.PI / 2 + i * 0.16;
      const R0 = H * 0.6;
      g.moveTo(Math.cos(a) * R0, H * 0.4 + Math.sin(a) * R0);
      g.lineTo(Math.cos(a) * R0 * 1.24, H * 0.4 + Math.sin(a) * R0 * 1.24);
    }
    stroke(far ? 3 : 5, 0.4);
    if (!far) {
      // aurora wash: layered translucent ribbons
      for (let i = 0; i < 3; i++) {
        const y0 = -H * (0.05 + i * 0.14);
        g.moveTo(-W, y0);
        for (let x = -W; x <= W; x += W / 6) {
          g.lineTo(x, y0 + Math.sin(x * 0.002 + i * 1.8) * H * 0.05);
        }
        for (let x = W; x >= -W; x -= W / 6) {
          g.lineTo(x, y0 + H * (0.05 + i * 0.02) + Math.sin(x * 0.002 + i * 1.8) * H * 0.05);
        }
        g.closePath();
        fill(0.1 - i * 0.02);
      }
    }
  }
  return g;
}

/** Small wrecked-satellite husk (panel + snapped mast), used in R2 mid band. */
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
