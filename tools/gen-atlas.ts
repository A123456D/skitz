/**
 * WRECKBALL pixel-art atlas generator.
 * Draws every sprite programmatically (shaded spheres + pixel decorations),
 * packs them into public/atlas.png and emits public/atlas.json in
 * Pixi Spritesheet format. Run: npm run atlas
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

type RGB = [number, number, number];

const WHITE: RGB = [255, 255, 255];

class Px {
  w: number;
  h: number;
  data: Buffer;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.data = Buffer.alloc(w * h * 4, 0);
  }

  set(x: number, y: number, c: RGB, a = 255): void {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.data[i] = c[0];
    this.data[i + 1] = c[1];
    this.data[i + 2] = c[2];
    this.data[i + 3] = a;
  }

  rect(x0: number, y0: number, w: number, h: number, c: RGB): void {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(x, y, c);
  }

  /** Shaded sphere: light from top-left, specular glint, darkened rim. */
  sphere(cx: number, cy: number, r: number, base: RGB, dark: RGB, light: RGB, spec = true): void {
    for (let y = Math.floor(cy - r) - 1; y <= cy + r + 1; y++) {
      for (let x = Math.floor(cx - r) - 1; x <= cx + r + 1; x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > r) continue;
        const nx = dx / (r || 1);
        const ny = dy / (r || 1);
        const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
        let t = nx * -0.5 + ny * -0.65 + nz * 0.72;
        t = Math.max(0, Math.min(1, t));
        let c: RGB = [
          Math.round(dark[0] + (base[0] - dark[0]) * t),
          Math.round(dark[1] + (base[1] - dark[1]) * t),
          Math.round(dark[2] + (base[2] - dark[2]) * t),
        ];
        if (t > 0.82) c = [
          Math.round(c[0] + (light[0] - c[0]) * 0.8),
          Math.round(c[1] + (light[1] - c[1]) * 0.8),
          Math.round(c[2] + (light[2] - c[2]) * 0.8),
        ];
        if (d > r - 1) c = [Math.round(c[0] * 0.45), Math.round(c[1] * 0.45), Math.round(c[2] * 0.5)];
        this.set(x, y, c);
      }
    }
    if (spec) {
      const sx = Math.round(cx - r * 0.38);
      const sy = Math.round(cy - r * 0.42);
      this.set(sx, sy, light);
      this.set(sx + 1, sy, light);
      this.set(sx, sy + 1, light);
    }
  }

  /** Blobby ellipse for slimes. */
  ellipse(cx: number, cy: number, rx: number, ry: number, base: RGB, dark: RGB, light: RGB): void {
    for (let y = Math.floor(cy - ry) - 1; y <= cy + ry + 1; y++) {
      for (let x = Math.floor(cx - rx) - 1; x <= cx + rx + 1; x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > 1) continue;
        let t = 1 - dy * 0.9 - dx * 0.35;
        t = Math.max(0, Math.min(1, t));
        let c: RGB = [
          Math.round(dark[0] + (base[0] - dark[0]) * t),
          Math.round(dark[1] + (base[1] - dark[1]) * t),
          Math.round(dark[2] + (base[2] - dark[2]) * t),
        ];
        if (t > 0.78) c = [
          Math.round(c[0] * 0.6 + light[0] * 0.4),
          Math.round(c[1] * 0.6 + light[1] * 0.4),
          Math.round(c[2] * 0.6 + light[2] * 0.4),
        ];
        if (d > 0.88) c = [Math.round(c[0] * 0.45), Math.round(c[1] * 0.45), Math.round(c[2] * 0.5)];
        this.set(x, y, c);
      }
    }
  }

  eyes(cx: number, cy: number, gap: number, dark: RGB, white: RGB): void {
    for (const gx of [cx - gap, cx + gap]) {
      this.set(gx, cy, dark);
      this.set(gx, cy - 1, dark);
      this.set(gx, cy - 1, white);
    }
  }

  triangleUp(cx: number, baseY: number, h: number, c: RGB, outline: RGB): void {
    for (let i = 0; i < h; i++) {
      const wHalf = Math.round((h - i) / 2);
      for (let x = cx - wHalf; x <= cx + wHalf; x++) this.set(x, baseY - i, i === h - 1 ? outline : c);
    }
  }
}

const DIRS8: ReadonlyArray<readonly [number, number]> = [
  [0, -1], [0.71, -0.71], [1, 0], [0.71, 0.71], [0, 1], [-0.71, 0.71], [-1, 0], [-0.71, -0.71],
];

interface SpriteDef {
  name: string;
  draw: (p: Px) => void;
  w: number;
  h: number;
}

