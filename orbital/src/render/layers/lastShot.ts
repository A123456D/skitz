// layers/lastShot.ts — the previous stroke's ACTUAL flight path, drawn as a
// faint gravity-cyan dotted line so players can study the curve they just
// played against their next aim preview. Sits under the bodies and the lit
// green in z-order (world root inserts it right above zone weather).
// Pooled sprites + typed arrays: zero per-frame allocation.

import { Container, Sprite } from 'pixi.js';
import { clamp, RAMP_SLOW } from '../core';
import { TexFactory } from '../textures';

const MAX_DOTS = 220;
const DOT_PX = 2.5;      // screen-space dot size: reads on phones, never bold
const ALPHA_TEE = 0.4;   // strongest at the tee end (hard cap per contract)
const ALPHA_END = 0.1;   // fades out toward the landing end

export class LastShotLayer {
  readonly container = new Container();
  private dots: Sprite[] = [];
  private xs = new Float32Array(MAX_DOTS);
  private ys = new Float32Array(MAX_DOTS);
  private count = 0;
  private step = 1; // lite tier draws every 2nd recorded point

  constructor(tex: TexFactory) {
    const t = tex.dot(24);
    for (let i = 0; i < MAX_DOTS; i++) {
      const sp = new Sprite(t);
      sp.anchor.set(0.5);
      sp.visible = false;
      sp.tint = RAMP_SLOW; // gravity cyan — same language as slow preview speed
      this.container.addChild(sp);
      this.dots.push(sp);
    }
  }

  setQuality(tier: 'full' | 'lite'): void {
    this.step = tier === 'lite' ? 2 : 1;
  }

  /** Record a finished stroke (null clears). Decimates into the pool. */
  setLastShot(points: { x: number; y: number }[] | null): void {
    this.count = 0;
    if (!points || points.length < 2) return;
    const last = points.length - 1;
    const stride = Math.max(this.step, Math.ceil(points.length / MAX_DOTS));
    for (let i = 0; i < last; i += stride) {
      if (this.count >= MAX_DOTS) return;
      this.xs[this.count] = points[i].x;
      this.ys[this.count] = points[i].y;
      this.count++;
    }
    // always keep the landing point, even past the last stride multiple
    if (this.count < MAX_DOTS) {
      this.xs[this.count] = points[last].x;
      this.ys[this.count] = points[last].y;
      this.count++;
    }
  }

  /** Re-size/re-fade against the current camera zoom (called per frame). */
  update(camScale: number): void {
    const px = DOT_PX / Math.max(camScale, 1e-4);
    const n = this.count;
    for (let i = 0; i < n; i++) {
      const sp = this.dots[i];
      sp.visible = true;
      sp.x = this.xs[i];
      sp.y = this.ys[i];
      sp.width = sp.height = px;
      const t = n > 1 ? i / (n - 1) : 0;
      sp.alpha = clamp(ALPHA_TEE + (ALPHA_END - ALPHA_TEE) * t, 0, ALPHA_TEE);
    }
    for (let i = n; i < MAX_DOTS; i++) this.dots[i].visible = false;
  }
}
