// ORBITAL — Region 3: THE GIANTS (L15–L21).
// Huge bodies (mu 2e7–3.2e7), long arcs, awe — and motion: a shepherd moon
// circles the Titan, a moonlet rides Beta's lap, a comet crosses the Deep Field
// where a wormhole pair offers the only sane skip. The Artery is a corridor
// star: chamber walls leave one slit, and the slit rides the flow. Machines,
// molten hearts, faint organic dust. Pins 1–2, par 3–5. Milo arc: suspicious.
import type { LevelDef } from '../sim';

export const R3_LEVELS: LevelDef[] = [
  {
    id: 'L15',
    name: 'The Giant',
    region: 3,
    concept:
      'One enormous mass fills half the sky: too big to fight, so you give in. The par route is a long, ' +
      'patient orbit around the Titan\u2019s limb — the green sits on the swing-out, and a shepherd moon ' +
      'circles the top lane, so even the lob must be timed.',
    par: 3,
    pinBudget: 2,
    tee: { x: 300, y: 780 },
    hole: { x: 1620, y: 1180 },
    bounds: { cx: 1075, cy: 740, rx: 1430, ry: 880 },
    hazards: [
      // the ring shard: a broken arc of the Titan's ring — walls the fast
      // upper-limb skim; the honest way in is under the limb
      { id: 'shard', kind: 'barrier', a: { x: 1050, y: 530 }, b: { x: 1300, y: 560 } },
    ],
    bodies: [
      { id: 'titan', kind: 'attractor', x: 1250, y: 760, radius: 170, mu: 3.2e7, influenceR: 1100, material: 'gas' },
      // The crown: a massless housing at the orbit's apex — direct lobs over the
      // top get dragged down into the grip (the honest way in).
      { id: 'crown', kind: 'anchor', x: 1250, y: 330, radius: 0, mu: 2.5e6, influenceR: 320, material: 'rock' },
      // The shepherd: a moon on a circular orbit of the Titan — it grazes the
      // over-the-top lane every lap, timing any direct lob.
      {
        id: 'shep', kind: 'path', x: 997, y: 1107, radius: 36, mu: 2.2e6, influenceR: 300, material: 'rock',
        path: { parent: 'titan', r: 430, speed: 0.3, phase: 2.2 },
      },
    ],
    fragments: [
      { x: 1250, y: 300 }, // high apex, deep in the giant\u2019s grip
      { x: 1850, y: 700 }, // the swing-out line
      { x: 700, y: 1100 }, // low entry, under the sag
    ],
    objectives: [{ id: 'o1', kind: 'orbit', text: 'Complete an orbit of the Titan.' }],
    story: [
      {
        id: 'st1',
        on: { type: 'start' },
        lines: [
          { who: 'coursekeeper', text: 'Asset 7. You are near the Cradle now. The Course grows... proud.' },
          { who: 'milo', text: 'Proud. Sure. It\u2019s a rock.' },
        ],
      },
      {
        id: 'st2',
        on: { type: 'zone', x: 1250, y: 300, r: 300 },
        lines: [
          { who: 'milo', text: 'Okay. It is not just a rock.' },
        ],
      },
      {
        id: 'st3',
        on: { type: 'sink' },
        lines: [
          { who: 'announcer', text: 'Around the TITAN and in! The crowd— ...the crowd is gone. Play on!' },
        ],
      },
    ],
    hint: 'Give in to the pull: enter low, swing the limb, release on the swing-out — and mind when the shepherd comes around.',
  },
  {
    id: 'L16',
    name: 'Pinball Orbit',
    region: 3,
    concept:
      'A paired engine — one star consents, its twin refuses: the fairway is the seam between yes and no. ' +
      'At the seam\u2019s heart a flipper field inverts everything it touches: cross it and Consent\u2019s pull becomes ' +
      'a shove, Refusal\u2019s shove becomes a grab — the dive off the flip is what Refusal rejects onto the green.',
    par: 3,
    pinBudget: 1,
    tee: { x: 300, y: 720 },
    hole: { x: 2100, y: 700 },
    bounds: { cx: 1200, cy: 635, rx: 1640, ry: 880 },
    bodies: [
      { id: 'yes', kind: 'attractor', x: 1000, y: 450, radius: 70, mu: 6.5e6, influenceR: 500, material: 'metal' },
      { id: 'no', kind: 'repulsor', x: 1500, y: 1000, radius: 70, mu: 5e6, influenceR: 500, material: 'metal' },
    ],
    hazards: [
      { id: 'flipper', kind: 'bumper', x: 1600, y: 640, r: 26, boost: 200 },
      // the home-stretch kiss: banks a hot seam exit down onto the green
      { id: 'kiss2', kind: 'bumper', x: 1800, y: 520, r: 22, boost: 160 },
    ],
    zones: [
      // THE SEAM FLIP: inside this disc every field inverts — pull becomes shove,
      // shove becomes grab. The pinball table\u2019s flipper, in gravity form.
      { id: 'seam', kind: 'flipper', x: 1250, y: 720, radius: 140 },
    ],
    fragments: [
      { x: 1000, y: 200 }, // above Consent
      { x: 1500, y: 720 }, // the seam itself, between pull and push
      { x: 1850, y: 500 }, // post-flipper line
    ],
    objectives: [{ id: 'o1', kind: 'touch', targetId: 'flipper', text: 'Flip off the Flipper.' }],
    story: [
      {
        id: 'st1',
        on: { type: 'start' },
        lines: [
          { who: 'coursekeeper', text: 'Twin engines: Consent and Refusal. The fairway is the seam between them.' },
        ],
      },
      {
        id: 'st2',
        on: { type: 'zone', x: 1500, y: 720, r: 220 },
        lines: [
          { who: 'milo', text: 'One of you needs to make up its mind. I\u2019m getting whiplash.' },
        ],
      },
      {
        id: 'st3',
        on: { type: 'sink' },
        lines: [
          { who: 'announcer', text: 'Off the flipper — PINNED! Pinball golf, folks!' },
        ],
      },
    ],
    hint: 'Ride the seam into the flip disc — inside it everything reverses. A hot dive off the flip is the ace; Refusal flattens it onto the cup.',
  },
  {
    id: 'L17',
    name: 'The Artery',
    region: 3,
    concept:
      'An ancient conduit still pumps through the dark, and the chamber walls leave exactly one slit: the ' +
      'slit rides the flow. Enter the Artery slow, let it grab you to the axis and accelerate you through ' +
      'the gate — skirting the pipe is death on the walls, and the exit choice is the Valve bank or the drop.',
    par: 3,
    pinBudget: 2,
    tee: { x: 300, y: 720 },
    hole: { x: 1860, y: 790 },
    bounds: { cx: 1143, cy: 685, rx: 1390, ry: 660 },
    bodies: [
      // the lintel-eye: massless housings over the gate — high lobs get pulled in
      { id: 'eye', kind: 'anchor', x: 1250, y: 280, radius: 0, mu: 1.8e6, influenceR: 260, material: 'machine' },
    ],
    zones: [
      {
        id: 'artery', kind: 'corridor', a: { x: 850, y: 640 }, b: { x: 1700, y: 660 },
        corridorR: 110, accel: 0.5, dir: 1,
      },
    ],
    hazards: [
      // the chamber walls: the only way through is the slit on the flow\u2019s axis
      { id: 'lintel', kind: 'barrier', a: { x: 1250, y: 330 }, b: { x: 1250, y: 580 } },
      { id: 'sill', kind: 'barrier', a: { x: 1250, y: 700 }, b: { x: 1250, y: 930 } },
      // the Valve: the over-swing catcher and the bank line home
      { id: 'valve', kind: 'bumper', x: 1900, y: 560, r: 26, boost: 120 },
    ],
    fragments: [
      { x: 1000, y: 560 }, // upper edge of the flow — steer against the spring
      { x: 1500, y: 810 }, // lower edge of the flow, past the sill
      { x: 1960, y: 540 }, // the Valve bank line
    ],
    objectives: [{ id: 'o1', kind: 'pinsMax', value: 1, text: 'No pin — let the Artery provide.' }],
    story: [
      {
        id: 'st1',
        on: { type: 'start' },
        lines: [
          { who: 'coursekeeper', text: 'The Artery fed the whole Course once. Listen. It still pumps.' },
        ],
      },
      {
        id: 'st2',
        on: { type: 'zone', x: 1250, y: 720, r: 300 },
        lines: [
          { who: 'milo', text: 'Okay, this is the pleasant one. I approve of the pleasant one.' },
        ],
      },
      {
        id: 'st3',
        on: { type: 'zone', x: 1700, y: 720, r: 200 },
        lines: [
          { who: 'log', text: 'LOG 301 — arterial pressure falling. Estimated failure: soon.' },
        ],
      },
    ],
    hint: 'Aim up into the mouth at the pipe\u2019s start — the flow grabs you to its axis and carries you through the slit.',
  },
  {
    id: 'L18',
    name: 'Figure Eight',
    region: 3,
    concept:
      'THE REGION\u2019S WOW-MOMENT: two giants trade custody of your ball. One lap of Alpha, through the ' +
      'crossing, one lap of Beta — now with a moonlet riding Beta\u2019s lap and wreck-scatter drifting through ' +
      'the crossing — released at the seam: the knot in the old trail murals, flown for real.',
    par: 3,
    pinBudget: 2,
    tee: { x: 300, y: 780 },
    hole: { x: 1980, y: 560 },
    bounds: { cx: 1140, cy: 750, rx: 1530, ry: 1120 },
    bodies: [
      { id: 'alpha', kind: 'attractor', x: 950, y: 450, radius: 120, mu: 2.6e7, influenceR: 900, material: 'gas' },
      { id: 'beta', kind: 'attractor', x: 1650, y: 1050, radius: 120, mu: 2.2e7, influenceR: 900, material: 'ice' },
      // the moonlet: rides Beta\u2019s lap, sweeping the second loop
      {
        id: 'moonlet', kind: 'path', x: 1859, y: 1265, radius: 30, mu: 1.8e6, influenceR: 260, material: 'ice',
        path: { parent: 'beta', r: 300, speed: -0.35, phase: 0.8 },
      },
    ],
    debris: [
      { x: 1290, y: 740, r: 8, vx: 3, vy: -2 },
      { x: 1330, y: 790, r: 7, vx: -2, vy: 3 },
    ],
    fragments: [
      { x: 1300, y: 750 }, // THE crossing — the money shot
      { x: 950, y: 180 }, // Alpha loop apex
      { x: 1650, y: 1320 }, // Beta loop nadir
    ],
    objectives: [{ id: 'o1', kind: 'orbit', text: 'Get captured by both giants — one full lap.' }],
    story: [
      {
        id: 'st1',
        on: { type: 'start' },
        lines: [
          { who: 'coursekeeper', text: 'The giants have been waiting to meet you, Asset 7. Both of them. By name.' },
        ],
      },
      {
        id: 'st2',
        on: { type: 'zone', x: 1300, y: 750, r: 220 },
        lines: [
          { who: 'milo', text: 'Wait. I know this maneuver. It\u2019s the knot from the trail murals. I\u2019M the knot.' },
        ],
      },
      {
        id: 'st3',
        on: { type: 'sink' },
        lines: [
          { who: 'announcer', text: 'A FIGURE EIGHT! The crowd would have LOVED that! Where IS the crowd?' },
        ],
      },
    ],
  },
  {
    id: 'L19',
    name: 'The Forge',
    region: 3,
    concept:
      'A dead forge still breathes: bellows of compressed gravity above, quench-baths of syrup below — one ' +
      'at the green\u2019s door — and the molten Heart in the middle SURGES as it punishes every lazy line. ' +
      'An anvil bumper posts the high crest. Amp/damp fields shape the route.',
    par: 4,
    pinBudget: 1,
    tee: { x: 300, y: 720 },
    hole: { x: 1950, y: 640 },
    bounds: { cx: 1125, cy: 735, rx: 1510, ry: 800 },
    bodies: [
      {
        id: 'heart', kind: 'unstable', x: 1200, y: 700, radius: 80, mu: 4e6, influenceR: 450, material: 'molten',
        muMin: 2.5e6, muMax: 6.5e6, wanderT: 1.3, deadly: true,
      },
    ],
    zones: [
      { id: 'bellows', kind: 'amp', x: 850, y: 500, radius: 220, strength: 2.0 },
      { id: 'quench', kind: 'damp', x: 1550, y: 900, radius: 230, strength: 0.45 },
      // the second quench: dead gravity at the cup\u2019s door — arrive with pace, no borrowed finishes
      { id: 'quench2', kind: 'damp', x: 1790, y: 620, radius: 190, strength: 0.42 },
    ],
    hazards: [
      // the anvil: kisses or kills the high crest line over the Heart
      { id: 'anvil', kind: 'bumper', x: 1450, y: 460, r: 24, boost: 180 },
    ],
    fragments: [
      { x: 850, y: 340 }, // inside the bellows
      { x: 1550, y: 1060 }, // deep in the quench
      { x: 1200, y: 430 }, // the risky high pass over the Heart
    ],
    objectives: [{ id: 'o1', kind: 'noHazard', text: 'Do not touch the Heart.' }],
    story: [
      {
        id: 'st1',
        on: { type: 'start' },
        lines: [
          { who: 'coursekeeper', text: 'The Forge quenched every club of the Open. It is cold now. Mostly.' },
        ],
      },
      {
        id: 'st2',
        on: { type: 'zone', x: 850, y: 500, r: 240 },
        lines: [
          { who: 'milo', text: 'Whoever left the bellows on: I have notes.' },
        ],
      },
      {
        id: 'st3',
        on: { type: 'zone', x: 1550, y: 900, r: 220 },
        lines: [
          { who: 'milo', text: 'Slow and syrupy. Good. I hated going that fast anyway.' },
        ],
      },
      {
        id: 'st4',
        on: { type: 'sink' },
        lines: [
          { who: 'log', text: 'LOG 408 — forge heart set to low, by request of the Calibration Department.' },
        ],
      },
    ],
    hint: 'Read the Heart\u2019s surge, ride the bellows over the crest — and strike the finish with pace, the quench kills borrowed rolls.',
  },
  {
    id: 'L20',
    name: 'Deep Field',
    region: 3,
    concept:
      'Between the giants the fields fade to almost nothing — except the Breach, a lone well mid-field that ' +
      'bends every flat line into it, and the Comet that crosses the whole fairway on its rounds. Vast bounds, ' +
      'faint organic dust, momentum dominant — power control, a dust-wisp bank, or the suture: a wormhole ' +
      'pair that is the only sane skip past the Breach.',
    par: 4,
    pinBudget: 2,
    tee: { x: 300, y: 700 },
    hole: { x: 2600, y: 700 },
    bounds: { cx: 1450, cy: 640, rx: 2080, ry: 660 },
    bodies: [
      { id: 'dust1', kind: 'attractor', x: 1100, y: 500, radius: 30, mu: 5e5, influenceR: 380, material: 'organic' },
      { id: 'dust2', kind: 'attractor', x: 1800, y: 900, radius: 30, mu: 5e5, influenceR: 380, material: 'organic' },
      // the Breach: a lone mid-field well — thread it or skip it
      { id: 'breach', kind: 'anchor', x: 1750, y: 700, radius: 0, mu: 3e6, influenceR: 520, material: 'organic' },
      // the Comet: crosses the whole fairway, forever
      {
        id: 'comet', kind: 'path', x: 900, y: 1000, radius: 26, mu: 1.5e6, influenceR: 260, material: 'ice',
        path: { points: [{ x: 900, y: 1000 }, { x: 2300, y: 400 }], speed: 70, mode: 'loop' },
      },
    ],
    wormholes: [
      // the suture: enter above the Breach, exit below the green\u2019s approach
      { id: 'w1', x: 1500, y: 330, r: 34, exitId: 'w2', angleDelta: -0.5 },
      { id: 'w2', x: 2150, y: 1010, r: 34, exitId: 'w1' },
    ],
    fragments: [
      { x: 1100, y: 350 }, // above the first dust wisp
      { x: 1800, y: 720 }, // the mid-field saddle, on the Breach\u2019s rim
      { x: 2300, y: 550 }, // the late-drift line
    ],
    objectives: [{ id: 'o1', kind: 'pinsMax', value: 1, text: 'Sink with at most one pin of your own.' }],
    story: [
      {
        id: 'st1',
        on: { type: 'start' },
        lines: [
          { who: 'coursekeeper', text: 'The Deep Field. The Course\u2019s oldest silence. Even I do not listen here.' },
        ],
      },
      {
        id: 'st2',
        on: { type: 'zone', x: 1450, y: 640, r: 400 },
        lines: [
          { who: 'milo', text: 'It\u2019s so quiet out here I can hear my own seams creak.' },
        ],
      },
      {
        id: 'st3',
        on: { type: 'zone', x: 1800, y: 900, r: 240 },
        lines: [
          { who: 'sprocket', text: 'Bzzt. (the drone\u2019s beep comes back three seconds later, echoed)' },
        ],
      },
      {
        id: 'st4',
        on: { type: 'sink' },
        lines: [
          { who: 'announcer', text: '...is this thing on? HELLO? ...oh. THEY\u2019RE IN.' },
        ],
      },
    ],
    hint: 'Three roads: bank the dust past the Breach, time the Comet\u2019s crossing, or dive the suture and pop out by the green.',
  },
  {
    id: 'L21',
    name: 'The Sequence',
    region: 3,
    concept:
      'THE MACHINE: the last working lock. Three latches, one order — wake the conduit in sequence and ' +
      'the artery assembles beneath the Warden to carry you to the green; a dead vent yawns under the line ' +
      'to swallow overskips. Out of order, the machine forgets you.',
    par: 4,
    pinBudget: 2,
    tee: { x: 300, y: 720 },
    hole: { x: 2160, y: 935 },
    bounds: { cx: 1230, cy: 770, rx: 1700, ry: 930 },
    bodies: [
      { id: 'warden', kind: 'attractor', x: 1250, y: 720, radius: 65, mu: 2.5e6, influenceR: 420, material: 'machine' },
    ],
    switches: [
      { id: 's1', x: 800, y: 460, r: 20, mode: 'once', targets: ['c1'] },
      { id: 's2', x: 1250, y: 1000, r: 20, mode: 'once', targets: ['c2'] },
      { id: 's3', x: 1750, y: 520, r: 20, mode: 'once', targets: ['c3'] },
    ],
    sequence: ['s1', 's2', 's3'],
    zones: [
      {
        id: 'c1', kind: 'corridor', a: { x: 850, y: 940 }, b: { x: 1250, y: 940 },
        corridorR: 80, accel: 0.2, dir: 1, gate: { switchId: 's1' },
      },
      {
        id: 'c2', kind: 'corridor', a: { x: 1250, y: 940 }, b: { x: 1650, y: 940 },
        corridorR: 80, accel: 0.2, dir: 1, gate: { switchId: 's2' },
      },
      {
        id: 'c3', kind: 'corridor', a: { x: 1650, y: 940 }, b: { x: 2050, y: 940 },
        corridorR: 80, accel: 0.2, dir: 1, gate: { switchId: 's3' },
      },
      // the vent: a dead-gravity well under the line — overskips die there
      { id: 'vent', kind: 'void', x: 1900, y: 1120, radius: 150, strength: 1 },
    ],
    fragments: [
      { x: 800, y: 300 }, // above latch one
      { x: 1250, y: 1240 }, // below latch two
      { x: 1750, y: 300 }, // above latch three
    ],
    objectives: [{ id: 'o1', kind: 'touch', targetId: 'warden', text: 'Leave your mark on the Warden.' }],
    story: [
      {
        id: 'st1',
        on: { type: 'start' },
        lines: [
          { who: 'coursekeeper', text: 'Sequence evaluation. The lock was built for someone who knew the order. Do you know the order, Asset 7?' },
          { who: 'milo', text: '...should I?' },
        ],
      },
      {
        id: 'st2',
        on: { type: 'zone', x: 1250, y: 1000, r: 200 },
        lines: [
          { who: 'milo', text: 'Whoever drilled these latches knew my exact hook. That\u2019s a strange thing to know.' },
        ],
      },
      {
        id: 'st3',
        on: { type: 'sink' },
        lines: [
          { who: 'coursekeeper', text: 'Sequence accepted. Noted. Recorded.' },
          { who: 'milo', text: 'Recorded where? WHO\u2019S READING THIS?' },
        ],
      },
    ],
    hint: 'Latch one, two, three — the conduits only assemble in order, and the vent under the line keeps honest score.',
  },
];
