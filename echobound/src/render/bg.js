// Collapsed City: ground tile + 3 parallax skyline strips + sky gradient, all generated.
import { L } from './renderer.js';
import { RNG } from '../core/util.js';

const STRIP_W = 2600; // world units per horizontal tile of each strip

export function buildBackgrounds() {
  const rng = new RNG(0xc179);
  const W = 1024;

  const gt = document.createElement('canvas'); gt.width = gt.height = 128;
  const gg = gt.getContext('2d');
  // worn asphalt: value-structured, not flat — aggregate, slabs, stains, markings
  gg.fillStyle = '#1b2130'; gg.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 200; i++) { gg.fillStyle = i % 3 ? '#1f2637' : '#171c2a'; gg.fillRect(rng.int(0, 127), rng.int(0, 127), 2, 2); }
  for (let i = 0; i < 160; i++) { gg.fillStyle = i % 2 ? '#232b3f' : '#141926'; gg.fillRect(rng.int(0, 127), rng.int(0, 127), 1, 1); }
  // slab seams
  gg.fillStyle = '#12161f'; gg.fillRect(0, 62, 128, 2); gg.fillRect(62, 0, 2, 62);
  gg.fillStyle = '#272f44'; gg.fillRect(0, 64, 128, 1); gg.fillRect(64, 0, 1, 62);
  // patched tarmac
  gg.fillStyle = '#171b27'; gg.beginPath(); gg.arc(30, 30, 14, 0, 7); gg.fill();
  gg.fillStyle = '#20283a'; gg.beginPath(); gg.arc(96, 90, 11, 0, 7); gg.fill();
  gg.fillStyle = '#242c40'; gg.fillRect(8, 92, 20, 3);
  // cracks
  gg.strokeStyle = '#0e1119'; gg.lineWidth = 1.5;
  for (let i = 0; i < 4; i++) {
    gg.beginPath(); let x = rng.int(6, 122), y = rng.int(6, 122); gg.moveTo(x, y);
    for (let s = 0; s < 4; s++) { x += rng.int(-16, 16); y += rng.int(-16, 16); gg.lineTo(x, y); }
    gg.stroke();
  }
  // oil stain with sheen
  gg.fillStyle = '#10141d'; gg.beginPath(); gg.ellipse(70, 40, 16, 9, 0.4, 0, 7); gg.fill();
  gg.fillStyle = '#2a3450'; gg.fillRect(64, 36, 6, 1); gg.fillRect(74, 42, 4, 1);
  // worn lane paint
  gg.fillStyle = 'rgba(214,220,235,.13)'; gg.fillRect(0, 92, 44, 6); gg.fillRect(56, 92, 30, 6);
  gg.fillStyle = 'rgba(214,220,235,.07)'; gg.fillRect(96, 92, 32, 6);
  // manhole
  gg.beginPath(); gg.arc(96, 30, 10, 0, 7); gg.fillStyle = '#12161f'; gg.fill(); gg.strokeStyle = '#2a3244'; gg.lineWidth = 2; gg.stroke();
  gg.strokeStyle = '#0c0f16'; gg.lineWidth = 1; gg.beginPath(); gg.arc(96, 30, 6, 0, 7); gg.stroke();

  const sky = document.createElement('canvas'); sky.width = 4; sky.height = 256;
  const sg = sky.getContext('2d');
  const grd = sg.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, '#0a0f1c'); grd.addColorStop(0.6, '#0d1424'); grd.addColorStop(1, '#141c30');
  sg.fillStyle = grd; sg.fillRect(0, 0, 4, 256);

  const strip = (h, draw) => { const cv = document.createElement('canvas'); cv.width = W; cv.height = h; draw(cv.getContext('2d'), h); return cv; };

  const bg1 = strip(300, (g, h) => {
    const b = (x, w2, bh) => { g.fillStyle = '#0c1322'; g.fillRect(x, h - bh, w2, bh); g.fillStyle = '#101a30'; g.fillRect(x, h - bh, w2, 3); };
    const bs = [[0, 90, 150], [80, 60, 210], [135, 100, 120], [230, 70, 250], [295, 110, 170], [400, 80, 290], [475, 120, 140], [590, 70, 230], [655, 95, 180], [745, 110, 260], [850, 65, 200], [910, 114, 150]];
    for (const [x, w2, bh] of bs) { b(x % W, w2, bh); b((x % W) - W, w2, bh); }
    g.fillStyle = '#0a101d';
    for (let i = 0; i < 14; i++) { g.fillRect(rng.int(0, W), rng.int(h - 260, h - 100), rng.int(4, 14), rng.int(10, 40)); }
    for (let i = 0; i < 90; i++) { g.fillStyle = rng.f() < 0.12 ? '#ffb454' : '#1d2c4c'; g.fillRect(rng.int(0, W), rng.int(h - 240, h - 10), 2, 3); }
    for (let i = 0; i < 7; i++) { const x = rng.int(0, W), y = h - rng.int(140, 280); g.fillStyle = '#ff8a4a'; g.fillRect(x, y, 3, 4); g.fillStyle = 'rgba(255,138,74,.25)'; g.fillRect(x - 2, y - 6, 7, 6); }
  });

  const bg2 = strip(340, (g, h) => {
    const b = (x, w2, bh) => { g.fillStyle = '#131c30'; g.fillRect(x, h - bh, w2, bh); g.fillStyle = '#182338'; g.fillRect(x, h - bh, w2, 4); };
    const bs = [[10, 110, 170], [130, 80, 230], [220, 130, 130], [360, 90, 260], [460, 120, 160], [590, 100, 210], [700, 140, 150], [850, 120, 240], [980, 60, 190]];
    for (const [x, w2, bh] of bs) { b(x % W, w2, bh); b((x % W) - W, w2, bh); }
    g.fillStyle = '#0f1728';
    for (let i = 0; i < 10; i++) { const x = rng.int(0, W); g.beginPath(); g.moveTo(x, h - rng.int(60, 140)); g.lineTo(x + rng.int(40, 90), h - rng.int(20, 60)); g.lineTo(x + rng.int(20, 50), h); g.lineTo(x - 10, h); g.fill(); }
    for (let i = 0; i < 60; i++) { g.fillStyle = rng.f() < 0.2 ? '#ffb454' : '#223458'; g.fillRect(rng.int(0, W), rng.int(h - 220, h - 20), 2, 3); }
    g.strokeStyle = '#1c2942'; g.lineWidth = 3;
    for (const x of [180, 640]) { g.beginPath(); g.moveTo(x, h); g.lineTo(x, h - 250); g.lineTo(x + 90, h - 250); g.moveTo(x, h - 220); g.lineTo(x - 40, h - 250); g.stroke(); }
  });

  const bg3 = strip(240, (g, h) => {
    g.fillStyle = '#182134';
    for (let x = 0; x < W; ) { const bw = rng.int(34, 78); g.fillRect(x, h - rng.int(26, 70), bw, 80); x += bw + rng.int(2, 16); }
    g.fillStyle = '#121a2b';
    for (let i = 0; i < 26; i++) { const x = rng.int(0, W); g.beginPath(); g.moveTo(x, h); g.lineTo(x + rng.int(14, 40), h - rng.int(18, 48)); g.lineTo(x + rng.int(30, 60), h); g.fill(); }
    g.strokeStyle = '#1f2c48'; g.lineWidth = 2;
    for (let i = 0; i < 16; i++) { const x = rng.int(0, W); g.beginPath(); g.moveTo(x, h); g.lineTo(x + rng.int(-20, 20), h - rng.int(22, 58)); g.stroke(); }
    for (let i = 0; i < 12; i++) { g.fillStyle = rng.f() < 0.3 ? '#8a6b3f' : '#253554'; g.fillRect(rng.int(0, W), rng.int(h - 60, h - 12), 2, 3); }
  });

  return { ground: gt, sky, bg1: fadeBottom(bg1), bg2: fadeBottom(bg2), bg3: fadeBottom(bg3) };
}

