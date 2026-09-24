// layers/milo.ts — the character rig. Procedural: white ball + two seam arcs +
// three dimples (the glyph) + brow-line eyes. Owns expression moods, blink,
// squash & stretch (launch/impact), aim anticipation, the orbit trail ribbon
// (pooled, colored by the slow-cyan -> fast-amber speed ramp), and spin driven
// by w.ball.spin.
//
// Face does NOT rotate with spin (character reads at all times); body detail
// (seams/dimples) does — that contrast is what sells "ball with a soul".

import { Container, Sprite } from 'pixi.js';
import type { SimEvent, World } from '../../sim/types';
import { MAX_LAUNCH_SPEED } from '../../sim/world';
import { clamp, expDamp, speedRamp } from '../core';
import { miloTextures, TexFactory } from '../textures';
import type { MiloMood } from '../api';

const VIS_R = 11.5; // visual radius (sim collision radius is 10 — slight oversize reads friendly)
const TRAIL_N = 26;
const TRAIL_DT = 0.024;

export class MiloLayer {
  readonly container = new Container();
  private trailLayer = new Container();
  private root = new Container();
  private squashC = new Container();
  private body!: Sprite;
  private detail!: Sprite;
  private face = new Container();
  private eyeL!: Sprite;
  private eyeR!: Sprite;
  private browL!: Sprite;
  private browR!: Sprite;
  private trail: Sprite[] = [];
  private tX = new Float32Array(TRAIL_N);
  private tY = new Float32Array(TRAIL_N);
  private tSpd = new Float32Array(TRAIL_N);
  private tClock = 0;
  private trailOn = false;

  private t = 0;
  private tf: TexFactory;
  private textures!: ReturnType<typeof miloTextures>;
  private override: MiloMood | null = null;
  private impactT = 0;
  private impactMag = 0;
  private impactNX = 0;
  private impactNY = 0;
  private joyT = 0;
  private stretch = 0;
  private stretchAng = 0;
  private blinkT = 2.4;
  private blinkPhase = 0; // 0..1 while blinking
  private leanX = 0;
  private leanY = 0;
  private eyeScaleY = 1;
  private hidden = false;

  constructor(tex: TexFactory) {
    this.tf = tex;
    this.textures = miloTextures(tex);
    this.build();
  }

  private build(): void {
    const tx = this.textures;
    this.body = new Sprite(tx.body);
    this.body.anchor.set(0.5);
    const s = VIS_R / 40; // texture body radius = 40px
    this.body.scale.set(s);
    this.detail = new Sprite(tx.detail);
    this.detail.anchor.set(0.5);
    this.detail.scale.set(s);

    const eyeScale = 0.34; // 36x44 px source -> ~12px eyes on a 23px ball
    this.eyeL = new Sprite(tx.eyeOpen);
    this.eyeR = new Sprite(tx.eyeOpen);
    for (const e of [this.eyeL, this.eyeR]) {
      e.anchor.set(0.5);
      e.scale.set(eyeScale);
    }
    this.eyeL.position.set(-4.6, -1.2);
    this.eyeR.position.set(4.6, -1.2);
    const browScale = 0.3;
    this.browL = new Sprite(tx.brow);
    this.browR = new Sprite(tx.brow);
    for (const b of [this.browL, this.browR]) {
      b.anchor.set(0.5);
      b.scale.set(browScale);
      b.tint = 0x2c2f38;
    }
    this.browL.position.set(-4.6, -6.2);
    this.browR.position.set(4.6, -6.2);

    this.face.addChild(this.eyeL, this.eyeR, this.browL, this.browR);
    this.squashC.addChild(this.body, this.detail, this.face);
    this.root.addChild(this.squashC);
    this.root.visible = false;
    this.container.addChild(this.trailLayer, this.root);

    // pooled trail ribbon
    const trailTex = this.tf.streak(64, 10);
    for (let i = 0; i < TRAIL_N; i++) {
      const sp = new Sprite(trailTex);
      sp.anchor.set(0.5);
      sp.alpha = 0;
      this.trailLayer.addChild(sp);
      this.trail.push(sp);
    }
  }

  reset(x: number, y: number): void {
    this.root.visible = true;
    this.hidden = false;
    this.root.alpha = 1;
    this.root.x = x;
    this.root.y = y;
    this.root.rotation = 0;
    this.squashC.scale.set(1);
    this.impactT = 0;
    this.joyT = 0;
    this.stretch = 0;
    this.trailOn = false;
    for (const sp of this.trail) sp.alpha = 0;
  }

