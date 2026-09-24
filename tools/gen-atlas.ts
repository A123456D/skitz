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

// ---------- playable balls (wrecker family is 20x20 to match its 9px sim radius) ----------

interface BallPal { base: RGB; dark: RGB; light: RGB; capA: RGB; capB: RGB; capC: RGB }

const WRECKER_PAL: BallPal = { base: [247, 197, 46], dark: [148, 96, 14], light: [255, 242, 176], capA: [150, 160, 195], capB: [70, 76, 120], capC: [225, 232, 252] };
const EMBER_PAL: BallPal = { base: [255, 122, 56], dark: [148, 44, 12], light: [255, 214, 160], capA: [120, 96, 96], capB: [58, 44, 48], capC: [235, 210, 205] };
const VOID_PAL: BallPal = { base: [118, 88, 190], dark: [44, 28, 88], light: [198, 172, 255], capA: [86, 92, 140], capB: [36, 40, 72], capC: [188, 196, 240] };

function drawWrecker(p: Px, c: BallPal): void {
  // heavy ball, light from top-left, cool shadow
  p.sphere(10, 10, 9.3, c.base, c.dark, c.light);
  // shackle cap on top
  p.sphere(10, 4, 2.6, c.capA, c.capB, c.capC);
  p.set(10, 2, [40, 44, 74]);
  const riv: RGB = [110, 70, 10];
  for (const [x, y] of [[6, 7], [14, 7], [4, 12], [16, 12]] as const) p.set(x, y, riv);
  for (let x = 5; x <= 15; x++) {
    for (let y = 16; y <= 18; y++) {
      const dx = x + 0.5 - 10;
      const dy = y + 0.5 - 10;
      if (dx * dx + dy * dy < 81) p.set(x, y, [Math.round(c.dark[0] * 1.16), Math.round(c.dark[1] * 1.2), Math.round(c.dark[2] * 1.4)]);
    }
  }
}

def('ball_wrecker', 20, 20, (p) => drawWrecker(p, WRECKER_PAL));
def('ball_wrecker_ember', 20, 20, (p) => drawWrecker(p, EMBER_PAL));
def('ball_wrecker_void', 20, 20, (p) => drawWrecker(p, VOID_PAL));

