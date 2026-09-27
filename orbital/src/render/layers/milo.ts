// layers/milo.ts — the character rig. Procedural: white ball + two seam arcs +
// three dimples (the glyph) + brow-line eyes. Owns expression moods, blink,
// squash & stretch (launch/impact), aim anticipation, the orbit trail ribbon
// (pooled, colored by the slow-cyan -> fast-amber speed ramp), spin driven
// by w.ball.spin, and the 2.5D contact shadow (proximity-driven).
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
const MILO_MIN_R_PX = 4.6; // css-px floor on the on-screen radius (phone legibility:
                           // at the ~0.25 phone zoom Milo was a 5px speck)
const TRAIL_N = 26;
const TRAIL_DT = 0.024;

const RECOIL_END = 0.25; // launch recoil timeline length (seconds)

/**
 * Launch recoil curve: compress to 70% over the first 60ms (ease-out), then a
 * damped spring that overshoots to ~115% and settles back to 1 by 250ms.
 */
function recoilScale(t: number): number {
  if (t < 0.06) {
    const k = t / 0.06;
    return 1 - 0.3 * k * (2 - k);
  }
  const u = t - 0.06;
  return 1 - 0.3 * Math.cos(42 * u) * Math.exp(-9.3 * u);
}

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

  // --- field reaction: gravity stretch (springy), field-modulated roll,
  // launch recoil timeline, near-body flare arming, motion-blur ghost
  private gravStretch = 0;
  private gravVel = 0; // spring velocity for gravStretch
  private gravAng = 0;
  private gravSpin = 0;
  private recoilT = 999; // seconds since launch (999 = idle)
  private flareBodyId: string | null = null;
  flarePending = false; // consumed by index.ts -> vfx.nearFlare (zero-alloc handoff)
  flareX = 0;
  flareY = 0;
  flareVx = 0;
  flareVy = 0;
  private ghost!: Sprite;
  private ghostA = 0;

  // --- 2.5D contact shadow: an ellipse that slides toward the nearest body
  // surface, tightening/brightening as Milo closes in, fading in deep space
  private shadow!: Sprite;
  private shadowA = 0;

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

    // contact shadow (under everything in the rig)
    this.shadow = new Sprite(this.tf.glow(64));
    this.shadow.anchor.set(0.5);
    this.shadow.tint = 0x02100e; // near-black teal, matches body drop shadows
    this.shadow.alpha = 0;
    this.trailLayer.addChildAt(this.shadow, 0);

    // motion-blur ghost: ONE pooled body sprite, stretched along velocity
    this.ghost = new Sprite(tx.body);
    this.ghost.anchor.set(0.5);
    this.ghost.visible = false;
    this.trailLayer.addChild(this.ghost);
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
    this.gravStretch = 0;
    this.gravVel = 0;
    this.gravSpin = 0;
    this.recoilT = 999;
    this.flareBodyId = null;
    this.flarePending = false;
    this.ghostA = 0;
    this.ghost.visible = false;
    this.shadowA = 0;
    this.shadow.alpha = 0;
    for (const sp of this.trail) sp.alpha = 0;
  }

  onEvent(e: SimEvent, w: World): void {
    switch (e.type) {
      case 'launch': {
        const spd = Math.hypot(e.vx, e.vy);
        // launch reads as a fling: recoil timeline (compress -> overshoot ->
        // settle) owns the shape; skip the plain stretch channel
        this.recoilT = 0;
        this.stretch = 0;
        this.stretchAng = Math.atan2(e.vy, e.vx);
        this.flareBodyId = null; // new stroke re-arms near-body flares
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

  update(w: World, dt: number, camScale = 1): void {
    this.t += dt;
    const b = w.ball;

    // --- phone legibility: inflate root uniformly when the bounds zoom would
    // shrink Milo below the screen-radius floor (the small visual/collision
    // divergence this causes — <= ~2 css px at phone scale — reads fine)
    const rPx = VIS_R * camScale;
    const zoomComp = rPx > 0 && rPx < MILO_MIN_R_PX ? MILO_MIN_R_PX / rPx : 1;
    this.root.scale.set(zoomComp);

    // a new stroke revives Milo (startStroke cleared dead without a rebuild)
    if (this.hidden && !b.dead) this.hidden = false;

    if (this.hidden) {
      this.root.alpha = expDamp(this.root.alpha, 0, 8, dt);
      for (const sp of this.trail) sp.alpha = expDamp(sp.alpha, 0, 8, dt);
      this.ghostA = expDamp(this.ghostA, 0, 8, dt);
      this.ghost.visible = this.ghostA > 0.02;
      this.ghost.alpha = this.ghostA;
      this.shadowA = expDamp(this.shadowA, 0, 8, dt);
      this.shadow.visible = this.shadowA > 0.02;
      this.shadow.alpha = this.shadowA;
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

    // --- gravity reaction: nearest active field body at the ball drives a
    // subtle stretch TOWARD it, steers roll rate, and arms near-body flares.
    // Cheap linear scan; zero allocation.
    let gStr = 0; // 0 at the influence edge -> 1 at the surface
    if (b.flying && !b.dead) {
      let bestS = 0;
      let bestAx = 0;
      let bestAy = 0;
      for (const bd of w.bodies) {
        if (!bd.active || bd.influenceR <= 0 || bd.mu <= 0) continue;
        const dx = bd.cx - b.x;
        const dy = bd.cy - b.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const edge = d - bd.radius; // distance beyond the surface
        if (edge >= bd.influenceR) continue;
        const s = 1 - edge / bd.influenceR;
        if (s <= bestS) continue;
        bestS = s;
        bestAx = dx / d;
        bestAy = dy / d;
        // one flare per body per stroke: fast pass through the falloff zone
        const skimR = bd.radius + Math.max(0, bd.influenceR - bd.radius) * 0.3;
        if (speed > 400 && d < skimR && bd.id !== this.flareBodyId) {
          this.flareBodyId = bd.id;
          this.flarePending = true;
          this.flareX = b.x;
          this.flareY = b.y;
          this.flareVx = b.vx;
          this.flareVy = b.vy;
        }
      }
      gStr = bestS;
      if (gStr > 0) {
        // ease the stretch axis toward the pull direction (shortest arc)
        const tAng = Math.atan2(bestAy, bestAx);
        let da = tAng - this.gravAng;
        if (da > Math.PI) da -= Math.PI * 2;
        else if (da < -Math.PI) da += Math.PI * 2;
        this.gravAng += da * Math.min(1, 9 * dt);
        // roll steered by orbit direction (v x r), rate scales with field
        const cross = b.vx * bestAy - b.vy * bestAx;
        this.gravSpin += Math.sign(cross) * gStr * 3.2 * dt;
      }
    }
    // springy ease toward the pull elongation (max ~7.5%, subtle), returns to
    // round with a slight overshoot when the ball flies free
    {
      const target = 0.075 * gStr;
      const acc = (target - this.gravStretch) * 90 - this.gravVel * 11;
      this.gravVel += acc * dt;
      this.gravStretch += this.gravVel * dt;
    }

    // --- 2.5D contact shadow: slides toward the near body surface along the
    // eased pull axis (gravAng), tightening + brightening as gStr -> 1; a soft
    // ambient pool when resting; gone in deep space. Zero allocation.
    let sTgtA: number;
    let sAng = Math.PI / 2; // resting: shadow pools directly beneath
    let sDist = VIS_R * 1.2;
    let sScl = 1;
    if (b.flying) {
      if (gStr > 0.02) {
        sTgtA = 0.1 + 0.45 * gStr;
        sAng = this.gravAng;
        sDist = 4 + 14 * (1 - gStr); // converges onto the surface point
        sScl = 1.4 - 0.55 * gStr; // tightens as he closes in
      } else {
        sTgtA = 0; // deep space: no ground, no shadow
      }
    } else {
      sTgtA = 0.22;
    }
    this.shadowA = expDamp(this.shadowA, sTgtA, 10, dt);
    this.shadow.visible = this.shadowA > 0.015;
    this.shadow.alpha = this.shadowA;
    this.shadow.x = b.x + Math.cos(sAng) * sDist;
    this.shadow.y = b.y + Math.sin(sAng) * sDist;
    const shW = VIS_R * 2.3 * zoomComp * sScl;
    this.shadow.width = shW;
    this.shadow.height = shW * 0.5;

    // --- squash & stretch (priority: impact > launch recoil > gravity > launch)
    this.stretch = expDamp(this.stretch, 0, 3.2, dt);
    const impact = this.impactT > 0 ? (this.impactT / 0.42) * this.impactMag : 0;
    this.recoilT += dt;
    const recoil = this.recoilT < RECOIL_END ? recoilScale(this.recoilT) : 1;
    let axAng: number;
    let ax = this.stretch;
    if (this.impactT > 0) {
      axAng = Math.atan2(this.impactNY, this.impactNX);
    } else if (this.recoilT < RECOIL_END) {
      axAng = this.stretchAng; // the fling owns the axis while recoiling
    } else if (this.gravStretch > ax) {
      ax = this.gravStretch;
      axAng = this.gravAng;
    } else {
      axAng = this.stretchAng;
    }
    this.squashC.rotation = axAng;
    this.squashC.scale.set(
      (1 + ax) * (1 - impact * 0.45) * recoil,
      (1 - ax * 0.75) * (1 + impact * 0.32) * (1 + (1 - recoil) * 0.22),
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

    // --- spin: sim's visual roll accumulator drives seams + dimples, scaled by
    // local field strength (faster roll near mass, languid in dead space)
    this.detail.rotation = b.spin * (0.55 + 0.45 * gStr) + this.gravSpin;

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
        sp.height = 4.8 * zoomComp; // ribbon keeps up with the ball's zoom lift
        const age = 1 - i / TRAIL_N;
        sp.tint = speedRamp(this.tSpd[i] / MAX_LAUNCH_SPEED);
        sp.alpha = 0.6 * age * age;
      }
    } else {
      for (let i = 0; i < TRAIL_N - 1; i++) {
        this.trail[i].alpha = expDamp(this.trail[i].alpha, 0, 10, dt);
      }
    }

    // --- motion-blur ghost: one pooled sprite trailing the ball at speed
    const gTgt = b.flying && speed > 700 ? 0.25 * clamp((speed - 700) / 380, 0, 1) : 0;
    this.ghostA = expDamp(this.ghostA, gTgt, 9, dt);
    if (this.ghostA > 0.012 && b.flying) {
      const inv = 1 / (speed || 1);
      const ux = b.vx * inv;
      const uy = b.vy * inv;
      const ramp = clamp((speed - 700) / 400, 0, 1);
      const h = VIS_R * 2 * zoomComp;
      this.ghost.x = b.x - ux * (6 + 9 * ramp);
      this.ghost.y = b.y - uy * (6 + 9 * ramp);
      this.ghost.rotation = Math.atan2(uy, ux);
      this.ghost.height = h;
      this.ghost.width = h * (1 + 1.15 * ramp); // stretched along the flight axis
      this.ghost.alpha = this.ghostA;
      this.ghost.visible = true;
    } else {
      this.ghost.visible = false;
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
