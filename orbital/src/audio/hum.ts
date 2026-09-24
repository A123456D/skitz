// Gravity hum — persistent oscillator pool driven per-tick by sim state.
// Pitch ~ log(mass), gain ~ 1/distance gated by field presence, panned by
// screen x. Pins add a bright crystalline chord while present. All parameter
// moves use setTargetAtTime: the hum must glide, never zipper.
import type { BodyState, World } from '../sim';

export interface HumCore {
  ctx: AudioContext;
  /** Routed to the sfx bus — the audio slider governs world sound. */
  bus: GainNode;
}

export interface HumEngine {
  update(w: World): void;
  stop(): void;
  dispose(): void;
}

const MAX_BODIES = 6;
const MAX_PINS = 3;

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

interface HumVoice {
  oscs: OscillatorNode[];
  gain: GainNode;
  pan: StereoPannerNode;
  /** Owning body id (or `pin:<id>`), null while free. */
  ownerId: string | null;
  assigned: boolean;
}

function mkVoice(core: HumCore, oscCount: number): HumVoice {
  const { ctx, bus } = core;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  const pan = ctx.createStereoPanner();
  gain.connect(pan);
  pan.connect(bus);
  const oscs: OscillatorNode[] = [];
  for (let i = 0; i < oscCount; i++) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = 60;
    o.connect(gain);
    o.start();
    oscs.push(o);
  }
  return { oscs, gain, pan, ownerId: null, assigned: false };
}

export function createHum(core: HumCore): HumEngine {
  const bodyPool: HumVoice[] = [];
  for (let i = 0; i < MAX_BODIES; i++) bodyPool.push(mkVoice(core, 1));
  // Crystalline pin chord: root + crystal fifth + sparkle octave-ish partial.
  const pinPool: HumVoice[] = [];
  for (let i = 0; i < MAX_PINS; i++) pinPool.push(mkVoice(core, 3));

  function retune(v: HumVoice, freqs: number[], gain: number, pan: number, tc: number): void {
    const now = core.ctx.currentTime;
    for (let i = 0; i < v.oscs.length; i++) {
      v.oscs[i].frequency.setTargetAtTime(freqs[i] ?? freqs[0], now, tc);
    }
    v.gain.gain.setTargetAtTime(gain, now, tc * 1.4);
    v.pan.pan.setTargetAtTime(clamp(pan, -1, 1), now, tc);
  }

  return {
    update(w: World): void {
      if (core.ctx.state === 'suspended') void core.ctx.resume();
      const ball = w.ball;
      const now = core.ctx.currentTime;

      // --- bodies: pick the 6 nearest active sources (distance-ranked per spec),
      // then gate each by actual field presence so distant mass is silent.
      const cands: BodyState[] = [];
      for (const b of w.bodies) {
        if (!b.active || b.muCurrent <= 0) continue;
        cands.push(b);
      }
      cands.sort((a, b) => {
        const da = (a.cx - ball.x) ** 2 + (a.cy - ball.y) ** 2;
        const db = (b.cx - ball.x) ** 2 + (b.cy - ball.y) ** 2;
        return da - db;
      });
      const chosen = cands.slice(0, MAX_BODIES);

      for (const v of bodyPool) v.assigned = false;
      for (const b of chosen) {
        let v = bodyPool.find((p) => p.ownerId === b.id);
        if (!v) {
          // Reclaim a free voice; prefer one already fading so it retunes quietly.
          v = bodyPool.find((p) => !p.assigned) ?? bodyPool[0];
        }
        v.assigned = true;
        v.ownerId = b.id;
        const d = Math.max(1, Math.hypot(b.cx - ball.x, b.cy - ball.y));
        // Field presence mirrors the sim's 15%-of-R edge fade: full pull inside
        // 0.85·R, gliding to zero at the influence edge — the hum swells exactly
        // when the sim's gravity starts acting on the ball.
        const r = Math.max(1, b.influenceR);
        const presence = clamp((r - d) / (r * 0.15), 0, 1);
        // Heavier masses sit louder and lower: freq = 50 + 26·log10(mu/1e6 + 1)
        // lands a standard planet (~5e6) near 70 Hz and colossi toward 200 Hz.
        const mu = Math.max(1, b.muCurrent);
        const freq = clamp(50 + 26 * Math.log10(mu / 1e6 + 1), 45, 200);
        const loud = clamp(900 / d, 0, 1) * 0.05 * presence * (0.6 + 0.4 * clamp(mu / 5e6, 0, 1));
        // Symmetric pan: dx/1000 clamped to [-1, 1] so bodies left of the ball
        // pan left (a clamp01 here would collapse the left half onto center).
        const px = clamp((b.cx - ball.x) / 1000, -1, 1);
        retune(v, [freq], loud, px, 0.15);
      }
      for (const v of bodyPool) {
        if (!v.assigned) retune(v, [60], 0, 0, 0.25);
      }

      // --- pins: bright crystalline chord while present (they are amber shards).
      for (let i = 0; i < pinPool.length; i++) {
        const v = pinPool[i];
        const pin = w.pins[i];
        if (pin) {
          // Base pitch varies per pin id so two pins don't phase-lock.
          const base = 620 + (pin.id % 5) * 55;
          const freqs = [base, base * 1.498, base * 2.01];
          const target = 0.018;
          const px = clamp((pin.x - ball.x) / 1000, -1, 1);
          if (v.ownerId !== `pin:${pin.id}`) {
            // New pin: snap pitch immediately, then fade the chord in fast.
            v.ownerId = `pin:${pin.id}`;
            const t = now;
            for (let k = 0; k < v.oscs.length; k++) {
              v.oscs[k].frequency.setValueAtTime(freqs[k], t);
            }
            v.gain.gain.cancelScheduledValues(t);
            v.gain.gain.setValueAtTime(0.0001, t);
            v.gain.gain.setTargetAtTime(target, t, 0.05);
            v.pan.pan.setTargetAtTime(px, t, 0.05);
          } else {
            retune(v, freqs, target, px, 0.05);
          }
        } else {
          v.ownerId = null;
          retune(v, [620, 930, 1250], 0, 0, 0.12);
        }
      }
    },

    stop(): void {
      const now = core.ctx.currentTime;
      for (const v of [...bodyPool, ...pinPool]) {
        v.gain.gain.cancelScheduledValues(now);
        v.gain.gain.setTargetAtTime(0, now, 0.08);
        v.ownerId = null;
        v.assigned = false;
      }
    },

    dispose(): void {
      for (const v of [...bodyPool, ...pinPool]) {
        try {
          for (const o of v.oscs) o.stop();
        } catch {
          // already stopped
        }
        v.gain.disconnect();
        v.pan.disconnect();
      }
      bodyPool.length = 0;
      pinPool.length = 0;
    },
  };
}
