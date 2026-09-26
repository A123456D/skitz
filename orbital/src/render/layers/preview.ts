// layers/preview.ts — the prediction & aim read-out. Designed to be
// UNMISSABLE at gameplay zoom (polish pass): every dot is sized in SCREEN
// space (>=5.5px regardless of camera zoom), rides on an additive glow halo
// for contrast over both dark skies and the region sun, and the end markers
// (flag pop / red x / rest dot) are screen-scaled and high-contrast.
// All sprite-pooled; the game may push new preview data every frame without
// allocating.

import { Container, Graphics, Sprite } from 'pixi.js';
import type { PredPoint } from '../../sim';
import { clamp, mixRGB, speedRamp } from '../core';
import { AMBER, DANGER, GREEN_WARM, TexFactory } from '../textures';

const MAX_POINTS = 160;
const MAX_DOTS = 56;
const MIN_DOT_PX = 5.5; // screen-space floor — never faint at any zoom
                        // (bumped for phone landscape: 390px-tall screens)

export class PreviewLayer {
  readonly container = new Container();
  private glowDots: Sprite[] = [];   // additive halos, behind the cores
  private dots: Sprite[] = [];
  private px = new Float32Array(MAX_POINTS);
  private py = new Float32Array(MAX_POINTS);
  private ps = new Float32Array(MAX_POINTS);
  private pCount = 0;
  private end: string | null = null;
  private t = 0;

  private endGlow = new Sprite();    // one halo behind whichever marker is live
  private flagC = new Container();
  private flagPop = 0;
  private deadX!: Sprite;
  private restRing!: Sprite;
  private restCore!: Sprite;

  private aimC = new Container();
  private aimShaft!: Sprite;
  private aimHead!: Sprite;
  private aimTicks: Sprite[] = [];
  private aimActive = false;
  private aimDx = 1;
  private aimDy = 0;
  private aimPower = 0;

  constructor(tex: TexFactory) {
    const glowTex = tex.glow(64);
    const dotTex = tex.dot(24);
    // halos first (drawn under the cores)
    for (let i = 0; i < MAX_DOTS; i++) {
      const sp = new Sprite(glowTex);
      sp.anchor.set(0.5);
      sp.visible = false;
      sp.blendMode = 'add';
      this.container.addChild(sp);
      this.glowDots.push(sp);
    }
    for (let i = 0; i < MAX_DOTS; i++) {
      const sp = new Sprite(dotTex);
      sp.anchor.set(0.5);
      sp.visible = false;
      this.container.addChild(sp);
      this.dots.push(sp);
    }

    // end-marker halo (behind whichever marker is live)
    this.endGlow.texture = glowTex;
    this.endGlow.anchor.set(0.5);
    this.endGlow.blendMode = 'add';
    this.endGlow.visible = false;
    this.container.addChild(this.endGlow);

    // end marker: sunk = a little flag that pops in
    const pole = new Graphics();
    pole.rect(-1, -30, 2, 34).fill({ color: 0xf2ecdc, alpha: 1 });
    pole.rect(-2.2, -31, 4.4, 3).fill({ color: 0x2c2f38, alpha: 0.9 }); // cap
    const flagSprite = new Sprite(tex.flag(30, 20));
    flagSprite.anchor.set(0, 0.5);
    flagSprite.tint = GREEN_WARM;
    flagSprite.position.set(1, -22);
    this.flagC.addChild(pole, flagSprite);
    this.flagC.visible = false;
    this.container.addChild(this.flagC);

    this.deadX = new Sprite(tex.xMark(40));
    this.deadX.anchor.set(0.5);
    this.deadX.tint = 0xff4632; // brighter danger red for contrast
    this.deadX.visible = false;
    this.container.addChild(this.deadX);

    // rest marker: bright ring + solid core ("the ball will stop here")
    this.restRing = new Sprite(tex.ringThin(48, 6));
    this.restRing.anchor.set(0.5);
    this.restRing.tint = 0xf2f6fa;
    this.restRing.visible = false;
    this.container.addChild(this.restRing);
    this.restCore = new Sprite(tex.dot(24));
    this.restCore.anchor.set(0.5);
    this.restCore.tint = 0xffffff;
    this.restCore.visible = false;
    this.container.addChild(this.restCore);

    // aim arrow: shaft + head + 25% ticks, all placed in world axes
    this.aimShaft = new Sprite(tex.streak(64, 12));
    this.aimShaft.anchor.set(0, 0.5);
    this.aimHead = new Sprite(tex.chevron(30));
    this.aimHead.anchor.set(0.5);
    for (let i = 0; i < 3; i++) {
      const tick = new Sprite(tex.streak(12, 4));
      tick.anchor.set(0.5);
      this.aimTicks.push(tick);
      this.aimC.addChild(tick);
    }
    this.aimC.addChild(this.aimShaft);
    this.aimC.addChild(this.aimHead);
    this.aimC.visible = false;
    this.container.addChild(this.aimC);
  }

  setPreview(points: PredPoint[] | null, end: string | null): void {
    if (!points || points.length === 0) {
      this.pCount = 0;
      this.end = null;
      return;
    }
    const n = Math.min(points.length, MAX_POINTS);
    for (let i = 0; i < n; i++) {
      this.px[i] = points[i].x;
      this.py[i] = points[i].y;
      this.ps[i] = points[i].speed;
    }
    this.pCount = n;
    this.end = end;
  }

  setAim(active: boolean, dirX: number, dirY: number, power01: number): void {
    this.aimActive = active;
    if (!active) return;
    const l = Math.hypot(dirX, dirY) || 1;
    this.aimDx = dirX / l;
    this.aimDy = dirY / l;
    this.aimPower = clamp(power01, 0, 1);
  }

