// ECHOBOUND — boot, fixed-step loop, camera, render orchestration
import { Renderer, makeVignetteCanvas, L } from './render/renderer.js';
import { buildBackgrounds, drawBackground } from './render/bg.js';
import { buildAtlas } from './art/art.js';
import { I } from './core/input.js';
import { A } from './core/audio.js';
import { G, STEP, resetRun, fastN } from './game/state.js';
import { FX } from './game/fx.js';
import { META } from './game/meta.js';
import { updatePlayer, drawPlayer, updateOrbit } from './game/player.js';
import { tickRecorder } from './game/echo.js';
import { updateEnemies, drawEnemies, hurt, spawnEnemy } from './game/enemies.js';
import { updateBullets, drawBullets, drawBeams } from './game/weapons.js';
import { updateEchoes, drawEchoes, setBanner as echoBanner } from './game/echo.js';
import { updateBoss, drawBossExtras, setBanner as bossBanner } from './game/bosses.js';
import { updateDirector, setBanner as dirBanner } from './game/director.js';
import { genWorld, updateWorld, drawWorld } from './game/world.js';
import { offerChoices, offerRelics, applyUpgrade, ownedLabel, setBanner as upBanner } from './game/upgrades.js';
import { HUD } from './ui/hud.js';
import { fmtTime, clamp, TAU, lerp, rand } from './core/util.js';

const canvas = document.getElementById('game');
let R;
try { R = new Renderer(canvas); } catch (err) {
  document.getElementById('ui').innerHTML = `<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;color:#e8ecf4;font-family:monospace">ECHOBOUND needs WebGL2. ${err.message}</div>`;
  throw err;
}
R.setAtlas(buildAtlas());
const BG = buildBackgrounds();
R.texFromCanvas('sky', BG.sky);
R.texFromCanvas('ground', BG.ground, true, true);
R.texFromCanvas('bg1', BG.bg1, true, false);
R.texFromCanvas('bg2', BG.bg2, true, false);
R.texFromCanvas('bg3', BG.bg3, true, false);
R.setVignette(makeVignetteCanvas());
R.resize();
addEventListener('resize', () => {
  R.resize();
  if (G.screen === 'run') G.cam.zoom = Math.max(1.05, Math.min(1.8, Math.min(innerWidth / 1000, innerHeight / 620)));
});

I.init(canvas);
HUD.init();
const bw = (t, s, c) => HUD.banner(t, s, c);
enemiesSetBanner(bw); bossBanner(bw); dirBanner(bw); upBanner(bw); echoBanner(bw);
HUD.selectCb = (char, weapon) => startRun(char, weapon);
HUD.restartCb = () => beginRun();
function enemiesSetBanner(fn) { import('./game/enemies.js').then((m) => m.setBanner(fn)); }

// ---------------- run lifecycle ----------------
let runOpts = { char: 'warden', weapon: 'grave' };
let unlockSnapshot = [];
let endT = null;

function startRun(char, weapon) { runOpts = { char, weapon }; beginRun(); }
function beginRun() {
  resetRun(runOpts);
  genWorld();
  FX.reset();
  G.screen = 'run'; G.paused = false; G.modal = null; G.quitFlag = false;
  HUD.hideAll(); HUD.showHud();
  unlockSnapshot = META.d.unlocks.slice();
  META.d.runs++; META.save();
  A.ensure(); A.setIntensity(1); A.setBoss(false);
  endT = null;
  G.viewR = R.viewW();
  if (!META.d.helped) {
    META.d.helped = 1; META.save();
    HUD.els.help.classList.add('on'); G.modal = 'help';
  }
}
function showResults() {
  const s = G.stats, P = G.player;
  const win = G.flags.won;
  const notices = [];
  if (META.d.unlocks.includes('runner') && !unlockSnapshot.includes('runner')) notices.push('UNLOCKED — THE RUNNER');
  if (G.time >= 360 && META.unlock('sun')) notices.push('UNLOCKED — SUNSPIKE');
  META.d.best = Math.max(META.d.best, Math.floor(G.time));
  META.save();
  const total = Math.max(1, s.dmgP + s.dmgE);
  HUD.results(win, {
    time: G.time, level: P.level, kills: s.kills, echoes: s.echoes,
    echoPct: Math.round(s.dmgE / total * 100),
    runs: META.d.runs, deaths: META.d.wins, build: ownedLabel(), unlocks: notices,
  }, (action) => {
    if (action === 'retry') beginRun();
    else HUD.showTitle();
  });
}

