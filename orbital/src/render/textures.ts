// textures.ts — procedural, seeded canvas-generated textures.
//
// Rules this module enforces:
//  - Every texture is built ONCE and cached by a stable key
//    (material + seed + quantized size). NEVER draw to canvas per frame.
//  - Canvases get ~2px padding around silhouettes so scaled/rotated sprites
//    never clip their anti-aliased edge.
//  - Bodies are lit from local +X; the body layer rotates each sprite so the
//    baked terminator always faces away from the region sun (one sprite, no
//    per-frame redraws, honest light direction).

import { Texture } from 'pixi.js';
import { mulberry32 } from '../sim/rng';
import { bodyTextureKey, bucketSize, hashSeed } from './core';
import type { Material } from '../sim/types';

// --------------------------------------------------- semantic colors (§11)
export const DANGER = 0xff5a3c;        // hazards, deadly, invalid
export const DANGER_DEEP = 0xd93a2a;
export const GRAVITY = 0x6fd8e8;       // gravity sourcing (rings, field dust)
export const AMBER = 0xffc46b;         // pins / switches / interactive
export const GREEN = 0x8fd9a0;         // the hole — warm lit green, not neon
export const GREEN_WARM = 0xd6f5cf;
export const DUST_SOFT = 0xcfd8e4;

const CANVAS_MAX = 1024;

type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

export class TexFactory {
  private cache = new Map<string, Texture>();