// strips dissolve into the ground instead of ending in a hard edge
function fadeBottom(cv) {
  const c = cv.getContext('2d');
  const gr = c.createLinearGradient(0, cv.height, 0, cv.height * 0.45);
  gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  c.globalCompositeOperation = 'destination-out';
  c.fillStyle = gr; c.fillRect(0, 0, cv.width, cv.height);
  c.globalCompositeOperation = 'source-over';
  return cv;
}

export function drawBackground(R, G, BG) {
  const vw = R.viewW(), vh = R.viewH();
  // sky: fills the whole view
  {
    const x0 = G.cam.x - vw / 2 - 40, y0 = G.cam.y - vh / 2 - 40, x1 = G.cam.x + vw / 2 + 40, y1 = G.cam.y + vh / 2 + 40;
    R._quad(L.SKY, [x0, y0, x1, y0, x0, y1, x1, y1], [0, 0, 1, 0, 0, 1, 1, 1], '#ffffff', 1);
  }
  // ground: world-uv tiled quad
  {
    const x0 = G.cam.x - vw / 2 - 64, y0 = G.cam.y - vh / 2 - 64, x1 = G.cam.x + vw / 2 + 64, y1 = G.cam.y + vh / 2 + 64;
    R._quad(L.GROUND, [x0, y0, x1, y0, x0, y1, x1, y1], [x0 / 128, y0 / 128, x1 / 128, y0 / 128, x0 / 128, y1 / 128, x1 / 128, y1 / 128], '#ffffff', 1);
  }
  // parallax strips: horizontal parallax via scaled camera, anchored near top of view
  const stripQuad = (cv, par, alpha, lid) => {
    const cxp = G.cam.x * par;
    const w2 = vw * 0.5 + STRIP_W;
    const x0 = cxp - w2, x1 = cxp + w2;
    const hh = vh * 0.62 * (cv.height / 300);
    const yTop = G.cam.y - vh * 0.5 - hh * 0.1, yBot = yTop + hh * 1.3;
    const uvX0 = x0 / STRIP_W, uvX1 = x1 / STRIP_W;
    R._quad(lid, [x0, yTop, x1, yTop, x0, yBot, x1, yBot], [uvX0, 0, uvX1, 0, uvX0, 1, uvX1, 1], '#ffffff', alpha);
  };
  stripQuad(BG.bg1, 0.22, 0.55, L.BG1);
  stripQuad(BG.bg2, 0.42, 0.45, L.BG2);
  stripQuad(BG.bg3, 0.65, 0.34, L.BG3);
}