// ---------------- simulation ----------------
function tick() {
  if (G.hitstop > 0) { G.hitstop -= STEP; return; }
  G.time += STEP;
  updatePlayer(STEP);
  tickRecorder();
  updateEnemies(STEP);
  updateBullets(STEP);
  updateEchoes(STEP);
  updateBoss(STEP);
  updateDirector(STEP);
  updateWorld(STEP);
  updateOrbit(STEP);
  FX.update(STEP);
  // ambient motes drift through the fight
  if (Math.random() < 0.3) {
    const r2 = G.viewR || 700;
    FX.dust(G.cam.x + rand(-r2 * 0.7, r2 * 0.7), G.cam.y + rand(-r2 * 0.45, r2 * 0.45));
  }
  // camera
  const P = G.player;
  const k = 1 - Math.pow(0.0015, STEP);
  G.cam.x = lerp(G.cam.x, P.x + Math.cos(P.aim) * 26, k);
  G.cam.y = lerp(G.cam.y, P.y + Math.sin(P.aim) * 26, k);
  G.cam.trauma = Math.max(0, G.cam.trauma - 1.7 * STEP);
  // end conditions
  if (!P.alive && endT === null) { endT = 1.6; HUD.banner('MEMORY SEVERED', '', '#ff5a5a'); A.setBoss(false); }
  if (G.flags.won && endT === null) endT = 2.8;
  if (endT !== null) { endT -= STEP; if (endT <= 0) { endT = null; showResults(); } }
  if (G.quitFlag) { G.quitFlag = false; HUD.showTitle(); }
}

// ---------------- render ----------------
function drawPickups(R) {
  for (const k of G.pickups) {
    const bob = Math.sin(G.time * 5 + k.x) * 2;
    const pulse = 0.75 + Math.sin(G.time * 6 + k.x * 0.7) * 0.25;
    if (k.kind !== 'shard') R.q('shadow', k.x, k.y + 6, { sx: 0.4, sy: 0.3, alpha: 0.3, layer: L.SHADOW });
    const spr = k.kind === 'shard' ? 'shard' : k.kind === 'heart' ? 'heart' : 'story';
    const col = k.kind === 'shard' ? '#7dff9b' : k.kind === 'heart' ? '#7dff9b' : '#ffd75e';
    R.q(spr, k.x, k.y + bob, { ay: 0.5, layer: L.ENT, alpha: k.kind === 'shard' ? pulse : 1 });
    R.q('glow', k.x, k.y + bob, { sx: k.kind === 'shard' ? 0.28 : 0.5, sy: k.kind === 'shard' ? 0.28 : 0.5, tint: col, alpha: (k.kind === 'shard' ? 0.18 : 0.3) * pulse, layer: L.GLOW });
  }
}

