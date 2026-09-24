// layers/vfx.ts — pooled particle VFX. One dense, typed-array-backed pool;
// zero allocation per frame or per spawn. Capacity is the budget:
// 'lite' halves it (and spawners scale their counts accordingly).

import { Container, Sprite } from 'pixi.js';
import { clamp } from '../core';
import { AMBER, DANGER, GREEN, GRAVITY, TexFactory } from '../textures';

const TEX_GLOW = 0;
const TEX_SHARD = 1;
const TEX_RING = 2;
const TEX_STAR = 3;
const TEX_DOT = 4;

const MAX_FULL = 320;

export class VfxLayer {
  readonly container = new Container();
  private cap = MAX_FULL;
  private count = 0;
  private sprites: Sprite[] = [];
  private x: Float32Array;
  private y: Float32Array;
  private vx: Float32Array;
  private vy: Float32Array;
  private life: Float32Array;
  private ttl: Float32Array;
  private s0: Float32Array;
  private s1: Float32Array;
  private grav: Float32Array;
  private drag: Float32Array;
  private rot: Float32Array;
  private vr: Float32Array;
  private a0: Float32Array;
  private color: Uint32Array;
  private texId: Uint8Array;
  private additive: Uint8Array;
  private quality: 'full' | 'lite' = 'full';

  constructor(tex: TexFactory) {
    this.x = new Float32Array(MAX_FULL);
    this.y = new Float32Array(MAX_FULL);
    this.vx = new Float32Array(MAX_FULL);
    this.vy = new Float32Array(MAX_FULL);
    this.life = new Float32Array(MAX_FULL);
    this.ttl = new Float32Array(MAX_FULL);
    this.s0 = new Float32Array(MAX_FULL);
    this.s1 = new Float32Array(MAX_FULL);
    this.grav = new Float32Array(MAX_FULL);
    this.drag = new Float32Array(MAX_FULL);
    this.rot = new Float32Array(MAX_FULL);
    this.vr = new Float32Array(MAX_FULL);
    this.a0 = new Float32Array(MAX_FULL);
    this.color = new Uint32Array(MAX_FULL);
    this.texId = new Uint8Array(MAX_FULL);
    this.additive = new Uint8Array(MAX_FULL);

    const textures = [
      tex.glow(64), tex.shard(24, 40), tex.ringThin(64, 4), tex.star(28), tex.dot(16),
    ];
    this.texList = textures;
    for (let i = 0; i < MAX_FULL; i++) {
      const sp = new Sprite(textures[0]);
      sp.anchor.set(0.5);
      sp.visible = false;
      this.container.addChild(sp);
      this.sprites.push(sp);
    }
  }

  setQuality(q: 'full' | 'lite'): void {
    this.quality = q;
    this.cap = q === 'lite' ? MAX_FULL / 2 : MAX_FULL;
  }

  private spawn(
    tex: number, x: number, y: number, vx: number, vy: number,
    ttl: number, s0: number, s1: number, color: number,
    additive: boolean, a0 = 1, grav = 0, drag = 0, rot = 0, vr = 0,
  ): void {
    if (this.count >= this.cap) return; // budget: silently drop, never spike
    const i = this.count++;
    this.texId[i] = tex;
    this.x[i] = x; this.y[i] = y;
    this.vx[i] = vx; this.vy[i] = vy;
    this.life[i] = ttl; this.ttl[i] = ttl;
    this.s0[i] = s0; this.s1[i] = s1;
    this.color[i] = color;
    this.additive[i] = additive ? 1 : 0;
    this.a0[i] = a0;
    this.grav[i] = grav;
    this.drag[i] = drag;
    this.rot[i] = rot;
    this.vr[i] = vr;
    this.applyTexture(i);
  }

  private applyTexture(i: number): void {
    const sp = this.sprites[i];
    sp.texture = this.texturesById(this.texId[i]);
    sp.blendMode = this.additive[i] ? 'add' : 'normal';
    sp.tint = this.color[i];
  }

