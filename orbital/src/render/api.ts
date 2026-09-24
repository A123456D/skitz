// Renderer API contract — owned by the integrator. src/render/index.ts must
// implement createRenderer() against exactly this interface.
import type { PredPoint, SimEvent, World } from '../sim';

export type MiloMood = 'idle' | 'aim' | 'panic' | 'impact' | 'joy' | 'dizzy' | 'curious';

export interface PinGhost {
  x: number;
  y: number;
  valid: boolean;
}

export interface OrbitalRenderer {
  /** Init Pixi v8 app into the host element (WebGPU→WebGL fallback). */
  mount(host: HTMLElement): Promise<void>;

  /** Called every frame with the current sim state; also renders. */
  syncWorld(w: World, frameDt: number): void;

  /** VFX triggers drained from the sim. */
  onEvents(events: SimEvent[]): void;

  /** Trajectory preview points (null hides). `end` = prediction terminator. */
  setPreview(preview: PredPoint[] | null, end: string | null): void;

  /** Aim arrow while dragging (power01 0..1). */
  setAim(active: boolean, dirX: number, dirY: number, power01: number): void;

  /** Ghost pin under the cursor during pin placement. */
  setPinGhost(pin: PinGhost | null): void;

  /** CSS-pixel screen coordinate → world coordinate (stable, shake-free). */
  screenToWorld(sx: number, sy: number): { x: number; y: number };

  /** Override Milo's expression (story moments); null = derive from sim. */
  setMiloMood(mood: MiloMood | null): void;

  screenShake(mag: number): void;

  /** 'lite' halves particle budgets and disables heavy filters (mobile). */
  setQuality(tier: 'full' | 'lite'): void;

  resize(): void;
  destroy(): void;
}

export function createRenderer(): OrbitalRenderer {
  throw new Error('renderer not implemented');
}
