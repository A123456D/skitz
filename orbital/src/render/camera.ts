// camera.ts — world→screen framing. Pure TS (no Pixi) so the math is
// unit-testable: the renderer applies (scale, x, y) to a root Container.
//
// Behavior contract:
//  - Auto-frame the level's elliptical bounds with margin on load (snap).
//  - While the ball flies, the center eases toward the ball; on desktop the
//    offset stays capped so the course never unframes, on small (phone)
//    viewports the follow is tighter and the course may partially leave the
//    frame (cinematic). Bounds framing returns between strokes.
//  - Screen shake decays exponentially; offsets are bounded by magnitude.

import { capToEllipse, clamp, decayShake, expDamp, fitScale, type PtOut } from './core';

export interface Bounds { cx: number; cy: number; rx: number; ry: number }
export interface BallLike { x: number; y: number }

// ------------------------------------------------------------------ framing
// Mobile-first tuning: phone landscape (844x390, even 740x360 css px) is the
// canonical viewport; desktop is the scaled-up guest. Everything below is
// derived from the CURRENT view size every frame()/refit()/update() call —
// never from construction time — so rotating or resizing re-frames live.
const SMALL_VIEW_DIM = 500;     // css px: min(viewW, viewH) below this = "phone"
const SMALL_RAMP = 70;          // blend width, so crossing the line never pops
const MARGIN_LARGE = 1.18;      // bounds fit margin at desktop (1280x800 tuning)
const MARGIN_SMALL = 1.04;      // course fills the screen on phones
const FOLLOW_CAP_LARGE = 0.42;  // flight follow cap fraction (of half-view)
const FOLLOW_CAP_SMALL = 0.62;  // phones stick closer to the ball mid-flight:
                                // partial off-screen course is fine/cinematic
const FOLLOW_DIST_LARGE = 0.28; // hard follow-distance cap fraction, desktop
const FOLLOW_DIST_SMALL = 0.44; // phones keep following further out

export class Camera {
  /** Uniform world→screen scale. */
  scale = 1;
  /** Current world-space camera center (what sits at screen center). */
  cx = 0;
  cy = 0;
  viewW = 1280;
  viewH = 720;

  private baseCx = 0;
  private baseCy = 0;
  private baseScale = 1;
  private follow = false;
  private followCap: PtOut = { x: 0, y: 0 };

  private shakeMag = 0;
  private t = 0;

  /** Screen-space shake offset (CSS px), refreshed by update(). */
  shakeX = 0;
  shakeY = 0;

  setView(w: number, h: number): void {
    this.viewW = w;
    this.viewH = h;
  }

  /** 0 = desktop framing, 1 = phone framing, smoothly blended in between. */
  private get phoneT(): number {
    return clamp((SMALL_VIEW_DIM - Math.min(this.viewW, this.viewH)) / SMALL_RAMP, 0, 1);
  }

  /** Current bounds fit margin (unitless; derives from the live viewport). */
  get fitMargin(): number {
    return MARGIN_LARGE + (MARGIN_SMALL - MARGIN_LARGE) * this.phoneT;
  }

  /** Flight follow cap fraction — larger on phones (tighter follow). */
  get followCapFraction(): number {
    return FOLLOW_CAP_LARGE + (FOLLOW_CAP_SMALL - FOLLOW_CAP_LARGE) * this.phoneT;
  }

  /** Hard follow-distance fraction — larger on phones (follows further out). */
  get followDistFraction(): number {
    return FOLLOW_DIST_LARGE + (FOLLOW_DIST_SMALL - FOLLOW_DIST_LARGE) * this.phoneT;
  }

  /** Frame a level. `snap` skips easing (level load / resize from nothing). */
  frame(b: Bounds, snap = false): void {
    this.baseCx = b.cx;
    this.baseCy = b.cy;
    this.baseScale = fitScale(this.viewW, this.viewH, b.rx, b.ry, this.fitMargin);
    if (snap || this.scale === 1) {
      this.scale = this.baseScale;
      this.cx = b.cx;
      this.cy = b.cy;
    } else {
      this.scale = expDamp(this.scale, this.baseScale, 4, 1 / 60);
    }
  }

  /** Re-fit without easing after a viewport resize (keeps the center). */
  refit(b: Bounds): void {
    this.baseScale = fitScale(this.viewW, this.viewH, b.rx, b.ry, this.fitMargin);
    this.scale = this.baseScale;
  }

