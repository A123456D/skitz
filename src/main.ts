/** WRECKBALL bootstrap: pixi app, screen state machine, loop wiring. */
import { Application } from 'pixi.js';
import { GameLoop } from './engine/loop';
import { Input } from './engine/input';
import { Camera } from './engine/camera';
import { audio } from './engine/audio';
import { loadAtlas } from './render/atlas';
import { makeWorldRenderer, type WorldRenderer } from './render/world';
import { PostFx } from './render/post';
import { Run } from './game/run';
import { CHARACTERS } from './game/data/characters';
import { ENEMY } from './game/data/enemies';
import { unlockDef } from './game/data/unlocks';
import { BIOMES } from './game/data/biomes';
import type { PendingChoice } from './game/state';
import { getSave, recordRun, addGold, grantDepthUnlocks } from './save/save';
import { buildHud, hurtFlash, hudFullscreenButton, hudPauseButton, toast, updateHud } from './ui/hud';
import { hideLevelUp, initLevelUp, showLevelUp } from './ui/levelup';
import { hideAllScreens, initMenus, showCharSelect, showEnd, showPause, showShop, showTitle } from './ui/menus';
import { initTouchUi, updateTouchUi } from './ui/touch';

type Phase = 'menu' | 'running' | 'levelup' | 'paused' | 'ended';

const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 0 && Math.min(screen.width, screen.height) < 820);
const maxActive = isMobile ? 850 : 1500;

let phase: Phase = 'menu';
let run: Run | null = null;
let renderer: WorldRenderer | null = null;
let post: PostFx | null = null;
let app: Application | null = null;
let loopRef: GameLoop | null = null;
let debugEl: HTMLElement;
let hudRoot: HTMLElement;
const camera = new Camera();
let screenW = 0;
let screenH = 0;
// music intensity smoothing (hysteresis so the mix doesn't flap)
let musicTarget = 0;
let musicCandidate = 0;
let musicCandT = 0;

const input = new Input(document.body, {
  onPause: () => {
    if (phase === 'running') pauseRun();
    else if (phase === 'paused') resumeRun();
  },
  onAnyInput: () => audio.unlock(),
});