const sprites: SpriteDef[] = [];
const def = (name: string, w: number, h: number, draw: (p: Px) => void) => sprites.push({ name, w, h, draw });

// ---------- playable balls (wrecker is 20x20 to match its 9px sim radius) ----------

def('ball_wrecker', 20, 20, (p) => {
  // construction-yellow wrecking ball, light from top-left, cool amber shadow
  p.sphere(10, 10, 9.3, [247, 197, 46], [148, 96, 14], [255, 242, 176]);
  // steel shackle cap on top
  p.sphere(10, 4, 2.6, [150, 160, 195], [70, 76, 120], [225, 232, 252]);
  p.set(10, 2, [40, 44, 74]);
  // rivets around the cap
  const riv: RGB = [110, 70, 10];
  for (const [x, y] of [[6, 7], [14, 7], [4, 12], [16, 12]] as const) p.set(x, y, riv);
  // heavy under-shade for mass
  for (let x = 5; x <= 15; x++) {
    for (let y = 16; y <= 18; y++) {
      const dx = x + 0.5 - 10;
      const dy = y + 0.5 - 10;
      if (dx * dx + dy * dy < 81) p.set(x, y, [172, 116, 22]);
    }
  }
});

/** Upright determined face — overlays the ball (ball spins beneath it, hamster-style). */
def('ball_face', 14, 9, (p) => {
  const dark: RGB = [46, 34, 12], glint: RGB = [255, 250, 235], brow: RGB = [32, 24, 8];
  // angled brows
  p.set(2, 1, brow); p.set(3, 2, brow); p.set(4, 2, brow);
  p.set(11, 1, brow); p.set(10, 2, brow); p.set(9, 2, brow);
  // solid 2x2 eyes
  for (const ex of [3, 9]) {
    p.rect(ex, 3, 2, 2, dark);
    p.set(ex, 3, glint);
  }
  // gritted mouth
  const teeth: RGB = [232, 222, 200];
  p.rect(4, 6, 6, 2, dark);
  p.set(5, 6, teeth); p.set(7, 6, teeth); p.set(9, 6, teeth);
});

def('ball_bouncy', 16, 16, (p) => {
  p.sphere(8, 8, 7, [255, 84, 112], [150, 30, 56], [255, 190, 205]);
  const band: RGB = [255, 190, 205];
  for (let x = 4; x <= 11; x++) p.set(x, 11, band);
  p.set(3, 10, band); p.set(12, 10, band);
});

def('ball_spiker', 16, 16, (p) => {
  const tip: RGB = [210, 255, 224], tipO: RGB = [24, 84, 48];
  for (const [dx, dy] of DIRS8) {
    p.set(8 + dx * 7, 8 + dy * 7, tipO);
    p.set(8 + dx * 6, 8 + dy * 6, tip);
  }
  p.sphere(8, 8, 5.5, [87, 227, 137], [24, 94, 56], [214, 255, 228]);
});

// ---------- ball rig attachments (each owned weapon/part mounts on the ball) ----------

const STEEL: RGB = [150, 160, 195];
const STEEL_D: RGB = [70, 76, 120];
const STEEL_L: RGB = [225, 232, 252];
const IRON_D: RGB = [44, 48, 76];

/** Seismic Slam — iron equator band with hazard chevrons (runs at y-offset, squashed in-engine). */
def('att_band', 24, 10, (p) => {
  const haz: RGB = [255, 150, 40], hazD: RGB = [190, 92, 16];
  for (let x = 0; x < 24; x++) {
    p.set(x, 3, STEEL_L); p.set(x, 4, STEEL); p.set(x, 5, STEEL_D); p.set(x, 6, IRON_D);
    // chevrons
    const c = (x + 2) % 6 < 3;
    if (c) { p.set(x, 4, haz); p.set(x, 5, x % 2 === 0 ? haz : hazD); }
  }
  p.set(1, 4, IRON_D); p.set(1, 5, IRON_D); p.set(22, 4, IRON_D); p.set(22, 5, IRON_D);
});

/** Gravity Crush — the band becomes a violet gravity collar with a glowing rift. */
def('att_band_gc', 24, 10, (p) => {
  const body: RGB = [124, 74, 200], dark: RGB = [66, 34, 120], rift: RGB = [240, 170, 255];
  for (let x = 0; x < 24; x++) {
    p.set(x, 3, [190, 150, 250]); p.set(x, 4, body); p.set(x, 5, dark); p.set(x, 6, [40, 20, 70]);
    if ((x + 1) % 7 < 3) { p.set(x, 4, rift); p.set(x, 5, [180, 90, 240]); }
  }
  p.set(4, 2, rift); p.set(19, 7, rift); // orbiting motes
});

