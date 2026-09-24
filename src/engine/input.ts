/**
 * Unified input: keyboard (WASD/arrows), dynamic virtual joystick (touch spawns
 * where the finger lands), optional gamepad. Produces a single move vector.
 */
export class Input {
  moveX = 0;
  moveY = 0;
  /** Raw aim (mouse position in screen px) if present; not required for survivors. */
  pointerX = 0;
  pointerY = 0;
  /** Set on jump press (Space / gamepad A / jump button); consumed by the sim. */
  jumpQueued = false;

  private keys = new Set<string>();
  private joyActive = false;
  private joyId = -1;
  private joyOriginX = 0;
  private joyOriginY = 0;
  private joyX = 0;
  private joyY = 0;
  private radius = 64;

  /** Visual joystick state for the touch UI overlay. */
  joyVisible = false;
  joyBaseX = 0;
  joyBaseY = 0;
  joyKnobX = 0;
  joyKnobY = 0;

  private el: HTMLElement;
  private onPause: () => void;
  private onAnyInput: () => void;

  constructor(el: HTMLElement, hooks: { onPause: () => void; onAnyInput: () => void }) {
    this.el = el;
    this.onPause = hooks.onPause;
    this.onAnyInput = hooks.onAnyInput;

    window.addEventListener('keydown', this.keydown);
    window.addEventListener('keyup', this.keyup);
    el.addEventListener('pointerdown', this.pdown);
    el.addEventListener('pointermove', this.pmove);
    el.addEventListener('pointerup', this.pup);
    el.addEventListener('pointercancel', this.pup);
    window.addEventListener('blur', this.blur);
  }

  private keydown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    this.onAnyInput();
    const k = e.key.toLowerCase();
    if (k === 'escape' || k === 'p') {
      this.onPause();
      return;
    }
    if (k === ' ' || k === 'spacebar') {
      e.preventDefault();
      this.jumpQueued = true;
      return;
    }
    this.keys.add(k);
    this.syncKeys();
  };

  private keyup = (e: KeyboardEvent) => {
    this.keys.delete(e.key.toLowerCase());
    this.syncKeys();
  };

  private blur = () => {
    this.keys.clear();
    this.syncKeys();
  };

  private syncKeys(): void {
    const k = this.keys;
    let x = 0;
    let y = 0;
    if (k.has('a') || k.has('arrowleft')) x -= 1;
    if (k.has('d') || k.has('arrowright')) x += 1;
    if (k.has('w') || k.has('arrowup')) y -= 1;
    if (k.has('s') || k.has('arrowdown')) y += 1;
    if (x !== 0 || y !== 0) {
      this.joyActive = false;
      this.joyVisible = false;
      const l = Math.hypot(x, y);
      this.moveX = x / l;
      this.moveY = y / l;
    } else if (!this.joyActive) {
      this.moveX = 0;
      this.moveY = 0;
    }
  }

  private pdown = (e: PointerEvent) => {
    this.onAnyInput();
    if (e.pointerType === 'mouse') {
      this.pointerX = e.clientX;
      this.pointerY = e.clientY;
      return; // mouse users steer with keys; no click-to-move
    }
    // touch on the jump button is handled by the button itself (stopPropagation);
    // any other touch spawns the joystick
    if (this.joyActive) return;
    this.joyActive = true;
    this.joyId = e.pointerId;
    this.joyOriginX = e.clientX;
    this.joyOriginY = e.clientY;
    this.joyX = 0;
    this.joyY = 0;
    this.joyVisible = true;
    this.joyBaseX = e.clientX;
    this.joyBaseY = e.clientY;
    this.joyKnobX = e.clientX;
    this.joyKnobY = e.clientY;
  };

  private pmove = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') {
      this.pointerX = e.clientX;
      this.pointerY = e.clientY;
      return;
    }
    if (!this.joyActive || e.pointerId !== this.joyId) return;
    let dx = e.clientX - this.joyOriginX;
    let dy = e.clientY - this.joyOriginY;
    const d = Math.hypot(dx, dy);
    const max = this.radius;
    if (d > max) {
      // drag the base along so the stick never feels stuck
      const k = (d - max) / d;
      this.joyOriginX += dx * k;
      this.joyOriginY += dy * k;
      dx = e.clientX - this.joyOriginX;
      dy = e.clientY - this.joyOriginY;
    }
    this.joyX = dx / max;
    this.joyY = dy / max;
    this.moveX = this.joyX;
    this.moveY = this.joyY;
    this.joyBaseX = this.joyOriginX;
    this.joyBaseY = this.joyOriginY;
    this.joyKnobX = this.joyOriginX + dx;
    this.joyKnobY = this.joyOriginY + dy;
  };

  private pup = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') return;
    if (!this.joyActive || e.pointerId !== this.joyId) return;
    this.joyActive = false;
    this.joyVisible = false;
    this.moveX = 0;
    this.moveY = 0;
    this.joyId = -1;
  };

  /** Poll gamepad if one is connected; keyboard/joystick win when active. */
  pollGamepad(): void {
    const pads = navigator.getGamepads?.();
    if (!pads) return;
    for (const p of pads) {
      if (!p) continue;
      const ax = p.axes[0] ?? 0;
      const ay = p.axes[1] ?? 0;
      if (Math.hypot(ax, ay) > 0.2) {
        this.moveX = ax;
        this.moveY = ay;
        return;
      }
      if (p.buttons[0]?.pressed) this.jumpQueued = true; // A / cross
    }
  }

  destroy(): void {
    window.removeEventListener('keydown', this.keydown);
    window.removeEventListener('keyup', this.keyup);
    this.el.removeEventListener('pointerdown', this.pdown);
    this.el.removeEventListener('pointermove', this.pmove);
    this.el.removeEventListener('pointerup', this.pup);
    this.el.removeEventListener('pointercancel', this.pup);
    window.removeEventListener('blur', this.blur);
  }
}
