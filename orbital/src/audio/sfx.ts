// SFX synth recipes — zero assets, small pure functions over a shared voice.
// Every recipe connects into `v.out` (a per-voice gain routed to the sfx bus by
// the factory), schedules its own start/stop, and pushes sources into
// `v.sources` so the voice-cap enforcer can hard-stop stolen voices.
import type { SfxName } from './api';

export interface SfxVoice {
  /** Per-voice gain node → (panner) → sfx bus. */
  out: GainNode;
  /** Scheduled sources, killed if the voice is stolen under the cap. */
  sources: AudioScheduledSourceNode[];
  /** True for voices that must never be dropped (UI + sink). */
  keep?: boolean;
}

export interface SfxCore {
  ctx: AudioContext;
  /** 2s white-noise buffer, shared by every noise-based recipe. */
  noise: AudioBuffer;
}

export interface SfxOpts {
  gain?: number;
  pan?: number;
  pitch?: number;
}

// ------------------------------------------------------------------ helpers

const MIN_VOL = 0.0001;

/**
 * Oscillator blip with optional exponential freq glide and a
 * fast-attack / exponential-decay envelope. `f1 === null` holds the pitch.
 * Exponential ramps are used for both pitch and decay because loudness and
 * pitch perception are logarithmic — linear decays sound like fade-outs.
 */
