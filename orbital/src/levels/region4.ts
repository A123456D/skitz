// ORBITAL — Region 4: THE GRAND COURSE (L22–L24).
// Finale teaser: everything combined, crystal and waking machine. Par 4–5.
// Milo arc: fascinated/aware. L24 carries the cradle cliffhanger payoff.
import type { LevelDef } from '../sim';

export const R4_LEVELS: LevelDef[] = [
  {
    id: 'L22',
    name: 'The Gauntlet',
    region: 4,
    concept:
      'Every lesson at once, in a row: the spinning blade, the shove of the Bouncer, the drifting wreck-scatter. ' +
      'One fairway that refuses to be read twice — a synthesis exam, left to right.',
    par: 4,
    pinBudget: 2,
    tee: { x: 300, y: 720 },
    hole: { x: 2250, y: 680 },
    bounds: { cx: 1275, cy: 690, rx: 1780, ry: 570 },
    bodies: [
      { id: 'hub1', kind: 'attractor', x: 750, y: 720, radius: 40, mu: 2e6, influenceR: 300, material: 'machine' },
      { id: 'bouncer', kind: 'repulsor', x: 1350, y: 500, radius: 60, mu: 5e6, influenceR: 480, material: 'metal' },
      { id: 'wreck', kind: 'attractor', x: 1850, y: 800, radius: 55, mu: 5e6, influenceR: 500, material: 'machine' },
    ],
    hazards: [
      { id: 'b1', kind: 'beam', x: 750, y: 720, len: 190, r: 12, spin: 0.7 },
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
  },
  {
    id: 'L23',
    name: 'The Chorus',
    region: 4,
    concept:
      'Six crystal voices pulse in rounds around a steady conductor: the chaos has a rhythm. ' +
      'Find the downbeat, dare the podium at the center, and meet the green as it glides along the far chord.',
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
  },
  {
    id: 'L24',
    name: 'The Last Tee',
    region: 4,
    concept:
      'The finale\u2019s wow-moment: the Course\u2019s calibration cradle lies DARK ahead of you — launch into dead ' +
      'space and the machine WAKES as you arrive, seizing your ball mid-flight and slinging it around its limb to the ' +
      'last green. Everything Milo has suspected is on the other side of this hole.',
    par: 5,
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
  },
];