  private texList: Sprite['texture'][] = [];
  private texturesById(id: number): Sprite['texture'] {
    return this.texList[id] ?? this.texList[0];
  }

  private kill(i: number): void {
    const last = --this.count;
    if (i !== last) {
      // swap-remove: move the last live particle into this slot
      this.texId[i] = this.texId[last];
      this.x[i] = this.x[last]; this.y[i] = this.y[last];
      this.vx[i] = this.vx[last]; this.vy[i] = this.vy[last];
      this.life[i] = this.life[last]; this.ttl[i] = this.ttl[last];
      this.s0[i] = this.s0[last]; this.s1[i] = this.s1[last];
      this.color[i] = this.color[last];
      this.additive[i] = this.additive[last];
      this.a0[i] = this.a0[last];
      this.grav[i] = this.grav[last];
      this.drag[i] = this.drag[last];
      this.rot[i] = this.rot[last];
      this.vr[i] = this.vr[last];
      this.applyTexture(i);
    }
    this.sprites[last].visible = false;
  }

  update(dt: number): void {
    for (let i = 0; i < this.count; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.kill(i);
        i--; // re-process the swapped-in particle
        continue;
      }
      const d = this.drag[i];
      if (d > 0) {
        const f = Math.max(0, 1 - d * dt);
        this.vx[i] *= f;
        this.vy[i] *= f;
      }
      this.vy[i] += this.grav[i] * dt;
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      this.rot[i] += this.vr[i] * dt;

      const k = 1 - this.life[i] / this.ttl[i]; // 0 -> 1 over lifetime
      const sp = this.sprites[i];
      sp.visible = true;
      sp.x = this.x[i];
      sp.y = this.y[i];
      sp.rotation = this.rot[i];
      sp.width = sp.height = this.s0[i] + (this.s1[i] - this.s0[i]) * k;
      sp.alpha = this.a0[i] * Math.sin(Math.PI * clamp(k, 0, 1));
    }
    for (let i = this.count; i < this.sprites.length; i++) this.sprites[i].visible = false;
  }

  clear(): void {
    this.count = 0;
    for (const sp of this.sprites) sp.visible = false;
  }

  // ------------------------------------------------------------- spawners

  private q(): number {
    return this.quality === 'lite' ? 0.5 : 1;
  }

  launchBurst(x: number, y: number, vx: number, vy: number): void {
    const spd = Math.hypot(vx, vy) || 1;
    const ux = vx / spd;
    const uy = vy / spd;
    const n = Math.round(12 * this.q());
    for (let i = 0; i < n; i++) {
      const spread = (i / n - 0.5) * 1.9;
      const ca = Math.cos(spread);
      const sa = Math.sin(spread);
      const bx = -ux * ca - uy * sa; // cone behind the launch
      const by = -ux * sa + uy * ca;
      const sp = 90 + Math.random() * 160;
      this.spawn(TEX_GLOW, x, y, bx * sp, by * sp, 0.4 + Math.random() * 0.25,
        14, 3, GRAVITY, true, 0.85, 0, 2.6);
    }
    // one stretch flash along the launch vector
    this.spawn(TEX_RING, x + ux * 8, y + uy * 8, 0, 0, 0.28, 26, 58, 0xffffff, true, 0.7);
  }

  impactDust(x: number, y: number, nx: number, ny: number, speed: number): void {
    const n = Math.round(clamp(speed / 60, 3, 12) * this.q());
    for (let i = 0; i < n; i++) {
      const a = Math.atan2(ny, nx) + (Math.random() - 0.5) * 2.1;
      const sp = 40 + Math.random() * speed * 0.35;
      this.spawn(TEX_DOT, x, y, Math.cos(a) * sp, Math.sin(a) * sp,
        0.3 + Math.random() * 0.25, 7, 2.5, 0xcfd8e4, false, 0.65, 60, 2.2);
    }
  }

  hazardShatter(x: number, y: number): void {
    const n = Math.round(18 * this.q());
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
      const sp = 130 + Math.random() * 260;
      this.spawn(TEX_SHARD, x, y, Math.cos(a) * sp, Math.sin(a) * sp,
        0.5 + Math.random() * 0.35, 16, 3, i % 3 === 0 ? 0xffb8a0 : DANGER, false,
        1, 0, 1.6, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 9);
    }
    this.spawn(TEX_RING, x, y, 0, 0, 0.35, 20, 120, DANGER, true, 0.7);
  }

  voidedDrift(x: number, y: number): void {
    const n = Math.round(10 * this.q());
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.spawn(TEX_GLOW, x, y, Math.cos(a) * 55, Math.sin(a) * 55,
        0.9, 16, 4, GRAVITY, true, 0.5, 0, 0.6);
    }
  }

  sinkCelebration(x: number, y: number): void {
    // ONE warm ring + brief dimple-confetti, localized (~0.8 s), never spam
    this.spawn(TEX_RING, x, y, 0, 0, 0.55, 18, 95, GREEN, true, 0.9);
    this.spawn(TEX_RING, x, y, 0, 0, 0.8, 10, 60, 0xffffff, true, 0.5);
    const n = Math.round(12 * this.q());
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i / n - 0.5) * 2.2;
      const sp = 120 + Math.random() * 130;
      this.spawn(TEX_DOT, x, y, Math.cos(a) * sp, Math.sin(a) * sp,
        0.55 + Math.random() * 0.3, 6, 3, i % 2 === 0 ? AMBER : 0xffffff,
        false, 1, 340, 1.2, 0, (Math.random() - 0.5) * 6);
    }
  }

  orbitFlash(x: number, y: number): void {
    this.spawn(TEX_RING, x, y, 0, 0, 0.5, 30, 150, GRAVITY, true, 0.55);
    this.spawn(TEX_RING, x, y, 0, 0, 0.7, 20, 100, 0xffffff, true, 0.35);
  }

  wormholeFlash(x: number, y: number): void {
    const n = Math.round(10 * this.q());
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.spawn(TEX_GLOW, x + Math.cos(a) * 22, y + Math.sin(a) * 22,
        -Math.cos(a) * 70, -Math.sin(a) * 70, 0.35, 12, 4, GRAVITY, true, 0.8);
    }
  }

  pinBloom(x: number, y: number): void {
    this.spawn(TEX_RING, x, y, 0, 0, 0.45, 14, 70, AMBER, true, 0.8);
    const n = Math.round(6 * this.q());
    for (let i = 0; i < n; i++) {
      this.spawn(TEX_STAR, x, y, (Math.random() - 0.5) * 90, -40 - Math.random() * 80,
        0.5, 10, 3, AMBER, true, 0.9, 220, 1);
    }
  }

  pinDeny(x: number, y: number): void {
    const n = Math.round(6 * this.q());
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.spawn(TEX_DOT, x, y, Math.cos(a) * 60, Math.sin(a) * 60,
        0.3, 7, 2, DANGER, false, 0.7, 0, 3);
    }
  }

  lipout(x: number, y: number): void {
    const n = Math.round(5 * this.q());
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.spawn(TEX_DOT, x, y, Math.cos(a) * 80, Math.sin(a) * 80 - 30,
        0.35, 6, 2, 0xcfd8e4, false, 0.6, 180, 2);
    }
  }

  fragmentPickup(x: number, y: number): void {
    const n = Math.round(10 * this.q());
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.spawn(TEX_STAR, x, y, Math.cos(a) * 120, Math.sin(a) * 120,
        0.45, 12, 3, AMBER, true, 0.95, 0, 1.5, 0, 4);
    }
  }

  settledPuff(x: number, y: number): void {
    const n = Math.round(5 * this.q());
    for (let i = 0; i < n; i++) {
      const a = Math.PI + Math.random() * Math.PI; // upward hemisphere
      this.spawn(TEX_DOT, x, y, Math.cos(a) * 40, Math.sin(a) * 40,
        0.5, 6, 2, 0xaab6c4, false, 0.5, -30, 1.5);
    }
  }
}