/** Ricochet Round — steel cannon, points +x; rig rotates it to the aim angle. */
def('att_cannon', 13, 9, (p) => {
  const brass: RGB = [196, 150, 60], brassD: RGB = [120, 88, 24];
  // breech
  for (let y = 2; y <= 6; y++) for (let x = 0; x <= 3; x++) p.set(x, y, y <= 3 ? brass : brassD);
  // barrel
  for (let y = 3; y <= 5; y++) for (let x = 4; x <= 10; x++) p.set(x, y, y === 3 ? STEEL_L : y === 4 ? STEEL : STEEL_D);
  // muzzle ring
  for (let y = 2; y <= 6; y++) p.set(11, y, IRON_D);
  p.set(12, 4, [20, 22, 40]);
  // mount nub
  p.set(2, 7, IRON_D); p.set(3, 7, IRON_D);
});

/** Pinball Storm — the cannon goes gold with a target muzzle. */
def('att_cannon_pb', 13, 9, (p) => {
  const gold: RGB = [255, 208, 70], goldD: RGB = [180, 130, 30], red: RGB = [255, 70, 90];
  for (let y = 2; y <= 6; y++) for (let x = 0; x <= 3; x++) p.set(x, y, y <= 3 ? gold : goldD);
  for (let y = 3; y <= 5; y++) for (let x = 4; x <= 10; x++) p.set(x, y, y === 3 ? [255, 236, 160] : y === 4 ? gold : goldD);
  for (let y = 2; y <= 6; y++) p.set(11, y, red);
  p.set(12, 4, [160, 20, 40]);
  p.set(2, 7, IRON_D); p.set(3, 7, IRON_D);
});

/** Wreck Dash — rocket pack, nozzle points -x; rig rotates it opposite the aim. */
def('att_rocket', 12, 9, (p) => {
  const red: RGB = [235, 84, 84], redD: RGB = [140, 30, 44];
  // nozzle
  p.set(0, 4, [255, 170, 60]); p.set(1, 3, IRON_D); p.set(1, 5, IRON_D); p.set(2, 4, IRON_D);
  for (let y = 3; y <= 5; y++) p.set(3, y, STEEL_D);
  // body
  for (let y = 2; y <= 6; y++) for (let x = 4; x <= 9; x++) p.set(x, y, y === 2 ? [255, 170, 170] : y <= 4 ? red : redD);
  // nose + fins
  p.set(10, 3, redD); p.set(11, 4, redD);
  p.set(8, 1, redD); p.set(9, 1, redD); p.set(8, 7, redD); p.set(9, 7, redD);
});

/** Juggernaut — twin-nozzle heavy rocket, hazard orange stripes. */
def('att_rocket_jg', 12, 9, (p) => {
  const red: RGB = [200, 70, 60], or: RGB = [255, 150, 40];
  // twin nozzles clearly separated, opening -x
  for (const ny of [2, 6]) {
    p.set(0, ny, [255, 170, 60]);
    p.set(1, ny - 1, IRON_D); p.set(1, ny + 1, IRON_D); p.set(2, ny, IRON_D);
  }
  // body
  for (let y = 3; y <= 5; y++) for (let x = 3; x <= 10; x++) p.set(x, y, y === 3 ? [230, 120, 110] : y === 4 ? red : [120, 34, 30]);
  for (let x = 5; x <= 9; x += 2) p.set(x, 4, or);
  p.set(11, 4, STEEL_L);
});

/** Static Chain — tesla coil, copper windings, white-hot orb tip. */
def('att_coil', 9, 15, (p) => {
  const cop: RGB = [214, 132, 58], copD: RGB = [132, 72, 26];
  // base
  for (let y = 12; y <= 14; y++) for (let x = 2; x <= 6; x++) p.set(x, y, y === 12 ? STEEL : STEEL_D);
  // windings
  for (let y = 6; y <= 11; y++) for (let x = 3; x <= 5; x++) p.set(x, y, y % 2 === 0 ? cop : copD);
  // halo + orb
  p.set(4, 2, [200, 230, 255], 140);
  p.sphere(4, 4, 2.2, [255, 250, 210], [200, 160, 80], [255, 255, 250]);
});

/** Stormcaller — violet storm coil, bigger orb, fork stubs. */
def('att_coil_sc', 9, 15, (p) => {
  const vio: RGB = [158, 96, 236], vioD: RGB = [92, 52, 158];
  for (let y = 12; y <= 14; y++) for (let x = 2; x <= 6; x++) p.set(x, y, y === 12 ? [110, 80, 170] : [60, 40, 110]);
  for (let y = 5; y <= 11; y++) for (let x = 3; x <= 5; x++) p.set(x, y, y % 2 === 0 ? vio : vioD);
  p.set(1, 6, [220, 190, 255]); p.set(7, 8, [220, 190, 255]);
  p.set(4, 1, [230, 200, 255], 150);
  p.sphere(4, 3, 2.6, [250, 240, 255], [150, 100, 230], [255, 255, 255]);
});

