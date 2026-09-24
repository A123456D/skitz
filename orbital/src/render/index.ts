// index.ts — createRenderer(): Pixi v8 app lifecycle, layer orchestration,
// sim event -> VFX routing, and the camera loop. All per-frame work happens in
// Pixi (GPU-first); nothing in the DOM except the canvas itself.

import { Application, Container, Sprite } from 'pixi.js';
import type { PinGhost, MiloMood, OrbitalRenderer } from './api';
import type { PredPoint } from '../sim';
import type { SimEvent, World } from '../sim/types';
import { Camera } from './camera';
import { TexFactory } from './textures';
import { BackgroundLayer, beginBackgroundFrame, regionSun, reportVoids } from './layers/background';
import { BodiesLayer } from './layers/bodies';
import { ZonesLayer } from './layers/zones';
import { ObjectsLayer } from './layers/objects';
import { MiloLayer } from './layers/milo';
import { VfxLayer } from './layers/vfx';
import { PreviewLayer } from './layers/preview';

const MAX_DT = 0.05; // clamp long frames so eased motion never explodes

class OrbitalRendererImpl implements OrbitalRenderer {
  private app = new Application();
  private host: HTMLElement | null = null;
  private mounted = false;
  private ro: ResizeObserver | null = null;

  private cam = new Camera();
  private tex = new TexFactory();
  private vignette = new Sprite();

  private worldRoot = new Container();
  private bg: BackgroundLayer;
  private bodies: BodiesLayer;
  private zones: ZonesLayer;
  private objects: ObjectsLayer;
  private milo: MiloLayer;
  private vfx: VfxLayer;
  private preview: PreviewLayer;

  private lastWorld: World | null = null;
  private switchIdx = new Map<string, number>();
  private quality: 'full' | 'lite' = 'full';
  private voidScratch: number[] = [];
  private voidCount = 0;

  constructor() {
    this.bg = new BackgroundLayer(this.tex);
    this.bodies = new BodiesLayer(this.tex);
    this.zones = new ZonesLayer(this.tex);
    this.objects = new ObjectsLayer(this.tex);
    this.milo = new MiloLayer(this.tex);
    this.vfx = new VfxLayer(this.tex);
    this.preview = new PreviewLayer(this.tex);

    // world-space layers, back to front: zone weather under bodies, gameplay
    // hardware over bodies, Milo & FX on top, preview read-out above all
    this.worldRoot.addChild(
      this.zones.container,
      this.bodies.container,
      this.objects.container,
      this.milo.container,
      this.vfx.container,
      this.preview.container,
    );
    this.vignette.anchor.set(0, 0);
  }