  update(dt: number, ball: BallLike, flying: boolean): void {
    this.t += dt;

    // Gentle ball-follow: chase a point capped inside the level ellipse so the
    // camera pans with the shot but the course edge never leaves the frame.
    let tgtX = this.follow ? this.baseCx + this.followCap.x : this.baseCx;
    let tgtY = this.follow ? this.baseCy + this.followCap.y : this.baseCy;
    let tgtScale = this.baseScale;
    let rate = flying ? 2.4 : 1.8;

    if (flying) {
      if (!this.follow) {
        this.follow = true;
        this.followCap.x = 0;
        this.followCap.y = 0;
      }
      // Cap grows with a viewport-derived fraction (0.42 desktop / 0.62 phone)
      // — on phones the camera pans tighter on the ball and the course edge
      // may leave the frame; bounds framing returns between strokes.
      const capF = this.followCapFraction;
      capToEllipse(ball.x - this.baseCx, ball.y - this.baseCy,
        capF * (this.viewW / this.scale) * 0.5, capF * (this.viewH / this.scale) * 0.5, this.followCap);
      // Cap against the level ellipse too — whichever is tighter wins.
      const lx = ball.x - this.baseCx;
      const ly = ball.y - this.baseCy;
      const ld = Math.hypot(lx, ly);
      const maxD = Math.min(this.viewW, this.viewH) / this.scale * this.followDistFraction;
      if (ld > maxD && ld > 0) {
        this.followCap.x = (lx / ld) * maxD;
        this.followCap.y = (ly / ld) * maxD;
      }
    } else {
      this.follow = false;
    }

    this.cx = expDamp(this.cx, tgtX, rate, dt);
    this.cy = expDamp(this.cy, tgtY, rate, dt);
    this.scale = expDamp(this.scale, tgtScale, 3.0, dt);

    // --- shake
    this.shakeMag = decayShake(this.shakeMag, dt);
    if (this.shakeMag === 0) {
      // snap to clean zero (avoids -0 leaking through the sin products)
      this.shakeX = 0;
      this.shakeY = 0;
      return;
    }
    // Two incommensurate sines per axis look like noise without a RNG table.
    this.shakeX = this.shakeMag * (Math.sin(this.t * 39.7) * 0.62 + Math.sin(this.t * 27.3 + 1.7) * 0.38);
    this.shakeY = this.shakeMag * (Math.cos(this.t * 34.1 + 0.4) * 0.62 + Math.cos(this.t * 22.9 + 2.1) * 0.38);
  }

  shake(mag: number): void {
    this.shakeMag = Math.max(this.shakeMag, mag);
  }

  /** Apply camera to a Pixi-style root container transform. */
  applyToRoot(root: { scale: { set(x: number, y: number): void }; position: { set(x: number, y: number): void } }): void {
    root.scale.set(this.scale, this.scale);
    root.position.set(
      this.viewW * 0.5 - this.cx * this.scale + this.shakeX,
      this.viewH * 0.5 - this.cy * this.scale + this.shakeY,
    );
  }

  /** Project a world point to screen space (writes into `out`). */
  worldToScreen(x: number, y: number, out: PtOut): PtOut {
    out.x = (x - this.cx) * this.scale + this.viewW * 0.5 + this.shakeX;
    out.y = (y - this.cy) * this.scale + this.viewH * 0.5 + this.shakeY;
    return out;
  }

  /**
   * Inverse projection: CSS-pixel host coordinate -> world point.
   * Deliberately ignores the shake offset so input-driven placement (pins,
   * aim) stays stable while the view shakes. Writes into `out`, returns it.
   */
  screenToWorld(sx: number, sy: number, out: PtOut): PtOut {
    out.x = (sx - this.viewW * 0.5) / this.scale + this.cx;
    out.y = (sy - this.viewH * 0.5) / this.scale + this.cy;
    return out;
  }

  /** Screen-space position of a world point with parallax factor f (0..1). */
  parallax(x: number, y: number, f: number, out: PtOut): PtOut {
    out.x = (x - this.cx * f) * this.scale + this.viewW * 0.5 + this.shakeX * f;
    out.y = (y - this.cy * f) * this.scale + this.viewH * 0.5 + this.shakeY * f;
    return out;
  }
}
