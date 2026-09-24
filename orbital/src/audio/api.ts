// Audio API contract — owned by the integrator. src/audio/index.ts implements.
import type { World } from '../sim';

export type AudioTheme = 'practice' | 'graveyard' | 'giants' | 'course';

export type SfxName =
  | 'launch' | 'bounce' | 'hazard' | 'sink' | 'lipout' | 'settled' | 'voided'
  | 'orbit' | 'switch' | 'sequenceReset' | 'fragment' | 'pinPlace' | 'pinDeny'
  | 'wormhole' | 'uiTick' | 'uiSelect' | 'miloChirp' | 'announcer';

export interface OrbitalAudio {
  /** Call on first user gesture (browser autoplay policy). */
  unlock(): Promise<void>;

  /** Crossfade the region music bed. */
  setTheme(theme: AudioTheme): void;

  /** 0..1 tension — layers drums/dissonance as shots get dramatic. */
  setIntensity(v: number): void;

  sfx(name: SfxName, opts?: { gain?: number; pan?: number; pitch?: number }): void;

  /** Per-tick update: gravity bodies hum (pitch ~ log mass, gain ~ 1/d). */
  updateHum(w: World): void;

  setBuses(sfx: number, music: number): void;

  destroy(): void;
}

export function createAudio(): OrbitalAudio {
  throw new Error('audio not implemented');
}
