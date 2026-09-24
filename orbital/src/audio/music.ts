// Procedural region music beds — zero assets. A 200 ms lookahead scheduler
// books theme notes ~0.5 s ahead on the audio clock (sample-accurate, immune
// to main-thread jitter). Themes live on parallel gain buses; setTheme()
// crossfades them over ~2 s while only the active theme keeps scheduling.
import type { AudioTheme } from './api';
import { hiss, tone } from './sfx';

export interface MusicCore {
  ctx: AudioContext;
  bus: GainNode;
  noise: AudioBuffer;
}

export interface MusicEngine {
  setTheme(theme: AudioTheme): void;
  setIntensity(v: number): void;
  startScheduler(): void;
  dispose(): void;
}

const hz = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);

/** Lookahead window — must exceed the 200 ms interval with headroom. */
const HORIZON = 0.5;
const CROSSFADE = 2.0;

interface ThemeState {
  gain: GainNode;
  next: number;
  step: number;
  stepDur: number;
  level: number;
}

/** I–vi–IV–V in C major, voiced low and open — the "calm mode" bed for R1. */
const PROG: number[][] = [
  [48, 55, 60, 64], // C
  [45, 52, 57, 60], // Am
  [41, 48, 53, 57], // F
  [43, 50, 55, 59], // G
];

