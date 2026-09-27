// ORBITAL — Region 2: THE GRAVEYARD (L08–L14).
// Wrecks, debris, unease — every hole is hostile now: barrier ribs cage the
// derelict, a third blade sweeps the green approach, the storm kills on touch
// above a no-go void well, the Wanderer runs a dogleg, the bait gate is spiked,
// and the moving green meets you only where the lens and gongs allow.
// Materials machine/metal (the fleet that lost the Grand Open). Pins 1–2,
// par 3–4. Milo: curious.
import type { LevelDef } from '../sim';

export const R2_LEVELS: LevelDef[] = [
  {
    id: 'L08',
    name: 'Driftwood',
    region: 2,
    concept:
      'A caged derelict in a drifting wreck-scatter: three broken ribs of the hulk\u2019s superstructure ' +
      'wall the high approach, the over-the-top lane, and the low skim-exit, so the only line is the ' +
      'bank OFF the hulk\u2019s hull itself — debris as weather, the dead station as tool.',
    par: 3,
    pinBudget: 1,
    tee: { x: 300, y: 720 },
    hole: { x: 2060, y: 560 },
    bounds: { cx: 1150, cy: 665, rx: 1560, ry: 620 },
    bodies: [
      { id: 'hulk', kind: 'attractor', x: 1200, y: 700, radius: 75, mu: 7e6, influenceR: 560, material: 'machine' },
    ],
    hazards: [
      // the rib cage: high-left approach, over-the-top lane, low skim-exit
      { id: 'rib1', kind: 'barrier', a: { x: 980, y: 470 }, b: { x: 1180, y: 520 } },
      { id: 'rib2', kind: 'barrier', a: { x: 1450, y: 430 }, b: { x: 1600, y: 470 } },
      { id: 'rib3', kind: 'barrier', a: { x: 1420, y: 860 }, b: { x: 1600, y: 810 } },
      // the block: rounds off the slow diver's exit under rib3
      { id: 'block', kind: 'bumper', x: 1650, y: 830, r: 30, boost: 240 },
    ],
    debris: [
      { x: 850, y: 600, r: 12, vx: 8, vy: -4 },
      { x: 950, y: 840, r: 10, vx: -6, vy: 6 },
      { x: 1250, y: 450, r: 9, vx: 4, vy: 8 },
      { x: 1500, y: 900, r: 13, vx: -8, vy: -5 },
      { x: 1700, y: 600, r: 8, vx: 5, vy: 5 },
      { x: 1520, y: 760, r: 16, vx: -4, vy: -3 },
    ],
    fragments: [
      { x: 1200, y: 380 }, // over the hulk, through the drifting stones
      { x: 1520, y: 950 }, // deep in the lower scatter
      { x: 820, y: 560 }, // high entry lane past the first rib
    ],
    objectives: [{ id: 'o1', kind: 'touch', targetId: 'hulk', text: 'Leave a dent on the derelict.' }],
    story: [
      {
        id: 'st1',
        on: { type: 'start' },
        lines: [
          { who: 'coursekeeper', text: 'Salvage sector. The fleet that lost the Grand Open still drifts here.' },
        ],
      },
      {
        id: 'st2',
        on: { type: 'zone', x: 950, y: 840, r: 200 },
        lines: [
          { who: 'milo', text: 'Who wrecks an entire armada... playing golf?' },
        ],
      },
      {
        id: 'st3',
        on: { type: 'zone', x: 1500, y: 900, r: 180 },
        lines: [
          { who: 'sprocket', text: 'Bzzt! (the drone winds through the debris like it\u2019s home)' },
        ],
      },
      {
        id: 'st4',
        on: { type: 'sink' },
        lines: [
          { who: 'log', text: 'LOG 209 — hull scars match regulation dimple patterns. Curious.' },
        ],
      },
    ],
    hint: 'The ribs own the sky and the low road. Skim the hulk\u2019s hull itself — let the capture shed your speed.',
  },
  {
    id: 'L09',
    name: 'The Wreck',
    region: 2,
    concept:
      'A broken station\u2019s defense grid still spins: two counter-rotating blades share one hub, and a ' +
      'third sweeper patrols the green approach behind them. The only way through is THE TINY GAP between ' +
      'the scissors — read both rotations, pick your second.',
    par: 3,
    pinBudget: 1,
    tee: { x: 300, y: 720 },
    hole: { x: 1850, y: 700 },
    bounds: { cx: 1075, cy: 720, rx: 1420, ry: 400 },
    bodies: [
      { id: 'station', kind: 'attractor', x: 1200, y: 700, radius: 45, mu: 3.5e6, influenceR: 420, material: 'machine' },
    ],
    hazards: [
      { id: 'b1', kind: 'beam', x: 1200, y: 700, len: 200, r: 12, spin: 0.9 },
      { id: 'b2', kind: 'beam', x: 1200, y: 700, len: 200, r: 12, spin: -0.65, phase: 2.4 },
      // the approach sweeper: crossing the scissors only buys you the next gate
      { id: 'b3', kind: 'beam', x: 1640, y: 620, len: 100, r: 9, spin: 1.3 },
    ],
    debris: [
      { x: 1400, y: 800, r: 7, vx: 4, vy: -3 },
      { x: 1350, y: 580, r: 6, vx: -3, vy: 4 },
    ],
    fragments: [
      { x: 1370, y: 540 }, // inside the blade sweep — timed run
      { x: 950, y: 900 }, // low entry lane
      { x: 1620, y: 560 }, // past the scissors, inside the sweeper's reach
    ],
    objectives: [{ id: 'o1', kind: 'noHazard', text: 'Cross the scissors untouched.' }],
    story: [
      {
        id: 'st1',
        on: { type: 'start' },
        lines: [
          { who: 'coursekeeper', text: 'Defense grid armed since the Open. It never received the ceasefire.' },
        ],
      },
      {
        id: 'st2',
        on: { type: 'firstBounce' },
        lines: [
          { who: 'milo', text: 'It\u2019s still guarding a golf course. From golfers. With scissors.' },
        ],
      },
      {
        id: 'st3',
        on: { type: 'zone', x: 1370, y: 540, r: 180 },
        lines: [
          { who: 'sprocket', text: 'Bzzt! Bzzt! (the drone times the blades and beeps twice — now)' },
        ],
      },
      {
        id: 'st4',
        on: { type: 'sink' },
        lines: [
          { who: 'announcer', text: 'THREADED THEM BOTH! Unbelievable, folks!' },
        ],
      },
    ],
  },
  {
    id: 'L10',
    name: 'Bad Weather',
    region: 2,
    concept:
      'One storming flare-star cannot decide how heavy it is — and it kills on contact: read the surging ' +
      'field, launch into the lull, and skim as close as your nerve allows. Below, the safe-looking murk ' +
      'is syrup, and a dead void well short of the green swallows every lazy approach.',
    par: 3,
    pinBudget: 1,
    tee: { x: 300, y: 720 },
    hole: { x: 2060, y: 540 },
    bounds: { cx: 1150, cy: 790, rx: 1560, ry: 880 },
    bodies: [
      {
        id: 'storm', kind: 'unstable', x: 1200, y: 720, radius: 70, mu: 6e6, influenceR: 550, material: 'molten',
        muMin: 3.5e6, muMax: 8.5e6, wanderT: 1.0, deadly: true,
      },
    ],
    zones: [
      { id: 'murk', kind: 'damp', x: 1500, y: 1000, radius: 230, strength: 0.45 },
      // the no-go well: dead gravity short of the green — no borrowed finishes
      { id: 'well', kind: 'void', x: 1560, y: 780, radius: 170, strength: 1 },
    ],
    fragments: [
      { x: 1200, y: 350 }, // high over the storm — bend depth is the bet
      { x: 1450, y: 1000 }, // deep in the murk
      { x: 820, y: 600 }, // entry lane
    ],
    objectives: [{ id: 'o1', kind: 'secret', x: 1300, y: 560, r: 70, text: 'Find the eye of the storm.' }],
    story: [
      {
        id: 'st1',
        on: { type: 'start' },
        lines: [
          { who: 'coursekeeper', text: 'Core instability logged three centuries ago. It has been \u2018temporary\u2019 ever since.' },
        ],
      },
      {
        id: 'st2',
        on: { type: 'zone', x: 1200, y: 500, r: 240 },
        lines: [
          { who: 'milo', text: 'Make up your mind — heavy or light! Some of us are ball-shaped!' },
        ],
      },
      {
        id: 'st3',
        on: { type: 'zone', x: 1450, y: 1000, r: 180 },
        lines: [
          { who: 'sprocket', text: 'Bzzzt... (the drone backs away from the murk, slowly)' },
        ],
      },
      {
        id: 'st4',
        on: { type: 'sink' },
        lines: [
          { who: 'announcer', text: 'Right through the storm cell! Play resumes! Nobody minds the weather!' },
        ],
      },
    ],
    hint: 'The well is dead and the murk is slow — the honest line rides the storm\u2019s mood at a skim.',
  },
  {
    id: 'L11',
    name: 'The Slingshot',
    region: 2,
    concept:
      'A wanderer has run this dogleg since the Open: high corner, then a plunge across the low field — ' +
      'two crossings of your fairway per lap. Launch while it blocks and it steals your ball; launch when ' +
      'it turns and its wake hands you to the green. Alignment — timing a moving planet.',
    par: 3,
    pinBudget: 1,
    tee: { x: 300, y: 720 },
    hole: { x: 2050, y: 660 },
    bounds: { cx: 1175, cy: 700, rx: 1600, ry: 910 },
    bodies: [
      {
        id: 'wanderer', kind: 'path', x: 700, y: 300, radius: 55, mu: 4.5e6, influenceR: 480, material: 'metal',
        path: {
          points: [{ x: 700, y: 300 }, { x: 1700, y: 500 }, { x: 1200, y: 1100 }],
          speed: 90, mode: 'pingpong',
        },
      },
    ],
    hazards: [{ id: 'bell', kind: 'bumper', x: 1350, y: 720, r: 30, boost: 260 }],
    debris: [
      { x: 1000, y: 420, r: 8, vx: 5, vy: 3 },
      { x: 1550, y: 750, r: 8, vx: -4, vy: 5 },
      { x: 1650, y: 950, r: 7, vx: -5, vy: -4 },
    ],
    fragments: [
      { x: 1150, y: 1200 }, // under the wanderer\u2019s plunge — risky when it dives
      { x: 1350, y: 950 }, // under the bell — the bank line
      { x: 1750, y: 420 }, // over the wanderer\u2019s high corner
    ],
    objectives: [{ id: 'o1', kind: 'touch', targetId: 'bell', text: 'Ring the crossing bell.' }],
    story: [
      {
        id: 'st1',
        on: { type: 'start' },
        lines: [
          { who: 'coursekeeper', text: 'The Wanderer has run its crossing since the Open. Do not argue with it. Time it.' },
        ],
      },
      {
        id: 'st2',
        on: { type: 'zone', x: 1350, y: 950, r: 200 },
        lines: [
          { who: 'announcer', text: 'The parade float crosses the fairway — WHAT timing, folks!' },
          { who: 'milo', text: 'That is not a parade float.' },
        ],
      },
      {
        id: 'st3',
        on: { type: 'sink' },
        lines: [
          { who: 'log', text: 'LOG 77 — who recalibrates the Wanderer\u2019s route each dawn? No entry.' },
        ],
      },
    ],
    hint: 'The high wake-line is the ace — and it only exists when the Wanderer is up. Time the dogleg; fire into its wake.',
  },
  {
    id: 'L12',
    name: 'The False Path',
    region: 2,
    concept:
      'The obvious lane is baited: two pretty lantern-stars funnel every careless ball through a spiked ' +
      'gate straight into the dead stove — the barrier across the throat makes the trap honest. The real ' +
      'line refuses the gate and swings wide through the lure\u2019s amplified sky.',
    par: 3,
    pinBudget: 1,
    tee: { x: 300, y: 720 },
    hole: { x: 1960, y: 700 },
    bounds: { cx: 1160, cy: 565, rx: 1580, ry: 780 },
    bodies: [
      { id: 'lantern1', kind: 'attractor', x: 1050, y: 640, radius: 30, mu: 3.5e6, influenceR: 400, material: 'ice' },
      { id: 'lantern2', kind: 'attractor', x: 1050, y: 820, radius: 30, mu: 3.5e6, influenceR: 400, material: 'ice' },
      // mu ~0: pure trap, all mouth.
      { id: 'stove', kind: 'attractor', x: 1450, y: 800, radius: 65, mu: 1e5, influenceR: 260, material: 'molten', deadly: true },
    ],
    hazards: [
      // the spike: seals the baited gate's throat — the funnel was never a route
      { id: 'spike', kind: 'barrier', a: { x: 1020, y: 690 }, b: { x: 1150, y: 760 } },
    ],
    zones: [{ id: 'lure', kind: 'amp', x: 1000, y: 380, radius: 200, strength: 2.2 }],
    fragments: [
      { x: 1450, y: 560 }, // the greedy pass between gate and stove
      { x: 1000, y: 300 }, // inside the lure — the wide line
      { x: 1750, y: 950 }, // low survivor lane, past the funnel
    ],
    objectives: [{ id: 'o1', kind: 'noHazard', text: 'Refuse the bait — no ball in the stove.' }],
    story: [
      {
        id: 'st1',
        on: { type: 'start' },
        lines: [
          { who: 'coursekeeper', text: 'Two routes, Asset 7. One of them was never a route.' },
        ],
      },
      {
        id: 'st2',
        on: { type: 'zone', x: 1050, y: 730, r: 180 },
        lines: [
          { who: 'milo', text: 'A perfect little gate. Practically glittering. Yeah, no.' },
        ],
      },
      {
        id: 'st3',
        on: { type: 'zone', x: 1380, y: 720, r: 140 },
        lines: [
          { who: 'log', text: 'LOG 156 — why did we bait our own fairway? (no answer recorded)' },
        ],
      },
      {
        id: 'st4',
        on: { type: 'sink' },
        lines: [
          { who: 'announcer', text: 'The long way IS the fast way, folks! Write that down!' },
        ],
      },
    ],
  },
  {
    id: 'L13',
    name: 'The Cascade',
    region: 2,
    concept:
      'THE CASCADE — the region\u2019s wow-moment: brush the crane\u2019s trigger and the machine wakes in a chain — ' +
      'keystone wakes, the counterweight falls, the second latch fires, and the dead conduit to the green begins to flow. ' +
      'One shot can spring the whole sequence and ride it home.',
    par: 3,
    pinBudget: 2,
    tee: { x: 300, y: 720 },
    hole: { x: 2050, y: 780 },
    bounds: { cx: 1175, cy: 722, rx: 1600, ry: 580 },
    bodies: [
      { id: 'crane', kind: 'attractor', x: 1000, y: 500, radius: 55, mu: 5e6, influenceR: 460, material: 'machine' },
      // Gated anchor: mass without surface. Asleep until s1.
      {
        id: 'keystone', kind: 'anchor', x: 1500, y: 940, radius: 0, mu: 3.5e6, influenceR: 380, material: 'machine',
        gate: { switchId: 's1' },
      },
    ],
    debris: [{ x: 1500, y: 660, r: 10 }], // the counterweight: falls to s2 when the keystone wakes
    switches: [
      { id: 's1', x: 760, y: 620, r: 20, mode: 'once', targets: ['keystone'] },
      { id: 's2', x: 1500, y: 800, r: 18, mode: 'once', targets: ['c1'] },
    ],
    zones: [
      {
        id: 'c1', kind: 'corridor', a: { x: 1560, y: 720 }, b: { x: 1800, y: 735 },
        corridorR: 90, accel: 0.8, dir: 1, gate: { switchId: 's2' },
      },
    ],
    fragments: [
      { x: 1000, y: 860 }, // under the crane, at the pin line
      { x: 1400, y: 480 }, // above the falling weight
      { x: 1750, y: 600 }, // over the dead conduit
    ],
    objectives: [{ id: 'o1', kind: 'secret', x: 1000, y: 940, r: 60, text: 'Inspect the machine\u2019s underside.' }],
    story: [
      {
        id: 'st1',
        on: { type: 'start' },
        lines: [
          { who: 'coursekeeper', text: 'That crane held the Open\u2019s grandstand cable. It remembers its work. Remind it.' },
        ],
      },
      {
        id: 'st2',
        on: { type: 'zone', x: 1000, y: 860, r: 200 },
        lines: [
          { who: 'milo', text: 'Hey, big machine. Catch.' },
        ],
      },
      {
        id: 'st3',
        on: { type: 'zone', x: 1500, y: 800, r: 180 },
        lines: [
          { who: 'sprocket', text: 'BZZT!! (the drone loses its mind as the conduit lights up)' },
        ],
      },
      {
        id: 'st4',
        on: { type: 'sink' },
        lines: [
          { who: 'coursekeeper', text: 'Conduit restored. The Course thanks Asset 7.' },
          { who: 'milo', text: 'Milo. But sure.' },
        ],
      },
    ],
  },
  {
    id: 'L14',
    name: 'The Moving Green',
    region: 2,
    concept:
      'The finale green of the Grand Open never stopped circling its lighthouse star — and the lighthouse ' +
      'fights back: an amp lens burns over the near chord and gong-bumpers post the bottom and the flat. ' +
      'Stop chasing and start MEETING the lap where the course allows: read it, lead it, arrive when it does.',
    par: 3,
    pinBudget: 1,
    tee: { x: 350, y: 720 },
    hole: {
      x: 1200, y: 420,
      path: {
        points: [
          { x: 1500, y: 720 }, { x: 1460, y: 870 }, { x: 1350, y: 980 }, { x: 1200, y: 1020 },
          { x: 1050, y: 980 }, { x: 940, y: 870 }, { x: 900, y: 720 }, { x: 940, y: 570 },
          { x: 1050, y: 460 }, { x: 1200, y: 420 }, { x: 1350, y: 460 }, { x: 1460, y: 570 },
        ],
        speed: 70,
        mode: 'loop',
      },
    },
    bounds: { cx: 925, cy: 720, rx: 1080, ry: 620 },
    bodies: [
      { id: 'beacon', kind: 'attractor', x: 1200, y: 720, radius: 55, mu: 5.5e6, influenceR: 560, material: 'machine' },
    ],
    hazards: [
      // the gongs: the bottom chord and the flat lane are posted
      { id: 'gong1', kind: 'bumper', x: 1200, y: 950, r: 22, boost: 160 },
      { id: 'gong2', kind: 'bumper', x: 820, y: 700, r: 22, boost: 160 },
    ],
    zones: [
      // the lens: the lighthouse beam burns the near chord — meetings there get whipped
      { id: 'lens', kind: 'amp', x: 950, y: 550, radius: 170, strength: 2.0 },
    ],
    fragments: [
      { x: 1200, y: 1020 }, // bottom of the ring, past the gong
      { x: 900, y: 720 }, // left of the ring — the hole passes right here
      { x: 760, y: 500 }, // high entry diagonal
    ],
    objectives: [{ id: 'o1', kind: 'orbit', text: 'Take one lap with the beacon.' }],
    story: [
      {
        id: 'st1',
        on: { type: 'start' },
        lines: [
          { who: 'coursekeeper', text: 'The Moving Green. The finale hole of the Grand Open. It never stopped circling.' },
        ],
      },
      {
        id: 'st2',
        on: { type: 'zone', x: 1200, y: 420, r: 240 },
        lines: [
          { who: 'milo', text: 'I\u2019ve chased greens before. They usually have the decency to hold still.' },
        ],
      },
      {
        id: 'st3',
        on: { type: 'sink' },
        lines: [
          { who: 'announcer', text: 'The green came to HIM! A first in Open history, folks!' },
        ],
      },
    ],
    hint: 'The lens owns the near chord, the gongs own the bottom. Lead the lap on the far chord — a perfect lead is the ace.',
  },
];
