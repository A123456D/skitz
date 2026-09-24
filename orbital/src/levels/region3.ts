// ORBITAL — Region 3: THE GIANTS (L15–L21).
// Huge bodies (mu 2e7–3.2e7), long arcs, awe. Machines, molten hearts, faint
// organic dust. Pins 1–2, par 3–5. Milo arc: suspicious.
import type { LevelDef } from '../sim';

export const R3_LEVELS: LevelDef[] = [
  {
    id: 'L15',
    name: 'The Giant',
    region: 3,
    concept:
      'One enormous mass fills half the sky: too big to fight, so you give in. ' +
      'The par route is a long, patient orbit around the Titan\u2019s limb — the green sits on the swing-out.',
    par: 4,
    pinBudget: 2,
    tee: { x: 300, y: 780 },
    hole: { x: 1620, y: 1180 },
    bounds: { cx: 1075, cy: 740, rx: 1430, ry: 880 },
    bodies: [
      { id: 'titan', kind: 'attractor', x: 1250, y: 760, radius: 170, mu: 2.6e7, influenceR: 1100, material: 'gas' },
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
  },
  {
    id: 'L16',
    name: 'Pinball Orbit',
    region: 3,
    concept:
      'A paired engine — one star consents, its twin refuses: the fairway is the seam between yes and no. ' +
      'Ride the shear, then flip off the Flipper on the way home. Attract/repel pinball.',
    par: 3,
    pinBudget: 1,
    tee: { x: 300, y: 720 },
    hole: { x: 2100, y: 700 },
    bounds: { cx: 1200, cy: 635, rx: 1640, ry: 880 },
    bodies: [
      { id: 'yes', kind: 'attractor', x: 1000, y: 450, radius: 70, mu: 5e6, influenceR: 500, material: 'metal' },
      { id: 'no', kind: 'repulsor', x: 1500, y: 1000, radius: 70, mu: 5e6, influenceR: 500, material: 'metal' },
    ],
    hazards: [{ id: 'flipper', kind: 'bumper', x: 1600, y: 640, r: 26, boost: 200 }],
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
  },
  {
    id: 'L17',
    name: 'The Artery',
    region: 3,
    concept:
      'An ancient conduit still pumps through the dark: enter the Artery slow and let it carry you — ' +
      'the exit choice is yours. The gentle plumbing ride, or the hot lane banked off the Valve.',
    par: 3,
    pinBudget: 2,
    tee: { x: 300, y: 720 },
    hole: { x: 1770, y: 715 },
    bounds: { cx: 1143, cy: 685, rx: 1390, ry: 390 },
    bodies: [],
    zones: [
      {
        id: 'artery', kind: 'corridor', a: { x: 900, y: 720 }, b: { x: 1700, y: 720 },
        corridorR: 110, accel: 0.3, dir: 1,
      },
    ],
    hazards: [{ id: 'valve', kind: 'bumper', x: 1900, y: 560, r: 26, boost: 120 }],
    fragments: [
      { x: 1000, y: 640 }, // upper edge of the flow — steer against the spring
      { x: 1500, y: 810 }, // lower edge of the flow
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
  },
  {
    id: 'L18',
    name: 'Figure Eight',
    region: 3,
    concept:
      'THE REGION\u2019S WOW-MOMENT: two giants trade custody of your ball. One lap of Alpha, through the ' +
      'crossing, one lap of Beta, released at the seam — the knot in the old trail murals, flown for real.',
    par: 4,
    pinBudget: 2,
    tee: { x: 300, y: 780 },
    hole: { x: 1980, y: 560 },
    bounds: { cx: 1140, cy: 750, rx: 1530, ry: 1120 },
    bodies: [
      { id: 'alpha', kind: 'attractor', x: 950, y: 450, radius: 120, mu: 2.2e7, influenceR: 900, material: 'gas' },
      { id: 'beta', kind: 'attractor', x: 1650, y: 1050, radius: 120, mu: 2.2e7, influenceR: 900, material: 'ice' },
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
      'A dead forge still breathes: bellows of compressed gravity above, quench-baths of syrup below, ' +
      'and the molten Heart in the middle punishes every lazy line. Amp/damp fields shape the route.',
    par: 4,
    pinBudget: 1,
    tee: { x: 300, y: 720 },
    hole: { x: 1950, y: 640 },
    bounds: { cx: 1125, cy: 735, rx: 1510, ry: 800 },
    bodies: [
      { id: 'heart', kind: 'attractor', x: 1200, y: 700, radius: 80, mu: 4e6, influenceR: 450, material: 'molten', deadly: true },
    ],
    zones: [
      { id: 'bellows', kind: 'amp', x: 850, y: 500, radius: 220, strength: 2.0 },
      { id: 'quench', kind: 'damp', x: 1550, y: 900, radius: 230, strength: 0.45 },
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
  },
  {
    id: 'L20',
    name: 'Deep Field',
    region: 3,
    concept:
      'Between the giants the fields fade to almost nothing: one perfect strike and you glide forever. ' +
      'Vast bounds, faint organic dust, momentum dominant — power control is the whole game.',
    par: 4,
    pinBudget: 2,
    tee: { x: 300, y: 700 },
    hole: { x: 2600, y: 700 },
    bounds: { cx: 1450, cy: 640, rx: 2080, ry: 600 },
    bodies: [
      { id: 'dust1', kind: 'attractor', x: 1100, y: 500, radius: 30, mu: 5e5, influenceR: 380, material: 'organic' },
      { id: 'dust2', kind: 'attractor', x: 1800, y: 900, radius: 30, mu: 5e5, influenceR: 380, material: 'organic' },
    ],
    fragments: [
      { x: 1100, y: 350 }, // above the first dust wisp
      { x: 1800, y: 720 }, // the mid-field saddle
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
  },
  {
    id: 'L21',
    name: 'The Sequence',
    region: 3,
    concept:
      'THE MACHINE: the last working lock. Three latches, one order — wake the conduit in sequence and ' +
      'the artery assembles beneath the Warden to carry you to the green. Out of order, the machine forgets you.',
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
  },
];
