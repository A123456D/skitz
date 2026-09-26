export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
export const irand = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
export const dist2 = (ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; };
export const len = (x, y) => Math.hypot(x, y);
export const norm = (x, y) => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };
export const angTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);
export const adiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
export const fmtTime = (t) => { t = Math.max(0, t | 0); const m = (t / 60) | 0, s = t % 60; return `${m}:${s < 10 ? '0' : ''}${s}`; };

export class RNG {
  constructor(seed) { this.s = (seed >>> 0) || 0x9e3779b9; }
  f() { let s = this.s; s ^= s << 13; s ^= s >>> 17; s ^= s << 5; this.s = s >>> 0; return (this.s >>> 0) / 4294967296; }
  range(a, b) { return a + this.f() * (b - a); }
  int(n) { return (this.f() * n) | 0; }
  pick(arr) { return arr[this.int(arr.length)]; }
}

// grid spatial hash; int key packing (no -1 sentinel pitfalls)
export class SpatialHash {
  constructor(cell) { this.cell = cell; this.map = new Map(); }
  clear() { this.map.clear(); }
  key(cx, cy) { return ((cx & 0xffff) << 16) | (cy & 0xffff); }
  insert(obj, x, y, r) {
    const c = this.cell;
    const x0 = ((x - r) / c) | 0, x1 = ((x + r) / c) | 0, y0 = ((y - r) / c) | 0, y1 = ((y + r) / c) | 0;
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const k = this.key(cx, cy); let a = this.map.get(k); if (!a) { a = []; this.map.set(k, a); } a.push(obj);
    }
  }
  query(x, y, r, out) {
    out.length = 0; const c = this.cell;
    const x0 = ((x - r) / c) | 0, x1 = ((x + r) / c) | 0, y0 = ((y - r) / c) | 0, y1 = ((y + r) / c) | 0;
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const a = this.map.get(this.key(cx, cy)); if (a) for (let i = 0; i < a.length; i++) { const o = a[i]; if (out.indexOf(o) < 0) out.push(o); }
    }
    return out;
  }
}