/** Shock Trail — cyan capacitor cell. */
def('att_cell', 9, 11, (p) => {
  const glass: RGB = [110, 228, 255], glassD: RGB = [30, 130, 175], core: RGB = [240, 255, 255];
  for (let x = 2; x <= 6; x++) { p.set(x, 0, STEEL_L); p.set(x, 10, STEEL_D); }
  for (let y = 1; y <= 9; y++) for (let x = 1; x <= 7; x++) {
    if (x === 1 || x === 7 || y === 1 || y === 9) p.set(x, y, glassD);
    else p.set(x, y, glass);
  }
  p.rect(3, 4, 2, 3, core);
  p.set(5, 3, [200, 250, 255]);
});

/** Tesla Web — web-etched cell, brighter teal. */
def('att_cell_tw', 9, 11, (p) => {
  const glass: RGB = [90, 245, 220], glassD: RGB = [16, 140, 130], core: RGB = [255, 255, 255];
  for (let x = 2; x <= 6; x++) { p.set(x, 0, [190, 160, 250]); p.set(x, 10, [90, 70, 150]); }
  for (let y = 1; y <= 9; y++) for (let x = 1; x <= 7; x++) {
    if (x === 1 || x === 7 || y === 1 || y === 9) p.set(x, y, glassD);
    else p.set(x, y, glass);
  }
  p.rect(3, 4, 2, 3, core);
  p.set(0, 3, core, 200); p.set(8, 6, core, 200); // arc forks
});

/** Orbit Spikes — steel gyro hoop around the equator (squashed ellipse in-engine). */
def('att_hoop', 30, 12, (p) => {
  const cx = 15, cy = 6, rx = 13.2, ry = 4.8;
  for (let a = 0; a < 360; a++) {
    const rad = (a * Math.PI) / 180;
    const x = cx + Math.cos(rad) * rx;
    const y = cy + Math.sin(rad) * ry;
    const shade = Math.sin(rad);
    p.set(x, y, shade < -0.35 ? STEEL_L : shade > 0.35 ? STEEL_D : STEEL);
    p.set(x, y + Math.sin(rad) > 0 ? 1 : -1, shade > 0.35 ? IRON_D : STEEL_D);
  }
});

/** Sawring — the hoop becomes a spinning sawblade ring. */
def('att_hoop_sr', 30, 12, (p) => {
  const cx = 15, cy = 6, rx = 12.6, ry = 4.4;
  for (let a = 0; a < 360; a++) {
    const rad = (a * Math.PI) / 180;
    const x = cx + Math.cos(rad) * rx;
    const y = cy + Math.sin(rad) * ry;
    p.set(x, y, Math.sin(rad) > 0.3 ? STEEL_D : STEEL);
    // teeth every 24deg
    if (a % 24 < 10) {
      const tx = cx + Math.cos(rad) * (rx + 1.4);
      const ty = cy + Math.sin(rad) * (ry + 1.2);
      p.set(tx, ty, STEEL_L);
    }
  }
  for (const dx of [-6, 0, 6]) p.set(cx + dx, cy + (dx === 0 ? 4 : 3), [255, 90, 90]);
});

/** white flame jet, points -x (exhaust for the rocket pack); tinted at runtime */
def('att_flame', 10, 6, (p) => {
  const body: RGB = [255, 255, 255], mid: RGB = [255, 240, 200];
  for (let x = 0; x <= 8; x++) {
    const half = Math.max(0, Math.round((x / 8) * 2.4));
    for (let y = 3 - half; y <= 2 + half; y++) p.set(x, y, x % 3 === 2 ? mid : body);
  }
  p.set(9, 2, mid); p.set(9, 3, mid);
});

// ---------- passive charms (7x7 trinkets hung on the ball) ----------

def('charm_mass', 7, 7, (p) => {
  const a: RGB = [150, 90, 220], d: RGB = [84, 44, 140], hole: RGB = [40, 20, 70];
  p.rect(2, 1, 3, 1, a); p.rect(1, 2, 5, 3, a); p.rect(2, 5, 3, 1, a);
  p.set(1, 2, d); p.set(1, 4, d); p.set(5, 2, d); p.set(5, 4, d);
  p.rect(3, 3, 2, 1, hole);
  p.set(2, 2, [214, 176, 255]);
});