async function boot(): Promise<void> {
  app = new Application();
  await app.init({
    canvas: document.getElementById('game') as HTMLCanvasElement,
    preference: 'webgpu',
    autoStart: false, // our own loop renders manually
    antialias: false,
    background: 0x0b0e1a,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
    resizeTo: window,
  });

  const atlas = await loadAtlas();
  renderer = makeWorldRenderer(atlas, isMobile);
  renderer.skin = getSave().skin;
  renderer.initPlayerSprite();
  // GPU post stack (bloom/grade/chromatic/vignette) — ?fx=0 disables for A/B
  const search = new URLSearchParams(location.search);
  // GPU post stack (bloom/grade/chromatic/vignette) — ?fx=0 disables for A/B;
  // phones run lite (no chroma, softer bloom/vignette) unless ?fx=full
  if (search.get('fx') !== '0') {
    const liteFx = isMobile && search.get('fx') !== 'full';
    post = new PostFx(app, renderer.root, liteFx);
    renderer.onScreenImpact = (f) => post?.screenImpact(f);
    renderer.onBossKill = () => {
      post?.bossKill();
      camera.zoomPulse(0.14, 0.7);
    };
  } else {
    app.stage.addChild(renderer.root);
  }

  buildHud();
  hudRoot = document.getElementById('hud')!;
  initLevelUp({
    pick: pickCard,
    reroll: () => {
      if (!run) return;
      const next = run.reroll();
      if (next) {
        showLevelUp(next, {
          level: run.w.runStats.level,
          rerollsLeft: run.rerollsLeft,
          banishesLeft: run.banishesLeft,
          lockedKey: run.w.locked ? `${run.w.locked.kind}:${run.w.locked.id}` : null,
        });
      }
    },
    banish: (c) => {
      if (!run) return;
      const rest = run.banish(c);
      if (rest && rest.length > 0) {
        showLevelUp(rest, {
          level: run.w.runStats.level,
          rerollsLeft: run.rerollsLeft,
          banishesLeft: run.banishesLeft,
          lockedKey: run.w.locked ? `${run.w.locked.kind}:${run.w.locked.id}` : null,
        });
      } else if (rest && rest.length === 0) {
        // banished the last visible card: force a fresh hand if possible
        const next = run.reroll() ?? run.takeChoices();
        if (next && next.length > 0) {
          showLevelUp(next, {
            level: run.w.runStats.level,
            rerollsLeft: run.rerollsLeft,
            banishesLeft: run.banishesLeft,
            lockedKey: run.w.locked ? `${run.w.locked.kind}:${run.w.locked.id}` : null,
          });
        } else {
          run.w.locked = null;
          run.w.refreshStats();
          hideLevelUp();
          phase = 'running';
        }
      }
    },
    lock: (c) => {
      if (!run) return;
      run.toggleLock(c);
      const hand = run.currentHand();
      if (hand.length > 0) {
        showLevelUp(hand, {
          level: run.w.runStats.level,
          rerollsLeft: run.rerollsLeft,
          banishesLeft: run.banishesLeft,
          lockedKey: run.w.locked ? `${run.w.locked.kind}:${run.w.locked.id}` : null,
        });
      }
    },
  });
  initTouchUi(input, isMobile);
  initMenus({
    onPlay: startRun,
    onShop: () => showShop(),
    onCharSelect: () => void showCharSelect(),
    onBack: () => {
      phase = 'menu';
      showTitle();
    },
    onResume: resumeRun,
    onQuitRun: () => endRun('dead', true),
    onRetry: startRun,
    onDescend: descendRun,
    refresh: () => {},
  });
  audio.sfxOn = getSave().settings.sfx;

  hudPauseButton().addEventListener('click', () => {
    if (phase === 'running') pauseRun();
    else if (phase === 'paused') resumeRun();
  });
  // fullscreen: hide browser chrome (the main mobile complaint). iOS Safari has
  // no element fullscreen — hide the button there (PWA install is the path).
  const fsBtn = hudFullscreenButton();
  if (!document.fullscreenEnabled) fsBtn.classList.add('hidden');
  fsBtn.addEventListener('click', () => {
    const doc = document as Document & { webkitFullscreenElement?: Element; webkitRequestFullscreen?: () => Promise<void> };
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
    const active = document.fullscreenElement ?? doc.webkitFullscreenElement;
    if (active) {
      void document.exitFullscreen();
    } else {
      const req = el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.();
      void req?.then(() => {
        // installed-PWA/Android: lock to landscape so the rotation gate rarely shows
        const so = screen.orientation as (ScreenOrientation & { lock?: (o: string) => Promise<void> }) | undefined;
        try { void so?.lock?.('landscape'); } catch { /* unsupported */ }
      }).catch(() => { /* denied */ });
    }
  });
  window.addEventListener('pointerdown', () => audio.unlock(), { once: true });

  resize();
  window.addEventListener('resize', resize);
  // entering/exiting fullscreen resizes the viewport — reflow camera + post
  window.addEventListener('fullscreenchange', () => setTimeout(resize, 60));
  // ?nopause=1 keeps the sim running when the tab is hidden (automated QA)
  if (!new URLSearchParams(location.search).has('nopause')) {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && phase === 'running') pauseRun();
    });
  }

  // landscape gate: portrait touch devices get the rotate overlay (CSS) + auto-pause;
  // ?forcemobile=1 previews the gate on desktop for QA
  const devForce = new URLSearchParams(location.search).has('forcemobile');
  if (devForce) document.body.classList.add('force-portrait');
  const portraitGate = window.matchMedia('(orientation: portrait) and (pointer: coarse)');
  const gateChange = (): void => {
    const gated = portraitGate.matches || document.body.classList.contains('force-portrait');
    if (gated && phase === 'running') pauseRun();
  };
  portraitGate.addEventListener('change', gateChange);

  debugEl = document.createElement('div');
  debugEl.style.cssText = 'position:fixed;bottom:4px;left:4px;font:11px monospace;color:#8f8;background:#000a;padding:2px 8px;z-index:99;display:none;pointer-events:none;white-space:pre';
  document.body.appendChild(debugEl);

  // PWA: installable + offline-capable (https or localhost only)
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    void navigator.serviceWorker.register('./sw.js').catch(() => { /* dev/offline env */ });
  }
  window.addEventListener('keydown', (e) => {
    if (e.key === 'F3') {
      e.preventDefault();
      debugEl.style.display = debugEl.style.display === 'none' ? 'block' : 'none';
    }
  });

  loopRef = new GameLoop(simulate, renderFrame);
  loopRef.start();
  // dev introspection hook (used by automated QA)
  (window as unknown as { __wb?: unknown }).__wb = {
    app, renderer, post, camera, loop: loopRef, audio,
    get run() { return run; },
    get phase() { return phase; },
  };
}

function resize(): void {
  screenW = window.innerWidth;
  screenH = window.innerHeight;
  camera.resize(screenW, screenH, Math.min(window.devicePixelRatio || 1, 2));
  post?.resize(screenW, screenH);
}

// ---------- run lifecycle ----------

