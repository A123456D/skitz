// ORBITAL — Region 4: THE DEEP (L22–L24).
// Finale: everything combined, crystal and waking machine. Par 4–5. The new
// verb debuts here: FLIPPER zones — slingshot rim shots that turn a bank into a
// launch — plus amp coils through pinch points and a hush of damp by the far
// chord. L24 carries the cradle cliffhanger payoff. Milo arc: fascinated/aware.
import type { LevelDef } from '../sim';

export const R4_LEVELS: LevelDef[] = [
  {
    id: 'L22',
    name: 'The Gauntlet',
    region: 4,
    concept:
      'Every lesson at once, in a row: the spinning blade at the first hub, the shove of the Bouncer\u2019s ' +
      'squeeze, the wreck\u2019s surging reactor pulling through an amp coil, and a flipper field before the ' +
      'green that turns the whole gauntlet into one launch. One fairway that refuses to be read twice — ' +
      'a synthesis exam, left to right.',
    par: 4,
    pinBudget: 2,
    tee: { x: 300, y: 720 },
    hole: { x: 2250, y: 680 },
    bounds: { cx: 1275, cy: 690, rx: 1780, ry: 570 },
    bodies: [
      { id: 'hub1', kind: 'attractor', x: 750, y: 720, radius: 40, mu: 2e6, influenceR: 300, material: 'machine' },
      { id: 'bouncer', kind: 'repulsor', x: 1350, y: 500, radius: 60, mu: 5e6, influenceR: 480, material: 'metal' },
      {
        id: 'wreck', kind: 'unstable', x: 1850, y: 800, radius: 55, mu: 5e6, influenceR: 500, material: 'machine',
        muMin: 3e6, muMax: 7e6, wanderT: 1.5,
      },
    ],
    hazards: [
      { id: 'b1', kind: 'beam', x: 750, y: 720, len: 190, r: 12, spin: 0.7 },
    ],
    zones: [
      // the coil: amp field whipping the wreck\u2019s pull — the launch rail
      { id: 'coil', kind: 'amp', x: 1900, y: 740, radius: 150, strength: 1.6 },
      // THE SLING: a flipper disc on the wreck\u2019s rim — inside it the wreck\u2019s
      // grab inverts into a shove aimed at the green. Rim shot = launch.
      { id: 'sling', kind: 'flipper', x: 2060, y: 790, radius: 140 },
    ],
    debris: [
      { x: 1750, y: 700, r: 9, vx: 6, vy: -4 },
      { x: 1950, y: 940, r: 11, vx: -5, vy: -6 },
      { x: 2060, y: 760, r: 8, vx: -4, vy: 6 },
    ],
    fragments: [
      { x: 750, y: 420 }, // above the blade sweep
      { x: 1350, y: 950 }, // the squeeze under the Bouncer
      { x: 1900, y: 480 }, // above the wreck sling
    ],
    objectives: [{ id: 'o1', kind: 'noHazard', text: 'Cross whole — no blades, no burns.' }],
    story: [
      {
        id: 'st1',
        on: { type: 'start' },
        lines: [
          { who: 'coursekeeper', text: 'The Grand Course proper begins. Everything you have learned, all at once, forever.' },
        ],
      },
      {
        id: 'st2',
        on: { type: 'zone', x: 1350, y: 950, r: 220 },
        lines: [
          { who: 'milo', text: 'Blades, a shove, AND a rock garden. Sure. Why not.' },
        ],
      },
      {
        id: 'st3',
        on: { type: 'sink' },
        lines: [
          { who: 'announcer', text: 'SURVIVED THE GAUNTLET! Ticket holders, you missed HISTORY!' },
        ],
      },
    ],
    hint: 'Blade, squeeze, surge, sling — the flipper disc by the wreck turns whatever survives into the launch.',
  },
  {
    id: 'L23',
    name: 'The Chorus',
    region: 4,
    concept:
      'Six crystal voices pulse in rounds around a steady conductor: the chaos has a rhythm. Find the ' +
      'downbeat, dare the podium at the center, and meet the green as it glides along the far chord — ' +
      'where a hush of damp muffles every voice, so the finish must carry its own pace.',
    par: 4,
    pinBudget: 2,
    tee: { x: 300, y: 720 },
    hole: {
      x: 2000, y: 560,
      path: {
        points: [{ x: 2000, y: 560 }, { x: 2400, y: 880 }],
        speed: 60,
        mode: 'pingpong',
      },
    },
    bounds: { cx: 1350, cy: 711, rx: 1900, ry: 820 },
    bodies: [
      { id: 'p0', kind: 'pulse', x: 1670, y: 720, radius: 38, mu: 2.5e6, influenceR: 300, material: 'crystal', pulsePeriod: 3, pulsePhase: 0, pulseMin: 0.25 },
      { id: 'p1', kind: 'pulse', x: 1460, y: 1084, radius: 38, mu: 2.5e6, influenceR: 300, material: 'crystal', pulsePeriod: 3, pulsePhase: 1, pulseMin: 0.25 },
      { id: 'p2', kind: 'pulse', x: 1040, y: 1084, radius: 38, mu: 2.5e6, influenceR: 300, material: 'crystal', pulsePeriod: 3, pulsePhase: 2, pulseMin: 0.25 },
      { id: 'p3', kind: 'pulse', x: 830, y: 720, radius: 38, mu: 2.5e6, influenceR: 300, material: 'crystal', pulsePeriod: 3, pulsePhase: 3, pulseMin: 0.25 },
      { id: 'p4', kind: 'pulse', x: 1040, y: 356, radius: 38, mu: 2.5e6, influenceR: 300, material: 'crystal', pulsePeriod: 3, pulsePhase: 4, pulseMin: 0.25 },
      { id: 'p5', kind: 'pulse', x: 1460, y: 356, radius: 38, mu: 2.5e6, influenceR: 300, material: 'crystal', pulsePeriod: 3, pulsePhase: 5, pulseMin: 0.25 },
      // The conductor: a massless dashed ring of pure pull at the center.
      { id: 'conductor', kind: 'anchor', x: 1250, y: 720, radius: 0, mu: 1.2e7, influenceR: 520, material: 'crystal' },
    ],
    zones: [
      // the hush: the chorus falls silent along the far chord — no borrowed finishes
      { id: 'hush', kind: 'damp', x: 2200, y: 720, radius: 200, strength: 0.45 },
    ],
    fragments: [
      { x: 1250, y: 300 }, // the top gap of the ring
      { x: 890, y: 940 }, // inside the ring, lower-left chord
      { x: 1700, y: 560 }, // grazing p0\u2019s breathing field
    ],
    objectives: [{ id: 'o1', kind: 'secret', x: 1250, y: 720, r: 80, text: 'Stand on the conductor\u2019s podium.' }],
    story: [
      {
        id: 'st1',
        on: { type: 'start' },
        lines: [
          { who: 'coursekeeper', text: 'The Chorus rehearsed for the Open\u2019s opening ceremony. It never received the cancellation.' },
        ],
      },
      {
        id: 'st2',
        on: { type: 'zone', x: 1250, y: 470, r: 260 },
        lines: [
          { who: 'milo', text: 'It\u2019s a round. Six voices, one downbeat. Sing when they sing — I know this one.' },
        ],
      },
      {
        id: 'st3',
        on: { type: 'sink' },
        lines: [
          { who: 'announcer', text: 'AND THE BAND PLAYED ON! BRAVO! BRAVO!' },
        ],
      },
    ],
    hint: 'Sing on the downbeat past the podium — and strike the far-chord finish with pace, the hush muffled every helper.',
  },
  {
    id: 'L24',
    name: 'The Last Tee',
    region: 4,
    concept:
      'The finale\u2019s wow-moment: the Course\u2019s calibration cradle lies DARK ahead of you — launch into dead ' +
      'space down the amp coil and the machine WAKES as you arrive, seizing your ball mid-flight and slinging ' +
      'it around its limb, where a flipper disc turns the wake into the last launch. Everything Milo has ' +
      'suspected is on the other side of this hole.',
    par: 4,
    pinBudget: 2,
    tee: { x: 300, y: 720 },
    hole: { x: 1850, y: 1060 },
    bounds: { cx: 1175, cy: 718, rx: 1600, ry: 930 },
    bodies: [
      {
        id: 'cradle', kind: 'attractor', x: 1300, y: 720, radius: 150, mu: 3.2e7, influenceR: 1150, material: 'machine',
        gate: { proximity: 700 },
      },
    ],
    zones: [
      // the coil: dead until the cradle wakes, then it amplifies the seize
      { id: 'coil', kind: 'amp', x: 760, y: 950, radius: 170, strength: 1.7 },
      // THE KICK: a flipper disc on the wake\u2019s rim — the slingshot around the
      // limb inverts mid-disc and becomes the launch onto the last green.
      { id: 'kick', kind: 'flipper', x: 1520, y: 950, radius: 140 },
    ],
    wormholes: [
      { id: 'w1', x: 750, y: 1150, r: 36, exitId: 'w2', angleDelta: 1.25 },
      { id: 'w2', x: 2050, y: 420, r: 36, exitId: 'w1' },
    ],
    fragments: [
      { x: 1300, y: 380 }, // high over the sleeping cradle
      { x: 1300, y: 1080 }, // the wake line below
      { x: 2050, y: 250 }, // the suture exit — wormhole delivery
    ],
    objectives: [{ id: 'o1', kind: 'pinsMax', value: 1, text: 'The last green needs at most one pin of your own.' }],
    story: [
      {
        id: 'st1',
        on: { type: 'start' },
        lines: [
          { who: 'coursekeeper', text: 'Asset 7. The last tee. I have waited a very long time to say this: play.' },
        ],
      },
      {
        id: 'st2',
        on: { type: 'zone', x: 1300, y: 720, r: 500 },
        lines: [
          { who: 'milo', text: 'It\u2019s waking up. They ALL wake up when I arrive. Why do they wake when I arrive?' },
        ],
      },
      {
        id: 'st3',
        on: { type: 'sink' },
        lines: [
          { who: 'coursekeeper', text: 'Calibration complete. Tolerance 0.0003 degrees. WELCOME HOME, ASSET 7.' },
          { who: 'milo', text: 'The name\u2019s—' },
        ],
      },
      {
        id: 'st4',
        on: { type: 'sink' },
        lines: [
          { who: 'announcer', text: 'Ladies and gentlemen... he\u2019s home.' },
        ],
      },
    ],
    hint: 'Launch low through the coil, let the cradle wake and seize you — the flipper disc on the wake\u2019s rim is the last launch.',
  },
];
