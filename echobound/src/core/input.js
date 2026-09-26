// keyboard + mouse + touch twin-sticks
export const I = {
  keys: new Set(), pressedSet: new Set(),
  mx: 0, my: 0, mdown: false,
  touch: false,
  stickL: { active: false, id: -1, ox: 0, oy: 0, x: 0, y: 0, dx: 0, dy: 0 },
  stickR: { active: false, id: -1, ox: 0, oy: 0, x: 0, y: 0, dx: 0, dy: 0 },
  dashBtn: false,

  init(canvas) {
    this.touch = matchMedia('(pointer:coarse)').matches;
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code); this.pressedSet.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('mousemove', (e) => { this.mx = e.clientX; this.my = e.clientY; });
    addEventListener('mousedown', (e) => { if (e.button === 0) this.mdown = true; });
    addEventListener('mouseup', (e) => { if (e.button === 0) this.mdown = false; });
    addEventListener('blur', () => { this.keys.clear(); this.mdown = false; });

    canvas.addEventListener('touchstart', (e) => this.onTouch(e, 'start'), { passive: false });
    canvas.addEventListener('touchmove', (e) => this.onTouch(e, 'move'), { passive: false });
    canvas.addEventListener('touchend', (e) => this.onTouch(e, 'end'), { passive: false });
    canvas.addEventListener('touchcancel', (e) => this.onTouch(e, 'end'), { passive: false });
  },
  onTouch(e, kind) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (kind === 'start') {
        if (t.clientX < innerWidth * 0.5 && !this.stickL.active) {
          const s = this.stickL; s.active = true; s.id = t.identifier; s.ox = t.clientX; s.oy = t.clientY; s.x = s.ox; s.y = s.oy; s.dx = 0; s.dy = 0;
        } else if (!this.stickR.active) {
          const s = this.stickR; s.active = true; s.id = t.identifier; s.ox = t.clientX; s.oy = t.clientY; s.x = s.ox; s.y = s.oy; s.dx = 0; s.dy = 0;
        }
      } else {
        for (const s of [this.stickL, this.stickR]) {
          if (s.active && s.id === t.identifier) {
            if (kind === 'move') { s.x = t.clientX; s.y = t.clientY; }
            else { s.active = false; s.id = -1; s.dx = 0; s.dy = 0; }
          }
        }
      }
    }
    if (kind === 'move') {
      for (const s of [this.stickL, this.stickR]) {
        if (s.active) {
          let dx = s.x - s.ox, dy = s.y - s.oy; const l = Math.hypot(dx, dy), max = 46;
          if (l > max) { dx = (dx / l) * max; dy = (dy / l) * max; }
          s.dx = dx / max; s.dy = dy / max;
        }
      }
    }
  },
  moveAxis() {
    let x = 0, y = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y += 1;
    if (this.stickL.active) { x = this.stickL.dx; y = this.stickL.dy; }
    const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    return [x, y];
  },
  firing() { return this.mdown || this.stickR.active || this.keys.has('KeyF'); },
  dashPressed() { return this.pressedSet.has('Space') || this.pressedSet.has('ShiftLeft') || this.dashBtn; },
  aimWorld(G) {
    if (this.stickR.active && (Math.abs(this.stickR.dx) > 0.12 || Math.abs(this.stickR.dy) > 0.12)) return Math.atan2(this.stickR.dy, this.stickR.dx);
    if (this.touch) return G.player.aim; // last aim on touch when stick released
    const wx = G.cam.x + (this.mx - innerWidth / 2) / G.cam.zoom;
    const wy = G.cam.y + (this.my - innerHeight / 2) / G.cam.zoom;
    return Math.atan2(wy - G.player.y, wx - G.player.x);
  },
  pressed(code) { return this.pressedSet.has(code); },
  endFrame() { this.pressedSet.clear(); this.dashBtn = false; },
};