def('charm_velocity', 7, 7, (p) => {
  const g: RGB = [110, 230, 140], d: RGB = [24, 94, 56];
  // two clean chevrons pointing right
  p.set(1, 1, d); p.set(2, 2, g); p.set(3, 3, g); p.set(2, 4, g); p.set(1, 5, d);
  p.set(4, 1, d); p.set(5, 2, g); p.set(5, 3, g); p.set(5, 4, g); p.set(4, 5, d);
});

def('charm_magnet', 7, 7, (p) => {
  const b: RGB = [90, 150, 255], d: RGB = [40, 80, 170];
  p.set(1, 1, d); p.set(2, 1, b); p.set(4, 1, b); p.set(5, 1, d);
  p.set(1, 2, b); p.set(5, 2, b);
  p.set(1, 3, b); p.set(5, 3, b);
  p.set(1, 4, b); p.set(5, 4, b);
  p.set(1, 5, b); p.set(5, 5, b);
  p.set(1, 6, [240, 248, 255]); p.set(5, 6, [240, 248, 255]);
});

def('charm_vitality', 7, 7, (p) => {
  const r: RGB = [255, 92, 112], d: RGB = [150, 30, 50];
  p.set(2, 1, r); p.set(3, 1, r); p.set(4, 1, r);
  p.rect(1, 2, 5, 2, r);
  p.set(2, 4, r); p.set(3, 5, r); p.set(4, 4, r);
  p.set(1, 2, d); p.set(5, 2, d); p.set(4, 4, d);
  p.set(2, 2, [255, 200, 210]);
});

def('charm_regen', 7, 7, (p) => {
  const c: RGB = [190, 240, 90], d: RGB = [90, 130, 30];
  p.rect(3, 1, 2, 6, c);
  p.rect(1, 3, 6, 2, c);
  p.set(3, 6, d); p.set(4, 6, d);
  p.set(2, 3, [230, 255, 170]);
});

def('charm_impact', 7, 7, (p) => {
  const o: RGB = [255, 160, 60], d: RGB = [180, 90, 20];
  p.set(3, 0, o); p.set(3, 6, o);
  p.set(0, 3, o); p.set(6, 3, o);
  p.set(1, 1, d); p.set(5, 1, d); p.set(1, 5, d); p.set(5, 5, d);
  p.rect(2, 2, 3, 3, [255, 220, 150]);
  p.set(3, 3, [255, 250, 230]);
});

def('charm_ricochet', 7, 7, (p) => {
  const t: RGB = [196, 148, 96], d: RGB = [110, 76, 40];
  for (let y = 1; y <= 6; y++) for (let x = 1; x <= 5; x++) {
    if ((x === 1 || x === 5) && (y === 1 || y === 6)) continue;
    p.set(x, y, x === 1 || y === 1 ? [230, 190, 140] : t);
  }
  p.set(5, 6, d); p.set(4, 6, d);
  p.set(3, 3, d); p.set(4, 4, d); // bounce mark
});

def('charm_luck', 7, 7, (p) => {
  const g: RGB = [96, 220, 116], d: RGB = [30, 120, 52], gold: RGB = [255, 214, 80];
  p.set(2, 2, g); p.set(1, 3, g); p.set(2, 4, g);
  p.set(4, 2, g); p.set(5, 3, g); p.set(4, 4, g);
  p.set(3, 3, d); p.set(3, 4, g); p.set(3, 5, g); p.set(3, 6, d);
  p.set(5, 1, gold); p.set(6, 1, gold); p.set(5, 0, gold);
});

// ---------- enemies ----------

def('imp', 16, 16, (p) => {
  p.triangleUp(5, 4, 3, [255, 210, 160], [90, 50, 20]);
  p.triangleUp(10, 4, 3, [255, 210, 160], [90, 50, 20]);
  p.sphere(8, 9, 6, [255, 159, 67], [150, 70, 15], [255, 220, 170]);
  p.eyes(8, 8, 3, [40, 20, 8], [255, 240, 220]);
  p.set(6, 13, WHITE); p.set(9, 13, WHITE);
});

def('swarmie', 16, 16, (p) => {
  p.sphere(8, 9, 4.5, [255, 126, 219], [140, 40, 110], [255, 205, 240]);
  p.eyes(8, 9, 2, [50, 10, 40], WHITE);
});

def('tank', 20, 20, (p) => {
  p.sphere(10, 11, 8.5, [125, 135, 184], [55, 60, 96], [205, 214, 246]);
  const band: RGB = [86, 48, 26], bandL: RGB = [150, 90, 50];
  for (let x = 3; x <= 16; x++) { p.set(x, 5, bandL); p.set(x, 6, band); }
  p.eyes(10, 10, 4, [20, 22, 40], [255, 230, 120]);
  p.set(5, 14, [40, 45, 70]); p.set(15, 14, [40, 45, 70]);
});

