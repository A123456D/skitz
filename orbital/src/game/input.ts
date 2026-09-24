// Pointer + keyboard input for the aim/pin loop. Produces high-level intents;
// the game state machine decides what they mean.

export interface InputCallbacks {
  /** Drag aim in progress (slingshot pull). power01 0..1. */
  onAim(dirX: number, dirY: number, power01: number): void;
  onAimEnd(dirX: number, dirY: number, power01: number): void;
  onAimCancel(): void;
  /** Short tap with no drag — pin placement intent. */
  onTap(sx: number, sy: number): void;
  /** Hover while not aiming (pin ghost). */
  onHover(sx: number, sy: number): void;
  onKey(code: string): void;
}

const DRAG_THRESHOLD = 8;
const TAP_MS = 300;

export class InputController {
  private el: HTMLElement;
  private cb: InputCallbacks;
  private down = false;
  private dragged = false;
  private startX = 0;
  private startY = 0;
  private curX = 0;
  private curY = 0;
  private downTime = 0;
  private pointerId = -1;
  /** Keyboard aim state (arrows + space), used when no pointer drag is live. */
  angle = 0;
  charging = false;
  chargeT = 0;
  enabled = false;

  constructor(el: HTMLElement, cb: InputCallbacks) {
    this.el = el;
    this.cb = cb;
    el.addEventListener('pointerdown', this.pd);
    el.addEventListener('pointermove', this.pm);
    el.addEventListener('pointerup', this.pu);
    el.addEventListener('pointercancel', this.pc);
    window.addEventListener('keydown', this.kd);
    window.addEventListener('keyup', this.ku);
  }

  destroy(): void {
    this.el.removeEventListener('pointerdown', this.pd);
    this.el.removeEventListener('pointermove', this.pm);
    this.el.removeEventListener('pointerup', this.pu);
    this.el.removeEventListener('pointercancel', this.pc);
    window.removeEventListener('keydown', this.kd);
    window.removeEventListener('keyup', this.ku);
  }

  /** Called per frame by the game for space-charge ramp. */
  tick(dt: number): void {
    if (this.charging) {
      this.chargeT = Math.min(1, this.chargeT + dt / 1.2);
      const p = this.powerCurve(this.chargeT);
      this.cb.onAim(Math.cos(this.angle), Math.sin(this.angle), p);
    }
  }

  cancelAll(): void {
    this.down = false;
    this.dragged = false;
    this.charging = false;
    this.chargeT = 0;
    this.enabled = false;
  }

  private powerCurve(t: number): number {
    // soft cap: gentle start, tapers near max
    return Math.min(1, Math.pow(t, 1.15));
  }

  private emitAim(): void {
    const dx = this.startX - this.curX;
    const dy = this.startY - this.curY;
    const len = Math.hypot(dx, dy);
    if (len < DRAG_THRESHOLD) return;
    const maxDrag = Math.min(this.el.clientWidth, this.el.clientHeight) * 0.35;
    const power01 = Math.min(1, len / maxDrag);
    this.cb.onAim(dx / len, dy / len, this.powerCurve(power01));
  }

  private pd = (e: PointerEvent): void => {
    if (!this.enabled || this.down) return;
    this.down = true;
    this.dragged = false;
    this.pointerId = e.pointerId;
    this.startX = this.curX = e.clientX;
    this.startY = this.curY = e.clientY;
    this.downTime = performance.now();
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      // capture unsupported — pointermove still fires on the element
    }
  };

  private pm = (e: PointerEvent): void => {
    if (!this.enabled) return;
    if (this.down && e.pointerId === this.pointerId) {
      this.curX = e.clientX;
      this.curY = e.clientY;
      if (!this.dragged && Math.hypot(this.curX - this.startX, this.curY - this.startY) > DRAG_THRESHOLD) {
        this.dragged = true;
      }
      if (this.dragged) this.emitAim();
    } else if (!this.down) {
      this.cb.onHover(e.clientX, e.clientY);
    }
  };

  private pu = (e: PointerEvent): void => {
    if (!this.enabled || !this.down || e.pointerId !== this.pointerId) return;
    this.down = false;
    this.curX = e.clientX;
    this.curY = e.clientY;
    if (this.charging) {
      this.charging = false;
      const p = this.powerCurve(this.chargeT);
      this.chargeT = 0;
      if (p > 0.02) this.cb.onAimEnd(Math.cos(this.angle), Math.sin(this.angle), p);
      else this.cb.onAimCancel();
      return;
    }
    if (this.dragged) {
      const dx = this.startX - this.curX;
      const dy = this.startY - this.curY;
      const len = Math.hypot(dx, dy);
      if (len < DRAG_THRESHOLD) {
        this.cb.onAimCancel();
      } else {
        const maxDrag = Math.min(this.el.clientWidth, this.el.clientHeight) * 0.35;
        this.cb.onAimEnd(dx / len, dy / len, this.powerCurve(Math.min(1, len / maxDrag)));
      }
      return;
    }
    if (performance.now() - this.downTime < TAP_MS) {
      this.cb.onTap(e.clientX, e.clientY);
    }
  };

  private pc = (): void => {
    if (this.down && this.dragged) this.cb.onAimCancel();
    this.down = false;
    this.dragged = false;
  };

  private kd = (e: KeyboardEvent): void => {
    if (!this.enabled) return;
    const step = e.shiftKey ? 0.01 : 0.05;
    switch (e.code) {
      case 'ArrowLeft':
        this.angle -= step;
        this.cb.onAim(Math.cos(this.angle), Math.sin(this.angle), this.chargeT > 0 ? this.powerCurve(this.chargeT) : 0.35);
        e.preventDefault();
        break;
      case 'ArrowRight':
        this.angle += step;
        this.cb.onAim(Math.cos(this.angle), Math.sin(this.angle), this.chargeT > 0 ? this.powerCurve(this.chargeT) : 0.35);
        e.preventDefault();
        break;
      case 'Space':
        if (!this.charging && !e.repeat) {
          this.charging = true;
          this.chargeT = 0;
        }
        e.preventDefault();
        break;
      default:
        this.cb.onKey(e.code);
    }
  };

  private ku = (e: KeyboardEvent): void => {
    if (e.code === 'Space' && this.charging) {
      this.charging = false;
      const p = this.powerCurve(this.chargeT);
      this.chargeT = 0;
      if (p > 0.02) this.cb.onAimEnd(Math.cos(this.angle), Math.sin(this.angle), p);
      else this.cb.onAimCancel();
    }
  };
}
