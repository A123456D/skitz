/**
 * Tiny WebAudio synth — zero asset SFX. Unlocked on first user interaction.
 * Music: procedural sequencer (engine/music.ts) on its own bus; intensity
 * gates layers, not volume. Master runs through a compressor so full-screen
 * chaos doesn't clip.
 */
import { MusicSystem } from './music';

export class AudioSys {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private lastPlay = new Map<string, number>();
  private music = new MusicSystem();
  sfxOn = true;
  musicOn = true;

  /** Call from a user-gesture handler. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 24;
    comp.ratio.value = 4;
    comp.connect(this.ctx.destination);
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(comp);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0;
    this.musicGain.connect(this.master);
  }

  /** Throttle: allow at most one sound per key per `minIntervalMs`. */
  private gate(key: string, minIntervalMs: number): boolean {
    const now = performance.now();
    const last = this.lastPlay.get(key) ?? -1e9;
    if (now - last < minIntervalMs) return false;
    this.lastPlay.set(key, now);
    return true;
  }

  /** Start the procedural music loop for a biome (no-op until unlocked). */
  startMusic(biomeId: string): void {
    if (!this.ctx || !this.musicGain) return;
    this.music.start(this.ctx, this.musicGain, biomeId);
    this.applyMusicVolume(0.4);
  }

  /** Zone change: crossfade to the new biome's theme at the next bar. */
  setMusicTheme(biomeId: string): void {
    this.music.setTheme(biomeId);
  }

  /** Threat level 0..3 — gates music layers. */
  setMusicIntensity(level: number): void {
    this.music.setIntensity(level);
  }

  stopMusic(): void {
    this.music.stop();
    this.applyMusicVolume(0);
  }

  private applyMusicVolume(target: number): void {
    if (!this.ctx || !this.musicGain) return;
    this.musicGain.gain.setTargetAtTime(this.musicOn ? target : 0, this.ctx.currentTime, 0.5);
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number): void {
    if (!this.ctx || !this.master || !this.sfxOn) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo !== undefined) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number, lowpass = 2400): void {
    if (!this.ctx || !this.master || !this.sfxOn) return;
    const t = this.ctx.currentTime;
    // one shared noise buffer, created once
    if (!this.noiseBuf) {
      const n = Math.floor(this.ctx.sampleRate * 0.5);
      this.noiseBuf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = lowpass;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  bonk(force: number): void {
    if (!this.gate('bonk', 70)) return;
    // force 0..1 — pitch and volume scale with impact
    this.tone(90 + force * 70, 0.09 + force * 0.05, 'triangle', 0.12 + force * 0.2, 40);
    if (force > 0.55 && this.gate('bonknoise', 140)) this.noise(0.08, 0.1, 1200);
  }
  shot(): void { if (this.gate('shot', 90)) this.tone(660, 0.06, 'square', 0.05, 220); }
  gem(): void { if (this.gate('gem', 60)) this.tone(880, 0.07, 'square', 0.06, 1320); }
  gold(): void { if (this.gate('gold', 80)) this.tone(1046, 0.09, 'square', 0.07, 1568); }
  levelup(): void {
    this.tone(523, 0.1, 'square', 0.09);
    setTimeout(() => this.tone(659, 0.1, 'square', 0.09), 90);
    setTimeout(() => this.tone(784, 0.14, 'square', 0.1), 180);
  }
  hurt(): void { this.tone(200, 0.16, 'sawtooth', 0.16, 80); }
  die(): void { this.tone(300, 0.4, 'sawtooth', 0.2, 40); }
  boss(): void { this.tone(60, 0.8, 'sawtooth', 0.3, 30); this.noise(0.5, 0.2, 500); }
  win(): void {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.18, 'square', 0.1), i * 130));
  }
  click(): void { this.tone(440, 0.04, 'square', 0.05); }
  slam(): void { if (this.gate('slam', 120)) { this.tone(70, 0.2, 'triangle', 0.25, 35); this.noise(0.15, 0.18, 900); } }
  clang(): void { if (this.gate('clang', 90)) { this.tone(1180, 0.05, 'square', 0.06, 640); this.tone(1770, 0.04, 'square', 0.04, 900); } }
  pound(): void { if (this.gate('pound', 200)) { this.tone(55, 0.28, 'triangle', 0.32, 28); this.noise(0.2, 0.22, 700); } }
  roar(): void { if (this.gate('roar', 600)) { this.tone(140, 0.5, 'sawtooth', 0.22, 55); this.noise(0.35, 0.12, 400); } }
  hiss(): void { if (this.gate('hiss', 300)) this.noise(0.18, 0.08, 3200); }
  zap(): void { if (this.gate('zap', 110)) { this.tone(2200, 0.05, 'sawtooth', 0.045, 300); } }
  smash(): void { if (this.gate('smash', 140)) { this.tone(180, 0.12, 'square', 0.12, 60); this.noise(0.14, 0.16, 1600); } }
  thud(): void { if (this.gate('thud', 150)) this.tone(120, 0.06, 'triangle', 0.08, 70); }
  jump(): void { if (this.gate('jump', 160)) this.tone(300, 0.09, 'sine', 0.07, 520); }
  slamLand(): void { if (this.gate('slamland', 250)) { this.tone(60, 0.3, 'triangle', 0.34, 26); this.noise(0.22, 0.24, 800); } }
}

export const audio = new AudioSys();