export function createMusic(core: MusicCore): MusicEngine {
  const { ctx, bus, noise } = core;

  function mkState(stepDur: number, level: number): ThemeState {
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(bus);
    return { gain, next: 0, step: 0, stepDur, level };
  }

  const states = new Map<AudioTheme, ThemeState>();
  states.set('practice', mkState(4.0, 0.5));
  states.set('graveyard', mkState(2.0, 0.45));
  states.set('giants', mkState(6.0, 0.55));
  states.set('course', mkState(1.0, 0.38));

  let active: AudioTheme = 'practice';
  let timer: number | null = null;

  // ----------------------------------------------------------- voice helpers

  /** Detuned saw pair → one lowpass per note = warm analog-style pad. */
  function pad(dest: AudioNode, t: number, midi: number, dur: number, peak: number): void {
    const f = hz(midi);
    const flt = ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.Q.value = 0.4;
    // Slow filter bloom (380→720→380 Hz) keeps long chords from feeling static.
    flt.frequency.setValueAtTime(380, t);
    flt.frequency.linearRampToValueAtTime(720, t + dur * 0.45);
    flt.frequency.linearRampToValueAtTime(380, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + 1.6);
    g.gain.setValueAtTime(peak, t + dur);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 2.2);
    flt.connect(g);
    g.connect(dest);
    for (const det of [-6, 6]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = det;
      o.connect(flt);
      o.start(t);
      o.stop(t + dur + 2.4);
    }
  }

  // ------------------------------------------------------- theme step fns

  /** R1 — warm slow pads, chord drift every 4 s. */
  function stepPractice(st: ThemeState, t: number): void {
    const chord = PROG[st.step % PROG.length];
    for (const m of chord) pad(st.gain, t, m, 5.2, 0.03);
    // One faint high octave adds air without a new oscillator layer per note.
    pad(st.gain, t + 0.4, chord[chord.length - 1] + 12, 4.4, 0.008);
  }

  /** R2 — metallic drone stack + sparse inharmonic pings. */
  function stepGraveyard(st: ThemeState, t: number): void {
    if (st.step % 8 === 0) {
      // 16 s drone: square fundamental + sine fifth + slightly-sharp 3rd partial.
      // The sharp partial beats against the harmonic one → slow uneasy shimmer.
      tone({ out: st.gain, sources: [] }, ctx, 'square', 55, null, t, 15, 0.028, 4.0);
      tone({ out: st.gain, sources: [] }, ctx, 'sine', 82.4, null, t, 15, 0.04, 4.0);
      tone({ out: st.gain, sources: [] }, ctx, 'sine', 165.8, null, t, 15, 0.02, 4.0);
    } else if (Math.random() < 0.16) {
      // Decaying metallic ping: inharmonic ratios (1 / 1.61 / 2.76) read as scrap
      // metal rather than pitched instruments.
      const base = [523, 659, 784, 988][Math.floor(Math.random() * 4)] * (Math.random() < 0.3 ? 1.61 : 1);
      tone({ out: st.gain, sources: [] }, ctx, 'sine', base, null, t, 2.2, 0.04, 0.003);
      tone({ out: st.gain, sources: [] }, ctx, 'sine', base * 2.76, null, t, 1.2, 0.015, 0.003);
    }
  }

  /** R3 — deep swells: sine sub + slow fifth, very long attacks = awe. */
  function stepGiants(st: ThemeState, t: number): void {
    const pattern = [[28, 35], [24, 31], [26, 33], [31, 38]]; // E / C / D / C fifths
    const [a, b] = pattern[st.step % pattern.length];
    tone({ out: st.gain, sources: [] }, ctx, 'sine', hz(a), null, t, 6, 0.11, 3.4);
    tone({ out: st.gain, sources: [] }, ctx, 'sine', hz(b), null, t, 6, 0.05, 3.4);
    // Faint airy body — barely-there lowpassed noise so the swell has "air".
    hiss({ out: st.gain, sources: [] }, { ctx, noise }, t, 5, 0.012, 'lowpass', 150, null, 0.7, 2.5);
  }

  /** R4 — tense shimmer: slow minor arps + airy noise wash. */
  function stepCourse(st: ThemeState, t: number): void {
    const roots = [57, 53, 50, 52]; // Am F Dm Em — 8 steps per chord
    const degs = [0, 3, 7, 12, 7, 3];
    const midi = roots[(st.step >> 3) % roots.length] + degs[st.step % degs.length];
    // Dry note + a quiet +0.34 s echo — cheap depth with no delay node.
    tone({ out: st.gain, sources: [] }, ctx, 'triangle', hz(midi), null, t, 0.7, 0.03, 0.01);
    tone({ out: st.gain, sources: [] }, ctx, 'triangle', hz(midi), null, t + 0.34, 0.6, 0.012, 0.01);
    if (st.step % 16 === 0) {
      hiss({ out: st.gain, sources: [] }, { ctx, noise }, t, 20, 0.016, 'bandpass', 2800, null, 0.6, 6.0);
    }
  }

  function scheduleStep(theme: AudioTheme, st: ThemeState, t: number): void {
    switch (theme) {
      case 'practice': stepPractice(st, t); break;
      case 'graveyard': stepGraveyard(st, t); break;
      case 'giants': stepGiants(st, t); break;
      case 'course': stepCourse(st, t); break;
    }
  }

  // ------------------------------------------------------- intensity layer

  // Always-running but gain-gated: a pulsing sub + filtered noise that setIntensity
  // fades in. Node-gain automation (no scheduling) keeps it responsive per-frame.
  const pulseOsc = ctx.createOscillator();
  pulseOsc.type = 'sine';
  pulseOsc.frequency.value = 48;
  const pulseAM = ctx.createGain();
  pulseAM.gain.value = 0;
  pulseOsc.connect(pulseAM);
  pulseAM.connect(bus);
  pulseOsc.start();

  const lfo = ctx.createOscillator();
  lfo.frequency.value = 1.9;
  const lfoAmt = ctx.createGain();
  lfoAmt.gain.value = 0;
  lfo.connect(lfoAmt);
  lfoAmt.connect(pulseAM.gain); // AM: sub throb depth scales with intensity
  lfo.start();

  const wash = ctx.createBufferSource();
  wash.buffer = noise;
  wash.loop = true;
  const washFlt = ctx.createBiquadFilter();
  washFlt.type = 'lowpass';
  washFlt.frequency.value = 700;
  const washGain = ctx.createGain();
  washGain.gain.value = 0;
  wash.connect(washFlt);
  washFlt.connect(washGain);
  washGain.connect(bus);
  wash.start();

  // -------------------------------------------------------------- engine

  return {
    setTheme(theme: AudioTheme): void {
      active = theme;
      const now = ctx.currentTime;
      states.forEach((st, name) => {
        const g = st.gain.gain;
        g.cancelScheduledValues(now);
        g.setValueAtTime(g.value, now);
        g.linearRampToValueAtTime(name === theme ? st.level : 0, now + CROSSFADE);
      });
      const st = states.get(theme);
      if (st && st.next < now) st.next = now + 0.05; // resync after silence
    },

    setIntensity(v: number): void {
      const k = Math.min(1, Math.max(0, v));
      const now = ctx.currentTime;
      pulseAM.gain.setTargetAtTime(0.3 * k, now, 0.5);
      lfoAmt.gain.setTargetAtTime(0.26 * k, now, 0.5);
      washGain.gain.setTargetAtTime(0.02 * k, now, 0.6);
    },

    startScheduler(): void {
      if (timer !== null) return;
      const now = ctx.currentTime;
      states.forEach((st) => { if (st.next < now) st.next = now + 0.1; });
      timer = window.setInterval(() => {
        const t0 = ctx.currentTime;
        const st = states.get(active);
        if (!st) return;
        if (st.next < t0 - 0.1) st.next = t0 + 0.05; // catch up after tab suspension
        let guard = 0;
        while (st.next < t0 + HORIZON && guard++ < 16) {
          scheduleStep(active, st, st.next);
          st.next += st.stepDur;
          st.step++;
        }
      }, 200);
    },

    dispose(): void {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
      try {
        pulseOsc.stop();
        lfo.stop();
        wash.stop();
      } catch {
        // already stopped — nothing to do
      }
      states.forEach((st) => st.gain.disconnect());
      pulseAM.disconnect();
      washGain.disconnect();
    },
  };
}
