// render3d/textures.ts — procedural noise surfaces for the 3D client.
// Everything is generated once on canvas and cached: no assets, deterministic
// per seed string, and rich enough that the terrain reads as a world instead
// of a gradient.

import * as THREE from 'three';
import { hashSeed } from '../render/core';

/** Integer hash noise in [0,1) on a lattice, interpolated — classic value noise. */
function valueNoise(w: number, h: number, cells: number, seed: number): Float32Array {
  const lattice: number[] = [];
  const n = cells + 1;
  for (let i = 0; i < n * n; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    lattice.push(seed / 4294967296);
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const fx = (x / w) * cells;
      const fy = (y / h) * cells;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const tx = fx - x0;
      const ty = fy - y0;
      const sx = tx * tx * (3 - 2 * tx);
      const sy = ty * ty * (3 - 2 * ty);
      const a = lattice[y0 * n + x0];
      const b = lattice[y0 * n + x0 + 1];
      const c = lattice[(y0 + 1) * n + x0];
      const d = lattice[(y0 + 1) * n + x0 + 1];
      out[y * w + x] = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    }
  }
  return out;
}

/** Fractal Brownian motion: stacked value noise octaves. */
function fbm(w: number, h: number, seed: number, octaves = 4, baseCells = 4): Float32Array {
  const out = new Float32Array(w * h);
  let amp = 1;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    const layer = valueNoise(w, h, baseCells * Math.pow(2, o), seed + o * 7919);
    for (let i = 0; i < out.length; i++) out[i] += layer[i] * amp;
    total += amp;
    amp *= 0.55;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

function canvasFromField(): void {
  // (unused helper removed — pixel fills happen inline in each generator)
}
void canvasFromField;

/** Teal world-floor albedo: fbm dune shading, theme-tinted. */
export function groundAlbedo(hexTop: string, _hexBottom: string, seedStr: string): THREE.CanvasTexture {
  const S = 512;
  const cv = document.createElement('canvas');
  cv.width = S;
  cv.height = S;
  const g = cv.getContext('2d')!;
  const img = g.createImageData(S, S);
  const f1 = fbm(S, S, hashSeed(seedStr), 4, 3);
  const f2 = fbm(S, S, hashSeed(seedStr + 'b'), 3, 6);
  const hsl = { h: 0, s: 0, l: 0 };
  new THREE.Color(hexTop).getHSL(hsl);
  const hTop = hsl.h;
  const sTop = Math.min(0.65, hsl.s * 1.15);
  for (let i = 0; i < S * S; i++) {
    // cratered-plain shading in HSL: keep the theme's teal hue/saturation but
    // give the floor a real lightness range — the raw theme colors are far too
    // dark to survive tone mapping
    const streak = f1[i] * 0.7 + f2[i] * 0.3;
    const c = new THREE.Color();
    c.setHSL(hTop, sTop, 0.058 + streak * 0.088);
    const o = i * 4;
    img.data[o] = Math.round(c.r * 255);
    img.data[o + 1] = Math.round(c.g * 255);
    img.data[o + 2] = Math.round(c.b * 255);
    img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // impact craters: dark bowls with bright raised rims — this is a lifeless
  // cosmic plain, not a golf course
  let cseed = hashSeed(seedStr + 'craters');
  const rnd = (): number => {
    cseed = (Math.imul(cseed, 1664525) + 1013904223) >>> 0;
    return cseed / 4294967296;
  };
  for (let i = 0; i < 26; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const r = 4 + rnd() * 26;
    const bowl = g.createRadialGradient(x, y, 0, x, y, r);
    bowl.addColorStop(0, 'rgba(1,6,5,0.5)');
    bowl.addColorStop(0.75, 'rgba(1,6,5,0.28)');
    bowl.addColorStop(0.92, 'rgba(180,235,220,0.16)');
    bowl.addColorStop(1, 'rgba(180,235,220,0)');
    g.fillStyle = bowl;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Grayscale bump companion for the ground (broad dune relief). */
export function groundBump(seedStr: string): THREE.CanvasTexture {
  const S = 512;
  const cv = document.createElement('canvas');
  cv.width = S;
  cv.height = S;
  const g = cv.getContext('2d')!;
  const img = g.createImageData(S, S);
  const f = fbm(S, S, hashSeed(seedStr + 'bump'), 4, 2);
  for (let i = 0; i < S * S; i++) {
    const v = Math.round(f[i] * 255);
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Soft multi-blob nebula cloud (used by sky sprites and floor light-pools). */
export function cloudTexture(hex: string, seedStr: string, blobs = 26): THREE.CanvasTexture {
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = S;
  cv.height = S;
  const g = cv.getContext('2d')!;
  let seed = hashSeed(seedStr);
  const rnd = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  // fade the blob field to transparency at the tile edge
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'source-atop';
  const c = new THREE.Color(hex);
  const rgb = `${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)}`;
  for (let i = 0; i < blobs; i++) {
    const x = S * 0.2 + rnd() * S * 0.6;
    const y = S * 0.2 + rnd() * S * 0.6;
    const r = S * (0.04 + rnd() * 0.13);
    const bg = g.createRadialGradient(x, y, 0, x, y, r);
    const a = 0.10 + rnd() * 0.16;
    bg.addColorStop(0, `rgba(${rgb},${a})`);
    bg.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = bg;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