def('splitter', 16, 16, (p) => {
  p.ellipse(8, 10, 6.5, 5, [77, 225, 255], [20, 100, 140], [220, 250, 255]);
  p.eyes(8, 9, 3, [8, 40, 60], WHITE);
});

def('splitter_half', 16, 16, (p) => {
  p.ellipse(8, 11, 4, 3.4, [77, 225, 255], [20, 100, 140], [220, 250, 255]);
  p.eyes(8, 10, 2, [8, 40, 60], WHITE);
});

def('spitter', 16, 16, (p) => {
  p.sphere(8, 9, 6, [178, 102, 255], [90, 30, 150], [235, 205, 255]);
  const mouth: RGB = [30, 8, 50];
  p.rect(7, 12, 3, 2, mouth);
  p.eyes(8, 7, 3, [30, 8, 50], [255, 200, 255]);
});

def('exploder', 16, 16, (p) => {
  p.set(8, 2, [255, 220, 120]); p.set(9, 1, [255, 160, 60]);
  p.sphere(8, 9, 6, [52, 56, 80], [18, 20, 34], [120, 126, 160]);
  p.eyes(8, 8, 3, [10, 8, 16], [255, 90, 90]);
  p.rect(7, 13, 3, 1, [255, 90, 90]);
});

def('boss', 32, 32, (p) => {
  p.triangleUp(7, 9, 7, [255, 210, 160], [80, 40, 16]);
  p.triangleUp(24, 9, 7, [255, 210, 160], [80, 40, 16]);
  p.sphere(16, 18, 13, [190, 60, 80], [80, 16, 34], [255, 170, 185]);
  for (let x = 5; x <= 26; x++) p.set(x, 12, [255, 170, 185]);
  const glow: RGB = [255, 220, 90];
  p.rect(10, 16, 3, 2, glow);
  p.rect(19, 16, 3, 2, glow);
  p.set(10, 18, [180, 120, 20]); p.set(21, 18, [180, 120, 20]);
  const maw: RGB = [50, 8, 18];
  for (let x = 11; x <= 20; x++) { p.set(x, 24, maw); p.set(x, 25, maw); }
  for (const x of [12, 15, 18]) p.set(x, 24, WHITE);
});

// ---------- projectiles / pickups / fx ----------

def('shot', 8, 8, (p) => {
  const c: RGB = [255, 240, 150];
  p.set(3, 1, c); p.set(4, 1, c);
  p.set(2, 2, c); p.set(3, 2, WHITE); p.set(4, 2, WHITE); p.set(5, 2, c);
  p.rect(1, 3, 6, 1, WHITE);
  p.set(2, 4, c); p.set(3, 4, WHITE); p.set(4, 4, WHITE); p.set(5, 4, c);
  p.set(3, 5, c); p.set(4, 5, c);
});

def('spike', 10, 10, (p) => {
  const s: RGB = [200, 210, 240], o: RGB = [50, 55, 90];
  for (const [dx, dy] of DIRS8) {
    p.set(5 + dx * 4, 5 + dy * 4, o);
    p.set(5 + dx * 3, 5 + dy * 3, s);
  }
  p.sphere(5, 5, 2.6, [140, 150, 200], [70, 76, 120], [230, 235, 255]);
});

def('gem', 8, 8, (p) => {
  const c: RGB = [77, 225, 255], d: RGB = [24, 120, 160], w: RGB = [220, 252, 255];
  p.set(3, 0, c); p.set(4, 0, c);
  for (let y = 1; y <= 5; y++) {
    const half = y <= 2 ? y + 1 : 6 - y;
    for (let x = 4 - half; x <= 3 + half; x++) p.set(x, y, (x + y) % 3 === 0 ? d : c);
  }
  p.set(3, 6, d); p.set(4, 6, d);
  p.set(3, 2, w); p.set(2, 3, w);
});

def('coin', 8, 8, (p) => {
  p.sphere(4, 4, 3.4, [255, 210, 63], [170, 120, 20], [255, 245, 180]);
  const mark: RGB = [170, 120, 20];
  p.set(4, 3, mark); p.set(4, 5, mark); p.set(3, 4, mark); p.set(5, 4, mark);
});

def('ring', 32, 32, (p) => {
  const r = 14;
  for (let a = 0; a < 360; a += 1) {
    const rad = (a * Math.PI) / 180;
    p.set(16 + Math.cos(rad) * r, 16 + Math.sin(rad) * r, WHITE);
    p.set(16 + Math.cos(rad) * (r - 1), 16 + Math.sin(rad) * (r - 1), WHITE);
  }
});

