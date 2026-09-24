/**
 * Procedural music sequencer — zero assets. A lookahead scheduler drives
 * synthesized voices through the music bus. Pattern planning is pure
 * (`planStep`) so it is unit-testable without an AudioContext; the
 * `MusicSystem` class only turns NoteEvents into audio nodes.
 *
 * Intensity layers (set from the run's threat level):
 *   0 explore — pad + sub          2 combat — arp + hats
 *   1 pressure — bass pulse        3 boss — kick/snare + octave arp
 */

export const STEPS_PER_BAR = 16;

export interface MusicTheme {
  bpm: number;
  /** MIDI tonic, e.g. 45 = A2 */
  root: number;
  /** one chord (semitone offsets from root) per bar, cycled */
  chords: number[][];
  /** 16-step bass pattern: semitone offset or null rest */
  bass: (number | null)[];
  /** 16-step arp pattern: semitone offset or null rest */
  arp: (number | null)[];
  bassWave: OscillatorType;
  arpWave: OscillatorType;
  /** pad lowpass cutoff [calm, intense] Hz */
  cutoff: [number, number];
}

export const MUSIC_THEMES: Record<string, MusicTheme> = {
  iron: {
    bpm: 118, root: 45, // A minor: Am F C G
    chords: [[0, 3, 7], [-4, 0, 3], [3, 7, 10], [-2, 2, 5]],
    bass: [0, null, 0, null, 0, null, 7, null, 0, null, 0, null, 3, null, 7, null],
    arp: [0, null, 7, 12, null, 15, 12, null, 7, null, 0, 7, null, 12, 15, 12],
    bassWave: 'square', arpWave: 'square', cutoff: [420, 1600],
  },
  frost: {
    bpm: 112, root: 48, // C major: C G Am F
    chords: [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]],
    bass: [0, null, null, 0, null, null, 7, null, 0, null, null, 0, null, 4, null, 7],
    arp: [0, 4, 7, 12, null, 12, 7, 4, 0, 4, 7, 12, null, 14, 12, 11],
    bassWave: 'triangle', arpWave: 'triangle', cutoff: [600, 2200],
  },
  rust: {
    bpm: 122, root: 38, // D phrygian dominant: Dm C Bb A
    chords: [[0, 3, 7], [-2, 2, 5], [-4, 0, 3], [-5, -1, 2]],
    bass: [0, 0, null, 0, null, 0, null, null, 0, 0, null, 0, null, 1, null, 3],
    arp: [0, 1, 7, 8, 7, 1, 0, null, 0, 1, 7, 8, 10, 8, 7, 1],
    bassWave: 'square', arpWave: 'sawtooth', cutoff: [500, 1900],
  },
  ember: {
    bpm: 126, root: 40, // E phrygian: Em F D Em
    chords: [[0, 3, 7], [1, 5, 8], [-2, 2, 5], [0, 3, 7]],
    bass: [0, null, 0, 0, null, 0, null, 0, 0, null, 0, 0, 1, null, 3, null],
    arp: [0, 12, 3, 15, 7, 19, 3, 15, 0, 12, 3, 15, 8, 20, 7, 15],
    bassWave: 'square', arpWave: 'sawtooth', cutoff: [520, 2100],
  },
};

