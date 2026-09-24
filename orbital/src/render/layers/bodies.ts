// layers/bodies.ts — gravity sources. Each material gets a distinct silhouette
// and surface recipe (baked in textures.ts); this layer owns:
//   - terminator orientation (sprite rotated so baked light faces the region sun)
//   - influence rings that wake only while the ball is inside
//   - field drift particles whose DIRECTION reads the force (in = attractor,
//     out = repulsor) — gravity drawn honestly (§9 VFX)
//   - pulse breathing synced to the sim's mu curve, unstable flicker (render
//     Math.random only — never the sim RNG stream), motion trails, dormant gating

import { Container, Sprite } from 'pixi.js';
import type { World } from '../../sim/types';
import { clamp, expDamp, TAU } from '../core';
import { GRAVITY, TexFactory } from '../textures';

const BASE_TINT = 0xffffff;

interface BodyView {
  root: Container;
  sprite: Sprite;
  ring: Sprite;          // influence radius (dashed)
  spiky: Sprite | null;  // repulsor identity ring
  lock: Sprite | null;   // dormant glyph (gated + inactive)
  danger: Sprite | null; // deadly warning ring
  aura: Sprite | null;   // unstable surge glow
  baseScale: number;
  ringAlpha: number;
  drift: Sprite[];
  driftAngle: number[];
  driftFrac: number[];
  driftSpd: number[];
  trail: Sprite[];
  trailX: number[];
  trailY: number[];
  trailClock: number;
  moves: boolean;
  kind: string;
  pulsePeriod: number;
  pulsePhase: number;
  pulseMin: number;
  muBase: number;
}

export class BodiesLayer {
  readonly container = new Container();
  private views: BodyView[] = [];
  private t = 0;
  private quality: 'full' | 'lite' = 'full';
  private sunX = 0;
  private sunY = 0;

  constructor(private tex: TexFactory) {}

