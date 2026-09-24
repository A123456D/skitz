// camera.ts — world→screen framing. Pure TS (no Pixi) so the math is
// unit-testable: the renderer applies (scale, x, y) to a root Container.
//
// Behavior contract:
//  - Auto-frame the level's elliptical bounds with margin on load (snap).
//  - While the ball flies, the center eases toward the ball but the offset
//    from the level center is capped inside the bounds ellipse (never unframes).
//  - Screen shake decays exponentially; offsets are bounded by magnitude.

import { capToEllipse, decayShake, expDamp, fitScale, type PtOut } from './core';

export interface Bounds { cx: number; cy: number; rx: number; ry: number }
export interface BallLike { x: number; y: number }

const DEFAULT_MARGIN = 1.18;

export class Camera {
  /** Uniform world→screen scale. */
  scale = 1;
  /** Current world-space camera center (what sits at screen center). */
  cx = 0;
  cy = 0;
  viewW = 1280;
  viewH = 720;
  /** Multiplied into devicePixelRatio by the app; here 1 = CSS pixel space. */
  margin = DEFAULT_MARGIN;

  private baseCx = 0;
  private baseCy = 0;
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

  /** Frame a level. `snap` skips easing (level load / resize from nothing). */
  frame(b: Bounds, snap = false): void {
    this.baseCx = b.cx;
    this.baseCy = b.cy;
    const s = fitScale(this.viewW, this.viewH, b.rx, b.ry, this.margin);
    if (snap || this.scale === 1) {
      this.scale = s;
      this.cx = b.cx;
      this.cy = b.cy;
    } else {
      this.scale = expDamp(this.scale, s, 4, 1 / 60);
    }
  }

  /** Re-fit without easing after a viewport resize (keeps the center). */
  refit(b: Bounds): void {
    this.scale = fitScale(this.viewW, this.viewH, b.rx, b.ry, this.margin);
  }

  update(dt: number, ball: BallLike, flying: boolean): void {
    this.t += dt;

    // Gentle ball-follow: chase a point capped inside the level ellipse so the
    // camera pans with the shot but the course edge never leaves the frame.
    const tgtX = this.follow ? this.baseCx + this.followCap.x : this.baseCx;
    const tgtY = this.follow ? this.baseCy + this.followCap.y : this.baseCy;

    if (flying) {
      if (!this.follow) {
        this.follow = true;
        this.followCap.x = 0;
        this.followCap.y = 0;
      }
      // Cap grows with a shrink factor (0.42) — pan less than the full bounds.
      capToEllipse(ball.x - this.baseCx, ball.y - this.baseCy,
        0.42 * (this.viewW / this.scale) * 0.5, 0.42 * (this.viewH / this.scale) * 0.5, this.followCap);
      // Cap against the level ellipse too — whichever is tighter wins.
      const lx = ball.x - this.baseCx;
      const ly = ball.y - this.baseCy;
      const ld = Math.hypot(lx, ly);
      const maxD = Math.min(this.viewW, this.viewH) / this.scale * 0.28;
      if (ld > maxD && ld > 0) {
        this.followCap.x = (lx / ld) * maxD;
        this.followCap.y = (ly / ld) * maxD;
      }
    } else {
      this.follow = false;
    }

    this.cx = expDamp(this.cx, tgtX, flying ? 2.4 : 1.8, dt);
    this.cy = expDamp(this.cy, tgtY, flying ? 2.4 : 1.8, dt);

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