  onEvent(e: SimEvent, w: World): void {
    switch (e.type) {
      case 'launch': {
        const spd = Math.hypot(e.vx, e.vy);
        this.stretch = clamp(spd / MAX_LAUNCH_SPEED, 0, 1) * 0.4;
        this.stretchAng = Math.atan2(e.vy, e.vx);
        this.trailOn = true;
        this.tClock = 0;
        // seed the ribbon at the launch point so it doesn't streak from origin
        for (let i = 0; i < TRAIL_N; i++) {
          this.tX[i] = e.x;
          this.tY[i] = e.y;
          this.tSpd[i] = spd;
        }
        break;
      }
      case 'bounce': {
        this.impactT = 0.42;
        this.impactMag = clamp(e.speed / 500, 0.12, 0.42);
        // approximate impact normal: away from the nearest body surface
        let nx = 0;
        let ny = 0;
        let best = 1e9;
        for (const b of w.bodies) {
          if (b.radius <= 0) continue;
          const d = Math.hypot(e.x - b.cx, e.y - b.cy);
          const gap = Math.abs(d - (b.radius + 10));
          if (gap < best) {
            best = gap;
            nx = (e.x - b.cx) / (d || 1);
            ny = (e.y - b.cy) / (d || 1);
          }
        }
        this.impactNX = nx;
        this.impactNY = ny;
        break;
      }
      case 'sink':
        this.joyT = 2.6;
        this.trailOn = false;
        break;
      case 'settled':
      case 'hazard':
      case 'voided':
        this.trailOn = false;
        if (e.type === 'hazard' || e.type === 'voided') this.hidden = true;
        break;
    }
  }

  setMiloMood(mood: MiloMood | null): void {
    this.override = mood;
  }

  /** Aim state for anticipation (lean back + squint). */
  setAimState(active: boolean, dirX: number, dirY: number, power01: number): void {
    if (active) {
      this.leanX = -dirX * 5 * power01;
      this.leanY = -dirY * 5 * power01;
    } else {
      this.leanX = 0;
      this.leanY = 0;
    }
  }