  build(w: World, sunX: number, sunY: number): void {
    this.sunX = sunX;
    this.sunY = sunY;
    for (const v of this.views) v.root.destroy({ children: true });
    this.views.length = 0;

    const n = w.bodies.length;
    // global drift-particle budget: fewer per body when the level is busy
    const perBody = this.quality === 'lite'
      ? clamp(Math.floor(70 / Math.max(1, n)), 1, 3)
      : clamp(Math.floor(140 / Math.max(1, n)), 2, 6);

    for (const b of w.bodies) {
      const root = new Container();
      const view: BodyView = {
        root,
        sprite: new Sprite(),
        ring: new Sprite(),
        spiky: null,
        lock: null,
        danger: null,
        aura: null,
        baseScale: 1,
        ringAlpha: 0.06,
        drift: [],
        driftAngle: [],
        driftFrac: [],
        driftSpd: [],
        trail: [],
        trailX: [],
        trailY: [],
        trailClock: 0,
        moves: b.path !== undefined,
        kind: b.kind,
        pulsePeriod: b.pulsePeriod ?? 3,
        pulsePhase: b.pulsePhase ?? 0,
        pulseMin: b.pulseMin ?? 0.35,
        muBase: b.mu || 1,
      };

      if (b.radius > 0) {
        const tex = this.tex.body(b.material, b.id, b.radius);
        // texture body radius = bucket/2 - 4 (4px pad baked in textures.ts)
        view.baseScale = b.radius / (tex.width / 2 - 4);
        view.sprite.texture = tex;
        view.sprite.anchor.set(0.5);
        view.sprite.scale.set(view.baseScale);
        root.addChild(view.sprite);

        // unstable bodies get an additive surge aura
        if (b.kind === 'unstable') {
          view.aura = new Sprite(this.tex.glow(128));
          view.aura.anchor.set(0.5);
          view.aura.blendMode = 'add';
          view.aura.tint = 0xffd9a0;
          view.aura.width = b.radius * 3.2;
          view.aura.height = b.radius * 3.2;
          root.addChildAt(view.aura, 0);
        }
      } else {
        // anchor: no planet — a small dashed marker ring (design §2)
        view.sprite.texture = this.tex.ringDashed(128, 14);
        view.sprite.anchor.set(0.5);
        view.sprite.tint = GRAVITY;
        const s = (b.influenceR * 0.16) / 128;
        view.baseScale = s; // update() re-applies scale every frame
        view.sprite.scale.set(s);
        view.sprite.alpha = 0.6;
        root.addChild(view.sprite);
      }

      // influence radius — nearly invisible until the ball enters it
      view.ring.texture = this.tex.ringDashed(256, 30);
      view.ring.anchor.set(0.5);
      view.ring.tint = GRAVITY;
      const rs = (b.influenceR * 2) / 256;
      view.ring.scale.set(rs);
      view.ring.alpha = view.ringAlpha;
      root.addChildAt(view.ring, 0);

      if (b.kind === 'repulsor') {
        view.spiky = new Sprite(this.tex.ringSpiky(256, 14));
        view.spiky.anchor.set(0.5);
        view.spiky.tint = GRAVITY;
        view.spiky.alpha = 0.3;
        const ss = (b.radius * 2.9) / 256;
        view.spiky.scale.set(ss);
        root.addChildAt(view.spiky, 0);
      }

      if (b.deadly) {
        view.danger = new Sprite(this.tex.ringThin(128, 4));
        view.danger.anchor.set(0.5);
        view.danger.tint = 0xff5a3c;
        view.danger.alpha = 0.4;
        const ds = (b.radius * 2.24) / 128;
        view.danger.scale.set(ds);
        root.addChild(view.danger);
      }

      if (b.gate) {
        view.lock = new Sprite(this.tex.lock(40));
        view.lock.anchor.set(0.5);
        view.lock.tint = 0xd8c8a8;
        view.lock.alpha = 0.85;
        view.lock.scale.set(clamp(b.radius * 0.05, 0.35, 0.8));
        view.lock.y = -b.radius - 26;
        root.addChild(view.lock);
      }

      // field drift particles — the gravity vector made visible
      const driftTex = this.tex.dot(16);
      for (let i = 0; i < perBody; i++) {
        const sp = new Sprite(driftTex);
        sp.anchor.set(0.5);
        sp.tint = GRAVITY;
        sp.alpha = 0;
        const s = clamp(b.radius * 0.05, 0.06, 0.22);
        sp.scale.set(s);
        root.addChildAt(sp, 0);
        view.drift.push(sp);
        view.driftAngle.push((i / perBody) * TAU + Math.random());
        view.driftFrac.push(Math.random());
        view.driftSpd.push(0.35 + Math.random() * 0.4);
      }

      // motion trail ghosts for path/orbit bodies
      if (view.moves) {
        const trailTex = this.tex.glow(32);
        for (let i = 0; i < 5; i++) {
          const sp = new Sprite(trailTex);
          sp.anchor.set(0.5);
          sp.tint = BASE_TINT;
          sp.alpha = 0;
          sp.scale.set(clamp(b.radius / 40, 0.25, 1.1));
          this.container.addChild(sp); // trails live at world pos, not in root
          view.trail.push(sp);
          view.trailX.push(b.cx);
          view.trailY.push(b.cy);
        }
      }

      this.container.addChild(root);
      this.views.push(view);
    }
  }

  setQuality(q: 'full' | 'lite'): void {
    this.quality = q;
  }