export function tone(
  v: SfxVoice, ctx: AudioContext, type: OscillatorType,
  f0: number, f1: number | null, t: number, dur: number, peak: number, attack = 0.004,
): void {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(Math.max(1, f0), t);
  if (f1 !== null) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(MIN_VOL, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(MIN_VOL, t + dur);
  o.connect(g);
  g.connect(v.out);
  o.start(t);
  o.stop(t + dur + 0.05);
  v.sources.push(o);
}

/** Filtered noise burst (band sweep = whooshes/sweeps, static = clicks/puffs). */
export function hiss(
  v: SfxVoice, core: SfxCore, t: number, dur: number, peak: number,
  ftype: BiquadFilterType, f0: number, f1: number | null, q = 0.8, attack = 0.004,
): void {
  const src = core.ctx.createBufferSource();
  src.buffer = core.noise;
  src.loop = true;
  const flt = core.ctx.createBiquadFilter();
  flt.type = ftype;
  flt.Q.value = q;
  flt.frequency.setValueAtTime(Math.max(20, f0), t);
  if (f1 !== null) flt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = core.ctx.createGain();
  g.gain.setValueAtTime(MIN_VOL, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(MIN_VOL, t + dur);
  src.connect(flt);
  flt.connect(g);
  g.connect(v.out);
  src.start(t);
  src.stop(t + dur + 0.05);
  v.sources.push(src);
}

// ------------------------------------------------------------------ recipes

function sLaunch(v: SfxVoice, c: SfxCore, t: number, k: number): void {
  // Filtered noise sweep up — compressed-air launch, energy rising with the shot.
  hiss(v, c, t, 0.42, 0.34 * k, 'bandpass', 260, 2600, 1.1);
  tone(v, c.ctx, 'sine', 110, 300, t, 0.4, 0.07 * k);
}

function sBounce(v: SfxVoice, c: SfxCore, t: number, k: number, p: number): void {
  // Short sine thunk — pitch + gain scale with impact speed (caller maps speed→pitch).
  const sp = Math.min(2, Math.max(0.2, p));
  // ±4 cents of random detune keeps rapid impacts from machine-gunning into one
  // tone. 2^(cents/1200) is the exact cent conversion; Math.random is fine here
  // because it only feeds scheduled audio parameters, never render state.
  const d = Math.pow(2, (Math.random() * 8 - 4) / 1200);
  tone(v, c.ctx, 'sine', 150 * sp * d, 70 * d, t, 0.13, 0.34 * k * Math.min(1, sp));
  hiss(v, c, t, 0.05, 0.1 * k * Math.min(1, sp), 'lowpass', 900, 300);
}

function sHazard(v: SfxVoice, c: SfxCore, t: number, k: number): void {
  // Harsh descending zap — two detuned saws beat against each other = bite.
  tone(v, c.ctx, 'sawtooth', 640, 80, t, 0.34, 0.22 * k);
  tone(v, c.ctx, 'sawtooth', 647, 82, t, 0.34, 0.11 * k);
  hiss(v, c, t, 0.15, 0.1 * k, 'highpass', 1800, null, 0.7);
}

function sSink(v: SfxVoice, c: SfxCore, t: number, k: number): void {
  // THE payoff, staged: (1) thoom — the cup swallows the ball, sub body decays
  // under it; (2) rising C-major fanfare with a top-octave sparkle; then a soft
  // cymbal-ish noise tail for air. Arp gains stay modest so the master
  // compressor doesn't pump when the chord lands on the thoom's tail.
  tone(v, c.ctx, 'sine', 84, 36, t, 0.75, 0.5 * k);
  tone(v, c.ctx, 'sine', 42, 30, t, 0.9, 0.22 * k); // octave-down body
  hiss(v, c, t, 0.5, 0.16 * k, 'lowpass', 240, 90, 0.7, 0.03);
  const arp = [523.25, 659.26, 783.99, 1046.5]; // C5 E5 G5 C6
  for (let i = 0; i < arp.length; i++) {
    tone(v, c.ctx, 'triangle', arp[i], null, t + 0.3 + i * 0.12, 0.55, (i === 3 ? 0.1 : 0.13) * k, 0.006);
  }
  // Cymbal tail: bright noise that swells slowly and darkens as it decays
  // (highpass sweeps down) — brushed shimmer, not a static burst. Pure fade-in
  // attack ramp means it can never click.
  hiss(v, c, t + 0.3, 1.7, 0.055 * k, 'highpass', 5200, 2600, 0.7, 0.35);
}

function sLipout(v: SfxVoice, c: SfxCore, t: number, k: number): void {
  // Dull double knock — the ball rejects the cup.
  tone(v, c.ctx, 'sine', 165, 120, t, 0.1, 0.3 * k);
  tone(v, c.ctx, 'sine', 150, 110, t + 0.13, 0.1, 0.26 * k);
  hiss(v, c, t, 0.04, 0.08 * k, 'lowpass', 500, null);
}

function sSettled(v: SfxVoice, c: SfxCore, t: number, k: number): void {
  // Soft puff — the ball coming to rest.
  hiss(v, c, t, 0.32, 0.16 * k, 'lowpass', 420, 160, 0.7, 0.06);
  tone(v, c.ctx, 'sine', 220, 180, t, 0.15, 0.04 * k);
}

function sVoided(v: SfxVoice, c: SfxCore, t: number, k: number): void {
  // Downward fade whoosh — drifting into the void.
  hiss(v, c, t, 0.95, 0.22 * k, 'bandpass', 950, 110, 1.0, 0.04);
  tone(v, c.ctx, 'sine', 320, 70, t, 0.9, 0.1 * k);
}

function sOrbit(v: SfxVoice, c: SfxCore, t: number, k: number): void {
  // Bell 'ding' + shimmer. The 2.76× partial is deliberately inharmonic — that
  // ratio is what makes a struck bell read as metal rather than as a note.
  tone(v, c.ctx, 'sine', 1318, null, t, 1.15, 0.2 * k, 0.003);
  tone(v, c.ctx, 'sine', 1318 * 2.76, null, t, 0.5, 0.05 * k, 0.003);
  const spark = [2637, 3136, 3520];
  for (let i = 0; i < 3; i++) {
    tone(v, c.ctx, 'sine', spark[i], null, t + 0.07 + i * 0.06, 0.3, 0.035 * k, 0.003);
  }
}

function sSwitch(v: SfxVoice, c: SfxCore, t: number, k: number): void {
  // Relay click + power-up hum (machines waking).
  tone(v, c.ctx, 'square', 1500, null, t, 0.025, 0.16 * k);
  hiss(v, c, t, 0.02, 0.1 * k, 'highpass', 3200, null);
  tone(v, c.ctx, 'triangle', 60, 150, t + 0.03, 0.42, 0.16 * k, 0.01);
  tone(v, c.ctx, 'triangle', 60.6, 151.5, t + 0.03, 0.42, 0.07 * k, 0.01); // slow beat = thickness
}

function sSequenceReset(v: SfxVoice, c: SfxCore, t: number, k: number): void {
  // Descending buzz — "wrong order", the machine resets.
  tone(v, c.ctx, 'square', 200, 96, t, 0.42, 0.16 * k);
  tone(v, c.ctx, 'square', 203, 98, t, 0.42, 0.1 * k);
  hiss(v, c, t, 0.3, 0.06 * k, 'lowpass', 600, 200);
}

function sFragment(v: SfxVoice, c: SfxCore, t: number, k: number, p: number): void {
  // Glassy pluck, pitch rises per index (caller passes pitch = 1 + idx * step).
  const f = 880 * Math.max(0.5, p);
  tone(v, c.ctx, 'triangle', f, null, t, 0.55, 0.16 * k, 0.002);
  tone(v, c.ctx, 'sine', f * 2.001, null, t, 0.4, 0.06 * k, 0.002); // glassy partials
  tone(v, c.ctx, 'sine', f * 2.99, null, t, 0.3, 0.03 * k, 0.002);
}

function sPinPlace(v: SfxVoice, c: SfxCore, t: number, k: number): void {
  // Bright crystal chord stab (pins are amber crystal shards).
  const chord = [1046.5, 1318.5, 1568];
  for (let i = 0; i < 3; i++) {
    tone(v, c.ctx, 'sine', chord[i], null, t + i * 0.018, 0.5, 0.1 * k, 0.003);
  }
  hiss(v, c, t, 0.08, 0.05 * k, 'highpass', 6500, null);
}

function sPinDeny(v: SfxVoice, c: SfxCore, t: number, k: number): void {
  // Dull thud — placement rejected.
  tone(v, c.ctx, 'sine', 92, 58, t, 0.16, 0.3 * k);
  hiss(v, c, t, 0.09, 0.12 * k, 'lowpass', 260, null);
}

function sWormhole(v: SfxVoice, c: SfxCore, t: number, k: number): void {
  // Pitch swoop — sucked in and spat out.
  tone(v, c.ctx, 'sine', 240, 1500, t, 0.26, 0.16 * k);
  tone(v, c.ctx, 'sine', 1500, 480, t + 0.26, 0.26, 0.12 * k);
  hiss(v, c, t, 0.5, 0.08 * k, 'bandpass', 1800, 3600, 1.2);
}

function sUiTick(v: SfxVoice, c: SfxCore, t: number, k: number): void {
  // Softer + slightly lower than before: ticks fire on every slider move, and
  // at 1900 Hz/0.09 they stacked into a harsh fizz while dragging on touch.
  tone(v, c.ctx, 'sine', 1650, null, t, 0.03, 0.05 * k, 0.002);
}

function sUiSelect(v: SfxVoice, c: SfxCore, t: number, k: number): void {
  // Tee 'tak' — a click plus a short woody body.
  hiss(v, c, t, 0.02, 0.14 * k, 'highpass', 2400, null);
  tone(v, c.ctx, 'sine', 340, 290, t, 0.07, 0.18 * k, 0.002);
}

function sMiloChirp(v: SfxVoice, c: SfxCore, t: number, k: number): void {
  // Two-tone formant blip, rising = curious. Triangle body + quiet high sine
  // stands in for a formant peak without a full filter bank.
  tone(v, c.ctx, 'triangle', 640, null, t, 0.06, 0.12 * k, 0.004);
  tone(v, c.ctx, 'triangle', 960, null, t + 0.07, 0.09, 0.12 * k, 0.004);
  tone(v, c.ctx, 'sine', 1280, null, t, 0.05, 0.03 * k, 0.004);
  tone(v, c.ctx, 'sine', 1920, null, t + 0.07, 0.05, 0.03 * k, 0.004);
}

function sAnnouncer(v: SfxVoice, c: SfxCore, t: number, k: number): void {
  // Tinny PA sweep + garbled tone — two near-unison squares beat (garble),
  // a narrow high bandpass gives the torn-speaker color.
  hiss(v, c, t, 0.55, 0.05 * k, 'bandpass', 1750, 1900, 6, 0.05);
  tone(v, c.ctx, 'square', 224, 217, t, 0.55, 0.05 * k, 0.03);
  tone(v, c.ctx, 'square', 229, 221, t, 0.55, 0.04 * k, 0.03);
  tone(v, c.ctx, 'square', 1120, 1080, t + 0.05, 0.3, 0.02 * k, 0.03);
}

/** Scheduled envelope lifetime per sfx (seconds) — used for cap bookkeeping. */
export const SFX_DURATION: Record<SfxName, number> = {
  launch: 0.5,
  bounce: 0.2,
  hazard: 0.4,
  sink: 2.1, // now spans the cymbal tail (0.3 + 1.7 s) for cap bookkeeping
  lipout: 0.3,
  settled: 0.4,
  voided: 1.05,
  orbit: 1.3,
  switch: 0.5,
  sequenceReset: 0.5,
  fragment: 0.65,
  pinPlace: 0.6,
  pinDeny: 0.25,
  wormhole: 0.6,
  uiTick: 0.1,
  uiSelect: 0.15,
  miloChirp: 0.2,
  announcer: 0.65,
};

const BUILDERS: Record<SfxName, (v: SfxVoice, c: SfxCore, t: number, k: number, p: number) => void> = {
  launch: (v, c, t, k) => sLaunch(v, c, t, k),
  bounce: (v, c, t, k, p) => sBounce(v, c, t, k, p),
  hazard: (v, c, t, k) => sHazard(v, c, t, k),
  sink: (v, c, t, k) => sSink(v, c, t, k),
  lipout: (v, c, t, k) => sLipout(v, c, t, k),
  settled: (v, c, t, k) => sSettled(v, c, t, k),
  voided: (v, c, t, k) => sVoided(v, c, t, k),
  orbit: (v, c, t, k) => sOrbit(v, c, t, k),
  switch: (v, c, t, k) => sSwitch(v, c, t, k),
  sequenceReset: (v, c, t, k) => sSequenceReset(v, c, t, k),
  fragment: (v, c, t, k, p) => sFragment(v, c, t, k, p),
  pinPlace: (v, c, t, k) => sPinPlace(v, c, t, k),
  pinDeny: (v, c, t, k) => sPinDeny(v, c, t, k),
  wormhole: (v, c, t, k) => sWormhole(v, c, t, k),
  uiTick: (v, c, t, k) => sUiTick(v, c, t, k),
  uiSelect: (v, c, t, k) => sUiSelect(v, c, t, k),
  miloChirp: (v, c, t, k) => sMiloChirp(v, c, t, k),
  announcer: (v, c, t, k) => sAnnouncer(v, c, t, k),
};

/** Build `name` into `v` at absolute time `t`. `k` = gain scale, `p` = pitch scale. */
export function buildSfx(name: SfxName, core: SfxCore, v: SfxVoice, t: number, o: SfxOpts): void {
  BUILDERS[name](v, core, t, o.gain ?? 1, o.pitch ?? 1);
}