  update(w: World, dt: number): void {
    this.t += dt;
    const b = w.ball;

    // a new stroke revives Milo (startStroke cleared dead without a rebuild)
    if (this.hidden && !b.dead) this.hidden = false;

    if (this.hidden) {
      this.root.alpha = expDamp(this.root.alpha, 0, 8, dt);
      for (const sp of this.trail) sp.alpha = expDamp(sp.alpha, 0, 8, dt);
      if (this.root.alpha < 0.02) this.root.visible = false;
      return;
    }
    this.root.visible = true;
    this.root.alpha = expDamp(this.root.alpha, 1, 8, dt);

    // --- position (+ hover wobble by mood, applied to face/root, not physics)
    this.root.x = b.x;
    this.root.y = b.y;

    // --- mood resolution: override > transient > sim-derived
    this.impactT = Math.max(0, this.impactT - dt);
    this.joyT = Math.max(0, this.joyT - dt);
    const speed = Math.hypot(b.vx, b.vy);
    let mood: MiloMood;
    if (this.override) mood = this.override;
    else if (this.impactT > 0) mood = 'impact';
    else if (this.joyT > 0) mood = 'joy';
    else if (b.dead || (b.settled && !b.flying)) mood = 'dizzy';
    else if (b.flying && speed > 600) mood = 'panic';
    else if (this.aimActive) mood = 'aim';
    else if (this.nearFragment(w)) mood = 'curious';
    else mood = 'idle';

    // --- squash & stretch
    this.stretch = expDamp(this.stretch, 0, 3.2, dt);
    const impact = this.impactT > 0 ? (this.impactT / 0.42) * this.impactMag : 0;
    this.squashC.rotation = this.impactT > 0
      ? Math.atan2(this.impactNY, this.impactNX)
      : this.stretchAng;
    const st = this.stretch;
    this.squashC.scale.set(
      (1 + st) * (1 - impact * 0.45),
      (1 - st * 0.75) * (1 + impact * 0.32),
    );

    // --- idle wobble / panic shake / dizzy tilt
    if (mood === 'panic') {
      this.root.x += Math.sin(this.t * 21) * 1.7;
      this.root.y += Math.cos(this.t * 17.3) * 1.4;
    } else if (mood === 'dizzy') {
      this.root.rotation = Math.sin(this.t * 2.2) * 0.16;
      this.root.y += Math.sin(this.t * 3.1) * 0.6;
    } else if (!b.flying) {
      this.root.y += Math.sin(this.t * 2.1) * 0.9; // gentle hover
      this.root.rotation = Math.sin(this.t * 1.3) * 0.03;
    } else {
      this.root.rotation = 0;
    }

    // --- aim anticipation lean
    const leanTargetX = this.aimActive ? this.leanX : 0;
    const leanTargetY = this.aimActive ? this.leanY : 0;
    this.face.x = expDamp(this.face.x, leanTargetX, 10, dt);
    this.face.y = expDamp(this.face.y, leanTargetY, 10, dt);

    // --- spin: sim's visual roll accumulator drives seams + dimples
    this.detail.rotation = b.spin;

    // --- eyes by mood (+ blink)
    const tx = this.textures;
    let eyeTex = tx.eyeOpen;
    let browRot = 0;
    let browY = -6.2;
    let faceTilt = 0;
    let eyeScale = 0.34;
    switch (mood) {
      case 'panic':
        eyeTex = tx.eyeWide;
        browRot = 0.22;
        browY = -7.2;
        break;
      case 'aim':
        eyeTex = tx.eyeSquint;
        browRot = -0.28;
        browY = -5.2;
        break;
      case 'impact':
        eyeTex = tx.eyeWide;
        browY = -6.8;
        eyeScale = 0.3;
        break;
      case 'joy':
        eyeTex = tx.eyeHappy;
        browRot = -0.12;
        browY = -7;
        break;
      case 'dizzy':
        eyeTex = tx.eyeSpiral;
        browRot = 0.1;
        browY = -6;
        break;
      case 'curious':
        eyeTex = tx.eyeOpen;
        faceTilt = 0.16;
        browY = -7.4;
        break;
      default:
        eyeTex = tx.eyeOpen;
    }
    this.eyeL.texture = eyeTex;
    this.eyeR.texture = eyeTex;
    this.face.rotation = faceTilt;
    this.browL.rotation = -browRot;
    this.browR.rotation = browRot;
    this.browL.y = browY;
    this.browR.y = browY;

    // blink (idle/curious only; squint/happy already closed shapes)
    let targetEyeScaleY = 1;
    if (mood === 'idle' || mood === 'curious' || mood === 'panic') {
      this.blinkT -= dt;
      if (this.blinkT <= 0) {
        this.blinkPhase = 1;
        this.blinkT = 2.4 + Math.random() * 2.8;
      }
      if (this.blinkPhase > 0) {
        this.blinkPhase = Math.max(0, this.blinkPhase - dt / 0.16);
        // sin(pi*t) blink curve: 1 -> 0.12 -> 1, no discontinuity at the ends
        const t = 1 - this.blinkPhase;
        targetEyeScaleY = 1 - 0.88 * Math.sin(Math.PI * t);
      }
    }
    this.eyeScaleY = expDamp(this.eyeScaleY, targetEyeScaleY, 30, dt);
    this.eyeL.scale.y = eyeScale * this.eyeScaleY;
    this.eyeR.scale.y = eyeScale * this.eyeScaleY;
    this.eyeL.scale.x = eyeScale;
    this.eyeR.scale.x = eyeScale;

    // --- orbit trail ribbon
    if (this.trailOn && b.flying) {
      this.tClock += dt;
      if (this.tClock >= TRAIL_DT) {
        this.tClock = 0;
        for (let i = TRAIL_N - 1; i > 0; i--) {
          this.tX[i] = this.tX[i - 1];
          this.tY[i] = this.tY[i - 1];
          this.tSpd[i] = this.tSpd[i - 1];
        }
        this.tX[0] = b.x;
        this.tY[0] = b.y;
        this.tSpd[0] = speed;
      }
      for (let i = 0; i < TRAIL_N - 1; i++) {
        const sp = this.trail[i];
        const x0 = this.tX[i];
        const y0 = this.tY[i];
        const x1 = this.tX[i + 1];
        const y1 = this.tY[i + 1];
        const dx = x1 - x0;
        const dy = y1 - y0;
        const d = Math.hypot(dx, dy);
        if (d < 0.5) {
          sp.alpha = 0;
          continue;
        }
        sp.x = (x0 + x1) * 0.5;
        sp.y = (y0 + y1) * 0.5;
        sp.rotation = Math.atan2(dy, dx);
        sp.width = Math.max(6, d);
        sp.height = 3.4;
        const age = 1 - i / TRAIL_N;
        sp.tint = speedRamp(this.tSpd[i] / MAX_LAUNCH_SPEED);
        sp.alpha = 0.5 * age * age;
      }
    } else {
      for (let i = 0; i < TRAIL_N - 1; i++) {
        this.trail[i].alpha = expDamp(this.trail[i].alpha, 0, 10, dt);
      }
    }
  }

  private aimActive = false;
  markAim(active: boolean): void {
    this.aimActive = active;
  }

  private nearFragment(w: World): boolean {
    if (w.ball.flying) return false;
    for (const f of w.fragments) {
      if (!f.taken && Math.hypot(w.ball.x - f.x, w.ball.y - f.y) < 130) return true;
    }
    return false;
  }
}
