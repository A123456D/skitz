// localStorage meta: unlocks, codex, settings, records
const KEY = 'echobound_save_v1';

export const CODEX = [
  { id: 'first_echo', t: 'ECHO 0001', how: 'Witness your first Echo', x: 'It wore your face and repeated your footsteps exactly. When it vanished you felt lighter. Something behind you felt heavier.' },
  { id: 'ten_echoes', t: 'TEN OF YOU', how: 'Summon 10 Echoes in one run', x: 'The Heartframe does not create. It borrows. Somewhere, ten debts are accruing under your name.' },
  { id: 'saint', t: 'THE CLOCKWORK SAINT', how: 'Defeat the Clockwork Saint', x: 'It died winding down, like a music box. Inside its chest: a smaller saint, and inside that, a note that read "WIND AGAIN". You did not.' },
  { id: 'hk1', t: 'THE HOLLOW KING', how: 'Reach the Hollow King', x: '"You have killed me hundreds of times," he said, and sounded less angry than tired. "I have started leaving notes for myself in your voice."' },
  { id: 'victory', t: 'THE FIRST MOMENT', how: 'Defeat the Hollow King', x: 'As he fell, the city for one second stood unbroken. Clean glass. Warm light. Someone laughed in an apartment that no longer exists. Then the Fracture remembered itself.' },
  { id: 'archivist', t: 'THE ARCHIVIST', how: 'Die in any run', x: '"I file every run," the Archivist says, not looking up. "This is run %N. You died at %T. In 31 of my drawers you survived. They are not lying to you. They are just not yours."' },
  { id: 'witness', t: 'THE WITNESS', how: 'Let a Witness adapt', x: 'It watched you. It took notes in a language made of your own habits. When it finished, it was you — the version of you that always knows what you will do next.' },
  { id: 'thief', t: 'THE THIEF', how: 'Have a Thief steal from you', x: 'It does not want your Fragments. It wants what you paid for them. Most thieves die rich in moments they never earned.' },
  { id: 'mirror', t: 'MIRROR', how: 'Kill a Mirror', x: 'It fired your weapon back at you with better posture. Kill one and it shatters into slides of a life where you aimed slightly left of everything.' },
  { id: 'ascend', t: 'ASCENSION', how: 'Trigger any Ascension', x: 'There are versions of you so load-bearing that time bends around them. For a moment you were one of them. The Heartframe wrote it down in a language you are not cleared to read.' },
  { id: 'runner', t: 'THE RUNNER', how: 'Defeat the Clockwork Saint', x: 'They never stopped moving during the Fracture, so the Fracture never caught them. They are still out there, technically, in the segment of second that never ended.' },
  { id: 'redbutton', t: 'THE RED BUTTON', how: 'Take The Red Button', x: 'Every Warden is told never to press it. Every Warden is given it anyway. The Heartframe keeps permanent Echoes of everyone who pressed — that is the part they do not tell you.' },
];

const DEF = { runs: 0, best: 0, wins: 0, unlocks: [], codex: [], set: { shake: 1, auto: 0, mute: 0, aimline: 1 } };

function load() {
  try { return { ...structuredClone(DEF), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return structuredClone(DEF); }
}

export const META = {
  d: load(),
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.d)); } catch { /* private mode */ } },
  unlocked(id) { return this.d.unlocks.includes(id); },
  unlock(id) { if (!this.unlocked(id)) { this.d.unlocks.push(id); this.save(); return true; } return false; },
  codexHas(id) { return this.d.codex.includes(id); },
  addCodex(id, vars = {}) {
    if (this.codexHas(id)) return false;
    this.d.codex.push(id); this.save();
    const e = CODEX.find((c) => c.id === id);
    return e ? e.t + ' — ' + e.x.replace(/%N/g, vars.n ?? '').replace(/%T/g, vars.t ?? '') : id;
  },
  event(name, ctx = {}) {
    switch (name) {
      case 'echo_first': return this.addCodex('first_echo');
      case 'echo_ten': return this.addCodex('ten_echoes');
      case 'saint_dead': this.unlock('runner'); return this.addCodex('saint');
      case 'hk_seen': return this.addCodex('hk1');
      case 'victory': this.d.wins++; return this.addCodex('victory');
      case 'death': return this.addCodex('archivist', { n: this.d.runs, t: ctx.time ?? '?' });
      case 'witness': return this.addCodex('witness');
      case 'thief': return this.addCodex('thief');
      case 'mirror': return this.addCodex('mirror');
      case 'ascend': return this.addCodex('ascend');
      case 'redbutton': return this.addCodex('redbutton');
    }
    return null;
  },
};
