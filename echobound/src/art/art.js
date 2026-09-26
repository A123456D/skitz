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
    const A = (i, j) => (i < 0 || j < 0 || i >= pw || j >= ph) ? 0 : d[(j * pw + i) * 4 + 3];
    if (!opt.noPost) {
      const shade = !opt.noShade;
      for (let j = ph - 1; j >= 0; j--) for (let i = pw - 1; i >= 0; i--) {
        const k = (j * pw + i) * 4;
        if (d[k + 3] > 40) {
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

  // ---------- characters ----------
  spr('warden', 24, 28, (g) => {
    g.R(9, 2, 7, 7, '#3d5c9e'); g.R(8, 4, 9, 4, '#3d5c9e'); // hood
    g.R(10, 5, 5, 2, '#7ef2ff'); // visor
    g.R(7, 9, 11, 13, '#33518c'); g.R(8, 9, 9, 11, '#4a6cb0'); // coat
    g.R(10, 11, 5, 5, '#2f8fb0'); g.px(12, 13, '#d8f6ff'); // heartframe core
    g.R(5, 10, 3, 9, '#2a4070'); g.R(17, 10, 3, 9, '#2a4070'); // arms
    g.R(9, 22, 3, 5, '#1a2438'); g.R(13, 22, 3, 5, '#1a2438'); // legs
    g.R(8, 26, 4, 2, '#141b2c'); g.R(13, 26, 4, 2, '#141b2c');
    g.px(7, 12, '#9fe8ff'); g.px(18, 14, '#9fe8ff'); g.px(12, 12, '#ffffff');
  }, { ay: 0.92 });

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

  // ---------- enemies ----------
  spr('husk', 22, 22, (g) => {
    g.ell(11, 12, 8, 8, P.rust); g.ell(11, 8, 6, 5, '#9c5a48'); // hunched body
    g.R(8, 5, 6, 4, '#7a4438'); // head low
    g.px(10, 7, P.amber); g.px(12, 7, P.amber); // eyes
    g.R(3, 12, 4, 8, '#6b3a30'); g.R(16, 12, 4, 8, '#6b3a30'); // dragging arms
    g.ell(8, 6, 3, 2, P.bone); g.R(14, 16, 4, 3, P.bone); // bone plates
    g.R(8, 19, 3, 3, P.rustD); g.R(12, 19, 3, 3, P.rustD);
  }, { ay: 0.9 });

  spr('lancer', 20, 30, (g) => {
    g.R(7, 2, 7, 6, '#9c5540'); g.px(9, 5, P.amber); g.px(12, 5, P.amber); // head
    g.R(6, 8, 9, 10, '#8a4a3a'); // torso
    g.R(4, 9, 3, 8, '#7a4034'); g.R(14, 9, 3, 8, '#7a4034'); // arms
    g.R(2, 12, 18, 2, P.bone); g.tri([19, 12, 19, 13, 22, 12.5], P.ember); // lance
    g.R(7, 18, 3, 10, P.rustD); g.R(11, 18, 3, 10, P.rustD); // legs
    g.R(6, 27, 4, 2, '#4a2820'); g.R(11, 27, 4, 2, '#4a2820');
  }, { ay: 0.93 });

  spr('mourner', 26, 28, (g) => {
    g.ell(13, 16, 10, 11, '#4a3f45'); g.ell(13, 8, 6, 6, '#3c3339'); // robe+hood
    g.R(10, 8, 6, 3, '#14161e'); // hollow face
    g.px(11, 9, '#9fd8ff'); g.px(14, 9, '#9fd8ff');
    g.R(4, 14, 4, 12, '#41363c'); g.R(19, 14, 4, 12, '#41363c'); // sleeves
    g.R(12, 14, 3, 8, '#6a7280'); g.ell(13, 23, 3, 3, '#9fd8ff'); g.px(13, 23, P.white); // lantern
  }, { ay: 0.92 });

  spr('thief', 18, 20, (g) => {
    g.ell(9, 7, 5, 5, '#a8722f'); g.R(6, 4, 7, 3, '#8a5a24'); // head wrap
    g.R(7, 6, 5, 2, '#14161e'); g.px(8, 6, P.gold); // mask+eye
    g.R(5, 11, 8, 7, '#8a5a24'); // body
    g.R(12, 10, 5, 5, P.bone); // sack
    g.R(4, 12, 2, 6, '#7a4e1e'); g.R(13, 12, 2, 6, '#7a4e1e');
    g.R(6, 17, 3, 3, '#5e3c16'); g.R(10, 17, 3, 3, '#5e3c16');
  }, { ay: 0.9 });

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

  // ---------- fx decals ----------
  spr('glow', 64, 64, (g) => { const gr = c.createRadialGradient(32, 32, 2, 32, 32, 31); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, 64, 64); }, { noOutline: true, noShade: true, ax: 0.5, ay: 0.5 });
  spr('soft', 64, 64, (g) => { const gr = c.createRadialGradient(32, 32, 4, 32, 32, 31); gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, 64, 64); }, { noOutline: true, noShade: true });
  spr('shadow', 48, 24, (g) => { const gr = c.createRadialGradient(24, 12, 2, 24, 12, 22); gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = gr; c.fillRect(0, 0, 48, 24); }, { noOutline: true, noShade: true });
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
