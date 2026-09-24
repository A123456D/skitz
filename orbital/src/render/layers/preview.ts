// layers/preview.ts — the prediction & aim read-out. Dotted trajectory with
// speed-ramped dots (same cyan->amber ramp as the orbit trail — one visual
// language), terminator markers per prediction end, and the aim arrow with
// 25%-power tick marks. All sprite-pooled; the game may push new preview data
// every frame without allocating.

import { Container, Graphics, Sprite } from 'pixi.js';
import type { PredPoint } from '../../sim';
import { clamp, mixRGB, speedRamp } from '../core';
import { AMBER, DANGER, GREEN_WARM, TexFactory } from '../textures';

const MAX_POINTS = 160;
const MAX_DOTS = 56;

export class PreviewLayer {
  readonly container = new Container();
  private dots: Sprite[] = [];
  private px = new Float32Array(MAX_POINTS);
  private py = new Float32Array(MAX_POINTS);
  private ps = new Float32Array(MAX_POINTS);
  private pCount = 0;
  private end: string | null = null;
  private t = 0;

  private flagC = new Container();
  private flagPop = 0;
  private deadX!: Sprite;
  private restDot!: Sprite;

  private aimC = new Container();
  private aimShaft!: Sprite;
  private aimHead!: Sprite;
  private aimTicks: Sprite[] = [];
  private aimActive = false;
  private aimDx = 1;
  private aimDy = 0;
  private aimPower = 0;

  constructor(tex: TexFactory) {
    const dotTex = tex.dot(24);
    for (let i = 0; i < MAX_DOTS; i++) {
      const sp = new Sprite(dotTex);
      sp.anchor.set(0.5);
      sp.visible = false;
      this.container.addChild(sp);
      this.dots.push(sp);
    }

    // end marker: sunk = a little flag that pops in
    const pole = new Graphics();
    pole.rect(-1, -30, 2, 34).fill({ color: 0xd8d2c4, alpha: 0.95 });
    const flagSprite = new Sprite(tex.flag(30, 20));
    flagSprite.anchor.set(0, 0.5);
    flagSprite.tint = GREEN_WARM;
    flagSprite.position.set(1, -22);
    this.flagC.addChild(pole, flagSprite);
    this.flagC.visible = false;
    this.container.addChild(this.flagC);

    this.deadX = new Sprite(tex.xMark(40));
    this.deadX.anchor.set(0.5);
    this.deadX.tint = DANGER;
    this.deadX.visible = false;
    this.container.addChild(this.deadX);

    this.restDot = new Sprite(tex.ringThin(48, 5));
    this.restDot.anchor.set(0.5);
    this.restDot.tint = 0xdfe8f2;
    this.restDot.visible = false;
    this.container.addChild(this.restDot);

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

  update(dt: number, ballX: number, ballY: number): void {
    this.t += dt;

    // --- trajectory dots
    let di = 0;
    if (this.pCount > 1) {
      const step = Math.max(1, Math.ceil(this.pCount / MAX_DOTS));
      for (let i = 0; i < this.pCount && di < MAX_DOTS; i += step) {
        const sp = this.dots[di++];
        sp.visible = true;
        sp.x = this.px[i];
        sp.y = this.py[i];
        const t01 = clamp(this.ps[i] / 900, 0, 1);
        sp.tint = speedRamp(t01);
        const fade = 1 - (i / this.pCount) * 0.45;
        sp.alpha = 0.85 * fade;
        sp.width = sp.height = 5 + t01 * 3;
      }
    }
    for (; di < MAX_DOTS; di++) this.dots[di].visible = false;

    // --- end marker at the last point
    const showEnd = this.pCount > 0 && this.end !== null;
    const ex = this.pCount > 0 ? this.px[this.pCount - 1] : 0;
    const ey = this.pCount > 0 ? this.py[this.pCount - 1] : 0;
    this.flagC.visible = showEnd && this.end === 'sunk';
    this.deadX.visible = showEnd && this.end === 'dead';
    this.restDot.visible = showEnd && this.end === 'settled';
    if (this.flagC.visible) {
      this.flagPop = Math.min(1, this.flagPop + dt * 3.2);
      this.flagC.x = ex;
      this.flagC.y = ey;
      const pop = 1 + (1 - this.flagPop) * 1.4;
      this.flagC.scale.set(pop);
      this.flagC.alpha = this.flagPop;
    } else {
      this.flagPop = 0;
    }
    if (this.deadX.visible) {
      this.deadX.x = ex;
      this.deadX.y = ey;
      this.deadX.rotation = Math.sin(this.t * 5) * 0.08;
      this.deadX.alpha = 0.6 + 0.3 * Math.sin(this.t * 7);
    }
    if (this.restDot.visible) {
      this.restDot.x = ex;
      this.restDot.y = ey;
      const p = 0.5 + 0.5 * Math.sin(this.t * 3.4);
      this.restDot.width = this.restDot.height = 12 + p * 5;
      this.restDot.alpha = 0.4 + p * 0.35;
    }

    // --- aim arrow anchored at the ball (components placed in world axes)
    this.aimC.visible = this.aimActive;
    if (!this.aimActive) return;
    const len = 34 + this.aimPower * 150;
    const ang = Math.atan2(this.aimDy, this.aimDx);
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    const col = mixRGB(0xffffff, AMBER, this.aimPower);
    this.aimC.x = ballX;
    this.aimC.y = ballY;
    this.aimShaft.rotation = ang;
    this.aimShaft.x = 18 * c;
    this.aimShaft.y = 18 * s;
    this.aimShaft.width = len;
    this.aimShaft.height = 6;
    this.aimShaft.tint = col;
    this.aimShaft.alpha = 0.85;
    this.aimHead.x = (26 + len) * c;
    this.aimHead.y = (26 + len) * s;
    this.aimHead.rotation = ang;
    this.aimHead.tint = col;
    this.aimHead.alpha = 0.95;
    for (let i = 0; i < 3; i++) {
      const tick = this.aimTicks[i];
      const d = 18 + len * 0.25 * (i + 1);
      tick.x = d * c;
      tick.y = d * s;
      tick.rotation = ang + Math.PI / 2; // perpendicular to the shaft
      tick.width = 3.5;
      tick.height = 14;
      tick.alpha = 0.7;
      tick.tint = col;
    }
  }
}
