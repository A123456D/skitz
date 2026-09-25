// Game orchestration: state machine, fixed-step loop, event routing, save.
// Owns main.ts. Modules (render/ui/audio/story/levels) plug in via api files.

import {
  createWorld, startStroke, launch, placePin, undoPin, stepTick, drainEvents,
  predict, STEP_DT, MAX_LAUNCH_SPEED,
} from '../sim';
import type { LevelDef, SimEvent, StrokeEndReason, World } from '../sim';
import { createRenderer } from '../render';
import type { OrbitalRenderer } from '../render/api';
import { createAudio } from '../audio';
import type { OrbitalAudio, AudioTheme } from '../audio/api';
import { createStoryRunner } from '../story';
import type { StoryRunner } from '../story/api';
import { mountUI } from '../ui';
import type { UIHandle, LevelResult, UIHooks } from '../ui/api';
import { LEVELS } from '../levels';
import { loadSave, writeSave } from '../save/save';
import type { SaveData } from '../save/save';
import { InputController } from './input';
import { strokeName, evaluateObjectives, computeMedals, secretZones } from './scoring';

type Phase = 'boot' | 'menu' | 'aim' | 'flight' | 'strokeEndWait' | 'results' | 'paused';

const THEMES: Record<number, AudioTheme> = { 1: 'practice', 2: 'graveyard', 3: 'giants', 4: 'course' };
const MOD_GRAVITY: Record<string, number> = { HEAVY: 1.5, DRIFTWOOD: 0.6 };

function qa(): URLSearchParams {
  return new URLSearchParams(location.search);
}

export function bootGame(root: HTMLElement): void {
  root.innerHTML = '';
  const host = document.createElement('div');
  host.id = 'ob-canvas-host';
  host.style.cssText = 'position:absolute;inset:0;touch-action:none;';
  const uiRoot = document.createElement('div');
  uiRoot.id = 'ui-root';
  uiRoot.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
  const vignette = document.createElement('div');
  vignette.id = 'ob-vignette';
  const rotate = document.createElement('div');
  rotate.id = 'ob-rotate';
  rotate.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="#6fd6e8" stroke-width="1.6"><rect x="6" y="3" width="12" height="18" rx="2.5"/><circle cx="12" cy="18.4" r="1" fill="#6fd6e8" stroke="none"/></svg><p>Rotate to landscape</p>';
  const fullscreen = document.createElement('button');
  fullscreen.id = 'ob-fullscreen';
  fullscreen.setAttribute('aria-label', 'Toggle fullscreen');
  fullscreen.innerHTML =
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
  fullscreen.addEventListener('click', () => {
    const el = document.documentElement;
    if (document.fullscreenElement) {
      void document.exitFullscreen?.().catch(() => {});
    } else {
      void el.requestFullscreen?.({ navigationUI: 'hide' }).then(() =>
        // fullscreen unlocks programmatic orientation lock on Android
        (screen.orientation as { lock?: (o: string) => Promise<void> }).lock?.('landscape').catch(() => {}),
      ).catch(() => {});
    }
  });
  root.appendChild(host);
  root.appendChild(vignette);
  root.appendChild(uiRoot);
  root.appendChild(rotate);
  root.appendChild(fullscreen);

  const g = new Game(host, uiRoot);
  void g.start();
}

class Game {
  private renderer: OrbitalRenderer = createRenderer();
  private audio: OrbitalAudio = createAudio();
  private story: StoryRunner = createStoryRunner();
  private ui!: UIHandle;
  private input!: InputController;

  private save: SaveData = loadSave();
  private phase: Phase = 'boot';
  private world: World | null = null;
  private levelIdx = -1;
  private modifiers: string[] = [];
  private seed = 1;
  private acc = 0;
  private lastT = 0;
  private waitT = 0;
  private levelTime = 0;
  private hazardHappened = false;
  private secretsFound = new Set<string>();
  private unlockedAudio = false;
  private isTouch = matchMedia('(pointer: coarse)').matches;