  update(dt: number, ballX: number, ballY: number, camScale: number): void {
    this.t += dt;
    // Screen-space sizing: world size = desired px / zoom, so dots never get
    // lost when the bounds framing zooms out or the aim zoom punches in.
    const inv = 1 / Math.max(camScale, 1e-4);

    // --- trajectory dots (halo + bright core)
    let di = 0;
    if (this.pCount > 1) {
      const step = Math.max(1, Math.ceil(this.pCount / MAX_DOTS));
      for (let i = 0; i < this.pCount && di < MAX_DOTS; i += step) {
        const t01 = clamp(this.ps[i] / 900, 0, 1);
        const corePx = MIN_DOT_PX + t01 * 2.5;
        const glowPx = corePx * 2.7;
        const core = this.dots[di];
        const halo = this.glowDots[di];
        di++;
        core.visible = halo.visible = true;
        core.x = halo.x = this.px[i];
        core.y = halo.y = this.py[i];
        // slightly white-lifted ramp keeps the cyan/amber language but reads
        // over both dark skies and the sun glow (halo is additive there)
        core.tint = mixRGB(speedRamp(t01), 0xffffff, 0.12);
        core.width = core.height = corePx * inv;
        core.alpha = 1;
        halo.tint = core.tint;
        halo.width = halo.height = glowPx * inv;
        halo.alpha = 0.34 + (i / this.pCount) * 0.1;
      }
    }
    for (; di < MAX_DOTS; di++) {
      this.dots[di].visible = false;
      this.glowDots[di].visible = false;
    }

    // --- end marker at the last point (screen-scaled, high contrast)
    const showEnd = this.pCount > 0 && this.end !== null;
    const ex = this.pCount > 0 ? this.px[this.pCount - 1] : 0;
    const ey = this.pCount > 0 ? this.py[this.pCount - 1] : 0;
    const isSunk = showEnd && this.end === 'sunk';
    const isDead = showEnd && this.end === 'dead';
    const isRest = showEnd && this.end === 'settled';
    this.flagC.visible = isSunk;
    this.deadX.visible = isDead;
    this.restRing.visible = isRest;
    this.restCore.visible = isRest;
    this.endGlow.visible = showEnd;

    if (showEnd) {
      this.endGlow.x = ex;
      this.endGlow.y = ey;
      this.endGlow.tint = isSunk ? GREEN_WARM : isDead ? DANGER : 0xdfe8f2;
      this.endGlow.width = this.endGlow.height = (isRest ? 70 : 95) * inv;
      this.endGlow.alpha = isSunk ? 0.45 : 0.35;
    }

    if (isSunk) {
      this.flagPop = Math.min(1, this.flagPop + dt * 3.2);
      this.flagC.x = ex;
      this.flagC.y = ey;
      const pop = (1 + (1 - this.flagPop) * 1.4) * 1.15 * inv;
      this.flagC.scale.set(pop);
      this.flagC.alpha = this.flagPop;
    } else {
      this.flagPop = 0;
    }
    if (isDead) {
      this.deadX.x = ex;
      this.deadX.y = ey;
      const s = (1 + Math.sin(this.t * 5) * 0.06) * 1.2 * inv;
      this.deadX.width = this.deadX.height = 40 * s;
      this.deadX.rotation = Math.sin(this.t * 5) * 0.08;
      this.deadX.alpha = 0.85 + 0.15 * Math.sin(this.t * 7);
    }
    if (isRest) {
      const p = 0.5 + 0.5 * Math.sin(this.t * 3.4);
      this.restRing.x = this.restCore.x = ex;
      this.restRing.y = this.restCore.y = ey;
      this.restRing.width = this.restRing.height = (16 + p * 6) * inv;
      this.restRing.alpha = 0.7 + p * 0.3;
      this.restCore.width = this.restCore.height = 7 * inv;
      this.restCore.alpha = 1;
    }

    // --- aim arrow anchored at the ball (screen-space like the dots: at the
    // phone bounds zoom (~0.25) the old world-space sizes were ~1px thin)
    this.aimC.visible = this.aimActive;
    if (!this.aimActive) return;
    const len = (26 + this.aimPower * 110) * inv; // css px along the aim axis
    const ang = Math.atan2(this.aimDy, this.aimDx);
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    const col = mixRGB(0xffffff, AMBER, this.aimPower);
    this.aimC.x = ballX;
    this.aimC.y = ballY;
    this.aimShaft.rotation = ang;
    this.aimShaft.x = 18 * inv * c;
    this.aimShaft.y = 18 * inv * s;
    this.aimShaft.width = len;
    this.aimShaft.height = 6 * inv;
    this.aimShaft.tint = col;
    this.aimShaft.alpha = 0.85;
    this.aimHead.x = (26 * inv + len) * c;
    this.aimHead.y = (26 * inv + len) * s;
    this.aimHead.width = this.aimHead.height = 30 * inv;
    this.aimHead.rotation = ang;
    this.aimHead.tint = col;
    this.aimHead.alpha = 0.95;
    for (let i = 0; i < 3; i++) {
      const tick = this.aimTicks[i];
      const d = 18 * inv + len * 0.25 * (i + 1);
      tick.x = d * c;
      tick.y = d * s;
      tick.rotation = ang + Math.PI / 2; // perpendicular to the shaft
      tick.width = 3.5 * inv;
      tick.height = 14 * inv;
      tick.alpha = 0.7;
      tick.tint = col;
    }
  }
}
