// Audio factory — graph: [sfx|music|hum] buses → master → compressor → out.
// The AudioContext is created lazily inside unlock() (autoplay policy); every
// other method is a safe no-op until then and re-resumes a suspended context.
import type { OrbitalAudio, SfxName } from './api';
import type { World } from '../sim';
import { buildSfx, SFX_DURATION, type SfxOpts, type SfxVoice } from './sfx';
import { createMusic, type MusicEngine } from './music';
import { createHum, type HumEngine } from './hum';

/** Voice budget per design §10 (~24). Unprotected requests are dropped at the cap. */
const MAX_VOICES = 24;
/** UI feedback + the sink payoff are never dropped (design brief). */
const PROTECTED: ReadonlySet<SfxName> = new Set<SfxName>(['uiTick', 'uiSelect', 'sink']);

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Returned handle = the contract plus one extra: stopHum() for level teardown. */
interface OrbitalAudioEx extends OrbitalAudio {
  stopHum(): void;
}

interface Graph {
  ctx: AudioContext;
  master: GainNode;
  sfxBus: GainNode;
  musicBus: GainNode;
  noise: AudioBuffer;
}

function makeNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * 2);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

export function createAudio(): OrbitalAudio {
  let g: Graph | null = null;
  let music: MusicEngine | null = null;
  let hum: HumEngine | null = null;
  const voices = new Set<SfxVoice>();
  const timers = new Map<SfxVoice, number>();
  let busLevels = { sfx: 0.8, music: 0.7 };

  function build(): void {
    const ctx = new AudioContext();
    // Compressor before the destination catches synth peaks; conservative voice
    // gains do the bulk of the gain-staging, this just rounds off transients.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 12;
    comp.ratio.value = 6;
    comp.attack.value = 0.004;
    comp.release.value = 0.18;
    const master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(comp);
    comp.connect(ctx.destination);

    const sfxBus = ctx.createGain();
    const musicBus = ctx.createGain();
    // Phone-speaker tuning: a gentle highpass (~90 Hz, Butterworth) on the
    // music bus. Tiny drivers cannot reproduce sub bass — below ~90 Hz the
    // beds' low pads and the intensity sub only turn to mud; on real speakers
    // the shelf sits below the fundamentals and is inaudible.
    const musicHp = ctx.createBiquadFilter();
    musicHp.type = 'highpass';
    musicHp.frequency.value = 90;
    musicHp.Q.value = 0.7;
    sfxBus.connect(master);
    musicBus.connect(musicHp);
    musicHp.connect(master);
    sfxBus.gain.value = busLevels.sfx * busLevels.sfx; // v² ≈ perceptual loudness
    musicBus.gain.value = busLevels.music * busLevels.music;

    g = { ctx, master, sfxBus, musicBus, noise: makeNoiseBuffer(ctx) };
    music = createMusic({ ctx, bus: musicBus, noise: g.noise });
    hum = createHum({ ctx, bus: sfxBus });
    music.startScheduler();
  }

  /** Free a voice immediately (cap steal / destroy). */
  function killVoice(v: SfxVoice): void {
    const t = timers.get(v);
    if (t !== undefined) {
      clearTimeout(t);
      timers.delete(v);
    }
    voices.delete(v);
    try {
      const now = g ? g.ctx.currentTime : 0;
      v.out.gain.cancelScheduledValues(now);
      v.out.gain.setValueAtTime(v.out.gain.value, now);
      v.out.gain.linearRampToValueAtTime(0, now + 0.03);
      for (const s of v.sources) s.stop();
    } catch {
      // node already finished
    }
  }

  function unlock(): Promise<void> {
    if (!g) build();
    const ctx = g!.ctx;
    return ctx.state === 'suspended' ? ctx.resume() : Promise.resolve();
  }

  /** Cheap in-call resume for methods invoked without a recent gesture. */
  function wake(): void {
    // Not just 'suspended': iOS reports 'interrupted' (phone call, route
    // change) — anything short of running is worth a resume attempt.
    if (g && g.ctx.state !== 'running') void g.ctx.resume().catch(() => undefined);
  }

  // --- unlock reliability ----------------------------------------------------
  // iOS suspends the context aggressively (backgrounding, route changes), and
  // the integrator's first-gesture unlock only ever runs once. These listeners
  // re-resume idempotently: resume() on a running context is a no-op, and with
  // no graph built yet there is nothing to wake — creation stays owned by
  // unlock(). Removed in destroy() so a rebuilt engine never double-binds.
  const onVisible = (): void => {
    if (!document.hidden) wake();
  };
  const onPointer = (): void => wake();
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('pointerdown', onPointer, { passive: true });

  const api: OrbitalAudioEx = {
    unlock,

    setTheme(theme): void {
      if (!g) return;
      wake();
      music?.setTheme(theme);
    },

    setIntensity(v): void {
      music?.setIntensity(clamp01(v));
    },

    sfx(name: SfxName, opts: SfxOpts = {}): void {
      if (!g) return;
      wake();
      // Voice cap with priority drop: unprotected sounds vanish first; a
      // protected sound (UI + sink) steals the oldest unprotected voice.
      if (voices.size >= MAX_VOICES) {
        if (!PROTECTED.has(name)) return;
        let victim: SfxVoice | null = null;
        for (const v of voices) {
          if (!v.keep) {
            victim = v;
            break; // Set iteration = insertion order = oldest first
          }
        }
        if (victim) killVoice(victim);
        else return; // everything live is protected — drop anyway
      }
      const { ctx, sfxBus } = g;
      const out = ctx.createGain();
      const pan = Math.max(-1, Math.min(1, opts.pan ?? 0));
      if (pan !== 0) {
        const panner = ctx.createStereoPanner();
        panner.pan.value = pan;
        out.connect(panner);
        panner.connect(sfxBus);
      } else {
        out.connect(sfxBus);
      }
      const v: SfxVoice = { out, sources: [], keep: PROTECTED.has(name) };
      buildSfx(name, { ctx, noise: g.noise }, v, ctx.currentTime + 0.01, opts);
      voices.add(v);
      const dur = (SFX_DURATION[name] + 0.4) * 1000;
      timers.set(v, window.setTimeout(() => {
        timers.delete(v);
        voices.delete(v);
      }, dur));
    },

    updateHum(w: World): void {
      if (!g || !hum) return;
      wake();
      hum.update(w);
    },

    setBuses(sfx: number, musicLv: number): void {
      busLevels = { sfx: clamp01(sfx), music: clamp01(musicLv) };
      if (!g) return;
      const now = g.ctx.currentTime;
      // v² curve: 0 is fully silent, 1 is unity, and the mid-range feels linear.
      g.sfxBus.gain.setTargetAtTime(busLevels.sfx * busLevels.sfx, now, 0.05);
      g.musicBus.gain.setTargetAtTime(busLevels.music * busLevels.music, now, 0.05);
    },

    stopHum(): void {
      hum?.stop();
    },

    destroy(): void {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pointerdown', onPointer);
      for (const v of [...voices]) killVoice(v);
      timers.clear();
      music?.dispose();
      music = null;
      hum?.dispose();
      hum = null;
      if (g) {
        void g.ctx.close().catch(() => undefined);
        g = null;
      }
    },
  };

  return api;
}