def('spark', 4, 4, (p) => {
  p.rect(1, 0, 2, 4, WHITE);
  p.rect(0, 1, 4, 2, WHITE);
});

/** 4-point star flash — muzzle bursts, impacts, sparkles. Tint at runtime. */
def('muzzle', 9, 9, (p) => {
  const c: RGB = [255, 255, 255], mid: RGB = [255, 240, 200];
  // vertical + horizontal rays
  for (let i = 0; i < 4; i++) {
    p.set(4, 1 + i, c); p.set(4, 5 + i, c);
    p.set(1 + i, 4, c); p.set(5 + i, 4, c);
  }
  // diagonal stubs
  p.set(2, 2, mid); p.set(6, 2, mid); p.set(2, 6, mid); p.set(6, 6, mid);
  // hot core
  p.rect(3, 3, 3, 3, WHITE);
  p.set(4, 3, mid); p.set(3, 4, mid); p.set(5, 4, mid); p.set(4, 5, mid);
});

/** Elongated streak — motion trails, debris, speed lines. Rotate at runtime. */
def('shard', 8, 3, (p) => {
  const tip: RGB = [255, 255, 255], body: RGB = [230, 230, 255];
  p.rect(2, 1, 5, 1, body);
  p.set(1, 1, body);
  p.set(7, 1, WHITE);
  p.set(7, 0, body);
  p.set(0, 1, tip);
});

// ---------- environment (neutral gray — biomes tint these at runtime) ----------

const tileDef = (variant: number) => (p: Px) => {
  const base: RGB = variant === 2 ? [64, 64, 74] : variant === 3 ? [54, 54, 63] : [59, 59, 69];
  p.rect(0, 0, 16, 16, base);
  const seam: RGB = [44, 44, 52];
  for (let i = 0; i < 16; i++) { p.set(i, 15, seam); p.set(15, i, seam); }
  const dot: RGB = [72, 72, 83];
  const dots: Array<[number, number]> = variant === 1
    ? [[3, 4], [9, 2], [12, 8], [5, 11], [10, 13]]
    : variant === 2
      ? [[2, 9], [7, 5], [13, 3], [11, 12]]
      : [[5, 2], [3, 12], [9, 9], [13, 10]];
  for (const [x, y] of dots) { p.set(x, y, dot); p.set(x + 1, y, dot); }
};
def('tile1', 16, 16, tileDef(1));
def('tile2', 16, 16, tileDef(2));
def('tile3', 16, 16, tileDef(3));

def('wall', 16, 34, (p) => {
  // 3/4 wall: tall face with parapet, footprint is the bottom 16px
  const brick: RGB = [118, 118, 130], dark: RGB = [70, 70, 82], edge: RGB = [56, 56, 66], top: RGB = [152, 152, 164];
  p.rect(0, 0, 16, 5, top);
  p.rect(0, 5, 16, 2, dark);
  for (let y = 7; y < 32; y += 8) {
    for (let x = 0; x < 16; x++) {
      p.set(x, y, dark);
      p.set(x, y + 7, dark);
      for (let b = 1; b <= 6; b++) p.set(x, y + b, brick);
    }
    const off = ((y - 7) / 8) % 2 === 0 ? 0 : 8;
    for (let y2 = y; y2 < y + 8; y2++) { p.set((off + 4) % 16, y2, dark); p.set((off + 12) % 16, y2, dark); }
  }
  for (let i = 0; i < 16; i++) p.set(i, 33, edge);
});

def('shadow', 18, 7, (p) => {
  // soft dark ellipse, alpha applied at runtime
  const c: RGB = [10, 10, 16];
  for (let x = 2; x <= 15; x++) { p.set(x, 2, c, 110); p.set(x, 3, c, 130); p.set(x, 4, c, 110); }
  for (let x = 4; x <= 13; x++) { p.set(x, 1, c, 70); p.set(x, 5, c, 70); }
});

def('crack', 16, 16, (p) => {
  const c: RGB = [34, 34, 40];
  let y = 2;
  for (let x = 1; x < 15; x++) {
    p.set(x, y, c);
    if (x % 3 === 0) { p.set(x, y + 1, c); y += x % 2 === 0 ? 1 : -1; }
    if (y < 2) y = 2;
    if (y > 13) y = 13;
  }
  p.set(4, 6, c); p.set(5, 7, c); p.set(11, 9, c); p.set(12, 10, c);
});

