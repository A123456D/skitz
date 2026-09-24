// layers/zones.ts — gravity zones as *legible weather*, not decoration (§3):
//   void    = desaturated dark disk, a "starfield hole", dust falls still
//   flipper = bright inverted ripples + arrows that read "gravity is flipped"
//   amp     = converging shimmer (field pulls harder here)
//   damp    = slow syrup drift
//   corridor= flowing streaks along the axis + arrowheads, masked to a capsule
// Everything animates via pooled sprites/tiling offsets — no per-frame redraws.

import { Container, Graphics, Sprite, TilingSprite } from 'pixi.js';
import type { World, ZoneState } from '../../sim/types';
import { expDamp, TAU } from '../core';
import { GRAVITY, TexFactory } from '../textures';

interface ZoneView {
  root: Container;
  kind: string;
  active: boolean;
  baseAlpha: number;
  // circular animated parts (ripple rings / dashes / blobs / arrows)
  parts: Sprite[];
  param: number[];
  // corridor
  tiling: TilingSprite | null;
  mask: Graphics | null;
  chevrons: Sprite[];
  chevronT: number[];
  ax: number;
  ay: number;
  bx: number;
  by: number;
  radius: number;
  axisLen: number;
  axisAngle: number;
  dir: number;
}

export class ZonesLayer {
  readonly container = new Container();
  private views: ZoneView[] = [];

  constructor(private tex: TexFactory) {}

  build(w: World): void {
    for (const v of this.views) v.root.destroy({ children: true });
    this.views.length = 0;
    for (const z of w.zones) {
      this.views.push(z.x !== undefined && z.y !== undefined && z.radius !== undefined
        ? this.buildCircular(z)
        : this.buildCorridor(z));
    }
  }

