// ORBITAL — Region 1: THE APPROACH (L01–L07).
// Teaching arc: ONE new verb per level, made geometric — the bend (attractor),
// the wall (barrier), the orbit (capture + gatepost), the shove (repulsor) under
// a sweeper, the dead pocket (void) + rim kiss, PINS behind a dead well, the
// two-body weave through a bumper gate. Calm celestial architecture, generous
// budgets (pins 2, par 2–3). Milo arc: confused.
// Variety rule: each level is one named idea; every guard obstacle kills the
// naive lane and opens the crafted one.
import type { LevelDef } from '../sim';

export const R1_LEVELS: LevelDef[] = [
  {
    id: 'L01',
    name: 'First Contact',
    region: 1,
    concept:
      'THE PUTT: no planets between Milo and the green. Drag back, watch the dotted arc end on the ' +
      'cup, let go. That is the whole game — every hole after this one is just weather on top of it. ' +
      'A little moon drifts far below the lane as a promise of what weather will look like.',
    par: 2,
    pinBudget: 2,
    tee: { x: 260, y: 700 },
    hole: { x: 1350, y: 660, captureR: 44 },
    bounds: { cx: 830, cy: 660, rx: 940, ry: 680 },
    bodies: [
      // weather preview only: far off the lane, too small to matter yet
      { id: 'herald', kind: 'attractor', x: 820, y: 1020, radius: 26, mu: 0.5e6, influenceR: 190, material: 'rock' },
    ],
    fragments: [
      { x: 660, y: 640 },
      { x: 980, y: 700 },
      { x: 1230, y: 600 },
    ],
    objectives: [
      { id: 'o1', kind: 'secret', x: 1010, y: 810, r: 60, text: 'Discover what waits below the line.' },
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
        on: { type: 'zone', x: 980, y: 660, r: 240 },
        lines: [
          { who: 'log', text: 'MAINTENANCE LOG 441 — ball locker restocked. Six remain. Do not ask about one through six.' },
        ],
      },
      {
        id: 'st3',
        on: { type: 'zone', x: 1010, y: 810, r: 150 },
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
    hint:
      'Drag back from Milo and watch the dotted arc — put its end on the cup and let go. ' +
      'Softer is safer: a gentle roll drops in, a screamer bounces out.',
  },
  {
    id: 'L02',
    name: 'The Bend',
    region: 1,
    concept:
      'THE WALL: the Pylon seals the fairway floor-to-sky, and its raised tip pinches the only gap ' +
      'against the small star parked above the wall. The crafted shot is a committed mortar that ' +
      'hugs the corner — Vell\u2019s pull swings it down the far side, and a lazy line kisses the corner bumper.',
    par: 2,
    pinBudget: 2,
    tee: { x: 260, y: 720 },
    hole: { x: 1900, y: 610, captureR: 36 },
    bounds: { cx: 1080, cy: 570, rx: 1500, ry: 900 },
    bodies: [
      { id: 'vell', kind: 'attractor', x: 1410, y: 235, radius: 60, mu: 2.6e6, influenceR: 520, material: 'ice' },
    ],
    hazards: [
      // the wall: shorter now — a wide, readable gap above the tip
      { id: 'pylon', kind: 'barrier', a: { x: 1150, y: 560 }, b: { x: 1150, y: 1000 } },
      // the corner kiss: clears an over-cooked mortar back down toward the green
      { id: 'corner', kind: 'bumper', x: 1215, y: 600, r: 22, boost: 150 },
    ],
    fragments: [
      { x: 1400, y: 110 }, // over the top of Vell — the committed line
      { x: 1265, y: 430 }, // the corner itself, just past the tip
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
    hint: 'Clear the top of the Pylon tight to the corner — the star beyond the tip pulls you down the far side.',
  },
  {
    id: 'L03',
    name: 'Capture',
    region: 1,
    concept:
      'THE ORBIT: a wide planet fills the middle and the green hides on its far side. The gatepost ' +
      'anchor sits square on the naive lob lane and drags it down into Kore\u2019s grip — so you capture into ' +
      'the swing on purpose, let gravity hold you, and release through the hole at exactly the right point.',
    par: 3,
    pinBudget: 2,
    tee: { x: 450, y: 720 },
    hole: { x: 1560, y: 560, captureR: 36 },
    bounds: { cx: 1005, cy: 685, rx: 1050, ry: 550 },
    bodies: [
      { id: 'kore', kind: 'attractor', x: 1200, y: 720, radius: 80, mu: 3.2e6, influenceR: 620, material: 'gas' },
      // The gatepost: massless marker hanging over the orbit's front door — it
      // nudges lazy high lobs down into Kore's grip instead of letting them clear.
      { id: 'gatepost', kind: 'anchor', x: 1000, y: 430, radius: 0, mu: 1.4e6, influenceR: 360, material: 'rock' },
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
    hint: 'Fire at the gatepost and let it hand you into Kore\u2019s swing — the green waits on the far side of the orbit.',
  },
  {
    id: 'L04',
    name: 'Pushback',
    region: 1,
    concept:
      'THE SHOVE: approach Sola and it pushes you away. The crafted lane passes under its rim and lets ' +
      'the rejection itself steer the ball down onto the green — while a sweeper beam scythes the mortar ' +
      'lane over the top and a kiss bumper banks the low line home. The repulsor slingshot.',
    par: 2,
    pinBudget: 2,
    tee: { x: 300, y: 720 },
    hole: { x: 1980, y: 900 },
    bounds: { cx: 1140, cy: 580, rx: 1530, ry: 660 },
    bodies: [
      { id: 'sola', kind: 'repulsor', x: 1150, y: 560, radius: 60, mu: 5e6, influenceR: 520, material: 'metal' },
    ],
    hazards: [
      // sweeper over the mortar lane: the over-the-top lob must be timed or refused
      { id: 'sweeper', kind: 'beam', x: 1720, y: 480, len: 120, r: 10, spin: 0.5 },
      // the low-line kiss: banks the under-rim slingshot onto the green
      { id: 'kiss', kind: 'bumper', x: 1560, y: 730, r: 24, boost: 180 },
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
    hint: 'Pass under Sola\u2019s rim and let the shove steer you — the sweeper owns the sky, the kiss owns the low bank.',
  },
  {
    id: 'L05',
    name: 'Still Air',
    region: 1,
    concept:
      'THE DEAD POCKET: a void well sits square on the fairway where gravity itself is switched off, and ' +
      'the green hangs HIGH beyond it — flat and low lines sail under the cup and die in nothing. Momentum ' +
      'is everything: hit through the still air on a rising line off Anemo\u2019s catch, or bank the rim kiss home.',
    par: 2,
    pinBudget: 2,
    tee: { x: 300, y: 720 },
    hole: { x: 2050, y: 470 },
    bounds: { cx: 1175, cy: 700, rx: 1600, ry: 620 },
    bodies: [
      // The Bell: nearly massless marker mid-void — pure objective, zero help.
      { id: 'bell', kind: 'attractor', x: 1150, y: 700, radius: 26, mu: 2e5, influenceR: 200, material: 'rock' },
      { id: 'anemo', kind: 'attractor', x: 1700, y: 660, radius: 55, mu: 4e6, influenceR: 430, material: 'gas' },
    ],
    zones: [{ id: 'still', kind: 'void', x: 1150, y: 700, radius: 330, strength: 1 }],
    hazards: [
      // the rim kiss: a well-struck climb off Anemo can bank off it into the cup
      { id: 'rim', kind: 'bumper', x: 1480, y: 560, r: 22, boost: 160 },
    ],
    fragments: [
      { x: 1150, y: 780 }, // dead center of the void, under the Bell
      { x: 1520, y: 900 }, // low sling line under Anemo
      { x: 1900, y: 380 }, // the high finish line over the cup
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
    hint: 'Dead space eats slow balls, and the cup hangs high — ride Anemo\u2019s catch into a rising line, hard.',
  },
  {
    id: 'L06',
    name: 'The Tee',
    region: 1,
    concept:
      'THE PINS TUTORIAL: the green hides deep in Umbra\u2019s shadow and a dead void well smothers every ' +
      'gravity assist short of the cup — the planet\u2019s own pull is not enough to corner the shot. If gravity ' +
      'is a club, this is where you plant your own. Wow-moment: your placed pin visibly finishes the bend ' +
      'no launch can hold.',
    par: 3,
    pinBudget: 2,
    tee: { x: 300, y: 720 },
    hole: { x: 1450, y: 980 },
    bounds: { cx: 930, cy: 690, rx: 1480, ry: 600 },
    bodies: [
      { id: 'umbra', kind: 'attractor', x: 1200, y: 720, radius: 90, mu: 5e6, influenceR: 520, material: 'rock' },
    ],
    zones: [
      // The dead well short of the green: pins are the only gravity that reaches here.
      { id: 'well', kind: 'void', x: 1660, y: 830, radius: 190, strength: 1 },
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
      'A straight line is impossible, and the dead well kills borrowed gravity. Plant ONE pin at (1560, 620) — ' +
      'right of Umbra\u2019s shadow — and let your pull finish the bend your launch can\u2019t.',
  },
  {
    id: 'L07',
    name: 'Binary',
    region: 1,
    concept:
      'TWO-BODY CHAIN: Castor bends you up, Pollux bends you down, and the S-curve between them is the ' +
      'fairway — but the saddle gate is posted: two pinball bumpers straddle the flat lane, so the honest ' +
      'line weaves the S and steals the curve. Kiss a planet, thread the posts, live.',
    par: 3,
    pinBudget: 2,
    tee: { x: 300, y: 720 },
    hole: { x: 2050, y: 560 },
    bounds: { cx: 1175, cy: 620, rx: 1600, ry: 880 },
    bodies: [
      { id: 'castor', kind: 'attractor', x: 1050, y: 440, radius: 60, mu: 4.5e6, influenceR: 470, material: 'rock' },
      { id: 'pollux', kind: 'attractor', x: 1550, y: 1000, radius: 60, mu: 4.5e6, influenceR: 470, material: 'rock' },
    ],
    hazards: [
      // the saddle gate: two posts straddling the flat lane through the saddle
      { id: 'post1', kind: 'bumper', x: 1290, y: 610, r: 24, boost: 220 },
      { id: 'post2', kind: 'bumper', x: 1330, y: 770, r: 24, boost: 220 },
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
    hint: 'Weave the saddle posts: Castor\u2019s pull lifts you over the first, Pollux\u2019s pulls you down past the second.',
  },
];
