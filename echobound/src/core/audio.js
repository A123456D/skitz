// Procedural WebAudio: layered intensity music + synthesized SFX. No assets.
export const A = {
  ctx: null, master: null, sfxBus: null, musBus: null, muted: false,
  stems: {}, intensity: 0, boss: false, schedTimer: 0, nextNote: 0, step: 0,

  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
    this.ctx = new C();
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 6;
    this.master = this.ctx.createGain(); this.master.gain.value = 0.55;
    this.master.connect(comp); comp.connect(this.ctx.destination);
    this.sfxBus = this.ctx.createGain(); this.sfxBus.gain.value = 0.9; this.sfxBus.connect(this.master);
    this.musBus = this.ctx.createGain(); this.musBus.gain.value = 0.5; this.musBus.connect(this.master);
    // stems
    const mk = (v) => { const g = this.ctx.createGain(); g.gain.value = v; g.connect(this.musBus); return g; };
    this.stems = { drone: mk(0.0), perc: mk(0.0), bass: mk(0.0), arp: mk(0.0), choir: mk(0.0) };
    // shared reverb-ish delay
    this.delay = this.ctx.createDelay(0.6); this.delay.delayTime.value = 0.28;
    this.dfb = this.ctx.createGain(); this.dfb.gain.value = 0.34;
    this.delay.connect(this.dfb); this.dfb.connect(this.delay); this.delay.connect(this.musBus);
    this.nextNote = this.ctx.currentTime + 0.1;
    setInterval(() => this.schedule(), 90);
  },
  toggleMute() { this.muted = !this.muted; if (this.master) this.master.gain.value = this.muted ? 0 : 0.55; return this.muted; },

  setIntensity(i) { this.intensity = i; if (!this.ctx || !this.stems) return; this.applyStems(); },
  setBoss(b) { this.boss = b; if (!this.ctx || !this.stems) return; this.applyStems(); },
  applyStems() {
    if (!this.stems || !this.stems.drone) return;
    const t = this.ctx.currentTime, lv = this.intensity;
    const ramp = (g, v) => { if (!g || !g.gain) return; g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(v, t + 1.6); };
    ramp(this.stems.drone.gain, 0.5);
    ramp(this.stems.perc.gain, lv >= 1 ? 0.34 + lv * 0.06 : 0);
    ramp(this.stems.bass.gain, lv >= 2 ? 0.42 : 0);
    ramp(this.stems.arp.gain, lv >= 3 ? 0.3 : 0);
    ramp(this.stems.choir.gain, this.boss ? 0.5 : 0);
  },

  schedule() {
    if (!this.ctx || this.ctx.state !== 'running' || !this.stems || !this.stems.drone) return;
    const lookahead = 0.35, spb = 60 / 132 / 4; // 132bpm 16ths
    while (this.nextNote < this.ctx.currentTime + lookahead) {
      this.playStep(this.step, this.nextNote);
      this.nextNote += spb; this.step = (this.step + 1) % 32;
    }
  },
  playStep(s, t) {
    const st = this.stems, lv = this.intensity;
    if (s % 16 === 0) this.drone(t);
    if (st.perc.gain.value > 0.02) {
      if ([0, 6, 8, 14, 16, 22, 24, 26].includes(s % 16) && lv >= 1) this.kick(t);
      if (s % 4 === 2 && lv >= 2) this.hat(t, 0.5);
      if (s % 8 === 4 && lv >= 2) this.snare(t);
    }
    if (st.bass.gain.value > 0.02) {
      const seq = [0, 0, 3, 0, 5, 0, 3, 2];
      if (s % 2 === 0) this.bassNote(t, seq[(s / 2) % 8 | 0]);
    }
    if (st.arp.gain.value > 0.02 && s % 2 === 1) this.arpNote(t, [0, 3, 7, 10, 12, 10, 7, 3][(s / 2) % 8 | 0]);
    if (st.choir.gain.value > 0.02 && s % 16 === 0) this.choir(t);
  },
  osc(type, freq, t, dur, gain, dest, detune = 0) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = freq; o.detune.value = detune;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
    return o;
  },
  noise(t, dur, gain, filterType, freq, dest) {
    const c = this.ctx, len = Math.max(1, (dur * c.sampleRate) | 0);
    const buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = filterType; f.frequency.value = freq;
    const g = c.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(dest); src.start(t); src.stop(t + dur + 0.02);
  },
  drone(t) { const st = this.stems; const base = 55 * Math.pow(2, 0 / 12); for (const det of [-6, 5]) this.osc('sawtooth', base, t, 3.4, 0.16, st.drone, det); this.osc('sine', base * 2, t, 3.2, 0.08, st.drone); },
  kick(t) { const c = this.ctx, o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.11); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16); o.connect(g); g.connect(this.stems.perc); o.start(t); o.stop(t + 0.2); },
  hat(t, v) { this.noise(t, 0.04, 0.12 * v, 'highpass', 7000, this.stems.perc); },
  snare(t) { this.noise(t, 0.12, 0.2, 'bandpass', 1800, this.stems.perc); },
  bassNote(t, semi) { this.osc('square', 55 * Math.pow(2, semi / 12), t, 0.16, 0.22, this.stems.bass); },
  arpNote(t, semi) { this.osc('triangle', 440 * Math.pow(2, semi / 12), t, 0.12, 0.2, this.stems.arp); this.osc('triangle', 440 * Math.pow(2, semi / 12), t, 0.2, 0.08, this.delay); },
  choir(t) { const ch = [0, 3, 7, 12]; for (const s of ch) { this.osc('sawtooth', 110 * Math.pow(2, s / 12), t, 2.8, 0.09, this.stems.choir, -8); this.osc('sawtooth', 110 * Math.pow(2, s / 12), t, 2.8, 0.09, this.stems.choir, 8); } },

  lastPlay: {},
  sfx(name, o = {}) {
    if (!this.ctx || this.ctx.state !== 'running' || this.muted) return;
    const now = this.ctx.currentTime;
    const gate = { pickup: 0.05, shoot: 0.03, hit: 0.03, shard: 0.04 }[name] || 0;
    if (gate && this.lastPlay[name] && now - this.lastPlay[name] < gate) return;
    this.lastPlay[name] = now;
    const d = 0.9 + Math.random() * 0.2, B = this.sfxBus;
    switch (name) {
      case 'shoot_gc': this.osc('square', 90 * d, now, 0.18, 0.3, B); this.noise(now, 0.08, 0.16, 'lowpass', 900, B); break;
      case 'shoot_widow': this.osc('square', 300 * d, now, 0.05, 0.12, B); break;
      case 'beam': this.noise(now, 0.09, 0.05, 'highpass', 3000, B); break;
      case 'hit': this.noise(now, 0.06, 0.14, 'bandpass', 2400, B); break;
      case 'pop': this.osc('sine', 300 * d, now, 0.1, 0.2, B); this.noise(now, 0.07, 0.18, 'lowpass', 1600, B); break;
      case 'crack': this.noise(now, 0.1, 0.2, 'bandpass', 900, B); this.osc('square', 140, now, 0.08, 0.12, B); break;
      case 'crit': this.osc('triangle', 1500 * d, now, 0.12, 0.18, B); this.osc('triangle', 2250 * d, now + 0.03, 0.1, 0.1, B); break;
      case 'boom': { const c2 = this.ctx, os = c2.createOscillator(), g = c2.createGain(); os.frequency.setValueAtTime(160, now); os.frequency.exponentialRampToValueAtTime(30, now + 0.4); g.gain.setValueAtTime(0.55, now); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.45); os.connect(g); g.connect(B); os.start(now); os.stop(now + 0.5); this.noise(now, 0.35, 0.4, 'lowpass', 1400, B); break; }
      case 'zap': this.noise(now, 0.1, 0.22, 'highpass', 4000, B); this.osc('sawtooth', 800 * d, now, 0.09, 0.1, B); break;
      case 'hurt': { const c3 = this.ctx, o3 = c3.createOscillator(), g3 = c3.createGain(); o3.type = 'sawtooth'; o3.frequency.setValueAtTime(320, now); o3.frequency.exponentialRampToValueAtTime(90, now + 0.22); g3.gain.setValueAtTime(0.3, now); g3.gain.exponentialRampToValueAtTime(0.0001, now + 0.25); o3.connect(g3); g3.connect(B); o3.start(now); o3.stop(now + 0.3); break; }
      case 'pickup': this.osc('triangle', 900 + Math.random() * 300, now, 0.05, 0.07, B); break;
      case 'levelup': [0, 4, 7, 12].forEach((s, i) => this.osc('triangle', 440 * Math.pow(2, s / 12), now + i * 0.07, 0.22, 0.16, B)); break;
      case 'echo': { const c4 = this.ctx, o4 = c4.createOscillator(), g4 = c4.createGain(); o4.type = 'sine'; o4.frequency.setValueAtTime(120, now); o4.frequency.exponentialRampToValueAtTime(1300, now + 0.5); g4.gain.setValueAtTime(0.0001, now); g4.gain.linearRampToValueAtTime(0.2, now + 0.4); g4.gain.exponentialRampToValueAtTime(0.0001, now + 0.55); o4.connect(g4); g4.connect(B); o4.start(now); o4.stop(now + 0.6); this.osc('triangle', 1760, now + 0.3, 0.3, 0.1, this.delay || B); break; }
      case 'boss': this.noise(now, 0.7, 0.4, 'lowpass', 500, B); this.osc('sawtooth', 65, now, 0.8, 0.3, B); this.osc('sawtooth', 66.5, now, 0.8, 0.3, B); break;
      case 'ui': this.osc('triangle', 700, now, 0.06, 0.1, B); break;
      case 'dash': this.noise(now, 0.12, 0.14, 'bandpass', 1200, B); break;
      case 'steal': this.osc('sawtooth', 500, now, 0.14, 0.12, B); this.osc('sawtooth', 380, now + 0.08, 0.14, 0.12, B); break;
      case 'adapt': this.osc('sawtooth', 220, now, 0.3, 0.16, B); this.osc('sawtooth', 224, now, 0.3, 0.16, B); this.noise(now, 0.3, 0.1, 'bandpass', 3000, B); break;
      case 'ascend': [0, 7, 12, 16, 19, 24].forEach((s, i) => this.osc('triangle', 220 * Math.pow(2, s / 12), now + i * 0.06, 0.5, 0.14, this.delay || B)); break;
    }
  },
};