  get(key: string, w: number, h: number, draw: Draw): Texture {
    let t = this.cache.get(key);
    if (t) return t;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(w));
    canvas.height = Math.max(1, Math.ceil(h));
    const ctx = canvas.getContext('2d');
    if (ctx) draw(ctx, canvas.width, canvas.height);
    // A fresh canvas per texture: CanvasSource keeps the reference alive.
    t = Texture.from(canvas);
    this.cache.set(key, t);
    return t;
  }

  /** Drop cached textures (level teardown with a different region set). */
  clear(): void {
    this.cache.clear();
  }

  // ------------------------------------------------------------ primitives

  /** Soft radial glow — the workhorse for light, bloom, and particles. */
  glow(size = 128): Texture {
    return this.get(`glow|${size}`, size, size, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
      g.addColorStop(0.6, 'rgba(255,255,255,0.16)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    });
  }

  /** Tight-core light (region sun core, star sparkle). */
  core(size = 64): Texture {
    return this.get(`core|${size}`, size, size, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.5, 'rgba(255,255,255,0.9)');
      g.addColorStop(0.75, 'rgba(255,255,255,0.25)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    });
  }

  dot(size = 32): Texture {
    return this.get(`dot|${size}`, size, size, (ctx, w, h) => {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, w / 2 - 1, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  /** Thin ring, stroke width proportional in the source (scale sprite). */
  ringThin(size = 64, width = 3): Texture {
    return this.get(`ring|${size}|${width}`, size, size, (ctx, w) => {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.arc(w / 2, w / 2, w / 2 - width, 0, Math.PI * 2);
      ctx.stroke();
    });
  }

  /** Dashed circle — anchor bodies, influence hints, capture radii. */
  ringDashed(size = 256, dashes = 26): Texture {
    return this.get(`ringd|${size}|${dashes}`, size, size, (ctx, w) => {
      const r = w / 2 - 4;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      const seg = (Math.PI * 2) / dashes;
      for (let i = 0; i < dashes; i++) {
        ctx.beginPath();
        ctx.arc(w / 2, w / 2, r, i * seg, i * seg + seg * 0.55);
        ctx.stroke();
      }
    });
  }

  /** Spiky ring — repulsor identity silhouette (design §2). */
  ringSpiky(size = 256, spikes = 14): Texture {
    return this.get(`spiky|${size}|${spikes}`, size, size, (ctx, w) => {
      const cx = w / 2;
      const rO = w / 2 - 4;
      const rI = rO * 0.8;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      for (let i = 0; i <= spikes * 2; i++) {
        const a = (i / (spikes * 2)) * Math.PI * 2;
        const r = i % 2 === 0 ? rO : rI;
        const x = cx + Math.cos(a) * r;
        const y = cx + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    });
  }

  /** Elongated crystal shard — pins, fragments, hazard debris. */
  shard(w = 32, h = 56): Texture {
    return this.get(`shard|${w}|${h}`, w, h, (ctx) => {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(w / 2, 1);
      ctx.lineTo(w - 2, h * 0.38);
      ctx.lineTo(w * 0.58, h - 2);
      ctx.lineTo(w * 0.42, h - 2);
      ctx.lineTo(2, h * 0.38);
      ctx.closePath();
      ctx.fill();
      // facet split — reads as a cut gem even at small sizes
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath();
      ctx.moveTo(w / 2, 1);
      ctx.lineTo(w - 2, h * 0.38);
      ctx.lineTo(w / 2, h * 0.55);
      ctx.closePath();
      ctx.fill();
    });
  }

  /** Horizontal soft streak — trails, corridor flow, aim shaft. */
  streak(w = 64, h = 10): Texture {
    return this.get(`streak|${w}|${h}`, w, h, (ctx) => {
      const g = ctx.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.35, 'rgba(255,255,255,0.9)');
      g.addColorStop(0.8, 'rgba(255,255,255,0.9)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      const hh = h * 0.62;
      const y = (h - hh) / 2;
      ctx.fillRect(0, y, w, hh);
      // soft vertical falloff
      const gv = ctx.createLinearGradient(0, y, 0, y + hh);
      gv.addColorStop(0, 'rgba(0,0,0,1)');
      gv.addColorStop(0.5, 'rgba(0,0,0,0)');
      gv.addColorStop(1, 'rgba(0,0,0,1)');
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = gv;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
    });
  }

  /** Spiral swirl — wormhole mouths. */
  swirl(size = 128): Texture {
    return this.get(`swirl|${size}`, size, size, (ctx, w) => {
      const cx = w / 2;
      ctx.strokeStyle = '#ffffff';
      ctx.lineCap = 'round';
      for (let arm = 0; arm < 3; arm++) {
        ctx.beginPath();
        for (let i = 0; i <= 40; i++) {
          const t = i / 40;
          const a = (arm / 3) * Math.PI * 2 + t * Math.PI * 1.5;
          const r = 4 + t * (w / 2 - 6);
          const x = cx + Math.cos(a) * r;
          const y = cx + Math.sin(a) * r;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.lineWidth = 7 * (1 - 0.3);
        ctx.globalAlpha = 0.85;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    });
  }

  /** Warning cone for beam sweeps — apex at left-center, opening to +x. */
  cone(size = 256): Texture {
    return this.get(`cone|${size}`, size, size, (ctx, w, h) => {
      const g = ctx.createRadialGradient(0, h / 2, 0, 0, h / 2, w);
      g.addColorStop(0, 'rgba(255,255,255,0.5)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.arc(0, h / 2, w, -0.52, 0.52);
      ctx.closePath();
      ctx.fill();
    });
  }

  chevron(size = 28): Texture {
    return this.get(`chev|${size}`, size, size, (ctx, w, h) => {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(w * 0.2, h * 0.2);
      ctx.lineTo(w * 0.8, h * 0.5);
      ctx.lineTo(w * 0.2, h * 0.8);
      ctx.stroke();
    });
  }

  xMark(size = 40): Texture {
    return this.get(`x|${size}`, size, size, (ctx, w, h) => {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(6, 6); ctx.lineTo(w - 6, h - 6);
      ctx.moveTo(w - 6, 6); ctx.lineTo(6, h - 6);
      ctx.stroke();
    });
  }

  /** Four-point sparkle — fragments, collectibles. */
  star(size = 28): Texture {
    return this.get(`star|${size}`, size, size, (ctx, w, h) => {
      const cx = w / 2;
      const g = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx);
      g.addColorStop(0, 'rgba(255,255,255,0.9)');
      g.addColorStop(0.35, 'rgba(255,255,255,0.25)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx, 3); ctx.lineTo(cx, h - 3);
      ctx.moveTo(3, cx); ctx.lineTo(w - 3, cx);
      ctx.stroke();
    });
  }

  /** Dormant lock glyph for gated bodies. */
  lock(size = 40): Texture {
    return this.get(`lock|${size}`, size, size, (ctx, w, h) => {
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 3.5;
      // shackle
      ctx.beginPath();
      ctx.arc(w / 2, h * 0.38, w * 0.2, Math.PI, 0);
      ctx.stroke();
      // body
      ctx.beginPath();
      const bw = w * 0.6, bh = h * 0.42, bx = (w - bw) / 2, by = h * 0.38;
      ctx.roundRect(bx, by, bw, bh, 3);
      ctx.fill();
      // keyhole
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.beginPath();
      ctx.arc(w / 2, by + bh * 0.38, 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(w / 2 - 1.2, by + bh * 0.42, 2.4, bh * 0.3);
    });
  }

  /** Mini flag for the hole & the 'sunk' preview marker (pole drawn by layer). */
  flag(w = 30, h = 20): Texture {
    return this.get(`flag|${w}|${h}`, w, h, (ctx) => {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(1, 1);
      ctx.lineTo(w - 1, h * 0.5);
      ctx.lineTo(1, h - 1);
      ctx.closePath();
      ctx.fill();
    });
  }

  // ------------------------------------------------------------- sky/sun

  /** Vertical gradient sky (screen-stretched). Keyed by its two colors. */
  sky(top: string, bottom: string): Texture {
    return this.get(`sky|${top}|${bottom}`, 8, 512, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, top);
      g.addColorStop(1, bottom);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    });
  }

  /** Screen vignette — transparent center, deep edges (depth, §9). */
  vignette(): Texture {
    return this.get('vignette', 512, 512, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, w * 0.32, w / 2, h / 2, w * 0.52);
      g.addColorStop(0, 'rgba(2,4,10,0)');
      g.addColorStop(1, 'rgba(2,4,10,0.5)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    });
  }

  // --------------------------------------------------------------- bodies

  /**
   * Material body texture. Lit from local +X. `seedKey` disambiguates
   * same-material bodies so no two planets share surface detail.
   */
  body(material: Material, seedKey: string, radiusPx: number): Texture {
    const bucket = bucketSize(radiusPx * 2 + 8, 32, 64, CANVAS_MAX);
    const seed = hashSeed(`${material}:${seedKey}`);
    return this.get(bodyTextureKey(material, seed, bucket), bucket, bucket, (ctx, w, h) => {
      drawBody(ctx, w, h, material, mulberry32(seed));
    });
  }
}

// ------------------------------------------------------------ body recipes

const MAT = {
  rock:     { base: '#7d6a58', dark: '#54452f', lite: '#a38a6d', name: 'rock' },
  ice:      { base: '#b8d8e8', dark: '#7fb2cc', lite: '#eaf8ff', name: 'ice' },
  metal:    { base: '#8e99a6', dark: '#5d6873', lite: '#c6d0da', name: 'metal' },
  glass:    { base: '#a8cde0', dark: '#6f9cb5', lite: '#ffffff', name: 'glass' },
  gas:      { base: '#b98f5e', dark: '#8a6238', lite: '#e8c896', name: 'gas' },
  crystal:  { base: '#8fa8dc', dark: '#5f7bb5', lite: '#d6e4fa', name: 'crystal' },
  machine:  { base: '#454f5a', dark: '#2c343d', lite: '#93a0ac', name: 'machine' },
  molten:   { base: '#241a18', dark: '#170f0e', lite: '#3a2a24', name: 'molten' },
  organic:  { base: '#9c5f6b', dark: '#6b3a46', lite: '#cf9099', name: 'organic' },
} as const;

function silhouettePath(ctx: CanvasRenderingContext2D, r: number, pts: number[] | null): void {
  ctx.beginPath();
  if (pts) {
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.closePath();
  } else {
    ctx.arc(0, 0, r, 0, Math.PI * 2);
  }
}

function drawBody(ctx: CanvasRenderingContext2D, w: number, h: number, material: Material, rnd: () => number): void {
  const pad = 4;
  const r = Math.min(w, h) / 2 - pad;
  const cx = w / 2;
  const cy = h / 2;
  const m = MAT[material];
  const detail = Math.max(0.55, Math.min(1.6, r / 56)); // detail scales with radius

  // faceted polygon for crystal — computed ONCE so clip, facets, and edge
  // stroke all share the same silhouette (must never re-walk the RNG).
  let crystalPts: number[] | null = null;
  if (material === 'crystal') {
    crystalPts = [];
    const n = 9;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rr = r * (0.86 + rnd() * 0.14);
      crystalPts.push(Math.cos(a) * rr, Math.sin(a) * rr);
    }
  }

  ctx.save();
  ctx.translate(cx, cy);
  silhouettePath(ctx, r, crystalPts);
  ctx.save();
  ctx.clip();

  // base
  ctx.fillStyle = m.base;
  ctx.fillRect(-r - pad, -r - pad, r * 2 + pad * 2, r * 2 + pad * 2);

  // --- material surface recipe
  switch (material) {
    case 'rock': {
      // strata: arced sediment bands
      const bands = 3 + Math.floor(rnd() * 3);
      for (let i = 0; i < bands; i++) {
        const y = -r + ((i + rnd() * 0.6) / bands) * r * 2;
        ctx.globalAlpha = 0.14 + rnd() * 0.12;
        ctx.fillStyle = rnd() > 0.5 ? m.dark : m.lite;
        ctx.beginPath();
        ctx.ellipse(0, y + r * 0.35, r * 1.1, r * (0.08 + rnd() * 0.1), 0, 0, Math.PI * 2);
        ctx.fill();
      }
      // craters: dark bowl + lit rim on the sun side
      const craters = 4 + Math.floor(rnd() * 5);
      for (let i = 0; i < craters; i++) {
        const a = rnd() * Math.PI * 2;
        const d = rnd() * r * 0.72;
        const x = Math.cos(a) * d;
        const y = Math.sin(a) * d;
        const cr = r * (0.08 + rnd() * 0.16);
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = m.dark;
        ctx.beginPath(); ctx.arc(x, y, cr, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 0.4;
        ctx.strokeStyle = m.lite;
        ctx.lineWidth = Math.max(1, cr * 0.22);
        ctx.beginPath(); ctx.arc(x, y, cr * 0.92, -0.9, 0.9); ctx.stroke();
      }
      break;
    }
    case 'ice': {
      // cracks: branching polylines
      ctx.strokeStyle = m.lite;
      const cracks = 4 + Math.floor(rnd() * 4);
      for (let i = 0; i < cracks; i++) {
        ctx.globalAlpha = 0.35 + rnd() * 0.3;
        ctx.lineWidth = Math.max(1, r * 0.02);
        let x = -r + rnd() * r * 2;
        let y = -r + rnd() * r * 2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        let a = rnd() * Math.PI * 2;
        for (let s = 0; s < 4; s++) {
          a += (rnd() - 0.5) * 1.2;
          x += Math.cos(a) * r * 0.28;
          y += Math.sin(a) * r * 0.28;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      // specular streak near the lit limb
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(1.5, r * 0.05);
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.82, -0.7, 0.5);
      ctx.stroke();
      break;
    }
    case 'metal':
    case 'machine': {
      // panel grid
      const step = r * 0.42;
      ctx.strokeStyle = m.dark;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = Math.max(1.2, r * 0.035);
      for (let gx = -r; gx <= r; gx += step) {
        ctx.beginPath(); ctx.moveTo(gx, -r); ctx.lineTo(gx, r); ctx.stroke();
      }
      for (let gy = -r; gy <= r; gy += step) {
        ctx.beginPath(); ctx.moveTo(-r, gy); ctx.lineTo(r, gy); ctx.stroke();
      }
      // rivets at some intersections
      ctx.fillStyle = m.lite;
      for (let gx = -r + step / 2; gx < r; gx += step) {
        for (let gy = -r + step / 2; gy < r; gy += step) {
          if (gx * gx + gy * gy > r * r * 0.8 || rnd() > 0.6) continue;
          ctx.globalAlpha = 0.7;
          ctx.beginPath(); ctx.arc(gx, gy, Math.max(1.2, r * 0.03), 0, Math.PI * 2); ctx.fill();
        }
      }
      // edge wear: short dark arcs near the rim
      ctx.strokeStyle = m.dark;
      for (let i = 0; i < 6; i++) {
        ctx.globalAlpha = 0.4;
        ctx.lineWidth = Math.max(1.5, r * 0.05);
        const a0 = rnd() * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(0, 0, r * (0.9 + rnd() * 0.06), a0, a0 + 0.2 + rnd() * 0.5);
        ctx.stroke();
      }
      if (material === 'machine') {
        // glowing conduit lines — machine's living circuitry
        const conduits = 2 + Math.floor(rnd() * 2);
        for (let i = 0; i < conduits; i++) {
          const pts: number[] = [];
          let x = -r * 0.7;
          let y = (rnd() - 0.5) * r * 1.2;
          pts.push(x, y);
          while (x < r * 0.7) {
            x += r * (0.25 + rnd() * 0.3);
            y += (rnd() - 0.5) * r * 0.5;
            pts.push(x, y);
          }
          for (const [alpha, lw, colr] of [[0.22, r * 0.09, '#9fe8ff'], [0.9, r * 0.032, '#c8f2ff']] as const) {
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = colr;
            ctx.lineWidth = Math.max(1.5, lw * detail);
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(pts[0], pts[1]);
            for (let p = 2; p < pts.length; p += 2) ctx.lineTo(pts[p], pts[p + 1]);
            ctx.stroke();
          }
        }
      }
      break;
    }
    case 'gas': {
      // banded flow — sinuous horizontal bands
      const bands = 6 + Math.floor(rnd() * 4);
      for (let i = 0; i < bands; i++) {
        const y = -r + (i / (bands - 1)) * r * 2;
        ctx.globalAlpha = 0.22 + rnd() * 0.18;
        ctx.fillStyle = i % 2 === 0 ? m.dark : m.lite;
        ctx.beginPath();
        const ph = rnd() * Math.PI * 2;
        const amp = r * 0.06;
        ctx.moveTo(-r, y + Math.sin(ph) * amp);
        for (let x = -r; x <= r; x += r / 8) {
          ctx.lineTo(x, y + Math.sin(ph + (x / r) * 2.4) * amp);
        }
        ctx.lineTo(r, y + r * (0.35 / bands) * 2);
        for (let x = r; x >= -r; x -= r / 8) {
          ctx.lineTo(x, y + r * (0.35 / bands) * 2 + Math.sin(ph + (x / r) * 2.4) * amp);
        }
        ctx.closePath();
        ctx.fill();
      }
      // storm oval
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = m.dark;
      ctx.beginPath();
      ctx.ellipse((rnd() - 0.5) * r, (rnd() - 0.5) * r * 0.8, r * 0.2, r * 0.11, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'crystal': {
      // facet facets from center, alternating brightness
      ctx.globalAlpha = 1;
      // sample the polygon we clipped with (deterministic: re-walk same rnd order)
      break;
    }
    case 'glass': {
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = m.dark;
      for (let i = 0; i < 4; i++) {
        const a = rnd() * Math.PI * 2;
        const d = rnd() * r * 0.6;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * d, Math.sin(a) * d, r * (0.03 + rnd() * 0.05), 0, Math.PI * 2);
        ctx.fill();
      }
      // inner refraction ring
      ctx.globalAlpha = 0.4;
      ctx.strokeStyle = m.lite;
      ctx.lineWidth = Math.max(1, r * 0.04);
      ctx.beginPath(); ctx.arc(0, 0, r * 0.6, 0, Math.PI * 2); ctx.stroke();
      // strong specular arc
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(2, r * 0.07);
      ctx.beginPath(); ctx.arc(0, 0, r * 0.86, -0.85, 0.35); ctx.stroke();
      break;
    }
    case 'molten': {
      // glowing fissure network over dark crust
      const veins = 5 + Math.floor(rnd() * 4);
      for (let i = 0; i < veins; i++) {
        const pts: number[] = [];
        let x = (rnd() - 0.5) * r * 1.4;
        let y = (rnd() - 0.5) * r * 1.4;
        pts.push(x, y);
        let a = rnd() * Math.PI * 2;
        for (let s = 0; s < 5; s++) {
          a += (rnd() - 0.5) * 1.4;
          x += Math.cos(a) * r * 0.24;
          y += Math.sin(a) * r * 0.24;
          pts.push(x, y);
        }
        for (const [colr, alpha, lw] of [['#ff7a33', 0.4, r * 0.075], ['#ffcf8a', 0.95, r * 0.028]] as const) {
          ctx.globalAlpha = alpha;
          ctx.strokeStyle = colr;
          ctx.lineWidth = Math.max(1.4, lw * detail);
          ctx.lineJoin = 'round';
          ctx.beginPath();
          ctx.moveTo(pts[0], pts[1]);
          for (let p = 2; p < pts.length; p += 2) ctx.lineTo(pts[p], pts[p + 1]);
          ctx.stroke();
        }
      }
      break;
    }
    case 'organic': {
      // mottled membrane
      const blobs = 8 + Math.floor(rnd() * 6);
      for (let i = 0; i < blobs; i++) {
        const a = rnd() * Math.PI * 2;
        const d = rnd() * r * 0.8;
        ctx.globalAlpha = 0.12 + rnd() * 0.14;
        ctx.fillStyle = rnd() > 0.5 ? m.dark : m.lite;
        ctx.beginPath();
        ctx.ellipse(Math.cos(a) * d, Math.sin(a) * d, r * (0.1 + rnd() * 0.2), r * (0.07 + rnd() * 0.14), rnd() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
      // pores
      ctx.fillStyle = m.dark;
      for (let i = 0; i < 12; i++) {
        const a = rnd() * Math.PI * 2;
        const d = rnd() * r * 0.75;
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * d, Math.sin(a) * d, Math.max(1, r * 0.028), 0, Math.PI * 2);
        ctx.fill();
      }
      // veins
      ctx.strokeStyle = m.lite;
      ctx.globalAlpha = 0.25;
      ctx.lineWidth = Math.max(1, r * 0.03);
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc((rnd() - 0.5) * r, (rnd() - 0.5) * r, r * (0.3 + rnd() * 0.4), rnd() * Math.PI * 2, rnd() * Math.PI * 2 + 2);
        ctx.stroke();
      }
      break;
    }
  }

  // crystal facets (same polygon as the clip — guaranteed by crystalPts)
  if (crystalPts) {
    const n = crystalPts.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      ctx.globalAlpha = i % 2 === 0 ? 0.3 : 0.12;
      ctx.fillStyle = i % 2 === 0 ? '#ffffff' : '#20345c';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(crystalPts[i * 2], crystalPts[i * 2 + 1]);
      ctx.lineTo(crystalPts[j * 2], crystalPts[j * 2 + 1]);
      ctx.closePath();
      ctx.fill();
    }
  }

  // --- shading pass: key light from +X, terminator across the sphere
  const lg = ctx.createLinearGradient(r, 0, -r, 0);
  lg.addColorStop(0, 'rgba(255,248,232,0.14)');
  lg.addColorStop(0.45, 'rgba(255,248,232,0)');
  lg.addColorStop(0.62, 'rgba(6,8,18,0.18)');
  lg.addColorStop(1, 'rgba(4,6,14,0.62)');
  ctx.globalAlpha = 1;
  ctx.fillStyle = lg;
  ctx.fillRect(-r - pad, -r - pad, r * 2 + pad * 2, r * 2 + pad * 2);

  // highlight pool near the lit pole
  const hg = ctx.createRadialGradient(r * 0.55, -r * 0.12, 0, r * 0.55, -r * 0.12, r * 0.55);
  hg.addColorStop(0, 'rgba(255,250,238,0.2)');
  hg.addColorStop(1, 'rgba(255,250,238,0)');
  ctx.fillStyle = hg;
  ctx.fillRect(-r - pad, -r - pad, r * 2 + pad * 2, r * 2 + pad * 2);

  // limb darkening + soft edge for gas giants
  const edge = material === 'gas' ? 0.62 : 0.8;
  const eg = ctx.createRadialGradient(0, 0, r * edge, 0, 0, r);
  eg.addColorStop(0, 'rgba(3,5,12,0)');
  eg.addColorStop(1, material === 'gas' ? 'rgba(3,5,12,0.55)' : 'rgba(3,5,12,0.28)');
  ctx.fillStyle = eg;
  ctx.fillRect(-r - pad, -r - pad, r * 2 + pad * 2, r * 2 + pad * 2);

  ctx.restore(); // unclip

  // --- rim light: thin bright arc on the sun side (design §9), dark limb opposite
  ctx.lineWidth = Math.max(1.6, r * 0.045);
  ctx.strokeStyle = 'rgba(255,242,220,0.55)';
  ctx.beginPath();
  ctx.arc(0, 0, r - ctx.lineWidth * 0.5, -1.0, 1.0);
  ctx.stroke();
  ctx.lineWidth = Math.max(1.2, r * 0.03);
  ctx.strokeStyle = 'rgba(255,242,220,0.2)';
  ctx.beginPath();
  ctx.arc(0, 0, r - ctx.lineWidth * 0.5, -1.35, 1.35);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(2,4,12,0.5)';
  ctx.beginPath();
  ctx.arc(0, 0, r - ctx.lineWidth * 0.5, Math.PI - 0.9, Math.PI + 0.9);
  ctx.stroke();

  // crystal: crisp full-silhouette edge (same polygon as clip + facets)
  if (crystalPts) {
    ctx.strokeStyle = 'rgba(220,235,255,0.5)';
    ctx.lineWidth = 2;
    silhouettePath(ctx, r, crystalPts);
    ctx.stroke();
  }

  ctx.restore();
}

// ------------------------------------------------------------- Milo textures

export function miloTextures(f: TexFactory): {
  body: Texture; detail: Texture;
  eyeOpen: Texture; eyeWide: Texture; eyeSquint: Texture; eyeSpiral: Texture; eyeHappy: Texture;
  brow: Texture;
} {
  const R = 40; // baked at 2x-ish for crispness under zoom
  const body = f.get('milo|body', R * 2 + 8, R * 2 + 8, (ctx, w, h) => {
    const cx = w / 2, cy = h / 2, r = R;
    // light from top-left — a character key light, independent of the region sun
    const g = ctx.createRadialGradient(cx - r * 0.4, cy - r * 0.45, r * 0.1, cx, cy, r);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.7, '#f2f0ec');
    g.addColorStop(1, '#c9c6c0');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    // dimple pores (golf ball material feel)
    ctx.fillStyle = 'rgba(90,88,84,0.16)';
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + 0.35;
      const d = r * (0.62 + (i % 3) * 0.12);
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 2.1, 0, Math.PI * 2);
      ctx.fill();
    }
    // rim light top-left, dark limb bottom-right
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath(); ctx.arc(cx, cy, r - 1.4, Math.PI * 0.75, Math.PI * 1.55); ctx.stroke();
    ctx.strokeStyle = 'rgba(40,42,52,0.35)';
    ctx.beginPath(); ctx.arc(cx, cy, r - 1.4, Math.PI * 1.85, Math.PI * 2.55); ctx.stroke();
  });

  // seams + the three-dimple triangle glyph — rotates with w.ball.spin
  const detail = f.get('milo|detail', R * 2 + 8, R * 2 + 8, (ctx, w, h) => {
    const cx = w / 2, cy = h / 2, r = R;
    ctx.strokeStyle = 'rgba(70,72,80,0.4)';
    ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.82, -0.55, 1.85); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.82, Math.PI - 0.55, Math.PI + 1.85); ctx.stroke();
    ctx.fillStyle = 'rgba(60,62,72,0.5)';
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 + (i / 3) * Math.PI * 2;
      const x = cx + Math.cos(a) * r * 0.42;
      const y = cy + Math.sin(a) * r * 0.42;
      ctx.beginPath(); ctx.arc(x, y, r * 0.13, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath(); ctx.arc(x - r * 0.035, y - r * 0.035, r * 0.045, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(60,62,72,0.5)';
    }
  });

  const eye = (key: string, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): Texture =>
    f.get(`milo|eye|${key}`, 36, 44, draw);

  const eyeOpen = eye('open', (ctx, w, h) => {
    ctx.fillStyle = '#171a21';
    ctx.beginPath(); ctx.ellipse(w / 2, h / 2, 9, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(w / 2 - 3, h / 2 - 4, 2.6, 0, Math.PI * 2); ctx.fill();
  });
  const eyeWide = eye('wide', (ctx, w, h) => {
    ctx.strokeStyle = '#171a21';
    ctx.lineWidth = 2;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.ellipse(w / 2, h / 2, 11, 13, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#171a21';
    ctx.beginPath(); ctx.arc(w / 2, h / 2 + 1, 5.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(w / 2 - 2, h / 2 - 2, 1.8, 0, Math.PI * 2); ctx.fill();
  });
  const eyeSquint = eye('squint', (ctx, w, h) => {
    ctx.strokeStyle = '#171a21';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(6, h / 2); ctx.lineTo(w - 6, h / 2); ctx.stroke();
  });
  const eyeSpiral = eye('spiral', (ctx, w, h) => {
    ctx.strokeStyle = '#171a21';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i <= 30; i++) {
      const t = i / 30;
      const a = t * Math.PI * 3.6;
      const r = 1.5 + t * 9.5;
      const x = w / 2 + Math.cos(a) * r;
      const y = h / 2 + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  });
  const eyeHappy = eye('happy', (ctx, w, h) => {
    ctx.strokeStyle = '#171a21';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(w / 2, h / 2 + 4, 10, Math.PI * 1.12, Math.PI * 1.88); ctx.stroke();
  });

  const brow = f.get('milo|brow', 30, 12, (ctx, w, h) => {
    ctx.strokeStyle = '#2c2f38';
    ctx.lineWidth = 4.5;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(4, h - 4); ctx.lineTo(w - 4, 4); ctx.stroke();
  });

  return { body, detail, eyeOpen, eyeWide, eyeSquint, eyeSpiral, eyeHappy, brow };
}