  async mount(host: HTMLElement): Promise<void> {
    this.host = host;
    await this.app.init({
      // WebGPU preferred with automatic WebGL fallback (v8 renderer preference)
      preference: 'webgpu',
      antialias: true,
      background: '#04060c',
      resolution: Math.min(window.devicePixelRatio || 1, 2), // DPR cap: 2 (contract)
      autoDensity: true,
      resizeTo: host,
      powerPreference: 'high-performance',
    });
    host.appendChild(this.app.canvas);
    this.app.canvas.style.display = 'block';

    this.app.stage.addChild(this.bg.container, this.worldRoot, this.vignette);
    this.vignette.texture = this.tex.vignette();

    // We own the render tick: syncWorld() updates then renders exactly once,
    // so transforms never lag a frame behind sim state.
    this.app.ticker.stop();

    this.mounted = true; // resize() gates on this
    this.resize();
    // Track the host element (covers window resizes and layout changes).
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(host);
    }
    this.app.renderer.render(this.app.stage);
  }

  syncWorld(w: World, frameDt: number): void {
    if (!this.mounted) return;
    const dt = Math.min(frameDt, MAX_DT);

    if (w !== this.lastWorld) this.rebuild(w);

    // --- camera
    this.cam.update(dt, w.ball, w.ball.flying);

    // --- void reporting (dust freeze), zero-alloc via scratch
    this.voidCount = 0;
    for (const z of w.zones) {
      if (z.kind === 'void' && z.active && z.x !== undefined && z.y !== undefined && z.radius !== undefined) {
        const i = this.voidCount * 3;
        this.voidScratch[i] = z.x;
        this.voidScratch[i + 1] = z.y;
        this.voidScratch[i + 2] = z.radius;
        this.voidCount++;
      }
    }
    reportVoids(this.voidScratch, this.voidCount);

    // --- layers
    beginBackgroundFrame(this.cam);
    this.bg.update(dt, this.cam);
    this.bodies.update(w, dt);
    this.zones.update(w, dt);
    this.objects.update(w, dt);
    this.milo.markAim(this.aimActive);
    this.milo.update(w, dt);
    this.vfx.update(dt);
    this.preview.update(dt, w.ball.x, w.ball.y, this.cam.scale);

    // --- draw
    this.cam.applyToRoot(this.worldRoot);
    this.vignette.width = this.cam.viewW;
    this.vignette.height = this.cam.viewH;
    this.app.renderer.render(this.app.stage);
  }

  onEvents(events: SimEvent[]): void {
    if (!this.mounted || events.length === 0) return;
    const w = this.lastWorld;
    for (const e of events) {
      switch (e.type) {
        case 'launch':
          this.vfx.launchBurst(e.x, e.y, e.vx, e.vy);
          break;
        case 'bounce': {
          const n = approxNormal(w, e.x, e.y);
          this.vfx.impactDust(e.x, e.y, n.x, n.y, e.speed);
          this.objects.bumperHit(e.x, e.y);
          break;
        }
        case 'hazard':
          this.vfx.hazardShatter(e.x, e.y);
          this.cam.shake(9);
          break;
        case 'sink':
          this.vfx.sinkCelebration(e.x, e.y);
          this.cam.shake(4); // warm thoom, not a jump scare
          break;
        case 'lipout':
          this.vfx.lipout(e.x, e.y);
          break;
        case 'settled':
          this.vfx.settledPuff(e.x, e.y);
          break;
        case 'voided':
          this.vfx.voidedDrift(e.x, e.y);
          break;
        case 'orbit': {
          const b = w?.bodies.find((o) => o.id === e.bodyId);
          if (b) this.vfx.orbitFlash(b.cx, b.cy);
          break;
        }
        case 'switch': {
          if (e.ok) {
            const si = this.switchIdx.get(e.switchId);
            if (si !== undefined) this.objects.fireSwitchPulse(si);
          }
          break;
        }
        case 'fragment':
          this.vfx.fragmentPickup(e.x, e.y);
          break;
        case 'pinPlace':
          this.vfx.pinBloom(e.x, e.y);
          this.objects.pinPlacedBloom();
          break;
        case 'pinDeny':
          this.vfx.pinDeny(e.x, e.y);
          break;
        case 'wormhole':
          this.vfx.wormholeFlash(e.x, e.y);
          this.cam.shake(2);
          break;
        case 'sequenceReset':
        case 'strokeEnd':
          // audio/UI owns these; nothing to draw (avoids double feedback)
          break;
      }
    }
    // transient moods (impact squash, joy) are event-driven in the rig
    if (w) {
      for (const e of events) this.milo.onEvent(e, w);
    }
  }

  setPreview(preview: PredPoint[] | null, end: string | null): void {
    this.preview.setPreview(preview, end);
  }

  setAim(active: boolean, dirX: number, dirY: number, power01: number): void {
    this.aimActive = active;
    this.cam.setAimState(active, dirX, dirY); // aim-time zoom on the ball
    this.preview.setAim(active, dirX, dirY, power01);
    this.milo.setAimState(active, dirX, dirY, power01);
  }
  private aimActive = false;

  setPinGhost(pin: PinGhost | null): void {
    this.objects.setPinGhost(pin);
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    // Host CSS px == camera view space (autoDensity canvas); shake-free inverse.
    const out = this.s2wScratch;
    this.cam.screenToWorld(sx, sy, out);
    return out;
  }
  private s2wScratch = { x: 0, y: 0 };

  setMiloMood(mood: MiloMood | null): void {
    this.milo.setMiloMood(mood);
  }

  screenShake(mag: number): void {
    this.cam.shake(mag);
  }

  setQuality(tier: 'full' | 'lite'): void {
    if (this.quality === tier) return;
    this.quality = tier;
    this.bg.setQuality(tier);
    this.bodies.setQuality(tier); // drift budgets re-apply on next level build
    this.vfx.setQuality(tier);
  }

  resize(): void {
    if (!this.host || !this.mounted) return;
    const vw = Math.max(1, this.host.clientWidth);
    const vh = Math.max(1, this.host.clientHeight);
    this.app.renderer.resize(vw, vh);
    this.cam.setView(vw, vh);
    this.bg.resize(vw, vh);
    // refit keeps the current center (no jarring snap mid-flight)
    if (this.lastWorld) this.cam.refit(this.lastWorld.def.bounds);
  }

  destroy(): void {
    this.ro?.disconnect();
    this.ro = null;
    this.app.destroy({ removeView: true }, { children: true });
    this.tex.clear();
    this.mounted = false;
    this.lastWorld = null;
  }

  // ------------------------------------------------------------- rebuild

  private rebuild(w: World): void {
    this.lastWorld = w;
    const b = w.def.bounds;
    const sun = regionSun(w.def.region, b);

    this.switchIdx.clear();
    w.switches.forEach((s, i) => this.switchIdx.set(s.def.id, i));

    this.cam.frame(b, true);
    this.bg.build(w.def.region, b);
    this.bg.resize(this.cam.viewW, this.cam.viewH);
    this.bodies.build(w, sun.x, sun.y);
    this.zones.build(w);
    this.objects.build(w);
    this.milo.reset(w.def.tee.x, w.def.tee.y);
    this.vfx.clear();
    this.preview.setPreview(null, null);
    this.preview.setAim(false, 1, 0, 0);
    this.objects.setPinGhost(null);
    this.aimActive = false;
  }
}

/** Impact normal approximation: away from the nearest body's surface. */
function approxNormal(w: World | null, x: number, y: number): { x: number; y: number } {
  if (!w) return { x: 0, y: -1 };
  let best = 1e9;
  let nx = 0;
  let ny = -1;
  for (const b of w.bodies) {
    if (b.radius <= 0) continue;
    const d = Math.hypot(x - b.cx, y - b.cy);
    const gap = Math.abs(d - b.radius);
    if (gap < best) {
      best = gap;
      nx = (x - b.cx) / (d || 1);
      ny = (y - b.cy) / (d || 1);
    }
  }
  return { x: nx, y: ny };
}

export function createRenderer(): OrbitalRenderer {
  return new OrbitalRendererImpl();
}