  constructor(private host: HTMLElement, private uiRoot: HTMLElement) {
    const q = qa();
    if (q.get('seed')) this.seed = Number(q.get('seed')) || 1;
  }

  async start(): Promise<void> {
    const q = qa();
    await this.renderer.mount(this.host);
    this.renderer.setQuality(q.get('fx') === 'full' ? 'full' : q.get('fx') === 'lite' || this.isTouch ? 'lite' : 'full');

    const hooks: UIHooks = {
      onPlayLevel: (idx, mods) => this.enterLevel(idx, mods),
      onResume: () => this.resume(),
      onRestart: () => this.restartLevel(),
      onPause: () => this.pause(),
      onQuitToMenu: () => this.toMenu(),
      onNextLevel: () => {
        if (this.levelIdx + 1 < LEVELS.length) this.enterLevel(this.levelIdx + 1, this.modifiers);
        else this.toMenu();
      },
      onReplay: () => this.restartLevel(),
      onSettingsChanged: (s) => {
        this.save.settings = s;
        writeSave(this.save);
        this.audio.setBuses(s.audio, s.music);
        this.input.aimForward = s.aimForward;
      },
      onUndoPin: () => {
        if (this.world && this.phase === 'aim' && this.world.pins.length > 0) {
          undoPin(this.world);
          this.audio.sfx('uiTick');
        }
      },
    };
    this.ui = mountUI(this.uiRoot, hooks);
    this.ui.refresh(this.save, LEVELS);
    this.ui.show('title');

    this.input = new InputController(this.host, {
      onAim: (dx, dy, p) => this.updateAim(dx, dy, p),
      onAimEnd: (dx, dy, p) => this.fire(dx, dy, p),
      onAimCancel: () => {
        this.renderer.setAim(false, 0, 0, 0);
        this.renderer.setPreview(null, null);
      },
      onTap: (sx, sy) => this.tapPlacePin(sx, sy),
      onHover: (sx, sy) => this.hoverGhost(sx, sy),
      onKey: (code) => this.key(code),
    });
    this.input.aimForward = this.save.settings.aimForward;

    this.story.onLine((line) => this.ui.showSubtitle(line));
    this.audio.setBuses(this.save.settings.audio, this.save.settings.music);
    window.addEventListener('resize', () => this.renderer.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.world && !qa().get('nopause')) this.pause();
    });
    // auto-pause when a touch device is held in portrait mid-round
    const portraitQuery = matchMedia('(orientation: portrait) and (pointer: coarse)');
    portraitQuery.addEventListener?.('change', (e) => {
      if (e.matches && this.world && !qa().get('nopause')) this.pause();
    });

    this.ui.showSubtitle = this.ui.showSubtitle.bind(this.ui);
    this.unlockAudio = this.unlockAudio.bind(this);
    window.addEventListener('pointerdown', this.unlockAudio, { once: false });
    window.addEventListener('keydown', this.unlockAudio, { once: false });

    this.phase = 'menu';
    this.lastT = performance.now();
    requestAnimationFrame((t) => this.loop(t));

    const levelParam = q.get('level');
    if (levelParam !== null) {
      const idx = Number(levelParam);
      if (Number.isFinite(idx) && idx >= 0 && idx < LEVELS.length) {
        this.enterLevel(idx, (q.get('mods') ?? '').split(',').filter(Boolean));
      }
    }
  }

  private unlockAudio(): void {
    if (this.unlockedAudio) return;
    this.unlockedAudio = true;
    void this.audio.unlock();
    // strongest landscape enforcement available outside installed-PWA mode;
    // silently unsupported on iOS Safari and desktop — the rotate overlay covers those
    if (matchMedia('(pointer: coarse)').matches) {
      try {
        (screen.orientation as { lock?: (o: string) => Promise<void> }).lock?.('landscape').catch(() => {});
      } catch {
        // lock unavailable — rotate overlay remains the fallback
      }
    }
  }

  // ------------------------------------------------------------------ flow

  private enterLevel(idx: number, mods: string[]): void {
    this.levelIdx = idx;
    this.modifiers = mods;
    let def: LevelDef = structuredClone(LEVELS[idx]);
    if (mods.includes('PIN FAMINE')) def.pinBudget = Math.max(0, def.pinBudget - 1);
    if (mods.includes('ONE SHOT')) def.par = 1;
    let gravityScale = 1;
    for (const m of mods) if (MOD_GRAVITY[m]) gravityScale = MOD_GRAVITY[m];

    this.world = createWorld(def, this.seed, gravityScale);
    startStroke(this.world, true);
    this.phase = 'aim';
    this.hazardHappened = false;
    this.secretsFound.clear();
    this.levelTime = 0;
    this.renderer.setMiloMood(null);
    this.renderer.setPreview(null, null);
    this.renderer.setAim(false, 0, 0, 0);
    this.renderer.setPinGhost(null);
    this.story.loadLevel(def.story ?? []);
    this.audio.setTheme(THEMES[def.region] ?? 'practice');
    this.ui.show('playing');
    this.ui.bindWorld(this.world);
    this.ui.toast(`${def.name} — PAR ${def.par}`, 'neutral');
    this.input.enabled = true;
    if (qa().get('pred') === '0' || !this.save.settings.prediction) this.previewEnabled = false;
  }

  private previewEnabled = true;

  private restartLevel(): void {
    if (this.levelIdx < 0) return;
    this.resume();
    this.enterLevel(this.levelIdx, this.modifiers);
  }

  private pause(): void {
    if (this.phase === 'aim' || this.phase === 'flight' || this.phase === 'strokeEndWait') {
      this.phaseBeforePause = this.phase;
      this.phase = 'paused';
      this.input.cancelAll();
      this.input.enabled = false;
      this.ui.show('paused');
    }
  }

  private phaseBeforePause: Phase = 'aim';

  private resume(): void {
    if (this.phase === 'paused') {
      this.phase = this.phaseBeforePause;
      this.ui.show('playing');
      this.input.enabled = true;
    }
  }

  private toMenu(): void {
    this.world = null;
    this.phase = 'menu';
    this.input.cancelAll();
    this.input.enabled = false;
    this.ui.bindWorld(null);
    this.ui.showSubtitle(null);
    this.ui.refresh(this.save, LEVELS);
    this.ui.show('title');
    (this.audio as unknown as { stopHum?: () => void }).stopHum?.();
  }

  private key(code: string): void {
    if (this.phase === 'results') {
      if (code === 'Enter' || code === 'NumpadEnter') {
        if (this.levelIdx + 1 < LEVELS.length) this.enterLevel(this.levelIdx + 1, this.modifiers);
        else this.toMenu();
      } else if (code === 'KeyR') this.restartLevel();
      return;
    }
    if (code === 'KeyR') this.restartLevel();
    else if (code === 'KeyP' || code === 'Escape') {
      if (this.phase === 'paused') this.resume();
      else this.pause();
    } else if (code === 'KeyZ' && this.world && this.phase === 'aim') {
      undoPin(this.world);
      this.renderer.setPinGhost(null);
    }
  }

  // ------------------------------------------------------------------ input

  private updateAim(dx: number, dy: number, p: number): void {
    if (this.phase !== 'aim' || !this.world) return;
    this.renderer.setAim(true, dx, dy, p);
    const speed = MAX_LAUNCH_SPEED * p;
    if (this.previewEnabled && speed > 30) {
      const res = predict(this.world, dx * speed, dy * speed, 2.2);
      this.renderer.setPreview(res.points, res.end);
    }
  }

  private fire(dx: number, dy: number, p: number): void {
    if (this.phase !== 'aim' || !this.world) return;
    const speed = MAX_LAUNCH_SPEED * p;
    if (speed < 30) return;
    launch(this.world, dx, dy, speed);
    this.renderer.setAim(false, 0, 0, 0);
    this.renderer.setPreview(null, null);
    this.renderer.setPinGhost(null);
    this.phase = 'flight';
  }

  private tapPlacePin(sx: number, sy: number): void {
    if (this.phase !== 'aim' || !this.world) return;
    const wpt = this.renderer.screenToWorld(sx, sy);
    placePin(this.world, wpt.x, wpt.y);
  }

  private hoverGhost(sx: number, sy: number): void {
    if (this.phase !== 'aim' || !this.world || this.isTouch) return;
    const wpt = this.renderer.screenToWorld(sx, sy);
    const w = this.world;
    let valid = w.pins.length < w.def.pinBudget;
    if (valid) {
      for (const b of w.bodies) {
        if (b.radius > 0 && Math.hypot(wpt.x - b.cx, wpt.y - b.cy) < b.radius + 24) valid = false;
      }
      if (Math.hypot(wpt.x - w.holeX, wpt.y - w.holeY) < 30) valid = false;
    }
    this.renderer.setPinGhost({ x: wpt.x, y: wpt.y, valid });
  }

  // ------------------------------------------------------------------ loop

  private loop = (t: number): void => {
    requestAnimationFrame((tt) => this.loop(tt));
    const dt = Math.min(0.1, (t - this.lastT) / 1000);
    this.lastT = t;
    const w = this.world;
    if (!w) return;

    const running = this.phase === 'aim' || this.phase === 'flight' || this.phase === 'strokeEndWait';
    if (running) {
      this.levelTime += dt;
      this.input.tick(dt);
      // gravity always simulates (moving bodies, pulses, debris) — the world
      // is alive even while aiming; ball physics only matter in flight
      this.acc = Math.min(this.acc + dt, 0.25);
      let events: SimEvent[] = [];
      while (this.acc >= STEP_DT) {
        this.acc -= STEP_DT;
        stepTick(w);
        events = events.concat(drainEvents(w));
      }
      if (events.length) this.routeEvents(events, w);
      this.story.update(w, events);
      this.checkSecrets(w);
      this.updateIntensity(w);
    }
    this.renderer.syncWorld(w, dt);
    this.ui.updateHud(w, w.pins.length, evaluateObjectives(w.def, w, this.hazardHappened, this.secretsFound));

    if (this.phase === 'strokeEndWait') {
      this.waitT -= dt;
      if (this.waitT <= 0) {
        // golf rules: play it as it lies — only hazard/void sends you back to the tee
        startStroke(w, w.strokeEnded !== 'settled');
        this.phase = 'aim';
      }
    }
  };

  private updateIntensity(w: World): void {
    if (w.ball.flying) {
      const sp = Math.hypot(w.ball.vx, w.ball.vy);
      this.audio.setIntensity(Math.min(1, sp / MAX_LAUNCH_SPEED));
    } else {
      this.audio.setIntensity(0);
    }
  }

  private checkSecrets(w: World): void {
    for (const z of secretZones(w.def)) {
      if (!this.secretsFound.has(z.id)) {
        const obj = (w.def.objectives ?? []).find((o) => o.kind === 'secret' && o.id === z.id);
        if (obj && obj.kind === 'secret' && Math.hypot(w.ball.x - z.x, w.ball.y - z.y) < z.r) {
          this.secretsFound.add(z.id);
          this.ui.toast('SECRET FOUND', 'good');
          this.audio.sfx('fragment', { pitch: 1.4 });
        }
      }
    }
  }

  // ----------------------------------------------------------------- events

  private routeEvents(events: SimEvent[], w: World): void {
    this.renderer.onEvents(events);
    for (const e of events) {
      switch (e.type) {
        case 'launch':
          this.audio.sfx('launch');
          break;
        case 'bounce':
          this.audio.sfx('bounce', { gain: Math.min(1, 0.3 + e.speed / 600), pitch: 0.8 + Math.min(1, e.speed / 800) * 0.6 });
          this.renderer.screenShake(Math.min(1, e.speed / 700) * (this.save.settings.shake ? 1 : 0));
          break;
        case 'hazard':
          this.audio.sfx('hazard');
          this.hazardHappened = true;
          break;
        case 'sink':
          this.audio.sfx('sink');
          break;
        case 'lipout':
          this.audio.sfx('lipout');
          break;
        case 'orbit':
          this.audio.sfx('orbit');
          this.ui.toast('ORBIT COMPLETE', 'good');
          break;
        case 'switch':
          if (e.ok) this.audio.sfx('switch');
          else this.audio.sfx('sequenceReset');
          break;
        case 'sequenceReset':
          this.ui.toast('SEQUENCE RESET', 'bad');
          break;
        case 'fragment':
          this.audio.sfx('fragment', { pitch: 1 + e.index * 0.15 });
          break;
        case 'pinPlace':
          this.audio.sfx('pinPlace');
          break;
        case 'pinDeny':
          this.audio.sfx('pinDeny');
          break;
        case 'wormhole':
          this.audio.sfx('wormhole');
          break;
        case 'strokeEnd':
          this.onStrokeEnd(e.reason, w);
          break;
        default:
          break;
      }
    }
  }

  private onStrokeEnd(reason: StrokeEndReason, w: World): void {
    if (reason === 'sunk') {
      this.completeLevel(w);
      return;
    }
    this.phase = 'strokeEndWait';
    this.waitT = 0.45;
    const msg = reason === 'voided' ? 'LOST TO THE VOID' : reason === 'hazard' ? 'HAZARD' : 'SETTLED';
    this.ui.toast(msg, 'bad');
  }

  // ---------------------------------------------------------------- results

  private completeLevel(w: World): void {
    this.phase = 'results';
    this.input.cancelAll();
    this.input.enabled = false;
    const def = w.def;
    const objDone = evaluateObjectives(def, w, this.hazardHappened, this.secretsFound);
    const taken = w.fragments.filter((f) => f.taken).length;
    const medals = computeMedals(w.strokes, def.par, objDone, taken, w.fragments.length);

    // persist
    const id = def.id;
    const prev = this.save.medals[id] ?? { par: false, obj: false, frag: false };
    this.save.medals[id] = { par: prev.par || medals.par, obj: prev.obj || medals.obj, frag: prev.frag || medals.frag };
    const prevFrags = this.save.fragments[id] ?? [];
    this.save.fragments[id] = w.fragments.map((f, i) => (f.taken || prevFrags.includes(i) ? i : -1)).filter((i) => i >= 0);
    this.save.unlockedLevel = Math.max(this.save.unlockedLevel, Math.min(this.levelIdx + 1, LEVELS.length - 1));
    writeSave(this.save);

    if (this.modifiers.includes('TIME ATTACK')) {
      this.ui.toast(`TIME — ${this.levelTime.toFixed(1)}s`, 'good');
    }
    const prevBest = this.save.bestTimes[id];
    const isBest = this.levelTime > 1 && (prevBest === undefined || this.levelTime < prevBest);
    if (isBest) this.save.bestTimes[id] = Math.round(this.levelTime * 10) / 10;

    const result: LevelResult = {
      levelId: id,
      strokes: w.strokes,
      par: def.par,
      strokeName: strokeName(w.strokes, def.par),
      medals,
      objectives: (def.objectives ?? []).map((o, i) => ({ text: o.text, done: objDone[i] })),
      fragments: { total: w.fragments.length, taken },
      nextLevelId: this.levelIdx + 1 < LEVELS.length ? LEVELS[this.levelIdx + 1].id : null,
      modifiers: this.modifiers,
      timeSec: Math.round(this.levelTime * 10) / 10,
      bestSec: this.save.bestTimes[id] ?? prevBest,
    };
    this.ui.setResult(result);
    this.ui.show('results');
  }
}