export function themeFor(biomeId: string): MusicTheme {
  return MUSIC_THEMES[biomeId] ?? MUSIC_THEMES.iron;
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export interface NoteEvent {
  kind: 'pad' | 'sub' | 'bass' | 'arp' | 'kick' | 'snare' | 'hat';
  midi: number;
  /** seconds */
  dur: number;
  /** 0..1 */
  vel: number;
  /** detune cents for pad unison */
  detune?: number;
}

/** Pure pattern engine: what should sound at 16th-step `globalStep` given intensity 0..3. */
export function planStep(theme: MusicTheme, globalStep: number, intensity: number, sixteenth: number): NoteEvent[] {
  const inBar = ((globalStep % STEPS_PER_BAR) + STEPS_PER_BAR) % STEPS_PER_BAR;
  const bar = Math.floor(globalStep / STEPS_PER_BAR);
  const chord = theme.chords[((bar % theme.chords.length) + theme.chords.length) % theme.chords.length];
  const barLen = sixteenth * STEPS_PER_BAR;
  const out: NoteEvent[] = [];

  if (inBar === 0) {
    for (const semi of chord) {
      out.push({ kind: 'pad', midi: theme.root + 12 + semi, dur: barLen * 1.05, vel: 0.05, detune: -6 });
      out.push({ kind: 'pad', midi: theme.root + 12 + semi, dur: barLen * 1.05, vel: 0.05, detune: 6 });
    }
    out.push({ kind: 'sub', midi: theme.root - 12, dur: barLen * 0.95, vel: 0.12 });
  }
  if (intensity >= 1) {
    const b = theme.bass[inBar];
    if (b !== null && b !== undefined) out.push({ kind: 'bass', midi: theme.root + b, dur: sixteenth * 1.7, vel: 0.16 });
  }
  if (intensity >= 2) {
    const a = theme.arp[inBar];
    if (a !== null && a !== undefined) {
      out.push({ kind: 'arp', midi: theme.root + 12 + a + (intensity >= 3 ? 12 : 0), dur: sixteenth * 0.9, vel: 0.07 });
    }
    if (inBar % 2 === 1) out.push({ kind: 'hat', midi: 0, dur: 0.03, vel: 0.05 });
    else if (intensity >= 3) out.push({ kind: 'hat', midi: 0, dur: 0.03, vel: 0.02 });
  }
  if (intensity >= 3) {
    if (inBar % 4 === 0) out.push({ kind: 'kick', midi: 0, dur: 0.16, vel: 0.5 });
    if (inBar === 4 || inBar === 12) out.push({ kind: 'snare', midi: 0, dur: 0.09, vel: 0.16 });
  }
  return out;
}

/** Turns NoteEvents into WebAudio voices. Owns its own lookahead timer. */
export class MusicSystem {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private padFilter: BiquadFilterNode | null = null;
  private theme: MusicTheme = MUSIC_THEMES.iron;
  private pendingTheme: MusicTheme | null = null;
  private intensity = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextStepTime = 0;
  private step = 0;
  private sixteenth = 0.125;

  private static LOOKAHEAD = 0.15;
  private static TICK_MS = 40;

  start(ctx: AudioContext, out: GainNode, biomeId: string): void {
    this.stop();
    this.ctx = ctx;
    this.out = out;
    this.theme = themeFor(biomeId);
    this.pendingTheme = null;
    this.sixteenth = 60 / this.theme.bpm / 4;
    this.step = 0;
    this.nextStepTime = ctx.currentTime + 0.06;
    if (!this.noise) {
      const n = Math.floor(ctx.sampleRate * 0.5);
      this.noise = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = this.theme.cutoff[0];
    this.padFilter.connect(out);
    this.timer = setInterval(() => this.tick(), MusicSystem.TICK_MS);
  }

  /** Switch theme at the next bar boundary (zone change). */
  setTheme(biomeId: string): void {
    const t = themeFor(biomeId);
    if (t === this.theme) return;
    this.pendingTheme = t;
  }

  setIntensity(v: number): void {
    this.intensity = Math.max(0, Math.min(3, Math.round(v)));
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.padFilter) {
      this.padFilter.disconnect();
      this.padFilter = null;
    }
    this.ctx = null;
    this.out = null;
  }

  private tick(): void {
    const ctx = this.ctx;
    if (!ctx || !this.out) return;
    // resync after tab suspension
    if (this.nextStepTime < ctx.currentTime - 0.25) this.nextStepTime = ctx.currentTime + 0.05;
    while (this.nextStepTime < ctx.currentTime + MusicSystem.LOOKAHEAD) {
      if (this.step % STEPS_PER_BAR === 0 && this.pendingTheme) {
        this.theme = this.pendingTheme;
        this.pendingTheme = null;
        this.sixteenth = 60 / this.theme.bpm / 4;
      }
      for (const ev of planStep(this.theme, this.step, this.intensity, this.sixteenth)) {
        this.voice(ev, this.nextStepTime);
      }
      this.step++;
      this.nextStepTime += this.sixteenth;
    }
    // pad filter follows intensity
    if (this.padFilter) {
      const target = this.theme.cutoff[0] + (this.theme.cutoff[1] - this.theme.cutoff[0]) * (this.intensity / 3);
      this.padFilter.frequency.setTargetAtTime(target, ctx.currentTime, 0.8);
    }
  }

  private voice(ev: NoteEvent, t: number): void {
    const ctx = this.ctx;
    const out = this.out;
    if (!ctx || !out) return;
    switch (ev.kind) {
      case 'pad': {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.value = midiToFreq(ev.midi);
        o.detune.value = ev.detune ?? 0;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(ev.vel, t + this.sixteenth * 3);
        g.gain.setTargetAtTime(0, t + ev.dur * 0.8, 0.25);
        o.connect(g).connect(this.padFilter ?? out);
        o.start(t);
        o.stop(t + ev.dur + 0.8);
        break;
      }
      case 'sub':
      case 'bass': {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = ev.kind === 'sub' ? 200 : 900;
        o.type = ev.kind === 'sub' ? 'sine' : this.theme.bassWave;
        o.frequency.value = midiToFreq(ev.midi);
        g.gain.setValueAtTime(ev.vel, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + ev.dur);
        o.connect(f).connect(g).connect(out);
        o.start(t);
        o.stop(t + ev.dur + 0.02);
        break;
      }
      case 'arp': {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = this.theme.arpWave;
        o.frequency.value = midiToFreq(ev.midi);
        g.gain.setValueAtTime(ev.vel, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + ev.dur);
        o.connect(g).connect(out);
        o.start(t);
        o.stop(t + ev.dur + 0.02);
        break;
      }
      case 'kick': {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(150, t);
        o.frequency.exponentialRampToValueAtTime(42, t + 0.09);
        g.gain.setValueAtTime(ev.vel, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + ev.dur);
        o.connect(g).connect(out);
        o.start(t);
        o.stop(t + ev.dur + 0.02);
        break;
      }
      case 'snare':
      case 'hat': {
        if (!this.noise) return;
        const src = ctx.createBufferSource();
        src.buffer = this.noise;
        const f = ctx.createBiquadFilter();
        f.type = ev.kind === 'snare' ? 'bandpass' : 'highpass';
        f.frequency.value = ev.kind === 'snare' ? 1800 : 6500;
        const g = ctx.createGain();
        g.gain.setValueAtTime(ev.vel, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + ev.dur);
        src.connect(f).connect(g).connect(out);
        src.start(t, Math.random() * 0.3);
        src.stop(t + ev.dur + 0.02);
        break;
      }
    }
  }
}
