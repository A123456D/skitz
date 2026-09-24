// ORBITAL — Region 1: THE PRACTICE ORBIT (L01–L07).
// Teaching arc: ONE new mechanic per level — attractor → barrier → capture →
// repulsor → void → PINS → two-body. Calm celestial architecture, generous
// budgets (pins 2, par 2–3). Milo arc: confused.
// Variety rule: each level is one named idea; no archetype repeats in-region.
import type { LevelDef } from '../sim';

export const R1_LEVELS: LevelDef[] = [
  {
    id: 'L01',
    name: 'First Contact',
    region: 1,
    concept:
      'One planet between tee and green: what does gravity want to do to my ball? ' +
      'The direct line is blocked; a wide aim gets bent back down to the green.',
    par: 2,
    pinBudget: 2,
    tee: { x: 260, y: 720 },
    hole: { x: 2020, y: 660 },
    bounds: { cx: 1140, cy: 640, rx: 1600, ry: 470 },
    bodies: [
      { id: 'asterion', kind: 'attractor', x: 1150, y: 700, radius: 70, mu: 5e6, influenceR: 520, material: 'rock' },
    ],
    fragments: [
      { x: 1150, y: 430 }, // apex of the bend, high over Asterion
      { x: 1330, y: 850 }, // skim below-behind the planet
      { x: 1870, y: 560 }, // high line into the green
    ],
    objectives: [
      { id: 'o1', kind: 'secret', x: 1240, y: 840, r: 60, text: 'Discover what waits behind Asterion.' },
    ],
    story: [
      {
        id: 'st1',
        on: { type: 'start' },
        lines: [
          { who: 'coursekeeper', text: 'CALIBRATION ASSET 7. Begin intake evaluation.' },
          { who: 'milo', text: "The name's Milo. Evaluation of what, exactly?" },
        ],
      },
      {
        id: 'st2',
        on: { type: 'zone', x: 1150, y: 420, r: 260 },
        lines: [
          { who: 'log', text: 'MAINTENANCE LOG 441 — ball locker restocked. Six remain. Do not ask about one through six.' },
        ],
      },
      {
        id: 'st3',
        on: { type: 'zone', x: 1240, y: 840, r: 150 },
        lines: [
          { who: 'sprocket', text: 'Bzzt! (a one-wheeled drone nudges something shiny toward you)' },
        ],
      },
      {
        id: 'st4',
        on: { type: 'sink' },
        lines: [
          { who: 'coursekeeper', text: 'Adequate. Proceed, Asset 7.' },
          { who: 'milo', text: 'Still Milo.' },
        ],
      },
    ],
    hint: 'Aim wide of the planet — its pull will bend the ball back down toward the green.',
  },
  {
    id: 'L02',
    name: 'The Bend',
    region: 1,
    concept:
      'A Barrier Pylon seals the fairway: the only route is a mortar over its tip, ' +
      'cornered tight by the small star parked above the wall. Bend around a barrier.',
    par: 2,
    pinBudget: 2,
    tee: { x: 260, y: 720 },
    hole: { x: 1900, y: 610 },
    bounds: { cx: 1080, cy: 570, rx: 1500, ry: 900 },
    bodies: [
      { id: 'vell', kind: 'attractor', x: 1400, y: 240, radius: 60, mu: 5e6, influenceR: 520, material: 'ice' },
    ],
    hazards: [{ id: 'pylon', kind: 'barrier', a: { x: 1150, y: 470 }, b: { x: 1150, y: 1000 } }],
    fragments: [
      { x: 1400, y: 110 }, // over the top of Vell — the committed line
      { x: 1240, y: 430 }, // the corner itself, just past the tip
      { x: 760, y: 520 }, // high entry lane
    ],
    objectives: [{ id: 'o1', kind: 'noHazard', text: 'Never feed the Pylon.' }],
    story: [
      {
        id: 'st1',
        on: { type: 'start' },
        lines: [
          { who: 'coursekeeper', text: 'Obstacle practice. The Pylon does not forgive. It barely notices.' },
        ],
      },
      {
        id: 'st2',
        on: { type: 'zone', x: 1300, y: 480, r: 200 },
        lines: [
          { who: 'announcer', text: 'Spectacular bend, folks! The crowd goes wild!' },
          { who: 'milo', text: 'There is no crowd.' },
        ],
      },
      {
        id: 'st3',
        on: { type: 'sink' },
        lines: [
          { who: 'announcer', text: 'Textbook! Frame it! Enshrine it!' },
        ],
      },
    ],
    hint: 'Clear the top of the Pylon — the star beyond the tip pulls you down the far side.',
  },
  {
    id: 'L03',
    name: 'Capture',
    region: 1,
    concept:
      'THE ORBIT: a wide planet fills the middle and the green hides on its far side. ' +
      'Capture into the swing, let gravity hold you, and release through the hole at exactly the right point.',
    par: 3,
    pinBudget: 2,
    tee: { x: 450, y: 720 },
    hole: { x: 1560, y: 560 },
    bounds: { cx: 1005, cy: 685, rx: 1050, ry: 550 },
    bodies: [
      { id: 'kore', kind: 'attractor', x: 1200, y: 720, radius: 80, mu: 6e6, influenceR: 620, material: 'gas' },
    ],
    fragments: [
      { x: 1200, y: 420 }, // top of the orbit ring
      { x: 1500, y: 720 }, // far side of the ring — the release line
      { x: 700, y: 950 }, // low entry swing
    ],
    objectives: [{ id: 'o1', kind: 'orbit', text: 'Complete one full orbit of Kore.' }],
    story: [
      {
        id: 'st1',
        on: { type: 'start' },
        lines: [
          { who: 'coursekeeper', text: 'Capture evaluation. Hold the orbit. Release on the far side.' },
          { who: 'milo', text: 'You want me to just... fall forever?' },
        ],
      },
      {
        id: 'st2',
        on: { type: 'firstBounce' },
        lines: [
          { who: 'sprocket', text: 'Bzzt. (the drone traces the orbit line with a spray of sparks)' },
        ],
      },
      {
        id: 'st3',
        on: { type: 'sink' },
        lines: [
          { who: 'announcer', text: 'AN ORBITAL! In the Practice Orbit! The poetry writes itself!' },
        ],
      },
    ],
    hint: 'Fire just wide of Kore and let the capture carry you around — the green waits on the far side of the swing.',
  },
  {
    id: 'L04',
    name: 'Pushback',
    region: 1,
    concept:
      'A star that only says no: approach Sola and it shoves you away. ' +
      'Pass below its rim and the rejection itself steers the ball down onto the green — the repulsor slingshot.',
    par: 2,
    pinBudget: 2,
    tee: { x: 300, y: 720 },
    hole: { x: 1980, y: 900 },
    bounds: { cx: 1140, cy: 580, rx: 1530, ry: 660 },
    bodies: [
      { id: 'sola', kind: 'repulsor', x: 1150, y: 560, radius: 60, mu: 5e6, influenceR: 520, material: 'metal' },
    ],
    fragments: [
      { x: 1150, y: 260 }, // deep in the push zone, high line
      { x: 760, y: 900 }, // low entry, under the push
      { x: 1700, y: 700 }, // between rejection and green
    ],
    objectives: [{ id: 'o1', kind: 'pinsMax', value: 1, text: 'Sink using at most one pin.' }],
    story: [
      {
        id: 'st1',
        on: { type: 'start' },
        lines: [
          { who: 'coursekeeper', text: 'Repulsion calibration. The star declines contact. Learn from the star.' },
        ],
      },
      {
        id: 'st2',
        on: { type: 'zone', x: 1150, y: 300, r: 240 },
        lines: [
          { who: 'milo', text: 'First the hug, now the shove. Honestly? Relatable.' },
        ],
      },
      {
        id: 'st3',
        on: { type: 'sink' },
        lines: [
          { who: 'announcer', text: 'Rejected at the star — and THROUGH! Gorgeous!' },
        ],
      },
    ],
  },
  {
    id: 'L05',
    name: 'Still Air',
    region: 1,
    concept:
      'A dead pocket where gravity itself has been switched off: slow balls die in the middle of nothing. ' +
      'Momentum is everything — hit through the void, then let Anemo catch and carry you home.',
    par: 2,
    pinBudget: 2,
    tee: { x: 300, y: 720 },
    hole: { x: 2050, y: 560 },
    bounds: { cx: 1175, cy: 700, rx: 1600, ry: 620 },
    bodies: [
      // The Bell: nearly massless marker mid-void — pure objective, zero help.
      { id: 'bell', kind: 'attractor', x: 1150, y: 700, radius: 26, mu: 2e5, influenceR: 200, material: 'rock' },
      { id: 'anemo', kind: 'attractor', x: 1700, y: 660, radius: 55, mu: 4e6, influenceR: 420, material: 'gas' },
    ],
    zones: [{ id: 'still', kind: 'void', x: 1150, y: 700, radius: 300, strength: 1 }],
    fragments: [
      { x: 1150, y: 780 }, // dead center of the void, under the Bell
      { x: 1520, y: 860 }, // low sling line under Anemo
      { x: 760, y: 560 }, // high entry lane
    ],
    objectives: [{ id: 'o1', kind: 'touch', targetId: 'bell', text: 'Ring the Bell in the Still Air.' }],
    story: [
      {
        id: 'st1',
        on: { type: 'start' },
        lines: [
          { who: 'coursekeeper', text: 'Atmospheric scrubber failure, sector twelve. Sealed three hundred years ago. Momentum is your only lift now.' },
        ],
      },
      {
        id: 'st2',
        on: { type: 'zone', x: 1150, y: 700, r: 220 },
        lines: [
          { who: 'milo', text: 'No gravity, no wind, no sound. Just me and my dimples.' },
        ],
      },
      {
        id: 'st3',
        on: { type: 'zone', x: 760, y: 560, r: 160 },
        lines: [
          { who: 'sprocket', text: 'Bzzt! (the drone refuses to enter the still air and points instead)' },
        ],
      },
      {
        id: 'st4',
        on: { type: 'sink' },
        lines: [
          { who: 'log', text: 'LOG 88 — void pocket logged. Ticket refunded posthumously.' },
        ],
      },
    ],
    hint: 'Dead space eats slow balls. Hit through it — hard and level.',
  },
  {
    id: 'L06',
    name: 'The Tee',
    region: 1,
    concept:
      'THE PINS TUTORIAL: the green hides deep in Umbra\u2019s shadow and the planet\u2019s own pull is not ' +
      'enough to corner the shot. If gravity is a club, this is where you plant your own. Wow-moment: your placed ' +
      'pin visibly finishes the bend no launch can hold.',
    par: 3,
    pinBudget: 2,
    tee: { x: 300, y: 720 },
    hole: { x: 1450, y: 980 },
    bounds: { cx: 930, cy: 690, rx: 1180, ry: 600 },
    bodies: [
      { id: 'umbra', kind: 'attractor', x: 1200, y: 720, radius: 90, mu: 5e6, influenceR: 520, material: 'rock' },
    ],
    fragments: [
      { x: 1200, y: 400 }, // apex over Umbra
      { x: 1560, y: 900 }, // the pin line, just shy of the green
      { x: 700, y: 950 }, // low entry swing
    ],
    objectives: [{ id: 'o1', kind: 'pinsMax', value: 1, text: 'Sink using at most one pin.' }],
    story: [
      {
        id: 'st1',
        on: { type: 'start' },
        lines: [
          { who: 'coursekeeper', text: 'Gravity Pins. Plant one. The Course obeys the gardener, not the ball.' },
        ],
      },
      {
        id: 'st2',
        on: { type: 'zone', x: 1560, y: 900, r: 200 },
        lines: [
          { who: 'milo', text: 'So I grow my own gravity now? Since when do I get the good tools?' },
        ],
      },
      {
        id: 'st3',
        on: { type: 'sink' },
        lines: [
          { who: 'coursekeeper', text: 'Pins authorized. Calibration continues.' },
          { who: 'milo', text: 'That was the tutorial, wasn\u2019t it.' },
        ],
      },
    ],
    hint:
      'A straight line is impossible. Plant ONE pin at (1560, 620) — right of Umbra\u2019s shadow — ' +
      'and let your pull finish the bend your launch can\u2019t.',
  },
  {
    id: 'L07',
    name: 'Binary',
    region: 1,
    concept:
      'Two equal stars run a shared slingshot chain: Castor bends you up, Pollux bends you down, ' +
      'and the S-curve between them is the fairway. Steal the curve, kiss a planet, live.',
    par: 3,
    pinBudget: 2,
    tee: { x: 300, y: 720 },
    hole: { x: 2050, y: 560 },
    bounds: { cx: 1175, cy: 620, rx: 1600, ry: 880 },
    bodies: [
      { id: 'castor', kind: 'attractor', x: 1050, y: 440, radius: 60, mu: 4.5e6, influenceR: 470, material: 'rock' },
      { id: 'pollux', kind: 'attractor', x: 1550, y: 1000, radius: 60, mu: 4.5e6, influenceR: 470, material: 'rock' },
    ],
    fragments: [
      { x: 1050, y: 180 }, // above Castor — the committed high line
      { x: 1550, y: 720 }, // the saddle between the twins
      { x: 1900, y: 830 }, // low approach after Pollux
    ],
    objectives: [{ id: 'o1', kind: 'touch', targetId: 'pollux', text: 'Kiss Pollux and live.' }],
    story: [
      {
        id: 'st1',
        on: { type: 'start' },
        lines: [
          { who: 'coursekeeper', text: 'Binary evaluation. Two masters, one servant — the ball.' },
        ],
      },
      {
        id: 'st2',
        on: { type: 'zone', x: 1550, y: 720, r: 220 },
        lines: [
          { who: 'milo', text: 'Castor and Pollux, huh? One of you owes me a landing.' },
        ],
      },
      {
        id: 'st3',
        on: { type: 'sink' },
        lines: [
          { who: 'announcer', text: 'A DOUBLE BANK SHOT! Retire the ball, folks!' },
          { who: 'milo', text: 'Retire me? I\u2019ve got seventeen holes left.' },
        ],
      },
    ],
  },
];