function startRun(): void {
  audio.unlock();
  const save = getSave();
  const char = CHARACTERS.find((c) => c.id === save.selectedChar) ?? CHARACTERS[0];
  const seed = (Math.random() * 2 ** 31) | 0;
  run = new Run(char, seed, {
    maxActive,
    onLevelUp: (choices) => {
      if (choices.length === 0) return; // pool exhausted; sim resumes
      phase = 'levelup';
      showLevelUp(choices, {
        level: run!.w.runStats.level,
        rerollsLeft: run!.rerollsLeft,
        banishesLeft: run!.banishesLeft,
        lockedKey: run!.w.locked ? `${run!.w.locked.kind}:${run!.w.locked.id}` : null,
      });
    },
    onEnd: (state) => endRun(state, false),
  });
  run.fx = renderer;
  run.onZoneToast = (name) => {
    toast(name, 1800);
    // the current zone just became the new one: shift grade + music theme
    const b = run!.w.zoneAt(run!.w.px, run!.w.py).biome;
    post?.setBiome(b);
    audio.setMusicTheme(b.id);
  };
  run.onShrineToast = (kind) => toast(
    kind === 'might' ? "+30% DAMAGE — 45s" :
    kind === 'regen' ? "REGEN +1.2/s — 45s" : "MAGNET +60% — 45s", 1800);
  run.onToast = (msg) => toast(msg, 1300);
  run.onEventToast = (msg, durS) => toast(msg, Math.min(3600, durS * 1000 + 900));
  renderer!.initRun(run.w);
  // earned weapons join this run's draft pool
  if (getSave().unlocks.includes('u_boomer')) run.w.unlockedWeapons.add('boomer');
  renderer!.onShake = (mag, dur) => camera.shake(mag, dur);
  renderer!.onHurtFlash = () => hurtFlash();
  renderer!.onBossWarn = (type) => toast(type === ENEMY.krusher ? '⚠ KRUSHER INCOMING ⚠' : '⚠ BONZAR INCOMING ⚠', 2200);
  // dev fast-forward: ?t=300 starts the run 5 minutes in; ?build=max equips a maxed loadout
  const devParams = new URLSearchParams(location.search);
  const headStart = Number(devParams.get('t') ?? 0);
  if (headStart > 0 && headStart < 600) run.w.runStats.time = headStart;
  const biomeParam = devParams.get('biome');
  if (biomeParam) {
    const forced = BIOMES.find((b) => b.id === biomeParam);
    if (forced) run.w.biome = forced;
  }
  const zoneParam = devParams.get('zone');
  if (zoneParam) {
    const z = run.w.zones.find((zz) => zz.id === zoneParam);
    if (z) { run.w.px = z.x + z.w / 2; run.w.py = z.y + z.h / 2; run.w.egz = 0; }
  }
  if (devParams.get('build') === 'max') {
    for (const [id, lvl] of [['slam', 5], ['shot', 5], ['orbit', 5], ['dash', 5], ['chain', 5]] as const) {
      run.w.addWeapon(id);
      run.w.weapons.set(id, lvl);
      run.w.weaponCds.set(id, 1);
    }
    for (const [id, lvl] of [['mass', 5], ['vitality', 5], ['impact', 5], ['velocity', 5]] as const) {
      run.w.passives.set(id, lvl);
    }
    run.w.refreshStats();
    run.w.hp = run.w.stats.maxHp;
  }
  hideAllScreens();
  hideLevelUp();
  phase = 'running';
  // atmosphere + music follow the starting zone
  const startBiome = run.w.zoneAt(run.w.px, run.w.py).biome;
  post?.setBiome(startBiome);
  audio.unlock();
  audio.startMusic(startBiome.id);
  toast(`${run.w.biome.name} — SURVIVE 10:00`, 2400);
}

function pauseRun(): void {
  if (phase !== 'running') return;
  phase = 'paused';
  showPause();
}

function resumeRun(): void {
  if (phase !== 'paused') return;
  hideAllScreens();
  phase = 'running';
}

function endRun(state: 'dead' | 'won', quit: boolean): void {
  if (!run) return;
  const w = run.w;
  const t = w.runStats.time;
  const won = state === 'won' || w.wonRun; // DESCEND deaths still count as a cleared arena
  // bonus gold is granted once per run, even across multiple DESCEND endings
  const bonus = Math.floor(w.runStats.kills / 12 + (t / 60) * 3 + (won ? 40 : 0) + w.descendLevel * 15);
  const grant = Math.max(0, bonus - run.bankedBonus);
  run.bankedBonus = bonus;
  const total = w.runStats.goldEarned + Math.round(grant * w.stats.goldMult);
  addGold(total);
  recordRun(t, w.runStats.kills, w.runStats.level, won, w.descendLevel);
  // the unlock cascade: this run's depth may have earned permanent content
  const gained = grantDepthUnlocks(w.descendLevel).map((id) => unlockDef(id)?.name ?? id);
  phase = 'ended';
  audio.stopMusic();
  if (won) audio.win();
  else audio.die();
  showEnd(won, {
    time: t,
    kills: w.runStats.kills,
    level: w.runStats.level,
    gold: total,
    goldTotal: getSave().gold,
    depth: w.descendLevel || undefined,
    unlocked: gained,
    // retire-from-win offers the descent; a DESCEND death is final
  }, won && w.endState === 'won' ? { nextDepth: w.descendLevel + 1 } : undefined);
  void quit;
}