function render(dtR) {
  G.viewR = R.viewW();
  const [ox, oy] = FX.camOffset();
  R.begin({ x: G.cam.x + ox, y: G.cam.y + oy, zoom: G.cam.zoom });
  drawBackground(R, G, BG);
  if (G.screen === 'run' || G.screen === 'results') {
    drawWorld(R);
    FX.drawDecals(R);
    drawEnemies(R);
    drawEchoes(R);
    drawPlayer(R);
    drawPickups(R);
    if (G.orbPos) {
      for (const o of G.orbPos) {
        R.q('bolt', o.x, o.y, { tint: '#c8a0ff', layer: L.ENT });
        R.q('glow', o.x, o.y, { sx: 0.35, sy: 0.35, tint: '#c8a0ff', alpha: 0.35, layer: L.GLOW });
      }
    }
    drawBullets(R);
    drawBossExtras(R);
    drawBeams(R);
    FX.draw(R);
    const P = G.player;
    R.vignette(0.62);
    R.flash(0.05, '#3a2c12'); // subtle warm grade over the night city
    if (P && P.alive && P.hp < P.maxHp * 0.25) R.flash(0.06 + Math.sin(G.time * 5) * 0.04, '#ff1a3a');
    FX.drawFlash(R);
    G.beams.length = 0;
  } else {
    FX.draw(R);
    R.vignette(0.62);
    FX.drawFlash(R);
  }
  R.end();
  HUD.sync(dtR);
  if (G.Q.has('dbg') && G.screen === 'run') {
    HUD.els.dbg.textContent = `fps ${fps | 0} · en ${G.enemies.length} · bl ${G.bullets.length} · pa ${G.time.toFixed(0)}s · echoes ${G.echoes.length} · fast x${fastN()}`;
  }
}

// ---------------- loop ----------------
let last = performance.now(), acc = 0, fps = 60, fpsA = 0, fpsN = 0, fpsT = 0;
function frame(t) {
  requestAnimationFrame(frame);
  const dtR = Math.min(0.1, (t - last) / 1000);
  last = t;
  fpsA += dtR; fpsN++;
  if (fpsA > 0.5) { fps = fpsN / fpsA; fpsA = 0; fpsN = 0; }

  const running = G.screen === 'run' && !G.paused && !G.modal;
  if (running) {
    acc += dtR * fastN();
    let iter = 0;
    while (acc >= STEP && iter < 10) { tick(); acc -= STEP; iter++; }
    if (acc > STEP * 4) acc = 0;
    // queued level-ups / relic choice
    if (G.screen === 'run' && !G.paused && !G.modal && G.player.alive && !G.flags.won) {
      if (G.pendingRelic) {
        G.pendingRelic = false;
        HUD.openChoices('RELIC', 'the saint leaves behind a choice', offerRelics(3), (u) => { if (u) applyUpgrade(u); });
      } else if (G.pendingLevels > 0) {
        G.pendingLevels--;
        HUD.openChoices('LEVEL ' + G.player.level, 'choose what your past becomes', offerChoices(3), (u) => { if (u) applyUpgrade(u); });
      }
    }
  }  if (I.pressed('Escape') && G.screen === 'run' && !G.modal) HUD.togglePause();
  if (I.pressed('KeyM')) { A.ensure(); A.toggleMute(); }
  render(dtR);
  I.endFrame();
}
addEventListener('blur', () => { if (G.screen === 'run' && !G.modal && G.player && G.player.alive) HUD.togglePause(true); });

HUD.showTitle();
if (G.Q.has('dbg') || G.Q.has('test')) {
  const afterTicks = () => {
    if (G.screen === 'run' && !G.paused && !G.modal && G.player.alive && !G.flags.won) {
      if (G.pendingRelic) {
        G.pendingRelic = false;
        HUD.openChoices('RELIC', 'the saint leaves behind a choice', offerRelics(3), (u) => { if (u) applyUpgrade(u); });
      } else if (G.pendingLevels > 0) {
        G.pendingLevels--;
        HUD.openChoices('LEVEL ' + G.player.level, 'choose what your past becomes', offerChoices(3), (u) => { if (u) applyUpgrade(u); });
      }
    }
  };
  (window).EB = { G, HUD, A, R, META, tick, afterTicks, render: () => render(0.016), spawn: (type, n = 1, elite = null) => { for (let i = 0; i < n; i++) { const a = Math.random() * TAU, d = 300 + Math.random() * 260; spawnEnemy(type, G.player.x + Math.cos(a) * d, G.player.y + Math.sin(a) * d, elite); } }, step: (n) => { let i = 0; while (i++ < n && G.screen === 'run' && !G.modal && !G.paused) { tick(); afterTicks(); } } };
}
requestAnimationFrame(frame);
