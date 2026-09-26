// Procedural pixel-art atlas. Every sprite is drawn in code at 1x, then packed.
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

  // ---------- characters (3-frame walk cycle: idle, walkA, walkB) ----------
  const wardenBody = (g, legs) => {
    g.R(9, 2, 7, 7, '#3d5c9e'); g.R(8, 4, 9, 4, '#3d5c9e'); // hood
    g.R(10, 5, 5, 2, '#7ef2ff'); // visor
    g.R(7, 9, 11, 13, '#33518c'); g.R(8, 9, 9, 11, '#4a6cb0'); // coat
    g.R(10, 11, 5, 5, '#2f8fb0'); g.px(12, 13, '#d8f6ff'); // heartframe core
    g.R(5, 10, 3, 9, '#2a4070'); g.R(17, 10, 3, 9, '#2a4070'); // arms
    if (legs === 0) { g.R(9, 22, 3, 5, '#1a2438'); g.R(13, 22, 3, 5, '#1a2438'); g.R(8, 26, 4, 2, '#141b2c'); g.R(13, 26, 4, 2, '#141b2c'); }
    else if (legs === 1) { g.R(8, 22, 3, 4, '#1a2438'); g.R(14, 22, 3, 6, '#1a2438'); g.R(7, 25, 4, 2, '#141b2c'); g.R(14, 27, 4, 2, '#0d1119'); }
    else { g.R(8, 22, 3, 6, '#1a2438'); g.R(14, 22, 3, 4, '#1a2438'); g.R(7, 27, 4, 2, '#0d1119'); g.R(14, 25, 4, 2, '#141b2c'); }
    g.px(7, 12, '#9fe8ff'); g.px(18, 14, '#9fe8ff'); g.px(12, 12, '#ffffff');
  };
  for (let f = 0; f < 3; f++) spr('warden' + f, 24, 28, (g) => wardenBody(g, f), { ay: 0.92 });
  spr('runner', 22, 28, (g) => {
    g.R(8, 2, 7, 6, '#5a3a52'); g.R(9, 4, 4, 2, '#ffd0e8'); // head+hair band
    g.R(7, 8, 8, 10, '#6b4258'); // jacket
    g.R(4, 8, 3, 8, '#5a3a52'); g.R(15, 9, 3, 7, '#5a3a52'); // arms swing
    g.R(15, 6, 6, 2, P.mag); // scarf trail
    g.R(8, 18, 3, 7, '#2a2438'); g.R(12, 17, 3, 8, '#2a2438');
    g.R(7, 25, 5, 2, '#e6e6f0'); g.R(12, 24, 5, 2, '#e6e6f0'); // sneakers
  }, { ay: 0.92 });

  spr('ghost', 24, 28, (g) => {
    // drawn in greys so render tint colors it; echo of the warden
    g.R(9, 2, 7, 7, '#c8c8c8'); g.R(8, 4, 9, 4, '#c8c8c8');
    g.R(10, 5, 5, 2, '#ffffff');
    g.R(7, 9, 11, 13, '#b8b8b8'); g.R(8, 9, 9, 11, '#d4d4d4');
    g.R(10, 11, 5, 5, '#909090'); g.px(12, 13, '#ffffff');
    g.R(5, 10, 3, 9, '#a8a8a8'); g.R(17, 10, 3, 9, '#a8a8a8');
    g.R(9, 22, 3, 5, '#989898'); g.R(13, 22, 3, 5, '#989898');
    g.R(8, 26, 4, 2, '#888888'); g.R(13, 26, 4, 2, '#888888');
  }, { ay: 0.92, noOutline: true, noShade: true });

  // ---------- enemies (2-frame walk cycles where legs show) ----------
  const huskBody = (g, f) => {
    g.ell(11, 12, 8, 8, P.rust); g.ell(11, 8, 6, 5, '#9c5a48'); // hunched body
    g.R(8, 5, 6, 4, '#7a4438'); // head low
    g.px(10, 7, P.amber); g.px(12, 7, P.amber); // eyes
    g.R(3, 12, 4, 8, '#6b3a30'); g.R(16, 12, 4, 8, '#6b3a30'); // dragging arms
    g.ell(8, 6, 3, 2, P.bone); g.R(14, 16, 4, 3, P.bone); // bone plates
    if (f === 0) { g.R(8, 19, 3, 3, P.rustD); g.R(12, 20, 3, 2, P.rustD); }
    else { g.R(8, 20, 3, 2, P.rustD); g.R(12, 19, 3, 3, P.rustD); }
  };
  for (let f = 0; f < 2; f++) spr('husk' + f, 22, 22, (g) => huskBody(g, f), { ay: 0.9 });

  const lancerBody = (g, f) => {
    g.R(7, 2, 7, 6, '#9c5540'); g.px(9, 5, P.amber); g.px(12, 5, P.amber); // head
    g.R(6, 8, 9, 10, '#8a4a3a'); // torso
    g.R(4, 9, 3, 8, '#7a4034'); g.R(14, 9, 3, 8, '#7a4034'); // arms
    g.R(2, 12, 18, 2, P.bone); g.tri([19, 12, 19, 13, 22, 12.5], P.ember); // lance
    if (f === 0) { g.R(7, 18, 3, 10, P.rustD); g.R(11, 18, 3, 9, P.rustD); g.R(6, 27, 4, 2, '#4a2820'); g.R(11, 26, 4, 2, '#4a2820'); }
    else { g.R(7, 18, 3, 9, P.rustD); g.R(11, 18, 3, 10, P.rustD); g.R(6, 26, 4, 2, '#4a2820'); g.R(11, 27, 4, 2, '#4a2820'); }
  };
  for (let f = 0; f < 2; f++) spr('lancer' + f, 20, 30, (g) => lancerBody(g, f), { ay: 0.93 });

  spr('mourner', 26, 28, (g) => {
    g.ell(13, 16, 10, 11, '#4a3f45'); g.ell(13, 8, 6, 6, '#3c3339'); // robe+hood
    g.R(10, 8, 6, 3, '#14161e'); // hollow face
    g.px(11, 9, '#9fd8ff'); g.px(14, 9, '#9fd8ff');
    g.R(4, 14, 4, 12, '#41363c'); g.R(19, 14, 4, 12, '#41363c'); // sleeves
    g.R(12, 14, 3, 8, '#6a7280'); g.ell(13, 23, 3, 3, '#9fd8ff'); g.px(13, 23, P.white); // lantern
  }, { ay: 0.92 });

  const thiefBody = (g, f) => {
    g.ell(9, 7, 5, 5, '#a8722f'); g.R(6, 4, 7, 3, '#8a5a24'); // head wrap
    g.R(7, 6, 5, 2, '#14161e'); g.px(8, 6, P.gold); // mask+eye
    g.R(5, 11, 8, 7, '#8a5a24'); // body
    g.R(12, 10, 5, 5, P.bone); // sack
    if (f === 0) { g.R(4, 12, 2, 6, '#7a4e1e'); g.R(13, 12, 2, 5, '#7a4e1e'); g.R(5, 17, 3, 3, '#5e3c16'); g.R(11, 16, 3, 3, '#5e3c16'); }
    else { g.R(4, 12, 2, 5, '#7a4e1e'); g.R(13, 12, 2, 6, '#7a4e1e'); g.R(5, 16, 3, 3, '#5e3c16'); g.R(11, 17, 3, 3, '#5e3c16'); }
  };
  for (let f = 0; f < 2; f++) spr('thief' + f, 18, 20, (g) => thiefBody(g, f), { ay: 0.9 });

  spr('leech', 18, 14, (g) => {
    g.ell(9, 7, 8, 6, '#b0563a'); g.ell(9, 6, 7, 4, '#c46a48');
    g.ell(9, 8, 4, 3, '#5e2418'); // mouth
    for (let i = -1; i <= 1; i++) { g.px(9 + i * 2, 6, P.white); g.px(9 + i * 2, 9, P.white); }
    g.ell(4, 11, 2, 2, '#8a3a28'); g.ell(14, 11, 2, 2, '#8a3a28');
  }, { ay: 0.9 });

  spr('mirror', 20, 26, (g) => {
    g.tri([10, 1, 17, 10, 10, 24, 3, 10], '#5f6a7a'); // shard body
    g.tri([10, 4, 14, 10, 10, 20, 6, 10], '#7a8aa0');
    g.R(8, 9, 2, 4, '#aab6c8'); g.px(12, 13, '#aab6c8'); // shine
    g.R(9, 8, 3, 2, P.amber); g.px(9, 14, P.amber); g.px(11, 16, P.amber); // amber cracks
  }, { ay: 0.92 });

  spr('timeeater', 26, 26, (g) => {
    g.ell(13, 13, 11, 11, P.bronzeD); g.ell(13, 13, 9, 9, P.bronze);
    g.ell(13, 13, 7, 7, '#e6d9b8'); // clock face
    g.R(12, 7, 2, 7, '#3a3020'); g.R(13, 12, 5, 2, '#3a3020'); // hands
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.4; g.px(13 + Math.round(Math.cos(a) * 8), 13 + Math.round(Math.sin(a) * 8), '#8a7050'); }
    g.ell(6, 4, 3, 3, '#6b5a3f'); g.ell(20, 21, 3, 3, '#6b5a3f'); // bolts
    g.px(10, 10, P.red); // single red pupil center
  }, { ay: 0.9 });

  spr('parasite', 24, 12, (g) => {
    for (let i = 0; i < 4; i++) g.ell(4 + i * 5, 7 + (i % 2), 3, 4 - (i === 3 ? 1 : 0), i % 2 ? '#b08a3a' : '#9a7830');
    g.R(19, 4, 4, 5, '#8a6b2a'); g.px(21, 5, P.ember); g.px(21, 7, P.ember);
    g.R(2, 10, 3, 2, '#7a5c26'); g.R(8, 10, 3, 2, '#7a5c26'); g.R(14, 10, 3, 2, '#7a5c26');
  }, { ay: 0.85 });

  spr('witness', 24, 24, (g) => {
    g.ell(12, 14, 9, 8, '#4a3c30'); g.ell(12, 9, 6, 5, '#5a4a3a'); // cloak+hood
    g.ell(12, 11, 7, 6, P.bone); g.ell(12, 11, 5, 5, '#efe6d0'); // eye
    g.ell(12, 11, 2.5, 2.5, P.amber); g.px(12, 11, '#3a2a10'); // iris
    g.ell(5, 20, 2, 3, '#3c3128'); g.ell(19, 20, 2, 3, '#3c3128'); // tail tatters
  }, { ay: 0.9 });

  spr('clockadd', 16, 16, (g) => {
    g.ell(8, 9, 6, 6, P.bronzeD); g.ell(8, 9, 4, 4, P.bronze);
    g.R(7, 2, 2, 4, '#6b5535'); g.R(7, 12, 2, 4, '#6b5535'); g.R(2, 8, 4, 2, '#6b5535'); g.R(10, 8, 4, 2, '#6b5535'); // gear teeth
    g.px(7, 8, P.ember); g.px(9, 8, P.ember);
  }, { ay: 0.9 });

  spr('saint', 64, 72, (g) => {
    // gear halo behind
    g.ell(32, 16, 20, 20, '#00000000');
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; g.ell(32 + Math.round(Math.cos(a) * 17), 14 + Math.round(Math.sin(a) * 15), 3, 3, P.bronze); }
    g.ell(32, 14, 13, 11, P.bronzeD); g.ell(32, 14, 10, 8, '#3a3145');
    g.ell(32, 22, 10, 9, P.bone); g.ell(32, 20, 8, 7, '#e8dcbe'); // head
    g.R(28, 19, 2, 3, '#241c14'); g.R(34, 19, 2, 3, '#241c14'); // serene eyes
    g.R(30, 25, 4, 2, '#b8a482'); // mouth line
    // robe
    g.tri([32, 28, 14, 66, 50, 66], '#cfc0a0'); g.tri([32, 28, 20, 64, 44, 64], '#e2d4b2');
    g.R(28, 34, 8, 10, P.bronze); g.px(31, 38, P.amber); g.px(33, 38, P.amber); // chest relic
    // arms folded
    g.R(18, 32, 10, 5, P.bone); g.R(36, 32, 10, 5, P.bone);
    // gear wings
    for (const sx of [0, 1]) { const bx = sx ? 50 : 12; g.ell(bx, 36, 7, 7, P.bronzeD); g.ell(bx, 36, 4, 4, P.bronze); g.R(bx - 1, 26, 2, 6, '#6b5535'); }
    g.R(22, 66, 8, 4, '#a89878'); g.R(34, 66, 8, 4, '#a89878'); // hem
  }, { ay: 0.95 });

  spr('hk', 56, 64, (g) => {
    // crown
    g.R(18, 0, 3, 6, P.bronze); g.R(26, 0, 3, 6, P.bronze); g.R(34, 0, 3, 6, P.bronze);
    g.R(17, 5, 21, 3, P.bronzeD);
    g.R(19, 8, 18, 12, '#6b3a3a'); g.R(21, 10, 14, 8, '#7d4646'); // head
    g.R(23, 13, 3, 3, '#ffd0d0'); g.R(30, 13, 3, 3, '#ffd0d0'); // pale eyes
    g.R(24, 18, 8, 1, '#3a1c1c'); // grim mouth
    // shoulders massive
    g.R(6, 20, 44, 12, '#5e3434'); g.R(4, 22, 8, 14, '#4a2a2a'); g.R(44, 22, 8, 14, '#4a2a2a');
    // chest hollow
    g.R(20, 24, 16, 16, '#1a1018'); g.ell(28, 32, 5, 5, '#0c0810'); g.px(28, 32, P.red); g.px(27, 31, P.ember); // ember heart
    g.R(10, 32, 8, 18, '#5e3434'); g.R(38, 32, 8, 18, '#5e3434'); // arms
    g.R(8, 48, 10, 6, '#4a2a2a'); g.R(38, 48, 10, 6, '#4a2a2a'); // fists
    g.R(18, 40, 20, 18, '#6b3a3a'); // skirt
    g.R(16, 58, 10, 5, '#3a2020'); g.R(30, 58, 10, 5, '#3a2020');
    // tattered cape edge
    g.R(2, 36, 3, 8, '#412424'); g.R(51, 36, 3, 8, '#412424');
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
  spr('shard', 8, 10, (g) => { g.tri([4, 0, 8, 5, 4, 10, 0, 5], P.grn); g.tri([4, 2, 6, 5, 4, 8, 2, 5], '#c8ffd8'); }, { ay: 0.5 });
  spr('heart', 10, 9, (g) => { g.ell(3, 3, 3, 3, P.grn); g.ell(7, 3, 3, 3, P.grn); g.tri([0, 4, 10, 4, 5, 9], P.grn); g.px(3, 3, '#d0ffe0'); }, { ay: 0.5 });
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

  // ---------- 3x5 pixel digits ----------
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