/** VOLT — smooth cyan live-wire ball with a tesla nub and a zigzag charge. */
def('ball_volt', 20, 20, (p) => {
  p.sphere(10, 10, 9.3, [96, 222, 255], [18, 104, 158], [226, 252, 255]);
  // tesla nub on top
  p.sphere(10, 3.6, 2.2, [214, 132, 58], [132, 72, 26], [255, 220, 160]);
  p.set(10, 1, [255, 255, 220]);
  // electric zigzag decal
  const zap: RGB = [240, 255, 255], zapD: RGB = [130, 210, 250];
  p.set(7, 8, zapD); p.set(8, 7, zap); p.set(9, 8, zap); p.set(10, 7, zap);
  p.set(11, 8, zap); p.set(12, 7, zapD); p.set(13, 8, zapD);
  p.set(6, 13, zapD); p.set(7, 12, zap); p.set(8, 13, zap);
  // under-shade
  for (let x = 5; x <= 15; x++) {
    for (let y = 16; y <= 18; y++) {
      const dx = x + 0.5 - 10;
      const dy = y + 0.5 - 10;
      if (dx * dx + dy * dy < 81) p.set(x, y, [24, 128, 182]);
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

/** Wreckang — boomerang rack mounted on the ball's shoulder (points up-left). */
def('att_rang', 12, 11, (p) => {
  const steel: RGB = [176, 196, 232], steelD: RGB = [70, 80, 120], stripe: RGB = [96, 222, 255];
  // V boomerang, arms up
  for (let i = 0; i < 7; i++) {
    p.set(2 + i, 8 - i, i < 5 ? steel : steelD);      // left arm rising
    p.set(9 - i, 8 - i, i < 5 ? steel : steelD);      // right arm rising
  }
  for (let i = 0; i < 3; i++) { p.set(4 + i, 4 - 0 - 0, stripe); p.set(7 - i, 4, stripe); }
  // mount pad
  p.set(5, 9, steelD); p.set(6, 9, steelD); p.set(5, 10, steelD); p.set(6, 10, steelD);
});

/** Doomrangs — twin violet boomerangs on the rack. */
def('att_rang_dr', 12, 11, (p) => {
  const vio: RGB = [186, 120, 250], vioD: RGB = [92, 52, 158], stripe: RGB = [255, 170, 255];
  for (let i = 0; i < 7; i++) {
    p.set(2 + i, 8 - i, i < 5 ? vio : vioD);
    p.set(9 - i, 8 - i, i < 5 ? vio : vioD);
    p.set(4 + i, 10 - i, i < 4 ? vioD : vio); // second, offset rang
  }
  p.set(5, 3, stripe); p.set(6, 3, stripe);
  p.set(5, 9, vioD); p.set(6, 9, vioD); p.set(5, 10, vioD); p.set(6, 10, vioD);
});

/** Flying boomerang projectile — chunky chevron, spins in-engine. Tintable. */
def('rang_bolt', 11, 11, (p) => {
  const steel: RGB = [210, 224, 248], steelD: RGB = [70, 80, 120], tip: RGB = [255, 255, 255];
  for (let i = 0; i < 5; i++) {
    p.set(1 + i, 8 - i, steel);
    p.set(9 - i, 8 - i, steel);
  }
  p.set(0, 9, steelD); p.set(1, 9, steelD); p.set(9, 9, steelD); p.set(10, 9, steelD);
  p.set(5, 3, tip); p.set(4, 4, steelD); p.set(6, 4, steelD);
  p.set(2, 6, steelD); p.set(8, 6, steelD);
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
  // tiny scuttling bug: round body, antennae, splayed legs, big nervous eyes
  const body: RGB = [255, 126, 219], bodyD: RGB = [140, 40, 110], bodyL: RGB = [255, 205, 240];
  const leg: RGB = [100, 28, 80];
  // legs (3 per side, splayed)
  for (const [x0, y0, x1, y1] of [[3, 9, 1, 11], [3, 12, 1, 14], [12, 9, 14, 11], [12, 12, 14, 14]] as const) {
    p.set(x0, y0, leg); p.set(x1, y1, leg);
  }
  // body
  p.sphere(8, 9, 4.6, body, bodyD, bodyL);
  // shell seam
  for (let x = 5; x <= 11; x++) p.set(x, 11, bodyD);
  // antennae
  p.set(6, 4, leg); p.set(5, 3, leg); p.set(6, 3, bodyL);
  p.set(10, 4, leg); p.set(11, 3, leg); p.set(10, 3, bodyL);
  // big nervous eyes (white sclera + dark pupil)
  for (const ex of [6, 10]) {
    p.set(ex, 7, [255, 255, 255]); p.set(ex + 1, 7, [255, 255, 255]);
    p.set(ex, 8, [255, 255, 255]);
    p.set(ex, 7, [40, 10, 40]);
  }
  p.set(6, 7, [255, 255, 255]); p.set(10, 7, [255, 255, 255]);
  p.set(7, 8, [40, 10, 40]); p.set(11, 8, [40, 10, 40]);
});






/** 3/4 pinball bumper dome: squash-scales on hit (tinted pink at runtime) */
def('bumper_dome', 26, 18, (p) => {
  const base: RGB = [110, 116, 150], baseD: RGB = [56, 60, 92], dome: RGB = [210, 216, 240];
  // base plate
  for (let y = 13; y < 18; y++) for (let x = 3; x < 23; x++) {
    p.set(x, y, y === 13 ? base : y >= 17 ? baseD : [86, 90, 122]);
  }
  // dome
  p.ellipse(13, 9, 10, 6, dome, baseD, [244, 248, 255]);
  // specular
  p.set(9, 5, [255, 255, 255]); p.set(10, 4, [255, 255, 255]); p.set(11, 4, [255, 255, 255]);
  // band around the dome foot
  for (let x = 5; x < 21; x++) p.set(x, 12, baseD);
});

def('tank', 20, 20, (p) => {
  p.sphere(10, 11, 8.5, [125, 135, 184], [55, 60, 96], [205, 214, 246]);
  const band: RGB = [86, 48, 26], bandL: RGB = [150, 90, 50];
  for (let x = 3; x <= 16; x++) { p.set(x, 5, bandL); p.set(x, 6, band); }
  p.eyes(10, 10, 4, [20, 22, 40], [255, 230, 120]);
  p.set(5, 14, [40, 45, 70]); p.set(15, 14, [40, 45, 70]);
});

def('splitter', 16, 16, (p) => {
  // jelly with a visible inner nucleus, membrane sheen and a forming drip
  const a: RGB = [77, 225, 255], d: RGB = [20, 100, 140], l: RGB = [220, 250, 255];
  p.ellipse(8, 10, 6.5, 5, a, d, l);
  for (const [x, y] of [[4, 7], [5, 6], [6, 5], [7, 5], [8, 5]] as const) p.set(x, y, l);
  p.sphere(8, 11, 2.4, [30, 160, 200], [12, 90, 120], [150, 220, 250]);
  p.set(7, 10, [200, 240, 255]);
  p.set(12, 14, a); p.set(12, 15, d);
  p.rect(4, 9, 2, 2, [8, 40, 60]);
  p.rect(10, 9, 2, 2, [8, 40, 60]);
  p.set(4, 9, [220, 250, 255]); p.set(10, 9, [220, 250, 255]);
});

def('splitter_half', 16, 16, (p) => {
  const a: RGB = [77, 225, 255], d: RGB = [20, 100, 140], l: RGB = [220, 250, 255];
  p.ellipse(8, 11, 4, 3.4, a, d, l);
  for (const [x, y] of [[5, 9], [6, 8], [7, 8]] as const) p.set(x, y, l);
  p.sphere(8, 12, 1.5, [30, 160, 200], [12, 90, 120], [150, 220, 250]);
  p.set(6, 10, [8, 40, 60]); p.set(10, 10, [8, 40, 60]);
  p.set(11, 14, a);
});

def('spitter', 16, 16, (p) => {
  // pitcher-plant horror: bulbous head, wide-open glowing maw, spotted hide
  const a: RGB = [178, 102, 255], d: RGB = [90, 30, 150], l: RGB = [235, 205, 255];
  p.sphere(8, 7.6, 6.2, a, d, l);
  for (const [x, y] of [[3, 5], [12, 4], [13, 8], [3, 9]] as const) p.set(x, y, [140, 70, 210]);
  p.rect(5, 11, 7, 4, [30, 8, 50]);
  p.rect(6, 13, 5, 2, [255, 170, 90]);
  p.set(6, 12, [255, 210, 130]); p.set(10, 12, [255, 210, 130]);
  p.set(5, 11, [60, 16, 90]); p.set(11, 11, [60, 16, 90]);
  for (let x = 4; x <= 12; x++) p.set(x, 10, l);
  for (const ex of [4, 10]) {
    p.rect(ex, 5, 2, 2, [20, 6, 36]);
    p.set(ex, 5, [255, 220, 255]);
  }
  for (let x = 3; x <= 6; x++) p.set(x, 4, d);
  for (let x = 9; x <= 12; x++) p.set(x, 4, d);
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

/** KRUSHER — the pit's drill guardian. Angular steel wedge vs BONZAR's round maw. */
def('boss_krusher', 32, 32, (p) => {
  const shell: RGB = [126, 136, 178], shellD: RGB = [48, 54, 88], shellL: RGB = [208, 216, 244];
  const haz: RGB = [255, 190, 40], hazD: RGB = [180, 120, 16];
  // big drill horn: wide base tapering to a hot tip, segmented
  for (let i = 0; i < 13; i++) {
    const half = Math.max(0, Math.round(6 - (i * 6) / 12));
    for (let x = 16 - half; x <= 16 + half; x++) p.set(x, 10 - i, i % 3 === 0 ? shellD : shellL);
  }
  p.set(16, 0, [255, 240, 200]); p.set(15, 1, haz); p.set(16, 1, haz); p.set(17, 1, haz);
  // heavy dome shell
  p.sphere(16, 21, 11.5, shell, shellD, shellL);
  // hazard chevron band
  for (let x = 6; x <= 25; x++) {
    const yy = 19 + Math.round(Math.abs(x - 15.5) / 2.4);
    p.set(x, yy, (x % 4 < 2) ? haz : hazD);
    p.set(x, yy + 1, (x % 4 < 2) ? hazD : haz);
  }
  // glowing slit eyes under the drill base
  const eye: RGB = [255, 96, 64], glow: RGB = [255, 200, 110];
  p.rect(8, 14, 5, 2, eye); p.rect(19, 14, 5, 2, eye);
  p.set(9, 14, glow); p.set(20, 14, glow);
  // brow ridge
  for (let x = 7; x <= 12; x++) p.set(x, 13, shellD);
  for (let x = 19; x <= 24; x++) p.set(x, 13, shellD);
  // treads: wide stubby feet
  for (const [x0, y0] of [[3, 30], [21, 30]] as const) {
    for (let x = x0; x < x0 + 8; x++) { p.set(x, y0, shellD); p.set(x, y0 + 1, [26, 30, 50]); }
  }
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

// ---------- obstacles (were MISSING from the atlas — obstacles rendered invisible) ----------

const WOOD: RGB = [196, 156, 96], WOOD_D: RGB = [120, 88, 48], WOOD_L: RGB = [230, 196, 140];
const WOOD_EDGE: RGB = [74, 52, 28];

/** ammo crate: plank face, corner brackets, stencil mark */
def('crate', 20, 20, (p) => {
  for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) {
    const edge = x === 0 || y === 0 || x === 19 || y === 19;
    p.set(x, y, edge ? WOOD_EDGE : (x + y) % 7 === 0 ? WOOD_D : WOOD);
  }
  // top-lit plank bevel
  for (let x = 1; x < 19; x++) p.set(x, 1, WOOD_L);
  for (let y = 1; y < 19; y++) p.set(1, y, y < 4 ? WOOD_L : WOOD);
  // horizontal plank seams
  for (const yy of [6, 13]) for (let x = 1; x < 19; x++) p.set(x, yy, WOOD_D);
  // corner brackets
  const br: RGB = [110, 118, 150], brD: RGB = [56, 62, 96];
  for (const [bx, by] of [[2, 2], [15, 2], [2, 15], [15, 15]] as const) {
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) p.set(bx + x, by + y, (x === 0 || y === 0) ? br : brD);
  }
  // stencil chevron
  const st: RGB = [90, 62, 30];
  p.set(8, 9, st); p.set(9, 10, st); p.set(10, 9, st); p.set(11, 10, st);
  p.set(8, 12, st); p.set(10, 12, st); p.set(12, 12, st);
});

/** cracked crate overlay: swap in when damaged (stage 1) */
def('crate_dmg', 20, 20, (p) => {
  const c: RGB = [52, 38, 22];
  for (let x = 3; x <= 9; x++) p.set(x, 4 + (x % 3), c);
  p.set(9, 7, c); p.set(10, 8, c); p.set(11, 9, c); p.set(12, 10, c);
  for (let y = 11; y <= 17; y++) p.set(14 - (y % 3), y, c);
  p.set(5, 13, c); p.set(6, 14, c); p.set(4, 15, c);
  // splinters missing at a corner
  for (const [x, y] of [[17, 2], [18, 2], [18, 3], [16, 1]] as const) p.set(x, y, [0, 0, 0], 0);
  p.set(15, 2, WOOD_D); p.set(17, 4, WOOD_D);
});

/** heavy-crack overlay: near-breaking (stage 2) */
def('crate_dmg2', 20, 20, (p) => {
  const c: RGB = [44, 32, 18];
  for (let x = 2; x <= 17; x++) p.set(x, 9 + (x % 2), c);
  for (let y = 2; y <= 17; y++) p.set(9 + (y % 2), y, c);
  for (const [x, y] of [[16, 2], [17, 2], [18, 2], [17, 3], [18, 3], [3, 16], [2, 17], [3, 17], [2, 16]] as const) p.set(x, y, [0, 0, 0], 0);
  p.set(6, 4, c); p.set(7, 5, c); p.set(13, 14, c); p.set(14, 15, c);
});

/** indestructible pillar: riveted steel column, base-anchored footprint */
def('pillar', 20, 30, (p) => {
  const steel: RGB = [128, 138, 172], steelD: RGB = [64, 70, 108], steelL: RGB = [196, 206, 236];
  // column shaft with vertical shading
  for (let y = 0; y < 26; y++) for (let x = 3; x < 17; x++) {
    p.set(x, y, x <= 5 ? steelL : x <= 9 ? steel : x <= 13 ? steelD : [48, 54, 84]);
  }
  // horizontal flange rings
  for (const yy of [5, 14, 22]) {
    for (let x = 2; x < 18; x++) { p.set(x, yy, steelL); p.set(x, yy + 1, steelD); }
  }
  // rivets on rings
  const riv: RGB = [30, 34, 58];
  for (const yy of [5, 14, 22]) for (const xx of [4, 9, 14]) p.set(xx, yy, riv);
  // footing base
  for (let y = 26; y < 30; y++) for (let x = 0; x < 20; x++) {
    p.set(x, y, y === 26 ? steelL : y === 29 ? [30, 34, 54] : steel);
  }
  for (const xx of [2, 9, 16]) { p.set(xx, 27, riv); p.set(xx, 28, riv); }
});

/** loot chest: steel-banded wooden strongbox, gold latch */
def('chest', 24, 20, (p) => {
  for (let y = 0; y < 20; y++) for (let x = 0; x < 24; x++) {
    const edge = x === 0 || y === 0 || x === 23 || y === 19;
    p.set(x, y, edge ? WOOD_EDGE : (x * 3 + y) % 11 === 0 ? WOOD_D : WOOD);
  }
  for (let x = 1; x < 23; x++) p.set(x, 1, WOOD_L);
  // steel bands
  const band: RGB = [128, 138, 172], bandD: RGB = [64, 70, 108];
  for (const xx of [4, 12, 19]) {
    for (let y = 0; y < 20; y++) { p.set(xx, y, band); p.set(xx + 1, y, y % 3 === 0 ? band : bandD); }
  }
  // lid seam
  for (let x = 1; x < 23; x++) p.set(x, 7, WOOD_D);
  // gold latch
  const gold: RGB = [255, 210, 63], goldD: RGB = [170, 120, 20];
  p.rect(10, 6, 4, 5, gold);
  p.rect(11, 8, 2, 2, goldD);
  p.set(10, 6, [255, 240, 160]);
});

// ---------- set pieces (authored landmarks; neutral gray — zones tint them) ----------

const GR: RGB = [118, 126, 158], GR_D: RGB = [56, 62, 96], GR_L: RGB = [188, 198, 228];
const GR_E: RGB = [32, 36, 58];
const HAZ: RGB = [232, 168, 40], HAZ_D: RGB = [150, 100, 18];

/** reactor column: coils, glowing core slot, pipes, hazard skirt (56x56) */
def('sp_reactor', 56, 56, (p) => {
  // base slab
  for (let y = 48; y < 56; y++) for (let x = 4; x < 52; x++) p.set(x, y, y === 48 ? GR_L : y >= 54 ? GR_E : GR_D);
  for (const xx of [8, 20, 32, 44]) { p.set(xx, 50, GR_E); p.set(xx, 51, GR_E); }
  // main column
  for (let y = 8; y < 48; y++) for (let x = 14; x < 42; x++) {
    p.set(x, y, x < 18 ? GR_L : x < 30 ? GR : x < 38 ? GR_D : GR_E);
  }
  // coil rings
  for (const yy of [12, 20, 28, 36]) {
    for (let x = 13; x < 43; x++) { p.set(x, yy, GR_L); p.set(x, yy + 1, GR_D); }
    for (const xx of [16, 28, 39]) p.set(xx, yy, GR_E);
  }
  // core slot (glow painted white; zone tints + runtime glow do the color)
  for (let y = 22; y < 34; y++) for (let x = 24; x < 32; x++) {
    p.set(x, y, y === 22 || x === 24 ? [255, 255, 255] : y >= 32 ? [210, 210, 210] : [255, 255, 255]);
  }
  // top cap + antenna
  for (let x = 18; x < 38; x++) { p.set(x, 8, GR_L); p.set(x, 9, GR_D); }
  for (let y = 2; y < 8; y++) { p.set(27, y, GR); p.set(28, y, GR_D); }
  p.set(27, 1, [255, 255, 255]); p.set(28, 1, [255, 255, 255]);
  // side pipes
  for (let y = 14; y < 44; y++) { p.set(8, y, GR_D); p.set(9, y, GR); p.set(10, y, GR_L); }
  for (const yy of [16, 30, 42]) { p.set(7, yy, GR_E); p.set(11, yy, GR_E); }
  // hazard skirt
  for (let x = 4; x < 52; x++) { p.set(x, 47, (x % 6 < 3) ? HAZ : HAZ_D); }
});

/** half-open blast door: huge segmented slab, warning chevrons, gap (56x44) */
def('sp_door', 56, 44, (p) => {
  // frame
  for (let y = 0; y < 44; y++) for (let x = 0; x < 56; x++) {
    const frame = x < 5 || x >= 51;
    if (frame) p.set(x, y, x < 2 || y % 8 === 0 ? GR_E : GR_D);
  }
  // left slab (lowered, covers half)
  for (let y = 6; y < 44; y++) for (let x = 5; x < 30; x++) {
    p.set(x, y, x < 8 ? GR_L : x < 22 ? GR : x < 26 ? GR_D : GR_E);
  }
  for (let x = 5; x < 30; x++) { p.set(x, 6, GR_L); p.set(x, 7, GR_D); p.set(x, 24, GR_D); }
  // chevrons on slab
  for (let x = 8; x < 28; x++) { p.set(x, 40, (x % 6 < 3) ? HAZ : HAZ_D); p.set(x, 41, (x % 6 < 3) ? HAZ_D : HAZ); }
  // right slab (raised into frame)
  for (let y = 0; y < 18; y++) for (let x = 30; x < 51; x++) {
    p.set(x, y, x < 34 ? GR_L : x < 46 ? GR : GR_D);
  }
  for (let x = 30; x < 51; x++) p.set(x, 17, GR_E);
  for (let x = 32; x < 50; x++) { p.set(x, 1, (x % 6 < 3) ? HAZ : HAZ_D); }
  // floor gap between slabs: warning paint + debris nub
  for (let x = 30; x < 51; x++) { p.set(x, 42, (x % 8 < 4) ? HAZ_D : GR_D); p.set(x, 43, GR_E); }
  p.set(34, 39, GR); p.set(35, 40, GR_D); p.set(46, 38, GR_D);
});

/** coolant tank: riveted vertical tank, ladder, vent stack, frost seams (44x56) */
def('sp_tank', 44, 56, (p) => {
  for (let y = 6; y < 50; y++) for (let x = 6; x < 38; x++) {
    p.set(x, y, x < 10 ? GR_L : x < 22 ? GR : x < 32 ? GR_D : GR_E);
  }
  // tank rings + rivets
  for (const yy of [10, 20, 30, 40, 48]) {
    for (let x = 5; x < 39; x++) { p.set(x, yy, GR_L); p.set(x, yy + 1, GR_D); }
    for (const xx of [9, 18, 28, 35]) p.set(xx, yy, GR_E);
  }
  // domed top
  for (let x = 8; x < 36; x++) { p.set(x, 5, GR_L); p.set(x, 6, GR); }
  p.set(10, 4, GR_L); p.set(33, 4, GR);
  // vent stack
  for (let y = 0; y < 6; y++) { p.set(30, y, GR_D); p.set(31, y, GR); p.set(32, y, GR_L); }
  p.set(29, 0, GR_E); p.set(33, 0, GR_E);
  // ladder
  for (let y = 12; y < 48; y += 3) { p.set(38, y, GR_L); p.set(39, y, GR_D); }
  for (let y = 14; y < 48; y += 3) { p.set(38, y, GR_D); p.set(39, y, GR_D); }
  // base + frost seams (white icicles)
  for (let y = 50; y < 56; y++) for (let x = 4; x < 40; x++) p.set(x, y, y >= 54 ? GR_E : GR_D);
  const ice: RGB = [235, 246, 255];
  for (const [xx, len] of [[8, 3], [15, 5], [23, 2], [31, 4], [36, 2]] as const) {
    for (let i = 0; i < len; i++) p.set(xx, 49 + i, ice);
  }
  for (let x = 6; x < 38; x += 6) p.set(x, 50, ice);
});

/** pipe cluster: broken junction, valves, drip stains (56x30) */
def('sp_pipes', 56, 30, (p) => {
  // two horizontal runs
  for (let x = 2; x < 54; x++) {
    for (const yy of [8, 20]) { p.set(x, yy, GR_L); p.set(x, yy + 1, GR); p.set(x, yy + 2, GR_D); }
  }
  // vertical junction column
  for (let y = 6; y < 26; y++) for (let x = 24; x < 32; x++) {
    p.set(x, y, x < 26 ? GR_L : x < 30 ? GR : GR_D);
  }
  for (let y = 6; y < 26; y++) { p.set(24, y, GR_L); p.set(31, y, GR_E); }
  // valve wheels
  for (const [vx, vy] of [[12, 6], [40, 17]] as const) {
    p.sphere(vx, vy, 3.2, GR, GR_D, GR_L);
    p.set(vx, vy, GR_E); p.set(vx - 1, vy, GR_E); p.set(vx + 1, vy, GR_E);
  }
  // broken joint: gap + spray
  for (const [x, y] of [[17, 8], [18, 9], [18, 8], [19, 10], [19, 9]] as const) p.set(x, y, [0, 0, 0], 0);
  p.set(16, 8, GR_E); p.set(17, 10, GR_D); p.set(18, 11, GR_D);
  const drip: RGB = [70, 60, 40];
  p.set(18, 14, drip); p.set(18, 18, drip); p.set(19, 22, drip); p.set(18, 25, drip);
  // flanges
  for (const xx of [8, 46]) for (const yy of [7, 19]) {
    p.set(xx, yy, GR_E); p.set(xx + 1, yy, GR_E); p.set(xx, yy + 1, GR_E); p.set(xx + 1, yy + 1, GR_E);
  }
  // base shoes
  for (const xx of [6, 26, 44]) for (let y = 26; y < 30; y++) for (let x = xx; x < xx + 8; x++) {
    p.set(x, y, y === 26 ? GR_L : y >= 29 ? GR_E : GR_D);
  }
});

/** energy generator: ring housing, spinning core marks, cables (48x48) */
def('sp_generator', 48, 48, (p) => {
  // base
  for (let y = 40; y < 48; y++) for (let x = 4; x < 44; x++) p.set(x, y, y === 40 ? GR_L : y >= 46 ? GR_E : GR_D);
  // outer ring housing
  p.sphere(24, 24, 17, GR, GR_D, GR_L);
  p.sphere(24, 24, 12, [46, 50, 78], [34, 38, 60], [60, 66, 100]);
  // core ring: white so runtime glow + tint carry it
  for (let a = 0; a < 360; a += 2) {
    const rad = (a * Math.PI) / 180;
    p.set(24 + Math.cos(rad) * 9.5, 24 + Math.sin(rad) * 9.5, [255, 255, 255]);
  }
  // rotor marks
  for (const a of [0, 90, 180, 270]) {
    const rad = (a * Math.PI) / 180;
    p.set(24 + Math.cos(rad) * 6, 24 + Math.sin(rad) * 6, [255, 255, 255]);
  }
  // housing bolts
  for (let a = 0; a < 360; a += 45) {
    const rad = (a * Math.PI) / 180;
    p.set(24 + Math.cos(rad) * 15, 24 + Math.sin(rad) * 15, GR_E);
  }
  // top vents
  for (const xx of [18, 23, 28]) { p.set(xx, 5, GR_D); p.set(xx, 6, GR_D); }
  for (let x = 16; x < 32; x++) p.set(x, 4, GR_L);
  // cables snaking out
  for (const [x, y] of [[6, 42], [7, 43], [8, 43], [9, 44], [10, 44], [40, 43], [41, 44], [42, 44], [43, 45]] as const) p.set(x, y, [40, 38, 34]);
  // hazard corners on base
  for (let x = 4; x < 12; x++) p.set(x, 41, (x % 4 < 2) ? HAZ : HAZ_D);
  for (let x = 36; x < 44; x++) p.set(x, 41, (x % 4 < 2) ? HAZ : HAZ_D);
});

/** conduit hub: floor junction box with glowing ports (40x28) */
def('sp_hub', 40, 28, (p) => {
  for (let y = 4; y < 24; y++) for (let x = 2; x < 38; x++) {
    p.set(x, y, y < 6 ? GR_L : x < 5 ? GR_L : x < 33 ? GR : GR_D);
  }
  for (let x = 2; x < 38; x++) { p.set(x, 4, GR_L); p.set(x, 23, GR_E); }
  for (let y = 4; y < 24; y++) { p.set(2, y, GR_L); p.set(37, y, GR_E); }
  // glowing ports (white — runtime tint)
  for (const [px2, py2] of [[10, 12], [19, 9], [28, 14]] as const) {
    p.rect(px2, py2, 4, 4, [255, 255, 255]);
    p.rect(px2 + 1, py2 + 1, 2, 2, [220, 220, 220]);
  }
  // conduit stubs
  for (const [cx, cy, w] of [[0, 13, 2], [38, 13, 2], [19, 1, 2]] as const) {
    for (let i = 0; i < w; i++) { p.set(cx + i, cy, GR_D); p.set(cx + i, cy + 1, GR); }
  }
  // bolts
  for (const [bx, by] of [[5, 7], [33, 7], [5, 20], [33, 20]] as const) p.set(bx, by, GR_E);
});

/** suspended gantry beam with hanging chain + lamp (64x22) */
def('sp_gantry', 64, 22, (p) => {
  // main beam
  for (let y = 2; y < 8; y++) for (let x = 0; x < 64; x++) {
    p.set(x, y, y === 2 ? GR_L : y < 5 ? GR : GR_D);
  }
  // truss diagonals
  for (let x = 4; x < 62; x += 8) {
    for (let i = 0; i < 5; i++) { p.set(x + i, 8 + i, GR_D); p.set(x + 7 - i, 8 + i, GR_E); }
  }
  // end brackets
  for (const xx of [0, 60]) for (let y = 2; y < 14; y++) for (let x = xx; x < xx + 4; x++) {
    p.set(x, y, y === 2 || x === xx ? GR_L : GR_D);
  }
  // hanging chain + lamp housing
  for (let y = 8; y < 16; y += 2) p.set(32, y, GR_E);
  p.rect(30, 16, 5, 4, GR_D);
  p.rect(31, 17, 3, 2, [255, 255, 255]);
  // hazard tips
  for (let x = 0; x < 6; x++) { p.set(x, 13, (x % 2 === 0) ? HAZ : HAZ_D); p.set(58 + x, 13, (x % 2 === 0) ? HAZ : HAZ_D); }
});

// ---------- floor identity props (32px chunks; neutral gray — zones tint) ----------

/** large floor panel: bolted quadrant plate */
def('f_panel', 32, 32, (p) => {
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const seam = x === 15 || x === 16 || y === 15 || y === 16;
    p.set(x, y, seam ? [50, 54, 82] : x === 0 || y === 0 ? GR_D : GR);
  }
  for (let x = 1; x < 31; x++) { p.set(x, 1, GR_L); }
  for (let y = 1; y < 31; y++) p.set(1, y, y < 14 ? GR_L : GR);
  for (const [bx, by] of [[4, 4], [26, 4], [4, 26], [26, 26], [10, 10], [21, 10], [10, 21], [21, 21]] as const) {
    p.set(bx, by, GR_L); p.set(bx + 1, by, GR_D);
  }
  // one scratched corner
  for (const [x, y] of [[24, 24], [25, 25], [26, 26], [27, 25], [25, 27]] as const) p.set(x, y, [86, 92, 120]);
});

/** tread-plate walkway */
def('f_walkway', 32, 32, (p) => {
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p.set(x, y, GR);
  for (let y = 0; y < 32; y += 8) {
    for (let x = 0; x < 32; x++) p.set(x, y, GR_D);
    for (let x = (y % 16 === 0 ? 2 : 6); x < 32; x += 8) p.set(x, y + 1, GR_L);
  }
  for (let x = 0; x < 32; x++) { p.set(x, 0, GR_D); p.set(x, 31, GR_E); }
  for (let y = 0; y < 32; y++) { p.set(0, y, GR_D); p.set(31, y, GR_E); }
});

/** hazard-striped warning chunk */
def('f_hazard', 32, 32, (p) => {
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    p.set(x, y, ((x + y) % 12 < 6) ? HAZ_D : [64, 58, 48]);
  }
  // worn edge
  for (const [x, y] of [[3, 3], [4, 3], [3, 4], [27, 28], [28, 27], [28, 28], [16, 2], [2, 20]] as const) p.set(x, y, [86, 74, 54]);
  for (let x = 0; x < 32; x++) { p.set(x, 0, GR_E); p.set(x, 31, GR_E); }
  for (let y = 0; y < 32; y++) { p.set(0, y, GR_E); p.set(31, y, GR_E); }
});

/** floor vent: slotted grate with frame + glow hints */
def('f_vent', 24, 24, (p) => {
  for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) p.set(x, y, GR_D);
  for (let y = 3; y < 21; y += 4) for (let x = 3; x < 21; x++) p.set(x, y, [24, 26, 42]);
  for (let x = 3; x < 21; x += 3) for (let y = 2; y < 22; y++) p.set(x, y, GR);
  for (let x = 0; x < 24; x++) { p.set(x, 0, GR_L); p.set(x, 23, GR_E); }
  for (let y = 0; y < 24; y++) { p.set(0, y, GR_L); p.set(23, y, GR_E); }
  for (const [bx, by] of [[2, 2], [20, 2], [2, 20], [20, 20]] as const) p.set(bx, by, GR_E);
});

/** conduit run: cable line with junction node (48x14) */
def('f_conduit', 48, 14, (p) => {
  for (let x = 0; x < 48; x++) {
    p.set(x, 5, [40, 42, 64]); p.set(x, 6, GR); p.set(x, 7, GR_L); p.set(x, 8, GR_D);
  }
  // junction box mid
  for (let y = 2; y < 12; y++) for (let x = 20; x < 28; x++) {
    p.set(x, y, y === 2 || x === 20 ? GR_L : y >= 11 || x === 27 ? GR_E : GR);
  }
  p.rect(22, 5, 4, 4, [255, 255, 255]);
  p.set(22, 5, [230, 230, 230]);
  // clamps
  for (const xx of [6, 14, 34, 42]) { p.set(xx, 4, GR_E); p.set(xx, 9, GR_E); }
});

// ---------- terrain patches (3/4 textured hazards; scale to patch radius) ----------

/** ice pane: glazed floor with sheen streaks and stress cracks */
def('terrain_ice', 48, 48, (p) => {
  const body: RGB = [206, 236, 252], bodyD: RGB = [150, 196, 226], deep: RGB = [116, 168, 206], sheen: RGB = [245, 252, 255];
  // rounded blob pane
  for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) {
    const dx = x - 24, dy = y - 24;
    const d = Math.sqrt(dx * dx + dy * dy) + Math.sin(Math.atan2(dy, dx) * 5) * 2.5;
    if (d > 22) continue;
    p.set(x, y, d > 20 ? deep : dx - dy < -6 ? bodyL2() : body);
  }
  function bodyL2() { return bodyD; }
  // sheen streaks
  for (const [x0, y0, len] of [[10, 12, 7], [20, 8, 5], [28, 20, 8], [14, 26, 6]] as const) {
    for (let i = 0; i < len; i++) p.set(x0 + i, y0 + i - 1, sheen);
  }
  // stress cracks
  const c: RGB = [96, 148, 186];
  for (let i = 0; i < 6; i++) p.set(30 + i, 12 + i, c);
  for (let i = 0; i < 4; i++) p.set(12 + i, 30 - i, c);
  p.set(33, 19, c); p.set(34, 20, c);
  // edge glints
  p.set(8, 16, sheen); p.set(38, 30, sheen);
});

/** goo pool: murky slime with dripping edge and bright bubble spots */
def('terrain_goo', 48, 48, (p) => {
  const body: RGB = [110, 96, 52], bodyD: RGB = [70, 60, 30], deep: RGB = [48, 42, 22], hi: RGB = [168, 150, 84];
  for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) {
    const dx = x - 24, dy = y - 24;
    const d = Math.sqrt(dx * dx + dy * dy) + Math.sin(Math.atan2(dy, dx) * 4 + 1) * 3.5;
    if (d > 22) continue;
    p.set(x, y, d > 20 ? deep : (x * 7 + y * 3) % 23 === 0 ? bodyD : body);
  }
  // bright bubble spots (the per-frame bubbles rise from these)
  for (const [bx, by] of [[16, 20], [30, 14], [24, 30], [36, 26]] as const) {
    p.set(bx, by, hi); p.set(bx + 1, by, hi);
  }
  // surface sheen
  for (const [x, y] of [[12, 12], [13, 11], [14, 11], [20, 9]] as const) p.set(x, y, hi);
  // dripping tendril
  p.set(38, 34, body); p.set(39, 36, bodyD); p.set(38, 38, bodyD); p.set(39, 40, deep);
});

// ---------- wall variants (16x34, same footprint as wall) ----------

/** damaged wall segment: hole, rebar, scorch */
def('wall_dmg', 16, 34, (p) => {
  p.rect(0, 0, 16, 5, [152, 152, 164]);
  p.rect(0, 5, 16, 2, [70, 70, 82]);
  for (let y = 7; y < 32; y++) for (let x = 0; x < 16; x++) {
    p.set(x, y, (x + y) % 9 === 0 ? [62, 62, 74] : [110, 110, 122]);
  }
  // blast hole
  for (let y = 14; y < 24; y++) for (let x = 4; x < 13; x++) {
    const dx = x - 8, dy = y - 19;
    if (dx * dx + dy * dy < 20) p.set(x, y, [16, 16, 22]);
    else if (dx * dx + dy * dy < 28) p.set(x, y, [40, 40, 48]);
  }
  // rebar across hole
  for (const [x, y] of [[6, 16], [8, 17], [10, 18], [7, 21], [9, 22]] as const) p.set(x, y, [30, 30, 38]);
  // scorch streaks
  for (const [x, y] of [[3, 25], [3, 26], [12, 25], [12, 26], [12, 27], [5, 12], [5, 13]] as const) p.set(x, y, [46, 44, 52]);
  for (let i = 0; i < 16; i++) p.set(i, 33, [48, 48, 58]);
});

/** wall with pipe run + junction */
def('wall_pipe', 16, 34, (p) => {
  p.rect(0, 0, 16, 5, [152, 152, 164]);
  p.rect(0, 5, 16, 2, [70, 70, 82]);
  for (let y = 7; y < 32; y++) for (let x = 0; x < 16; x++) p.set(x, y, (x + y) % 9 === 0 ? [62, 62, 74] : [110, 110, 122]);
  // vertical pipe
  for (let y = 6; y < 34; y++) { p.set(10, y, [52, 56, 86]); p.set(11, y, [128, 138, 172]); p.set(12, y, [88, 96, 132]); }
  for (const yy of [10, 22]) { p.set(9, yy, [40, 44, 70]); p.set(13, yy, [40, 44, 70]); }
  // valve
  p.sphere(11, 16, 2.4, [128, 138, 172], [64, 70, 108], [196, 206, 236]);
  p.set(11, 16, [40, 44, 70]);
  for (let i = 0; i < 16; i++) p.set(i, 33, [48, 48, 58]);
});

/** wall strip with mounted lamp (white bulb — runtime glow) */
def('wall_light', 16, 34, (p) => {
  p.rect(0, 0, 16, 5, [152, 152, 164]);
  p.rect(0, 5, 16, 2, [70, 70, 82]);
  for (let y = 7; y < 32; y++) for (let x = 0; x < 16; x++) p.set(x, y, (x + y) % 9 === 0 ? [62, 62, 74] : [110, 110, 122]);
  // hood + bulb
  p.rect(5, 9, 7, 2, [56, 60, 92]);
  p.rect(6, 11, 5, 3, [255, 255, 255]);
  p.set(6, 11, [230, 230, 210]); p.set(10, 13, [230, 230, 210]);
  // conduit down to lamp
  p.set(8, 7, [40, 44, 70]); p.set(8, 8, [40, 44, 70]);
  for (let i = 0; i < 16; i++) p.set(i, 33, [48, 48, 58]);
});

// ---------- overlays ----------

/** elite crown: jagged spikes above an elite (tinted at runtime) */
def('elite_crown', 14, 6, (p) => {
  const a: RGB = [255, 255, 255], d: RGB = [190, 190, 210];
  for (const [bx, h] of [[0, 3], [3, 5], [6, 6], [9, 5], [12, 3]] as const) {
    for (let i = 0; i < h; i++) {
      p.set(bx + 1, 5 - i, i === h - 1 ? a : d);
      if (i < h - 1) p.set(bx, 5 - i, d);
    }
  }
});

/** ground direction arrow for charge/lunge telegraphs (tinted, rotated at runtime) */
def('tg_arrow', 16, 10, (p) => {
  const a: RGB = [255, 255, 255];
  for (let i = 0; i < 5; i++) {
    for (let y = 0; y <= i; y++) {
      p.set(9 + i, 4 - y, a);
      p.set(9 + i, 5 + y, a);
    }
  }
  for (let x = 0; x < 10; x++) { p.set(x, 4, a); p.set(x, 5, a); }
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