function descendRun(): void {
  if (!run || run.w.endState !== 'won') return;
  run.descend();
  hideAllScreens();
  phase = 'running';
  const b = run.w.zoneAt(run.w.px, run.w.py).biome;
  post?.setBiome(b);
  audio.descend();
  audio.startMusic(b.id);
  toast(`⚔ DESCEND ${run.w.descendLevel} — THE PIT HUNGERS. EVERY 90s, ANOTHER BONZAR.`, 3600);
}

function pickCard(c: PendingChoice): void {
  if (!run) return;
  const follow = run.resolveChoice(c);
  if (follow && follow.length > 0) {
    showLevelUp(follow, {
      level: run.w.runStats.level,
      rerollsLeft: run.rerollsLeft,
      banishesLeft: run.banishesLeft,
      lockedKey: run.w.locked ? `${run.w.locked.kind}:${run.w.locked.id}` : null,
    });
  } else if (!run.waitingChoice) {
    phase = 'running';
  }
}

// ---------- sim + render ----------

function simulate(dt: number): void {
  if (post?.tickHitstop(dt)) return; // freeze-frame: hold the world, skip the sim
  if (phase !== 'running' || !run) return;
  run.tick(dt, input);
  if (run.w.endState !== 'playing') {
    endRun(run.w.endState === 'won' ? 'won' : 'dead', false);
  }
}

/** threat level 0..3 drives the music layers */
function musicLevel(): number {
  const w = run?.w;
  if (!w || phase !== 'running') return 0;
  if (w.bossAlive) return 3;
  if (w.eCount > 40) return 2;
  if (w.eCount > 10) return 1;
  return 0;
}

function renderFrame(_alpha: number, frameDt: number): void {
  const r = renderer;
  if (!r || !app) return;

  if (run && phase !== 'menu') {
    const w = run.w;
    camera.follow(w.px, w.py, 8, frameDt);
    camera.update(frameDt);
    const viewL = camera.x - camera.viewW / 2;
    const viewT = camera.y - camera.viewH / 2;
    r.sync(run, frameDt, viewL, viewT, viewL + camera.viewW, viewT + camera.viewH);
    camera.apply(r.root, screenW, screenH);
    if (phase === 'running') updateHud(run);
  } else {
    camera.x = 1300 + Math.sin(performance.now() / 8000) * 300;
    camera.y = 1300 + Math.cos(performance.now() / 9000) * 300;
    camera.update(frameDt);
    camera.apply(r.root, screenW, screenH);
  }

  input.pollGamepad();
  updateTouchUi(input, phase === 'running');
  if (hudRoot) hudRoot.style.visibility = run && phase !== 'menu' ? 'visible' : 'hidden';
  hudPauseButton().style.visibility = phase === 'running' ? 'visible' : 'hidden';

  // adaptive music with hysteresis: a candidate level must hold ~1s before switching
  const lvl = musicLevel();
  if (lvl === musicTarget) {
    musicCandidate = lvl;
    musicCandT = 0;
  } else if (lvl === musicCandidate) {
    musicCandT += frameDt;
    if (musicCandT >= 1) musicTarget = lvl;
  } else {
    musicCandidate = lvl;
    musicCandT = 0;
  }
  audio.setMusicIntensity(musicTarget);
  post?.update(frameDt);

  if (debugEl && debugEl.style.display !== 'none') {
    const w = run?.w;
    debugEl.textContent = [
      `fps ${loopRef?.fps.toFixed(0) ?? '-'}  sim ${loopRef?.simMs.toFixed(2) ?? '-'}ms`,
      w ? `enemies ${w.eCount}  bolts ${w.bCount}  gems ${w.gCount}  ebullets ${w.vCount}` : 'menu',
      `particles ${r.particleCount}`,
    ].join('\n');
  }

  app.renderer.render(app.stage);
}

boot().catch((err) => {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;color:#f66;font-family:monospace;padding:2em;text-align:center;z-index:999;';
  el.textContent = `Failed to start: ${err instanceof Error ? err.message : String(err)}`;
  document.body.appendChild(el);
  throw err;
});