  update(w: World, dt: number): void {
    this.t += dt;
    const ball = w.ball;
    const lite = this.quality === 'lite';

    for (let i = 0; i < w.bodies.length; i++) {
      const b = w.bodies[i];
      const v = this.views[i];
      if (!v) continue;
      v.root.x = b.cx;
      v.root.y = b.cy;

      // --- terminator: rotate so the baked +X light points at the region sun
      v.sprite.rotation = Math.atan2(this.sunY - b.cy, this.sunX - b.cx);

      // --- dormant gating: dim, desaturate, lock glyph bobbing
      const dormant = !b.active;
      if (v.lock) {
        v.lock.visible = dormant;
        v.lock.y = -b.radius - 26 + Math.sin(this.t * 1.6 + i) * 3;
        v.lock.rotation = Math.sin(this.t * 0.9 + i) * 0.08;
      }
      v.sprite.tint = dormant ? 0x878d99 : BASE_TINT; // desaturating tint
      v.ring.visible = !dormant || b.radius === 0;
      if (v.aura) v.aura.visible = !dormant;

      // --- influence ring wakes only when the ball is inside
      const d = Math.hypot(ball.x - b.cx, ball.y - b.cy);
      const inside = b.active && d < b.influenceR;
      v.ringAlpha = expDamp(v.ringAlpha, inside ? 0.3 : 0.055, 5, dt);
      v.ring.alpha = v.ringAlpha;
      v.ring.rotation += dt * 0.05;

      // --- per-kind behavior
      let scaleMul = 1;
      let mainAlpha = 1;
      if (b.kind === 'pulse' && b.active) {
        // breathe on the SAME curve as mu so the visual IS the physics
        const min = v.pulseMin;
        const f = (b.muCurrent / v.muBase - min) / (1 - min);
        scaleMul = 0.9 + 0.1 * clamp(f, 0, 1);
      } else if (b.kind === 'unstable' && b.active) {
        // render-only jitter: Math.random is allowed here (NOT the sim stream)
        const ratio = clamp(b.muCurrent / v.muBase, 0, 2);
        scaleMul = 0.92 + 0.12 * ratio + (Math.random() - 0.5) * 0.03;
        mainAlpha = 0.82 + Math.random() * 0.18;
        if (v.aura) {
          v.aura.alpha = (0.1 + 0.3 * Math.random()) * clamp(ratio, 0.2, 1.2);
          v.aura.rotation += dt * 0.4;
        }
      }
      v.sprite.scale.set(v.baseScale * scaleMul);
      v.sprite.alpha = mainAlpha * (dormant ? 0.42 : 1);

      if (v.spiky) {
        v.spiky.rotation -= dt * 0.25;
        v.spiky.alpha = dormant ? 0.08 : 0.22 + (inside ? 0.14 : 0);
      }
      if (v.danger) {
        v.danger.alpha = 0.25 + 0.2 * (0.5 + 0.5 * Math.sin(this.t * 6 + i));
        v.danger.rotation += dt * 0.1;
      }

      // --- field drift particles: direction = force (§9)
      if (b.active && b.muCurrent > 0) {
        const inward = v.kind !== 'repulsor';
        const r0 = b.radius * 1.3 + 6;
        const r1 = Math.min(b.influenceR * 0.85, b.radius + 190);
        const speedMul = lite ? 0.7 : 1;
        for (let p = 0; p < v.drift.length; p++) {
          v.driftAngle[p] += dt * v.driftSpd[p] * 0.5;
          // frac cycles 1->0 (falling in) or 0->1 (blown out)
          v.driftFrac[p] += (inward ? -1 : 1) * dt * v.driftSpd[p] * speedMul;
          if (v.driftFrac[p] > 1) v.driftFrac[p] -= 1;
          if (v.driftFrac[p] < 0) v.driftFrac[p] += 1;
          const f = v.driftFrac[p];
          const r = r0 + (r1 - r0) * f;
          const a = v.driftAngle[p];
          const sp = v.drift[p];
          sp.x = Math.cos(a) * r;
          sp.y = Math.sin(a) * r;
          // brighter near the body, ghosting out at the influence edge
          sp.alpha = (inward ? 0.5 * (1 - f) + 0.1 : 0.55 * f + 0.08) * (lite ? 0.7 : 1);
        }
      } else {
        for (const sp of v.drift) sp.alpha = 0;
      }

      // --- motion trail for moving bodies
      if (v.trail.length > 0) {
        v.trailClock += dt;
        if (v.trailClock > 0.055) {
          v.trailClock = 0;
          for (let s = v.trail.length - 1; s > 0; s--) {
            v.trailX[s] = v.trailX[s - 1];
            v.trailY[s] = v.trailY[s - 1];
          }
          v.trailX[0] = b.cx;
          v.trailY[0] = b.cy;
        }
        for (let s = 0; s < v.trail.length; s++) {
          const sp = v.trail[s];
          if (dormant) {
            sp.alpha = 0;
            continue;
          }
          sp.x = v.trailX[s];
          sp.y = v.trailY[s];
          sp.alpha = b.active ? 0.16 * (1 - s / v.trail.length) : 0;
        }
      }
    }
  }
}
