// Procedural pixel-art atlas. Every sprite is drawn in code at 1x, then packed.
import { TAU } from '../core/util.js';

const OUT = '#0a0c14';
const SPR = 3; // art px -> world units

export const PAL = {
  ink: '#e8ecf4', cyan: '#54e6ff', cyanD: '#2f8fb0', pale: '#bfe9ff', white: '#f4f8ff',
  mag: '#ff5ad2', amber: '#ffb454', gold: '#ffd75e', ember: '#ff8a4a', red: '#ff5a5a',
  grn: '#7dff9b', bone: '#d8c9a8', boneD: '#a89878', bronze: '#c9a86b', bronzeD: '#8a6b3f',
  rust: '#8a4a3a', rustD: '#5e3028', ash: '#5a5f6e', ashD: '#3a3f4c', void: '#b08aff',
  coat: '#2e4470', coatD: '#22335a', navy: '#141b2e',
};

export function buildAtlas() {
  const size = 1024;
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const c = cv.getContext('2d', { willReadFrequently: true });
  const frames = {};
  let cx = 1, cy = 1, rowH = 1;

  function spr(name, w, h, draw, opt = {}) {
    const pw = w + 2, ph = h + 2;
    if (cx + pw > size - 1) { cx = 1; cy += rowH + 1; rowH = 1; }
    const x = cx, y = cy;
    c.save(); c.translate(x + 1, y + 1);
    const g = {
      px: (px, py, col) => { c.fillStyle = col; c.fillRect(px, py, 1, 1); },
      R: (px, py, pw2, ph2, col) => { c.fillStyle = col; c.fillRect(px, py, pw2, ph2); },
      ell: (ex, ey, rx, ry, col) => {
        c.fillStyle = col;
        for (let yy = -ry; yy <= ry; yy++) {
          const t = 1 - (yy * yy) / (ry * ry || 1);
          const hw = Math.round(rx * Math.sqrt(Math.max(0, t)));
          if (hw >= 0) c.fillRect(ex - hw, ey + yy, hw * 2 + 1, 1);
        }
      },
      tri: (pts, col) => { c.fillStyle = col; c.beginPath(); c.moveTo(pts[0] + .5, pts[1] + .5); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i] + .5, pts[i + 1] + .5); c.closePath(); c.fill(); },
    };
    draw(g, w, h);
    c.restore();
    const im = c.getImageData(x, y, pw, ph), d = im.data;
    const snap = new Uint8ClampedArray(d); // alpha snapshot: neighbors must not see in-place writes
    const A = (i, j) => (i < 0 || j < 0 || i >= pw || j >= ph) ? 0 : snap[(j * pw + i) * 4 + 3];
    if (!opt.noPost) {
      const shade = !opt.noShade;
      for (let j = ph - 1; j >= 0; j--) for (let i = pw - 1; i >= 0; i--) {
        const k = (j * pw + i) * 4;
        if (snap[k + 3] > 40) {
          if (shade) {
            if (A(i + 1, j) <= 40 || A(i, j + 1) <= 40) { d[k] *= 0.72; d[k + 1] *= 0.72; d[k + 2] *= 0.72; }
            else if (A(i - 1, j) <= 40 || A(i, j - 1) <= 40) { d[k] = Math.min(255, d[k] * 1.18); d[k + 1] = Math.min(255, d[k + 1] * 1.18); d[k + 2] = Math.min(255, d[k + 2] * 1.18); }
          }
        } else if (!opt.noOutline) {
          if (A(i - 1, j) > 40 || A(i + 1, j) > 40 || A(i, j - 1) > 40 || A(i, j + 1) > 40) {
            const oc = hexRGB(OUT); d[k] = oc[0]; d[k + 1] = oc[1]; d[k + 2] = oc[2]; d[k + 3] = 255;
          }
        }
      }
      c.putImageData(im, x, y);
    }
    frames[name] = { x, y, w: pw, h: ph, ax: (opt.ax ?? 0.5), ay: (opt.ay ?? 0.5) };
    cx += pw + 1; rowH = Math.max(rowH, ph);
  }

  const P = PAL;

  // ---------- pixel-art craft system ----------
  // consistent construction: segmented bodies, 3-tone shading + dither, top-left rim,
  // emissive cores with halo, true 4-frame walk cycles (knee bend + arm swing).
  const limb = (g, x0, y0, x1, y1, w, col) => {
    // thick line = limbs with knee/elbow bends
    const steps = Math.max(1, Math.round(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    for (let i = 0; i <= steps; i++) {
      const x = Math.round(x0 + (x1 - x0) * i / steps), y = Math.round(y0 + (y1 - y0) * i / steps);
      g.R(x - ((w / 2) | 0), y - ((w / 2) | 0), w, w, col);
    }
  };
  const dith = (g, x, y, w, h, col) => {
    // checkerboard dither row: pixel-art texture transition
    for (let i = 0; i < w; i++) if ((x + i + y) % 2 === 0) g.px(x + i, y, col);
  };
  const em = (g, x, y, col, halo) => {
    // emissive dot with halo
    if (halo) { g.px(x - 1, y, halo); g.px(x + 1, y, halo); g.px(x, y - 1, halo); g.px(x, y + 1, halo); }
    g.px(x, y, col);
  };

  // humanoid rig: side view facing right, canvas 36x46, feet on bottom row.
  // frames: 0 idle, 1 idle-breathe, 2-5 walk (contact/pass x2)
  // cfg: { coat, coatD, coatL, trim, legs, boots, hood, hoodD, visor, core, scarf, bulk, hunched }
  function humanoid(g, f, cfg) {
    const S = cfg.bulk || 0;             // extra width for bulky chars
    const hunch = cfg.hunched ? 3 : 0;   // hunched: head forward+down
    const bob = (f === 1 || f === 2) ? 1 : (f === 4) ? -1 : 0; // vertical body oscillation
    const by = cfg.hunched ? bob - 1 : bob;
    // ----- legs (hip 15,31 → knee → foot; contact/pass offsets, boots) -----
    const hipY = 31 + (cfg.hunched ? 1 : 0);
    const legPose = [
      { a: [15, hipY, 14, 38, 13, 43], b: [16, hipY, 18, 38, 19, 43] },   // idle: stand
      { a: [15, hipY, 14, 38, 13, 42], b: [16, hipY, 18, 38, 19, 43] },   // idle breathe
      { a: [15, hipY, 10, 37, 6, 42], b: [17, hipY, 20, 37, 23, 42] },    // contact: split
      { a: [15, hipY, 14, 36, 14, 41], b: [16, hipY, 17, 36, 17, 41] },   // pass: together, high
      { a: [15, hipY, 20, 37, 24, 42], b: [14, hipY, 10, 37, 7, 42] },    // contact swapped
      { a: [15, hipY, 16, 36, 16, 41], b: [15, hipY, 13, 36, 13, 41] },   // pass
    ][f];
    limb(g, legPose.a[0], legPose.a[1], legPose.a[2], legPose.a[3], 3 + S, cfg.legs);
    limb(g, legPose.a[2], legPose.a[3], legPose.a[4], legPose.a[5], 3, cfg.legs);
    g.R(legPose.a[4] - 1, legPose.a[5] - 1, 5, 3, cfg.boots);
    limb(g, legPose.b[0], legPose.b[1], legPose.b[2], legPose.b[3], 3 + S, cfg.legsD || cfg.legs);
    limb(g, legPose.b[2], legPose.b[3], legPose.b[4], legPose.b[5], 3, cfg.legsD || cfg.legs);
    g.R(legPose.b[4] - 1, legPose.b[5] - 1, 5, 3, cfg.bootsD || cfg.boots);
    // ----- torso: coat with shadow back, lit front, dither texture, hem -----
    const ty = 14 + by;
    const wT = 13 + S;
    g.R(13 - ((S / 2) | 0), ty, wT, 17, cfg.coat);
    g.R(13 - ((S / 2) | 0), ty, 4 + ((S / 2) | 0), 17, cfg.coatD);
    g.R(15, ty + 2, wT - 5, 6, cfg.coatL);
    dith(g, 15, ty + 8, wT - 4, 1, cfg.coatD);
    g.R(13 - ((S / 2) | 0), ty + 14, wT, 3, cfg.coatD);       // hem
    g.px(13 - ((S / 2) | 0), ty + 1, cfg.rim || cfg.coatL);   // rim light
    g.px(14 - ((S / 2) | 0), ty, cfg.rim || cfg.coatL);
    // ----- head: hood + void face + emissive visor -----
    const hy = 3 + by + (cfg.hunched ? 2 : 0);
    const hx = 13 + (cfg.hunched ? 3 : 0);
    g.ell(hx + 5, hy + 5, 5, 5, cfg.hood);
    g.R(hx + 1, hy + 1, 9, 7, cfg.hood);
    g.R(hx + 2, hy, 7, 2, cfg.hoodL || cfg.hood);
    g.px(hx + 1, hy + 2, cfg.rim || cfg.hoodL);
    g.R(hx + 5, hy + 3, 5, 3, '#0c1220');                      // face void
    g.R(hx + 5, hy + 4, 5, 1, cfg.visor);                      // emissive visor
    // ----- scarf accent -----
    if (cfg.scarf) {
      g.R(hx + 3, hy + 10, 6, 2, cfg.scarf);
      g.px(hx + 9 + (f % 2), hy + 11, cfg.scarf);              // tail flaps with frame
      g.px(hx + 10 - (f % 2), hy + 10, cfg.scarf);
    }
    // ----- chest emblem (emissive) -----
    if (cfg.core) {
      g.R(16, ty + 4, 4, 4, cfg.coatD);
      g.R(17, ty + 5, 2, 2, cfg.core);
      g.px(17, ty + 5, '#ffffff');
    }
    // ----- arms: back arm swings with stride; front arm braces forward -----
    const swing = [0, 0, -3, 0, 3, 0][f];
    limb(g, 12, ty + 3, 10 - swing, ty + 12, 3, cfg.coatD);      // back arm
    limb(g, 18, ty + 5, 25, ty + 7, 3, cfg.hood);                // front arm to grip
    if (cfg.glove) g.px(25, ty + 7, cfg.glove);
  }

  const WARDEN = {
    coat: '#33518c', coatD: '#263e6e', coatL: '#4a6cb0', rim: '#6f92d6',
    legs: '#1a2438', legsD: '#141c2e', boots: '#0f141f',
    hood: '#2c4170', hoodL: '#3a5488', visor: '#7ef2ff',
    core: '#7ef2ff', scarf: '#ff5ad2', glove: '#8fd6ff',
  };
  for (let f = 0; f < 6; f++) spr('warden' + f, 36, 46, (g) => humanoid(g, f, WARDEN));
  const RUNNER = {
    coat: '#6b4258', coatD: '#54324a', coatL: '#82556e', rim: '#a8789a',
    legs: '#2a2438', boots: '#e6e6f0', bootsD: '#c8c8d8',
    hood: '#5a3a52', hoodL: '#6d4a64', visor: '#ffd0e8',
    core: null, scarf: '#ff5ad2', glove: '#ffd0e8', hunched: true,
  };
  for (let f = 0; f < 6; f++) spr('runner' + f, 36, 46, (g) => humanoid(g, f, RUNNER));

  // ghost = the warden rig in greys (echo), auto-generated from the same rig
  const GHOST = {
    coat: '#c8c8c8', coatD: '#a8a8a8', coatL: '#e0e0e0', rim: '#f4f4f4',
    legs: '#909090', legsD: '#787878', boots: '#686868',
    hood: '#b8b8b8', hoodL: '#d4d4d4', visor: '#ffffff',
    core: '#ffffff', scarf: '#e8e8e8', glove: '#f8f8f8',
  };
  for (let f = 0; f < 6; f++) spr('ghost' + f, 36, 46, (g) => humanoid(g, f, GHOST), { noOutline: true, noShade: true });

  // ---------- enemies: bespoke 4-frame animated cycles, one per species ----------
  // HUSK — bloated corpse-walker: waddling mass, claw raise/slam, dragging arm
  const huskF = (g, f) => {
    const wob = [0, 1, 0, -1][f];
    g.ell(13 + wob, 16, 11, 10, '#6e2c18');
    g.ell(13 + wob, 14, 10, 9, '#a04a28');
    g.ell(12, 11, 8, 6, '#c05f34');
    g.ell(9, 9, 3, 2, '#e08a5a');                        // rim highlight
    // exposed ribs on the lit side
    for (let i = 0; i < 3; i++) g.R(8 + i * 3, 13 - i, 2, 1, '#e8dcbe');
    g.R(11 + wob, 4, 9, 6, '#7d3a1e');                   // head
    g.R(12 + wob, 5, 3, 2, '#3c1408');                   // eye socket
    em(g, 15 + wob, 6, '#ffd75e', '#8a5a20');            // big emissive eye
    g.ell(6, 13, 3, 2, '#d8c9a8'); g.ell(17, 19, 4, 2, '#d8c9a8'); // bone plates
    // claw arm: raise → slam
    if (f === 1) { limb(g, 20, 12, 26, 6, 3, '#8a3a20'); limb(g, 26, 6, 29, 4, 3, '#e8dcbe'); }
    else if (f === 3) { limb(g, 20, 12, 27, 16, 3, '#8a3a20'); limb(g, 27, 16, 30, 19, 3, '#e8dcbe'); }
    else limb(g, 20, 12, 26, 12, 3, '#8a3a20');
    // dragging arm + stub legs
    limb(g, 6, 16, 3 + wob, 22, 3, '#8a3a20');
    g.R(8 + (f % 2) * 2, 24, 4, 2, '#6e2c18'); g.R(15 - (f % 2) * 2, 24, 4, 2, '#6e2c18');
  };
  for (let f = 0; f < 4; f++) spr('husk' + f, 32, 27, (g) => huskF(g, f), { ay: 0.92 });

  // LANCER — crimson pike-trooper: cape flap, strut, glowing lance level
  const lancerF = (g, f) => {
    const bob = (f === 1 || f === 3) ? 1 : 0;
    g.R(11, 2 + bob, 8, 7, '#a03a2c'); g.R(12, 3 + bob, 6, 4, '#c04a3a'); // crested head
    g.ell(13, 5 + bob, 1.6, 1.6, '#ffd75e'); g.px(16, 5 + bob, '#ffd75e');
    g.R(9, 9 + bob, 10, 11, '#8f3026'); g.R(10, 10 + bob, 7, 5, '#a8483a'); // torso
    // cape flaps behind (3 frames of wave)
    const cw = [0, 2, 0, -2][f];
    g.tri([9, 9 + bob, 2 + cw, 22 + bob, 9, 21 + bob], '#5e1e16');
    g.px(4 + cw, 18 + bob, '#7d2c20');
    limb(g, 6, 10 + bob, 4, 17 + bob, 3, '#7a2820'); limb(g, 17, 10 + bob, 19, 16 + bob, 3, '#7a2820');
    g.R(1, 14 + bob, 24, 2, '#d8c9a8');                   // lance
    g.px(24, 14 + bob, '#ff8a4a'); g.px(25, 14 + bob, '#ffd75e'); // ember tip
    // strut legs
    if (f === 0 || f === 1) { limb(g, 11, 20 + bob, 9, 28 + bob, 3, '#6e241c'); limb(g, 15, 20 + bob, 17, 30 + bob, 3, '#6e241c'); g.R(7, 29 + bob, 5, 2, '#3c1410'); g.R(16, 31 + bob, 5, 2, '#3c1410'); }
    else { limb(g, 11, 20 + bob, 8, 30 + bob, 3, '#6e241c'); limb(g, 15, 20 + bob, 18, 28 + bob, 3, '#6e241c'); g.R(6, 31 + bob, 5, 2, '#3c1410'); g.R(17, 29 + bob, 5, 2, '#3c1410'); }
  };
  for (let f = 0; f < 4; f++) spr('lancer' + f, 27, 34, (g) => lancerF(g, f), { ay: 0.94 });

  // MOURNER — floating widow: robe hem waves, lantern swings, flame flickers
  const mournerF = (g, f) => {
    const sway = [0, 1, 0, -1][f];
    g.ell(14, 16, 11, 11, '#3c4258'); g.ell(14, 15, 9, 9, '#4a5270');
    // hem: three trailing tatters waving
    for (let i = -1; i <= 1; i++) g.tri([14 + i * 8, 24, 14 + i * 8 + sway * 2 + i * 2, 29, 14 + i * 8 + 4, 24], '#31374a');
    g.ell(14, 7, 7, 6, '#2c3245');
    g.R(11, 6, 7, 4, '#0c0f18');
    em(g, 12, 8, '#9fd8ff'); em(g, 16, 8, '#9fd8ff');      // cold eyes
    g.R(4, 13, 4, 12, '#3a4158'); g.R(21, 13, 4, 9, '#3a4158');
    // lantern swings on its chain
    const lx = 24 + sway * 2;
    g.R(lx, 8, 1, 6, '#6a7280');
    g.ell(lx, 17, 3, 4, '#1c2434'); g.ell(lx, 17, 2, 2.4, f % 2 ? '#d8f2ff' : '#bfe9ff'); g.px(lx, 17, '#ffffff');
    g.px(lx - 1, 13, '#bfe9ff'); g.px(lx + 2, 14, '#bfe9ff');
  };
  for (let f = 0; f < 4; f++) spr('mourner' + f, 30, 30, (g) => mournerF(g, f), { ay: 0.95 });

  // THIEF — hunched sprinter with coin sack bouncing
  const thiefF = (g, f) => {
    const bob = (f === 1 || f === 3) ? 1 : 0;
    const sack = (f % 2) * 2 - 1;
    g.ell(10, 6 + bob, 5, 5, '#c08430'); g.R(5, 2 + bob, 8, 3, '#8a5a24');
    g.R(6, 5 + bob, 6, 2, '#14161e'); em(g, 8, 5 + bob, '#ffe98a');
    g.R(4, 10 + bob, 9, 8, '#a8722f'); g.R(4, 10 + bob, 3, 8, '#8a5e24');
    g.ell(15 + sack, 9 + bob, 4, 4, '#e8d9b0'); g.R(14 + sack, 6 + bob, 2, 3, '#a89878');
    if (f === 0 || f === 1) { limb(g, 3, 12 + bob, 2, 18 + bob, 3, '#8a5e24'); limb(g, 13, 12 + bob, 15, 17 + bob, 3, '#8a5e24'); g.R(1, 19 + bob, 4, 2, '#5e3c16'); g.R(14, 18 + bob, 4, 2, '#5e3c16'); }
    else { limb(g, 3, 12 + bob, 1, 17 + bob, 3, '#8a5e24'); limb(g, 13, 12 + bob, 16, 18 + bob, 3, '#8a5e24'); g.R(0, 18 + bob, 4, 2, '#5e3c16'); g.R(15, 19 + bob, 4, 2, '#5e3c16'); }
  };
  for (let f = 0; f < 4; f++) spr('thief' + f, 20, 22, (g) => thiefF(g, f), { ay: 0.9 });

  // LEECH — inchworm: compression wave travels front-to-back
  const leechF = (g, f) => {
    const ph = [0, 1, 2, 3][f];
    const squish = (i) => Math.max(0, Math.sin((i - ph) * 1.6)) * 3;
    g.ell(10 - squish(0), 9, 9 - squish(0) * 0.4, 5 + squish(0), '#7d2416');
    for (let i = 0; i < 3; i++) g.ell(6 + i * 5 + squish(i), 8, 4, 3 + squish(i) * 0.6, i % 2 ? '#b0432c' : '#cf5c3e');
    g.ell(17, 8, 3, 2.4, '#e8785a');
    g.ell(10, 11, 4, 2, '#3c0d08');
    for (let i = -1; i <= 1; i++) { g.px(10 + i * 2, 10, '#ffece0'); g.px(10 + i * 2, 13, '#ffece0'); }
    em(g, 4, 11, '#8fd6ff'); g.px(17, 12, '#8fd6ff');
    g.ell(3, 13, 2, 2, '#8a3018'); g.ell(18, 13, 2, 2, '#8a3018');
  };
  for (let f = 0; f < 4; f++) spr('leech' + f, 22, 16, (g) => leechF(g, f), { ay: 0.9 });

  // MIRROR — floating shard: shimmer travels, cracks pulse
  for (let f = 0; f < 2; f++) spr('mirror' + f, 24, 30, (g) => {
    g.tri([12, 1, 21, 12, 12, 28, 3, 12], '#3f6a80');
    g.tri([12, 3, 18, 12, 12, 24, 6, 12], '#6698b0');
    g.tri([12, 6, 15, 12, 12, 20, 9, 12], '#8fc4d8');
    g.R(9 + f * 2, 9 + f * 2, 2, 5, '#c8ecf8'); g.px(13, 13 + f, '#c8ecf8');
    const glow = f ? '#ffd75e' : '#ffb454';
    g.px(9, 9, glow); g.px(13, 15, glow); g.px(10, 20, glow); g.R(10, 8, 3, 2, glow);
    g.px(12, 10, '#ffffff');
  }, { ay: 0.92, noShade: true });

  // TIME EATER — brass chronovore: outer gear rotates, hands sweep, pupil scans
  for (let f = 0; f < 4; f++) spr('timeeater' + f, 32, 32, (g) => {
    g.ell(16, 17, 13, 12, '#6e5528'); g.ell(16, 16, 11, 10, '#b08a3f'); g.ell(16, 15, 9, 8, '#e8d9b0');
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; g.px(16 + Math.round(Math.cos(a) * 8), 15 + Math.round(Math.sin(a) * 7), '#8a7050'); }
    const ha = f / 4 * Math.PI / 2;
    g.R(15, 9, 2, 8, '#3a3020');
    g.R(16, 14, Math.round(6 * Math.cos(ha)) + 1, 2, '#3a3020');
    g.ell(16, 15, 2, 2, '#c9302a'); g.px(16 + [0, 1, 0, -1][f], 15, '#ff6a5a');
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + f * (TAU / 32); g.ell(16 + Math.round(Math.cos(a) * 14), 16 + Math.round(Math.sin(a) * 13), 2, 2, '#8a6b3f'); }
    g.ell(6, 4, 3, 3, '#6e5528'); g.ell(27, 27, 3, 3, '#6e5528');
  }, { ay: 0.9 });

  // PARASITE — centipede: sine wave travels down segmented body
  for (let f = 0; f < 4; f++) spr('parasite' + f, 30, 14, (g) => {
    for (let i = 0; i < 4; i++) {
      const y = 7 + Math.round(Math.sin(f / 4 * TAU + i * 1.4) * 2);
      g.ell(5 + i * 6, y, 4, 5 - (i === 3 ? 1 : 0), i % 2 ? '#a8802e' : '#8a6a26');
      g.px(4 + i * 6, y - 3, '#d8b856');
      g.R(3 + i * 6, y + 4, 4, 2, '#6e521c'); // legs
    }
    g.R(21, 4, 6, 6, '#7a5c1e'); em(g, 24, 5, '#ff8a4a'); em(g, 24, 7, '#ff8a4a');
    g.tri([27, 4, 30, 3, 27, 6], '#d8c9a8'); g.tri([27, 7, 30, 9, 27, 8], '#d8c9a8');
  }, { ay: 0.85 });

  // WITNESS — hovers, the great eye blinks
  for (let f = 0; f < 3; f++) spr('witness' + f, 28, 30, (g) => {
    const bob = (f === 1) ? -1 : 0;
    g.ell(14, 16 + bob, 11, 10, '#3c3428'); g.ell(14, 9 + bob, 7, 6, '#4a4032');
    if (f === 2) { g.R(6, 12 + bob, 17, 2, '#efe6d0'); } // blink
    else {
      g.ell(14, 12 + bob, 9, 7, '#efe6d0'); g.ell(14, 12 + bob, 6, 5.4, '#f8f2e2');
      g.ell(14, 12 + bob, 3, 3, '#c9782a'); g.ell(14 + (f - 1), 12 + bob, 1.6, 1.6, '#ffb454'); g.px(14 + (f - 1), 12 + bob, '#2a1808');
    }
    g.px(9, 7 + bob, '#efe6d0'); g.px(19, 7 + bob, '#efe6d0');
    g.ell(4, 24 + bob, 2, 3, '#2e2820'); g.ell(24, 24 + bob, 2, 3, '#2e2820');
  }, { ay: 0.9 });

  spr('clockadd', 18, 18, (g) => {
    g.ell(9, 9, 7, 7, '#6e5528'); g.ell(9, 9, 5, 5, '#b08a3f'); g.ell(9, 9, 3, 3, '#e8d9b0');
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; g.ell(9 + Math.round(Math.cos(a) * 7), 9 + Math.round(Math.sin(a) * 7), 1.6, 1.6, '#8a6b3f'); }
    g.px(8, 8, '#ff8a4a'); g.px(10, 8, '#ff8a4a');
  }, { ay: 0.9 });

  spr('saint', 72, 80, (g) => {
    // the Clockwork Saint: halo of gears, serene bone face, relic heart
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; g.ell(36 + Math.round(Math.cos(a) * 21), 15 + Math.round(Math.sin(a) * 15), 3, 3, '#b08a3f'); g.px(36 + Math.round(Math.cos(a) * 21), 15 + Math.round(Math.sin(a) * 15), '#e8d9b0'); }
    g.ell(36, 14, 15, 12, '#8a6b3f'); g.ell(36, 14, 12, 9, '#4a4058');
    g.ell(36, 24, 11, 10, '#efe6d0'); g.ell(36, 21, 9, 8, '#f8f2e2'); // head
    g.R(31, 21, 3, 3, '#241c14'); g.R(38, 21, 3, 3, '#241c14');
    g.R(34, 28, 5, 2, '#c9b493');
    g.tri([36, 32, 15, 74, 57, 74], '#e2d4b2'); g.tri([36, 32, 22, 72, 50, 72], '#f4ecd6'); // robe
    g.R(31, 38, 10, 11, '#b08a3f'); g.R(33, 40, 6, 6, '#d4b86a'); g.px(35, 42, '#ffe98a'); g.px(37, 43, '#fff4c9'); // relic heart (emissive)
    g.R(20, 36, 12, 5, '#e8dcbe'); g.R(41, 36, 12, 5, '#e8dcbe'); // folded arms
    for (const sx of [0, 1]) { const bx = sx ? 56 : 14; g.ell(bx, 40, 8, 8, '#8a6b3f'); g.ell(bx, 40, 5, 5, '#b08a3f'); g.R(bx - 1, 29, 2, 7, '#6b5535'); }
    g.R(24, 74, 10, 4, '#c9b493'); g.R(38, 74, 10, 4, '#c9b493');
  }, { ay: 0.95 });

  spr('hk', 64, 72, (g) => {
    // the Hollow King: gold crown, hollow chest with ember heart
    g.R(20, 0, 4, 7, '#e8c878'); g.R(30, 0, 4, 7, '#e8c878'); g.R(40, 0, 4, 7, '#e8c878');
    g.px(21, 0, '#fff2b0'); g.px(31, 0, '#fff2b0'); g.px(41, 0, '#fff2b0');
    g.R(18, 6, 28, 3, '#b08a3f');
    g.R(20, 9, 24, 13, '#6e2c24'); g.R(23, 11, 18, 9, '#87392e');
    g.R(26, 14, 4, 4, '#ffd0d0'); g.R(34, 14, 4, 4, '#ffd0d0'); g.px(27, 15, '#ff8a8a'); g.px(35, 15, '#ff8a8a');
    g.R(26, 20, 12, 2, '#2a1010');
    g.R(6, 22, 52, 13, '#54261e'); g.R(4, 24, 9, 15, '#411c16'); g.R(51, 24, 9, 15, '#411c16');
    g.R(22, 26, 20, 18, '#170d12'); g.ell(32, 35, 6, 6, '#0c0810'); g.px(32, 35, '#ff5a5a'); g.px(30, 33, '#ff8a4a'); g.px(34, 37, '#c9302a'); // hollow ember heart
    g.R(11, 35, 9, 20, '#54261e'); g.R(44, 35, 9, 20, '#54261e');
    g.R(8, 53, 12, 7, '#411c16'); g.R(44, 53, 12, 7, '#411c16');
    g.R(20, 44, 24, 20, '#6b3026');
    g.R(17, 63, 12, 6, '#331610'); g.R(35, 63, 12, 6, '#331610');
    g.R(2, 40, 3, 9, '#4a2018'); g.R(59, 40, 3, 9, '#4a2018');
  }, { ay: 0.95 });

  // ---------- bullets / weapons fx ----------
  spr('gcball', 12, 12, (g) => { g.ell(6, 6, 5, 5, P.cyanD); g.ell(6, 6, 3, 3, P.pale); g.px(5, 5, P.white); }, { noOutline: true, noShade: true });
  spr('widowr', 6, 6, (g) => { g.R(1, 2, 5, 2, P.cyan); g.px(1, 2, P.white); }, { noOutline: true, noShade: true });
  spr('bolt', 8, 8, (g) => { g.ell(4, 4, 3, 3, '#ffd75e'); g.ell(4, 4, 1, 1, P.white); }, { noOutline: true, noShade: true });
  spr('orb', 10, 10, (g) => { g.ell(5, 5, 4, 4, '#8a3a24'); g.ell(5, 5, 2, 2, P.ember); }, { noOutline: true, noShade: true });
  spr('gear', 14, 14, (g) => { g.ell(7, 7, 5, 5, P.bronzeD); g.ell(7, 7, 3, 3, P.bronze); g.R(6, 0, 2, 3, '#6b5535'); g.R(6, 11, 2, 3, '#6b5535'); g.R(0, 6, 3, 2, '#6b5535'); g.R(11, 6, 3, 2, '#6b5535'); }, { noOutline: true });
  spr('spit', 8, 8, (g) => { g.ell(4, 4, 3, 3, '#8a6b2a'); g.ell(4, 4, 1, 1, '#e8c878'); }, { noOutline: true, noShade: true });
  spr('shock', 20, 20, (g) => { g.R(9, 2, 2, 16, P.pale); g.R(3, 9, 14, 2, P.pale); g.px(6, 6, P.white); g.px(13, 13, P.white); }, { noOutline: true, noShade: true });

  // ---------- pickups ----------
  spr('shard', 10, 12, (g) => {
    g.tri([5, 0, 10, 6, 5, 12, 0, 6], '#3fbf74'); g.tri([5, 1, 9, 6, 5, 11, 1, 6], '#5fe894');
    g.tri([5, 2, 7, 6, 5, 10, 3, 6], '#a8ffcc'); g.px(4, 3, '#ffffff');
  }, { ay: 0.5, noOutline: true, noShade: true });
  spr('heart', 12, 11, (g) => {
    g.ell(3.5, 4, 3.6, 3.6, '#3fbf74'); g.ell(8.5, 4, 3.6, 3.6, '#3fbf74'); g.tri([0, 5, 12, 5, 6, 11], '#3fbf74');
    g.ell(4, 3, 1.6, 1.6, '#c8ffd8'); g.px(7, 4, '#e8fff0');
  }, { ay: 0.5, noOutline: true, noShade: true });
  spr('story', 10, 10, (g) => { for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * (Math.PI * 2 / 5); g.ell(5 + Math.round(Math.cos(a) * 4), 5 + Math.round(Math.sin(a) * 4), 1, 1, P.gold); } g.ell(5, 5, 2, 2, '#fff2b0'); }, { ay: 0.5, noOutline: true });
  spr('wisp', 14, 16, (g) => { g.tri([7, 0, 12, 10, 7, 15, 2, 10], P.pale); g.tri([7, 3, 10, 10, 7, 13, 4, 10], P.white); }, { ay: 0.9 });

  // ---------- props ----------
  spr('barrel', 14, 18, (g) => {
    g.R(2, 2, 10, 15, P.rust); g.R(3, 3, 8, 13, '#9c5a48');
    g.R(2, 6, 10, 2, '#3a2a24'); g.R(2, 12, 10, 2, '#3a2a24');
    g.R(4, 9, 6, 2, P.amber); g.px(4, 9, '#14161e'); g.px(9, 10, '#14161e');
    g.ell(7, 2, 4, 1, '#7a4034');
  }, { ay: 0.92 });
  for (let gf = 0; gf < 2; gf++)
    spr('generator' + gf, 26, 30, (g) => {
      g.R(3, 6, 20, 22, P.ash); g.R(5, 8, 16, 18, P.ashD);
      g.ell(13, 17, 6, 6, P.bronzeD); g.ell(13, 17, 3, 3, gf ? '#ffe98a' : P.bronze);
      g.R(6, 2, 3, 5, '#4a5060'); g.R(17, 2, 3, 5, '#4a5060');
      if (gf) { g.px(6, 10, P.white); g.px(19, 20, P.white); g.px(13, 6, P.amber); }
      g.R(4, 27, 5, 3, '#3a4050'); g.R(17, 27, 5, 3, '#3a4050');
    }, { ay: 0.92 });
  spr('oil', 32, 16, (g, w, h) => {
    g.ell(16, 9, 14, 6, '#0e1218'); g.ell(10, 8, 6, 4, '#0e1218'); g.ell(23, 10, 6, 3, '#0e1218');
    g.ell(14, 7, 4, 1, '#2a3244'); g.px(22, 10, '#2a3244');
  }, { ay: 0.8, noOutline: true, noShade: true });
  spr('barricade', 30, 18, (g) => {
    for (let i = 0; i < 3; i++) g.R(0, 2 + i * 6, 30, 4, i % 2 ? '#7a5c3f' : '#8a6a4a');
    g.R(3, 0, 3, 18, '#4a5568'); g.R(24, 0, 3, 18, '#4a5568');
    g.R(0, 8, 30, 1, '#3a2f22');
  }, { ay: 0.9 });
  spr('car', 46, 24, (g) => {
    g.R(4, 8, 38, 10, '#4a5568'); g.R(2, 10, 42, 6, '#556275'); // body
    g.R(12, 2, 20, 8, '#3a4254'); g.R(14, 3, 16, 5, '#181c28'); // cabin/glass
    g.ell(10, 19, 4, 3, '#14161e'); g.ell(36, 19, 4, 3, '#14161e'); // wheels
    g.R(6, 12, 8, 2, '#6b4434'); g.R(30, 14, 10, 2, '#6b4434'); // rust
    g.R(40, 12, 4, 3, '#c9b493'); g.R(2, 12, 3, 2, '#8a3a3a'); // lights
  }, { ay: 0.92 });
  spr('rubble', 20, 14, (g) => { g.ell(7, 10, 6, 4, P.ash); g.ell(14, 11, 5, 3, P.ashD); g.R(10, 4, 2, 6, '#6b5535'); g.px(5, 7, '#7a8496'); }, { ay: 0.9 });
  for (let gf = 0; gf < 2; gf++)
    spr('billboard' + gf, 40, 28, (g) => {
      g.R(6, 20, 4, 8, '#3a4050'); g.R(30, 20, 4, 8, '#3a4050');
      g.R(2, 2, 36, 20, '#20283a'); g.R(4, 4, 32, 16, gf ? '#2a1a30' : '#141a2a');
      if (gf) { g.R(7, 7, 12, 3, P.amber); g.R(7, 13, 20, 2, '#ff8a4a'); g.R(23, 7, 6, 3, P.mag); }
      else { g.R(7, 7, 16, 2, '#2c3a56'); g.R(7, 12, 22, 2, '#232e46'); }
      g.R(2, 2, 36, 2, '#2c3448'); g.R(2, 20, 36, 2, '#2c3448');
    }, { ay: 0.95 });
  spr('subway', 44, 26, (g) => {
    g.ell(22, 26, 20, 16, '#20283a'); g.ell(22, 28, 14, 12, '#0a0e16');
    g.R(2, 0, 40, 5, '#2c3448'); g.R(8, 1, 28, 3, P.amber); // amber sign
    g.px(12, 2, '#14161e'); g.px(16, 2, '#14161e'); g.px(20, 2, '#14161e');
  }, { ay: 0.95 });
  spr('statue', 18, 30, (g) => {
    g.R(4, 26, 10, 4, '#3f4552');
    g.R(6, 6, 6, 20, '#6a7280'); g.ell(9, 4, 3, 3, '#6a7280');
    g.R(3, 10, 3, 8, '#575e6c'); g.R(12, 10, 3, 8, '#575e6c');
    g.px(8, 4, '#31363f'); g.px(10, 4, '#31363f');
  }, { ay: 0.95 });

  // ---------- fx decals (pixel-stepped gradients: no radial banding under NEAREST) ----------
  spr('glow', 64, 64, (g) => {
    for (let r = 30; r > 0; r -= 1) {
      const a = r > 22 ? 0.10 : r > 15 ? 0.22 : r > 9 ? 0.4 : 0.62;
      c.fillStyle = `rgba(255,255,255,${a})`;
      c.beginPath(); c.arc(32, 32, r, 0, Math.PI * 2); c.fill();
    }
  }, { noOutline: true, noShade: true, ax: 0.5, ay: 0.5 });
  spr('soft', 64, 64, (g) => {
    for (let r = 30; r > 0; r -= 1) {
      const a = r > 20 ? 0.12 : r > 12 ? 0.3 : 0.5;
      c.fillStyle = `rgba(255,255,255,${a})`;
      c.beginPath(); c.arc(32, 32, r, 0, Math.PI * 2); c.fill();
    }
  }, { noOutline: true, noShade: true });
  spr('shadow', 48, 24, (g) => {
    // dithered pixel ellipse: 3 softness steps, reads as intentional pixel art
    g.ell(24, 12, 21, 10, 'rgba(0,0,0,.16)');
    g.ell(24, 12, 16, 7, 'rgba(0,0,0,.22)');
    g.ell(24, 12, 10, 4, 'rgba(0,0,0,.3)');
  }, { noOutline: true, noShade: true });
  spr('ring', 64, 64, (g) => { c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 3; c.beginPath(); c.arc(32, 32, 28, 0, Math.PI * 2); c.stroke(); }, { noOutline: true, noShade: true });
  spr('beam', 32, 8, (g) => { const gr = c.createLinearGradient(0, 0, 0, 8); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, 32, 8); }, { noOutline: true, noShade: true });
  spr('trail', 6, 6, (g) => { g.ell(3, 3, 2, 2, 'rgba(255,255,255,.85)'); }, { noOutline: true, noShade: true });
  spr('firepool', 48, 24, (g) => { g.ell(24, 14, 20, 8, '#8a3a1e'); g.ell(24, 13, 16, 6, '#c4582a'); g.ell(18, 12, 7, 3, '#ffb454'); g.ell(28, 14, 5, 2, '#ffd75e'); for (let i = 0; i < 8; i++) g.px(8 + i * 4, 8 + (i % 3), '#ff8a4a'); }, { ay: 0.85, noOutline: true });
  spr('well', 48, 48, (g) => { c.strokeStyle = '#b08aff'; c.lineWidth = 2; c.beginPath(); c.arc(24, 24, 18, 0, Math.PI * 2); c.stroke(); c.strokeStyle = '#6b4a9c'; c.beginPath(); c.arc(24, 24, 12, 0, Math.PI * 2); c.stroke(); g.ell(24, 24, 5, 5, '#1a1024'); }, { noOutline: true, noShade: true });
  spr('star', 48, 48, (g) => { for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; g.R(24 + Math.cos(a) * 8 - 1, 24 + Math.sin(a) * 8 - 1, 2, 2, '#ffe98a'); } g.ell(24, 24, 6, 6, '#fff4c9'); g.ell(24, 24, 3, 3, '#ffffff'); }, { noOutline: true, noShade: true });
  spr('scorch', 48, 20, (g) => { g.ell(24, 11, 20, 7, 'rgba(8,8,12,.75)'); g.ell(24, 11, 14, 4, 'rgba(4,4,8,.85)'); }, { ay: 0.8, noOutline: true, noShade: true });
  spr('crackdec', 48, 48, (g) => { c.strokeStyle = 'rgba(10,12,20,.8)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(4, 8); c.lineTo(18, 20); c.lineTo(30, 16); c.lineTo(44, 30); c.moveTo(18, 20); c.lineTo(14, 40); c.moveTo(30, 16); c.lineTo(34, 4); c.stroke(); }, { ay: 0.5, noOutline: true, noShade: true });
  spr('tele', 64, 64, (g) => { c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 2; c.strokeRect(1, 1, 62, 62); const gr = c.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, 'rgba(255,255,255,.22)'); gr.addColorStop(1, 'rgba(255,255,255,.05)'); c.fillStyle = gr; c.fillRect(2, 2, 60, 60); }, { ax: 0, ay: 0, noOutline: true, noShade: true });
  spr('muzzle', 12, 12, (g) => { g.R(5, 0, 2, 12, P.white); g.R(0, 5, 12, 2, P.white); g.ell(6, 6, 2, 2, '#ffffff'); }, { noOutline: true, noShade: true });

  // ---------- environment kit: The Collapsed City ----------
  // ground patches (decals, no outline) — placed to break up tile repetition
  spr('concrete', 96, 96, (g) => {
    g.R(0, 0, 96, 96, '#1a2130');
    for (let i = 0; i < 90; i++) g.px((i * 37) % 96, (i * 53) % 96, i % 3 ? '#1e2636' : '#161c2a');
    g.R(0, 30, 96, 1, '#121826'); g.R(0, 31, 96, 1, '#202a3c');
    g.R(44, 0, 1, 96, '#121826'); g.R(45, 0, 1, 96, '#202a3c');
    g.R(46, 32, 1, 12, '#10151f'); g.R(13, 0, 1, 20, '#10151f');
  }, { ax: 0.5, ay: 0.5, noOutline: true, noShade: true });
  spr('dirt', 96, 96, (g) => {
    for (let i = 0; i < 18; i++) { const x = 8 + (i * 31) % 80, y = 8 + (i * 47) % 80; g.ell(x, y, 3 + (i * 7) % 6, 2 + (i * 5) % 4, i % 2 ? '#1e1a16' : '#191612'); }
    for (let i = 0; i < 14; i++) g.R((i * 41) % 90, (i * 29) % 90, 2, 2, i % 2 ? '#332b22' : '#3a4254'); // rubble bits
  }, { ax: 0.5, ay: 0.5, noOutline: true, noShade: true });
  spr('crossing', 96, 48, (g) => {
    g.R(0, 0, 96, 48, '#161b26');
    for (let x = 4; x < 96; x += 22) g.R(x, 8, 12, 30, 'rgba(200,208,224,.16)');
    for (let i = 0; i < 26; i++) g.px((i * 29) % 96, (i * 31) % 48, '#12161f');
  }, { ax: 0.5, ay: 0.5, noOutline: true, noShade: true });
  spr('debris', 64, 40, (g) => {
    for (let i = 0; i < 18; i++) { const x = 4 + (i * 23) % 56, y = 4 + (i * 17) % 32; g.ell(x, y, 2 + (i * 3) % 4, 1 + (i * 5) % 3, i % 3 ? '#232b3a' : '#2c3546'); }
    g.R(20, 16, 6, 2, '#4a5568'); g.R(38, 26, 5, 2, '#6b5535'); g.px(30, 10, '#7a8496');
  }, { ax: 0.5, ay: 0.5, noOutline: true, noShade: true });
  spr('puddle', 48, 20, (g) => {
    g.ell(24, 11, 20, 7, '#0e1420'); g.ell(20, 10, 9, 3, '#1b2840'); g.ell(30, 13, 5, 2, '#1b2840');
  }, { ax: 0.5, ay: 0.6, noOutline: true, noShade: true });
  spr('paint', 48, 14, (g) => {
    g.R(2, 4, 12, 5, 'rgba(210,190,90,.35)'); g.R(20, 4, 12, 5, 'rgba(210,190,90,.22)'); g.R(38, 4, 8, 5, 'rgba(210,190,90,.3)');
  }, { ax: 0.5, ay: 0.5, noOutline: true, noShade: true });
  spr('grate', 32, 32, (g) => {
    g.R(4, 4, 24, 24, '#10141d'); g.R(5, 5, 22, 22, '#181f2c');
    for (let y = 7; y < 27; y += 5) g.R(6, y, 20, 2, '#0a0e15');
    g.R(4, 4, 24, 1, '#232b3a'); g.R(4, 27, 24, 1, '#232b3a');
  }, { ax: 0.5, ay: 0.5, noOutline: true, noShade: true });
  spr('cables', 64, 24, (g) => {
    c.strokeStyle = '#0d1019'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(2, 8); c.quadraticCurveTo(18, 22, 34, 10); c.quadraticCurveTo(48, 2, 62, 14); c.stroke();
    c.strokeStyle = '#232b3a'; c.beginPath(); c.moveTo(2, 10); c.quadraticCurveTo(18, 24, 34, 12); c.stroke();
    g.px(34, 10, '#ffb454'); // frayed spark point
  }, { ax: 0.5, ay: 0.5, noOutline: true, noShade: true });
  spr('trash', 16, 12, (g) => {
    g.ell(5, 8, 4, 3, '#232b3a'); g.ell(11, 9, 4, 2, '#1c2331'); g.R(3, 4, 5, 2, '#2c3546'); g.px(12, 4, '#3a4254');
  }, { ay: 0.9 });
  spr('cone', 10, 12, (g) => {
    g.tri([5, 0, 9, 11, 1, 11], '#c46a2a'); g.R(3, 5, 4, 2, '#e8e0d0'); g.R(1, 10, 8, 2, '#8a4a1e');
  }, { ay: 0.92 });
  spr('crate', 20, 18, (g) => {
    g.R(2, 3, 16, 14, '#6b5535'); g.R(3, 4, 14, 12, '#7d643e');
    g.R(2, 9, 16, 2, '#5a4728'); g.R(9, 3, 2, 14, '#5a4728');
    g.R(2, 3, 16, 1, '#8d7248');
  }, { ay: 0.92 });
  // walls: front face + subdued top edge = 2.5D mass (kept under enemy contrast)
  spr('wall0', 48, 40, (g) => {
    g.R(0, 4, 48, 36, '#20283a'); g.R(0, 4, 48, 4, '#2c3852'); // face + top
    for (let y = 12; y < 40; y += 9) g.R(0, y, 48, 1, '#1a2131');
    for (let x = 0; x < 48; x += 16) g.R(x, 4, 1, 36, '#1a2131');
    g.R(4, 8, 6, 4, '#28324a'); g.R(30, 22, 8, 5, '#28324a'); // patches
  }, { ay: 0.9 });
  spr('wall1', 48, 40, (g) => {
    g.R(0, 4, 48, 36, '#20283a'); g.R(0, 4, 44, 4, '#2c3852');
    for (let y = 12; y < 40; y += 9) g.R(0, y, 48, 1, '#1a2131');
    c.strokeStyle = '#131a28'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(30, 4); c.lineTo(24, 18); c.lineTo(30, 30); c.lineTo(26, 40); c.stroke();
    g.R(10, 20, 5, 5, '#28324a'); g.px(31, 8, '#161d2c');
  }, { ay: 0.9 });
  spr('wall2', 48, 40, (g) => {
    g.tri([0, 40, 0, 8, 12, 4, 20, 14, 14, 40], '#20283a'); g.R(0, 4, 12, 4, '#2c3852');
    g.tri([26, 40, 22, 20, 34, 10, 48, 16, 48, 40], '#1c2434'); g.R(34, 10, 8, 3, '#28324a');
    g.ell(20, 34, 6, 4, '#171e2c'); g.R(4, 18, 4, 3, '#28324a');
    for (let i = 0; i < 8; i++) g.px(16 + (i * 7) % 28, 36 + (i % 3), '#2e3850');
  }, { ay: 0.9 });
  spr('storefront', 72, 48, (g) => {
    g.R(0, 0, 72, 40, '#252e42'); g.R(0, 0, 72, 6, '#39445c'); // fascia
    g.R(6, 8, 60, 3, '#8a6b3f'); g.px(10, 9, '#14161e'); g.px(14, 9, '#14161e'); // sign board
    g.R(6, 14, 26, 26, '#10151f'); // dark broken window
    g.tri([6, 40, 14, 22, 26, 40], '#1a2130'); // shards
    g.R(40, 14, 26, 26, '#39445c'); // fallen shutter
    for (let y = 16; y < 40; y += 4) g.R(40, y, 26, 1, '#2a3348');
    g.R(0, 40, 72, 8, '#1c2331'); // step
    g.R(34, 14, 2, 26, '#141a28');
  }, { ay: 0.92 });
  spr('machinery', 44, 40, (g) => {
    g.R(2, 6, 40, 34, '#333c52'); g.R(4, 8, 36, 30, '#3d4a66');
    g.R(6, 10, 12, 8, '#54e6ff55'); g.px(8, 12, '#9fe8ff'); // panel glow
    g.R(24, 12, 14, 4, '#222a3c'); g.R(26, 20, 4, 14, '#222a3c'); g.ell(28, 36, 3, 2, '#14161e'); // piston
    g.R(4, 30, 36, 3, '#ffb45455'); // hazard stripe
    g.R(0, 2, 8, 6, '#4a5568'); g.R(36, 2, 8, 6, '#4a5568'); // mounting lugs
    g.R(2, 36, 40, 4, '#1c2331');
  }, { ay: 0.92 });
  spr('pipes', 40, 16, (g) => {
    g.R(0, 5, 40, 6, '#39445c'); g.R(0, 6, 40, 2, '#4d5c7c');
    g.R(6, 3, 4, 10, '#2a3348'); g.R(28, 3, 4, 10, '#2a3348');
    g.px(36, 7, '#8a4a3a'); // rust joint
  }, { ay: 0.9 });
  spr('ebox', 16, 20, (g) => {
    g.R(3, 2, 10, 16, '#39445c'); g.R(4, 3, 8, 14, '#4d5c7c');
    g.R(6, 5, 4, 3, '#ffd75e88'); g.px(7, 6, '#14161e');
    g.R(4, 12, 8, 1, '#222a3c'); g.R(6, 18, 4, 2, '#1c2331');
  }, { ay: 0.92 });
  spr('vent', 20, 14, (g) => {
    g.R(1, 1, 18, 12, '#2a3348'); g.R(2, 2, 16, 10, '#39445c');
    for (let y = 3; y < 12; y += 3) g.R(3, y, 14, 1, '#1c2331');
  }, { ay: 0.9 });
  spr('fence', 40, 24, (g) => {
    c.strokeStyle = '#4d5c7c'; c.lineWidth = 1;
    for (let x = 2; x < 40; x += 5) { c.beginPath(); c.moveTo(x, 2); c.lineTo(x, 22); c.stroke(); }
    for (let y = 4; y < 24; y += 5) { c.beginPath(); c.moveTo(0, y); c.lineTo(40, y); c.stroke(); }
    g.R(0, 0, 3, 24, '#39445c'); g.R(37, 0, 3, 24, '#39445c');
    g.R(0, 0, 40, 2, '#4d5c7c');
  }, { ay: 0.92 });
  // arc-node hazard (electrical) — frame 1 = discharging
  for (let gf = 0; gf < 2; gf++)
    spr('arc' + gf, 20, 28, (g) => {
      g.R(7, 20, 6, 6, '#333c52'); g.R(8, 8, 4, 14, '#4d5c7c'); // base + pole
      g.ell(10, 6, 6, 4, '#39445c'); g.R(6, 5, 8, 2, '#4d5c7c'); // coil head
      g.px(8, 4, gf ? '#ffe98a' : '#ffd75e88'); g.px(12, 5, gf ? '#9fe8ff' : '#2f8fb0');
      if (gf) { g.R(3, 1, 2, 4, '#ffe98a'); g.R(15, 2, 2, 3, '#ffe98a'); g.px(10, 0, '#ffffff'); }
    }, { ay: 0.95 });
  // enemy spawn telegraph rune
  spr('rune', 48, 48, (g) => {
    c.strokeStyle = 'rgba(255,138,74,.9)'; c.lineWidth = 2;
    c.beginPath(); c.arc(24, 24, 20, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = 'rgba(255,180,84,.5)';
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.4; c.beginPath(); c.arc(24, 24, 14, a, a + 0.9); c.stroke(); }
    g.px(24, 24, '#ff8a4a');
  }, { noOutline: true, noShade: true });
  // death gibs + ground splat (tintable)
  spr('gib', 8, 8, (g) => {
    g.tri([1, 6, 3, 1, 6, 3, 7, 7], '#ffffff'); g.px(4, 4, '#cccccc');
  }, { noOutline: true, noShade: true });
  spr('splat', 36, 20, (g) => {
    g.ell(18, 11, 15, 6, '#ffffff'); g.ell(8, 9, 5, 3, '#ffffff'); g.ell(29, 13, 4, 2, '#ffffff'); g.px(6, 15, '#ffffff'); g.px(32, 8, '#ffffff');
  }, { ax: 0.5, ay: 0.5, noOutline: true, noShade: true });

  // ---------- held weapons (rotate toward aim, layered over the body) ----------
  spr('wp_grave', 18, 10, (g) => {
    g.R(2, 3, 13, 5, '#2c3648'); g.R(2, 2, 13, 2, '#4a5568'); // heavy barrel
    g.R(14, 2, 3, 6, '#39445c'); g.px(17, 4, '#7ef2ff');      // muzzle block + vent
    g.R(0, 4, 4, 5, '#5a3a24'); g.px(1, 8, '#3d2818');        // wood grip
    g.px(6, 2, '#8fd6ff');                                     // energy cell
  }, { ax: 0.15, ay: 0.5, noOutline: true, noShade: true });
  spr('wp_widow', 17, 9, (g) => {
    g.R(1, 3, 12, 3, '#39445c'); g.R(1, 2, 12, 1, '#55627a'); // slim body
    g.R(13, 3, 3, 2, '#2c3648'); g.px(16, 3, '#7ef2ff');      // suppressor tip
    g.R(5, 6, 2, 3, '#1c2434'); g.R(8, 6, 2, 2, '#1c2434');   // magazine
    g.px(3, 1, '#8fd6ff');
  }, { ax: 0.15, ay: 0.5, noOutline: true, noShade: true });
  spr('wp_sun', 19, 11, (g) => {
    g.R(1, 4, 4, 4, '#39445c');                                // grip housing
    g.tri([5, 2, 16, 1, 16, 9, 5, 8], '#4a5568');              // prism body
    g.tri([6, 3, 15, 3, 15, 7, 6, 7], '#7d5c9e');              // void core
    g.R(15, 3, 2, 5, '#b08aff'); g.px(17, 5, '#d8c8ff');       // emitter (emissive)
    g.px(8, 1, '#ffe98a'); g.px(10, 9, '#ffd75e');             // sun filaments
  }, { ax: 0.15, ay: 0.5, noOutline: true, noShade: true });

  // street lamp: pole + head; frame 1 = flicker-off
  for (let gf = 0; gf < 2; gf++)
    spr('lamp' + gf, 14, 40, (g) => {
      g.R(6, 10, 3, 29, '#2c3648'); g.R(6, 10, 1, 29, '#3d4a66'); // pole
      g.R(3, 2, 9, 3, '#39445c'); g.R(4, 5, 7, 3, '#2c3648');     // head
      if (!gf) { g.R(5, 7, 5, 2, '#ffd75e'); g.px(6, 8, '#fff2b0'); g.px(9, 8, '#fff2b0'); }
      else { g.R(5, 7, 5, 2, '#3a3244'); }
    }, { ay: 0.95 });
  const F = {
    '0': ['111', '101', '101', '101', '111'], '1': ['010', '110', '010', '010', '111'],
    '2': ['111', '001', '111', '100', '111'], '3': ['111', '001', '111', '001', '111'],
    '4': ['101', '101', '111', '001', '001'], '5': ['111', '100', '111', '001', '111'],
    '6': ['111', '100', '111', '101', '111'], '7': ['111', '001', '010', '010', '010'],
    '8': ['111', '101', '111', '101', '111'], '9': ['111', '101', '111', '001', '111'],
    '+': ['000', '010', '111', '010', '000'], '-': ['000', '000', '111', '000', '000'],
    'x': ['000', '101', '010', '101', '000'], '%': ['101', '001', '010', '100', '101'],
    '.': ['000', '000', '000', '000', '010'], ':': ['000', '010', '000', '010', '000'],
    'K': ['101', '110', '100', '110', '101'], 'M': ['101', '111', '111', '101', '101'],
    ' ': ['000', '000', '000', '000', '000'],
  };
  for (const ch in F) {
    spr('f' + (ch === ' ' ? 'sp' : ch), 3, 5, (g) => {
      const rows = F[ch];
      for (let y = 0; y < 5; y++) for (let x = 0; x < 3; x++) if (rows[y][x] === '1') g.px(x, y, '#ffffff');
    }, { noOutline: true, noShade: true, ax: 0.5, ay: 0.5 });
  }

  return { canvas: cv, frames, SPR };
}

function hexRGB(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