  private buildCircular(z: ZoneState): ZoneView {
    const root = new Container();
    const R = z.radius ?? 80;
    const view: ZoneView = {
      root, kind: z.kind, active: z.active, baseAlpha: 1,
      parts: [], param: [], tiling: null, mask: null, chevrons: [], chevronT: [],
      ax: 0, ay: 0, bx: 0, by: 0, radius: R, axisLen: 0, axisAngle: 0, dir: 1,
    };
    root.x = z.x ?? 0;
    root.y = z.y ?? 0;

    if (z.kind === 'void') {
      // deep dark pool, then a desaturated ring — the "hole" in the course
      const pool = new Sprite(this.tex.glow(128));
      pool.anchor.set(0.5);
      pool.tint = 0x020409;
      pool.alpha = 0.9;
      pool.width = R * 2.5;
      pool.height = R * 2.5;
      root.addChild(pool);
      const disk = new Sprite(this.tex.dot(64));
      disk.anchor.set(0.5);
      disk.tint = 0x0a0d14;
      disk.alpha = 0.8;
      disk.width = R * 2;
      disk.height = R * 2;
      root.addChild(disk);
      // frozen speckles — stars that "fell still" (drawn once, never animate)
      const speck = new Graphics();
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * TAU + i * 1.7;
        const d = R * (0.15 + ((i * 37) % 10) / 10 * 0.7);
        speck.circle(Math.cos(a) * d, Math.sin(a) * d, 1.3);
      }
      speck.fill({ color: 0xbcc6d4, alpha: 0.5 });
      root.addChild(speck);
      const ring = new Sprite(this.tex.ringThin(128, 3));
      ring.anchor.set(0.5);
      ring.tint = 0x8f9aa8;
      ring.width = R * 2;
      ring.height = R * 2;
      ring.alpha = 0.4;
      root.addChild(ring);
    } else {
      // shared boundary ring + faint fill
      const fill = new Sprite(this.tex.glow(128));
      fill.anchor.set(0.5);
      fill.width = R * 2;
      fill.height = R * 2;
      fill.alpha = z.kind === 'damp' ? 0.16 : 0.1;
      fill.tint = z.kind === 'flipper' ? 0xff9d7a : z.kind === 'amp' ? GRAVITY : 0x9fb2c8;
      root.addChild(fill);
      const ring = new Sprite(this.tex.ringThin(128, 2));
      ring.anchor.set(0.5);
      ring.width = R * 2;
      ring.height = R * 2;
      ring.tint = z.kind === 'flipper' ? 0xffb38a : z.kind === 'amp' ? GRAVITY : 0x9fb2c8;
      ring.alpha = 0.3;
      root.addChild(ring);

      if (z.kind === 'flipper') {
        // expanding bright ripples — "inverted color": white-hot, not cyan
        for (let i = 0; i < 2; i++) {
          const sp = new Sprite(this.tex.ringThin(128, 3));
          sp.anchor.set(0.5);
          sp.tint = 0xffffff;
          root.addChild(sp);
          view.parts.push(sp);
          view.param.push(i / 2);
        }
        // arrows pointing UP (gravity reversed) drifting upward
        for (let i = 0; i < 5; i++) {
          const sp = new Sprite(this.tex.chevron(28));
          sp.anchor.set(0.5);
          sp.tint = 0xffd0b8;
          sp.rotation = -Math.PI / 2;
          sp.scale.set(0.5);
          root.addChild(sp);
          view.parts.push(sp);
          view.param.push(i / 5);
        }
      } else if (z.kind === 'amp') {
        // converging shimmer: radial dashes falling inward
        for (let i = 0; i < 10; i++) {
          const sp = new Sprite(this.tex.streak(48, 8));
          sp.anchor.set(0.5);
          sp.tint = GRAVITY;
          root.addChild(sp);
          view.parts.push(sp);
          view.param.push((i / 10) % 1);
        }
      } else if (z.kind === 'damp') {
        // syrup: slow heavy blobs
        for (let i = 0; i < 5; i++) {
          const sp = new Sprite(this.tex.glow(64));
          sp.anchor.set(0.5);
          sp.tint = 0x9fb2c8;
          sp.scale.set(0.5 + (i % 3) * 0.2);
          root.addChild(sp);
          view.parts.push(sp);
          view.param.push(i / 5);
        }
      }
    }
    this.container.addChild(root);
    return view;
  }

  private buildCorridor(z: ZoneState): ZoneView {
    const root = new Container();
    const ax = z.a?.x ?? 0;
    const ay = z.a?.y ?? 0;
    const bx = z.b?.x ?? 0;
    const by = z.b?.y ?? 0;
    const R = z.corridorR ?? 60;
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.max(1, Math.hypot(dx, dy));
    const ang = Math.atan2(dy, dx);

    // capsule mask + outline (static Graphics)
    const outline = new Graphics();
    outline.moveTo(ax + Math.cos(ang + Math.PI / 2) * R, ay + Math.sin(ang + Math.PI / 2) * R);
    outline.arc(ax, ay, R, ang + Math.PI / 2, ang - Math.PI / 2);
    outline.lineTo(bx + Math.cos(ang - Math.PI / 2) * R, by + Math.sin(ang - Math.PI / 2) * R);
    outline.arc(bx, by, R, ang - Math.PI / 2, ang + Math.PI / 2);
    outline.closePath();
    outline.fill({ color: GRAVITY, alpha: 0.05 });
    outline.stroke({ width: 1.5, color: GRAVITY, alpha: 0.3 });

    // flowing streaks: one tiling sprite in corridor-local space, masked.
    // Position offset by -perp*R so the tiling's local y spans axis -R..+R.
    const tiling = new TilingSprite({ texture: this.tex.streak(128, 24), width: len, height: R * 2 });
    tiling.position.set(ax + Math.sin(ang) * R, ay - Math.cos(ang) * R);
    tiling.rotation = ang;
    tiling.alpha = 0.3;
    tiling.tint = GRAVITY;
    const mask = new Graphics();
    mask.moveTo(ax + Math.cos(ang + Math.PI / 2) * R, ay + Math.sin(ang + Math.PI / 2) * R);
    mask.arc(ax, ay, R, ang + Math.PI / 2, ang - Math.PI / 2);
    mask.lineTo(bx + Math.cos(ang - Math.PI / 2) * R, by + Math.sin(ang - Math.PI / 2) * R);
    mask.arc(bx, by, R, ang - Math.PI / 2, ang + Math.PI / 2);
    mask.closePath();
    mask.fill({ color: 0xffffff });
    tiling.mask = mask;

    root.addChild(mask, tiling, outline);

    const view: ZoneView = {
      root, kind: 'corridor', active: z.active, baseAlpha: 1,
      parts: [], param: [], tiling, mask, chevrons: [], chevronT: [],
      ax, ay, bx, by, radius: R, axisLen: len, axisAngle: ang, dir: z.dir ?? 1,
    };
    // arrowheads along the axis
    for (let i = 0; i < 3; i++) {
      const sp = new Sprite(this.tex.chevron(28));
      sp.anchor.set(0.5);
      sp.tint = GRAVITY;
      sp.rotation = ang;
      sp.scale.set(0.6);
      root.addChild(sp);
      view.chevrons.push(sp);
      view.chevronT.push(i / 3);
    }
    this.container.addChild(root);
    return view;
  }

  update(w: World, dt: number): void {
    for (let i = 0; i < w.zones.length; i++) {
      const z = w.zones[i];
      const v = this.views[i];
      if (!v) continue;
      v.active = z.active;
      // gated/inactive zones ghost out but stay faintly legible
      v.root.alpha = expDamp(v.root.alpha, z.active ? 1 : 0.1, 6, dt);
      if (v.root.alpha < 0.02) continue;

      const R = v.radius;
      if (v.kind === 'flipper') {
        for (let p = 0; p < 2; p++) {
          v.param[p] += dt * 0.5;
          if (v.param[p] > 1) v.param[p] -= 1;
          const f = v.param[p];
          v.parts[p].width = R * 2 * (0.15 + f * 0.85);
          v.parts[p].height = v.parts[p].width;
          v.parts[p].alpha = 0.4 * (1 - f);
        }
        for (let p = 2; p < v.parts.length; p++) {
          v.param[p] += dt * 0.35;
          if (v.param[p] > 1) v.param[p] -= 1;
          const f = v.param[p];
          const col = (p - 2) / 3 - 0.5;
          v.parts[p].x = col * R * 1.1;
          v.parts[p].y = R * 0.8 - f * R * 1.6;
          v.parts[p].alpha = 0.5 * Math.sin(f * Math.PI);
        }
      } else if (v.kind === 'amp') {
        for (let p = 0; p < v.parts.length; p++) {
          v.param[p] += dt * (0.25 + (p % 3) * 0.06);
          if (v.param[p] > 1) v.param[p] -= 1;
          const f = v.param[p];
          const a = (p / v.parts.length) * TAU;
          const r = R * (1.05 - f * 0.9);
          const sp = v.parts[p];
          sp.x = Math.cos(a) * r;
          sp.y = Math.sin(a) * r;
          sp.rotation = a; // streak aligned with the inward pull
          sp.alpha = 0.35 * (0.3 + f);
        }
      } else if (v.kind === 'damp') {
        for (let p = 0; p < v.parts.length; p++) {
          v.param[p] += dt * 0.06; // deliberately glacial
          const a = v.param[p] * TAU + p * 2.4;
          const r = R * 0.55 * (0.4 + (p % 3) * 0.3);
          const sp = v.parts[p];
          sp.x = Math.cos(a) * r;
          sp.y = Math.sin(a) * r * 0.8;
          sp.alpha = 0.12;
        }
      } else if (v.kind === 'corridor' && v.tiling) {
        const speed = 90 * v.dir;
        v.tiling.tilePosition.x -= speed * dt;
        for (let c = 0; c < v.chevrons.length; c++) {
          v.chevronT[c] += dt * 0.3 * v.dir;
          if (v.chevronT[c] > 1) v.chevronT[c] -= 1;
          if (v.chevronT[c] < 0) v.chevronT[c] += 1;
          const t = v.chevronT[c];
          v.chevrons[c].x = v.ax + (v.bx - v.ax) * t;
          v.chevrons[c].y = v.ay + (v.by - v.ay) * t;
          v.chevrons[c].alpha = 0.5 * Math.sin(t * Math.PI);
        }
      }
    }
  }
}