def('plate', 16, 16, (p) => {
  const edge: RGB = [86, 86, 98], hole: RGB = [40, 40, 48];
  for (let i = 0; i < 16; i++) { p.set(i, 0, edge); p.set(i, 15, edge); p.set(0, i, edge); p.set(15, i, edge); }
  p.set(3, 3, hole); p.set(4, 3, hole); p.set(3, 4, hole);
  p.set(12, 3, hole); p.set(11, 3, hole); p.set(12, 4, hole);
  p.set(3, 12, hole); p.set(4, 12, hole); p.set(3, 11, hole);
  p.set(12, 12, hole); p.set(11, 12, hole); p.set(12, 11, hole);
});

def('grate', 16, 16, (p) => {
  const bar: RGB = [92, 92, 104], hole: RGB = [30, 30, 36];
  for (let y = 1; y < 15; y += 3) for (let x = 1; x < 15; x++) p.set(x, y, hole);
  for (let x = 1; x < 15; x += 4) for (let y = 1; y < 15; y++) p.set(x, y, bar);
});

def('glowcrack', 16, 16, (p) => {
  const core: RGB = [255, 255, 255], mid: RGB = [220, 220, 220];
  let y = 8;
  for (let x = 1; x < 15; x++) {
    p.set(x, y, core);
    p.set(x, y + 1, mid, 140);
    if (x % 4 === 0) { y += x % 8 === 0 ? 1 : -1; p.set(x, y + 2, mid, 90); }
    if (y < 4) y = 4;
    if (y > 11) y = 11;
  }
});

def('rubble', 12, 12, (p) => {
  const a: RGB = [96, 96, 108], b: RGB = [70, 70, 80], c: RGB = [118, 118, 130];
  p.sphere(4, 7, 3, a, b, c);
  p.sphere(9, 5, 2.2, a, b, c);
  p.sphere(8, 9, 1.6, a, b, c);
});

/** Little comedic ghost that pops out of small enemies on death. White so it tints. */
def('ghost', 12, 12, (p) => {
  const body: RGB = [255, 255, 255], shade: RGB = [214, 222, 246];
  // dome
  for (let y = 1; y <= 6; y++) {
    const half = Math.round(Math.sqrt(Math.max(0, 36 - (y - 6) * (y - 6) * 1.44)) * 0.92);
    for (let x = 6 - half; x <= 5 + half; x++) p.set(x, y, (y === 6 || x === 6 - half) ? shade : body);
  }
  // body sides
  for (let y = 7; y <= 9; y++) { p.set(1, y, shade); for (let x = 2; x <= 9; x++) p.set(x, y, body); p.set(10, y, shade); }
  // wavy tail
  for (let x = 1; x <= 10; x++) {
    const dip = x % 4 < 2 ? 10 : 11;
    p.set(x, dip, x % 4 < 2 ? body : shade);
  }
  // eyes + open mouth (dark, stay dark when tinted)
  const eye: RGB = [30, 34, 58];
  p.set(4, 5, eye); p.set(4, 6, eye);
  p.set(7, 5, eye); p.set(7, 6, eye);
  p.set(5, 8, eye); p.set(6, 8, eye);
});

// ---------- pack ----------

function pack(): PNG {
  const pad = 2;
  type Slot = { name: string; x: number; y: number };
  const slots: Slot[] = [];
  let x = 0;
  let y = 0;
  let rowH = 0;
  for (const s of sprites) {
    const w = s.w + pad;
    const h = s.h + pad;
    if (x + w > 512) { x = 0; y += rowH; rowH = 0; }
    slots.push({ name: s.name, x: x + 1, y: y + 1 });
    x += w;
    rowH = Math.max(rowH, h);
  }
  const W = 512;
  const H = y + rowH;
  const atlas = new Px(W, H);

  const frames: Record<string, unknown> = {};
  for (let i = 0; i < sprites.length; i++) {
    const s = sprites[i];
    const slot = slots[i];
    const tmp = new Px(s.w, s.h);
    s.draw(tmp);
    for (let py = 0; py < tmp.h; py++) {
      for (let px = 0; px < tmp.w; px++) {
        const j = (py * tmp.w + px) * 4;
        if (tmp.data[j + 3] > 0) atlas.set(slot.x + px, slot.y + py, [tmp.data[j], tmp.data[j + 1], tmp.data[j + 2]], tmp.data[j + 3]);
      }
    }
    frames[s.name] = { frame: { x: slot.x, y: slot.y, w: s.w, h: s.h } };
  }

  const png = new PNG({ width: W, height: H });
  atlas.data.copy(png.data, 0, 0, Math.min(atlas.data.length, png.data.length));

  const json = JSON.stringify({ frames, meta: { image: 'atlas.png', size: { w: W, h: H }, scale: 1 } });
  const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'atlas.png'), PNG.sync.write(png));
  writeFileSync(join(outDir, 'atlas.json'), json);
  console.log(`atlas: ${W}x${H}, ${sprites.length} sprites -> public/`);
  return png;
}

pack();
