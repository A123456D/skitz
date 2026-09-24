/**
 * World camera: pixel-snapped for crisp pixel art, integer zoom, shake.
 * Auto-zooms so a minimum visible world area fits the viewport (phones).
 * The ground plane is tilted (TILT) for a 3/4 pseudo-3D view: world y is
 * compressed on screen; z height is added unscaled as billboard offset.
 */
export const GROUND_TILT = 0.78;

export class Camera {
  x = 0;
  y = 0;
  /** world px per screen px (fractional base, rounded to nice values) */
  zoom = 1;
  /** transient zoom multiplier from zoomPulse (1 = neutral) */
  zoomFx = 1;
  viewW = 0;
  viewH = 0;

  private shakeT = 0;
  private shakeDur = 0;
  private shakeMag = 0;
  private ox = 0;
  private oy = 0;
  private zoomFxT = 0;
  private zoomFxDur = 0;
  private zoomFxAmount = 0;

  resize(screenW: number, screenH: number, dpr: number): void {
    // Choose zoom so that at least minVisible world px fit the smaller axis.
    const cssW = screenW;
    const cssH = screenH;
    const minVisible = 560; // world px guaranteed visible on the short axis
    const short = Math.min(cssW, cssH);
    let z = short / minVisible;
    // keep zoom >= 1/3 and stable: no fractional-zoom pixel shimmer — round to 0.25 steps
    z = Math.max(0.5, Math.round(z * 4) / 4);
    this.zoom = z;
    this.viewW = cssW / z;
    this.viewH = cssH / z;
    void dpr;
  }

  follow(tx: number, ty: number, lerpRate: number, dt: number): void {
    const k = 1 - Math.exp(-lerpRate * dt);
    this.x += (tx - this.x) * k;
    this.y += (ty - this.y) * k;
  }

  shake(mag: number, dur: number): void {
    if (mag >= this.shakeMag * (this.shakeDur - this.shakeT + 0.01) / this.shakeDur) {
      this.shakeMag = mag;
      this.shakeDur = dur;
      this.shakeT = 0;
    }
  }

  /** Temporary zoom swell that eases back to base (boss kill, big slams). */
  zoomPulse(amount: number, dur: number): void {
    if (amount >= this.zoomFxAmount * (this.zoomFxDur - this.zoomFxT + 0.01) / this.zoomFxDur || this.zoomFxT >= this.zoomFxDur) {
      this.zoomFxAmount = amount;
      this.zoomFxDur = dur;
      this.zoomFxT = 0;
    }
  }

  update(dt: number): void {
    if (this.zoomFxT < this.zoomFxDur) {
      this.zoomFxT += dt;
      const t = Math.max(0, 1 - this.zoomFxT / this.zoomFxDur);
      this.zoomFx = 1 + this.zoomFxAmount * t * t;
    } else {
      this.zoomFx = 1;
    }
    if (this.shakeT < this.shakeDur) {
      this.shakeT += dt;
      const t = Math.max(0, 1 - this.shakeT / this.shakeDur);
      const m = this.shakeMag * t * t;
      this.ox = (Math.random() * 2 - 1) * m;
      this.oy = (Math.random() * 2 - 1) * m;
    } else {
      this.ox = 0;
      this.oy = 0;
      this.shakeMag = 0;
      this.shakeDur = 0;
    }
  }

  /** Apply to a Pixi container transform (world container). */
  apply(container: { x: number; y: number; scale: { set(x: number, y: number): void } }, screenW: number, screenH: number): void {
    const z = this.zoom * this.zoomFx;
    container.scale.set(z, z);
    container.x = Math.round(screenW / 2 - (this.x + this.ox) * z);
    container.y = Math.round(screenH / 2 - (this.y + this.oy) * GROUND_TILT * z);
  }

  /** Screen -> world coords. */
  toWorld(sx: number, sy: number, screenW: number, screenH: number): { x: number; y: number } {
    return {
      x: (sx - screenW / 2) / this.zoom + this.x + this.ox,
      y: ((sy - screenH / 2) / this.zoom) / GROUND_TILT + this.y + this.oy,
    };
  }
}
