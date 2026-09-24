// Campaign validator for ORBITAL's 24 levels (docs/design.md §7).
// Three layers:
//   1. Static integrity — geometry inside bounds, references resolve, schema
//      ranges, story/objective/fragment quotas, no unreachable silliness.
//   2. Distinctness — the VARIETY RULE: unique concepts and R1's strict
//      one-new-mechanic-per-level teaching order.
//   3. Solver sweep — brute-force the real sim per level; every hole must be
//      approachable (see tools/level-solver.ts).
import { describe, it, expect } from 'vitest';
import { LEVELS } from '../src/levels';
import { sweepLevel } from '../tools/level-solver';
import type { LevelDef } from '../src/sim';

// ----------------------------------------------------------------- helpers

/** Normalized ellipse radius at (x, y); <= 1 means inside. `shrink` trims the
 *  bounds first (used for the 40-unit safety margin checks). */
function ellipseNorm(def: LevelDef, x: number, y: number, shrink = 0): number {
  const rx = Math.max(1, def.bounds.rx - shrink);
  const ry = Math.max(1, def.bounds.ry - shrink);
  const nx = (x - def.bounds.cx) / rx;
  const ny = (y - def.bounds.cy) / ry;
  return Math.sqrt(nx * nx + ny * ny);
}

const inside = (def: LevelDef, x: number, y: number, shrink = 40): boolean =>
  ellipseNorm(def, x, y, shrink) <= 1;

/** Largest extent any authored object reaches from the bounds center, per axis.
 *  pad accounts for body/zone/hazard radius so EDGES are counted. */
function extents(def: LevelDef): { mx: number; my: number } {
  let mx = 0;
  let my = 0;
  const add = (x: number, y: number, pad = 0): void => {
    mx = Math.max(mx, Math.abs(x - def.bounds.cx) + pad);
    my = Math.max(my, Math.abs(y - def.bounds.cy) + pad);
  };
  add(def.tee.x, def.tee.y, 10);
  add(def.hole.x, def.hole.y, 16);
  if (def.hole.path) for (const p of def.hole.path.points) add(p.x, p.y, 0);
  for (const b of def.bodies) add(b.x, b.y, b.radius);
  for (const f of def.fragments ?? []) add(f.x, f.y, 0);
  for (const s of def.switches ?? []) add(s.x, s.y, s.r);
  for (const h of def.hazards ?? []) {
    if (h.kind === 'barrier') { add(h.a.x, h.a.y); add(h.b.x, h.b.y); }
    else if (h.kind === 'bumper') add(h.x, h.y, h.r);
    else add(h.x, h.y, h.len + h.r); // beam sweeps a full circle
  }
  for (const z of def.zones ?? []) {
    if (z.a && z.b) { add(z.a.x, z.a.y, z.corridorR ?? 0); add(z.b.x, z.b.y, z.corridorR ?? 0); }
    else if (z.x !== undefined && z.y !== undefined) add(z.x, z.y, z.radius ?? 0);
  }
  for (const wh of def.wormholes ?? []) add(wh.x, wh.y, wh.r);
  for (const o of def.objectives ?? []) if (o.kind === 'secret') add(o.x, o.y, o.r);
  return { mx, my };
}

const VALID_WHO = new Set(['milo', 'coursekeeper', 'sprocket', 'announcer', 'log']);

// ------------------------------------------------------------ static checks

describe('campaign shape', () => {
  it('is exactly 24 ordered levels with the contract names', () => {
    expect(LEVELS).toHaveLength(24);
    const expected = [
      'First Contact', 'The Bend', 'Capture', 'Pushback', 'Still Air', 'The Tee', 'Binary',
      'Driftwood', 'The Wreck', 'Bad Weather', 'The Slingshot', 'The False Path', 'The Cascade', 'The Moving Green',
      'The Giant', 'Pinball Orbit', 'The Artery', 'Figure Eight', 'The Forge', 'Deep Field', 'The Sequence',
      'The Gauntlet', 'The Chorus', 'The Last Tee',
    ];
    LEVELS.forEach((l, i) => {
      expect(l.id, `level ${i}`).toBe(`L${String(i + 1).padStart(2, '0')}`);
      expect(l.name, `${l.id} name`).toBe(expected[i]);
      expect(l.region, `${l.id} region`).toBe(i < 7 ? 1 : i < 14 ? 2 : i < 21 ? 3 : 4);
    });
  });

  it('has unique ids, names and concepts (the variety rule)', () => {
    const ids = new Set<string>();
    const names = new Set<string>();
    const concepts = new Set<string>();
    for (const l of LEVELS) {
      expect(ids.has(l.id), `duplicate id ${l.id}`).toBe(false);
      expect(names.has(l.name), `duplicate name ${l.name}`).toBe(false);
      expect(concepts.has(l.concept), `duplicate concept in ${l.id}`).toBe(false);
      ids.add(l.id); names.add(l.name); concepts.add(l.concept);
      expect(l.concept.length, `${l.id} concept must state its idea`).toBeGreaterThan(30);
    }
  });

  it('keeps scalar fields in contract ranges', () => {
    for (const l of LEVELS) {
      expect(l.par, `${l.id} par`).toBeGreaterThanOrEqual(1);
      expect(l.par, `${l.id} par`).toBeLessThanOrEqual(5);
      expect(l.pinBudget, `${l.id} pinBudget`).toBeGreaterThanOrEqual(1);
      expect(l.pinBudget, `${l.id} pinBudget`).toBeLessThanOrEqual(3);
    }
  });

  it('places every authored object inside bounds with margin, and bounds generously frame the play', () => {
    for (const l of LEVELS) {
      const msg = (what: string): string => `${l.id} ${l.name}: ${what} outside bounds-40`;
      // tee + hole clear of every body (hole needs the 40-unit comfort rule)
      for (const b of l.bodies) {
        const dBall = Math.hypot(l.tee.x - b.x, l.tee.y - b.y);
        expect(dBall, `${l.id}: tee inside body ${b.id}`).toBeGreaterThanOrEqual(b.radius + 16);
        const dHole = Math.hypot(l.hole.x - b.x, l.hole.y - b.y);
        expect(dHole, `${l.id}: hole within ${b.id} radius+40`).toBeGreaterThanOrEqual(b.radius + 40);
        if (l.hole.path) {
          for (const p of l.hole.path.points) {
            const d = Math.hypot(p.x - b.x, p.y - b.y);
            expect(d, `${l.id}: moving hole passes within ${b.id} radius+40`).toBeGreaterThanOrEqual(b.radius + 40);
          }
        }
      }
      expect(inside(l, l.tee.x, l.tee.y), msg('tee')).toBe(true);
      expect(inside(l, l.hole.x, l.hole.y), msg('hole')).toBe(true);
      if (l.hole.path) for (const p of l.hole.path.points) expect(inside(l, p.x, p.y), msg('hole path')).toBe(true);
      for (const b of l.bodies) {
        expect(inside(l, b.x, b.y), msg(`body ${b.id}`)).toBe(true);
        // body edge (not its influence) stays inside the real ellipse
        expect(ellipseNorm(l, b.x, b.y + b.radius), `${l.id}: body ${b.id} edge out of bounds`).toBeLessThanOrEqual(1);
        expect(ellipseNorm(l, b.x, b.y - b.radius), `${l.id}: body ${b.id} edge out of bounds`).toBeLessThanOrEqual(1);
        expect(ellipseNorm(l, b.x + b.radius, b.y), `${l.id}: body ${b.id} edge out of bounds`).toBeLessThanOrEqual(1);
        expect(ellipseNorm(l, b.x - b.radius, b.y), `${l.id}: body ${b.id} edge out of bounds`).toBeLessThanOrEqual(1);
      }
      for (const f of l.fragments ?? []) expect(inside(l, f.x, f.y), msg('fragment')).toBe(true);
      for (const s of l.switches ?? []) expect(inside(l, s.x, s.y), msg(`switch ${s.id}`)).toBe(true);
      for (const h of l.hazards ?? []) {
        if (h.kind === 'barrier') {
          expect(inside(l, h.a.x, h.a.y), msg(`barrier ${h.id}`)).toBe(true);
          expect(inside(l, h.b.x, h.b.y), msg(`barrier ${h.id}`)).toBe(true);
        } else if (h.kind === 'bumper') {
          expect(inside(l, h.x, h.y), msg(`bumper ${h.id}`)).toBe(true);
        } else {
          expect(inside(l, h.x, h.y), msg(`beam ${h.id}`)).toBe(true);
        }
      }
      for (const z of l.zones ?? []) {
        if (z.a && z.b) {
          expect(inside(l, z.a.x, z.a.y), msg(`corridor ${z.id}`)).toBe(true);
          expect(inside(l, z.b.x, z.b.y), msg(`corridor ${z.id}`)).toBe(true);
        } else if (z.x !== undefined && z.y !== undefined) {
          expect(inside(l, z.x, z.y), msg(`zone ${z.id}`)).toBe(true);
        }
      }
      for (const wh of l.wormholes ?? []) expect(inside(l, wh.x, wh.y), msg(`wormhole ${wh.id}`)).toBe(true);

      // generous framing: bounds reach >= 1.6x beyond every object extremity
      const { mx, my } = extents(l);
      expect(l.bounds.rx, `${l.id}: bounds.rx ${l.bounds.rx} is < 1.6x content extent ${mx.toFixed(0)}`)
        .toBeGreaterThanOrEqual(1.6 * mx);
      expect(l.bounds.ry, `${l.id}: bounds.ry ${l.bounds.ry} is < 1.6x content extent ${my.toFixed(0)}`)
        .toBeGreaterThanOrEqual(1.6 * my);
    }
  });

  it('resolves every reference (wormholes, switches, sequences, gates, touch targets)', () => {
    for (const l of LEVELS) {
      const bodyIds = new Set(l.bodies.map((b) => b.id));
      const zoneIds = new Set((l.zones ?? []).map((z) => z.id));
      const switchIds = new Set((l.switches ?? []).map((s) => s.id));
      const bumperIds = new Set((l.hazards ?? []).filter((h) => h.kind === 'bumper').map((h) => h.id));
      const whIds = new Set((l.wormholes ?? []).map((w) => w.id));

      for (const wh of l.wormholes ?? []) {
        expect(whIds.has(wh.exitId), `${l.id}: wormhole ${wh.id} exit ${wh.exitId} missing`).toBe(true);
      }
      for (const s of l.switches ?? []) {
        for (const t of s.targets) {
          expect(bodyIds.has(t) || zoneIds.has(t), `${l.id}: switch ${s.id} targets missing id ${t}`).toBe(true);
        }
      }
      for (const id of l.sequence ?? []) {
        expect(switchIds.has(id), `${l.id}: sequence references non-switch ${id}`).toBe(true);
        const s = (l.switches ?? []).find((x) => x.id === id);
        expect(s?.mode, `${l.id}: sequenced switch ${id} must be 'once'`).toBe('once');
      }
      // a gated body/zone must have an activator (switch target or self-gate)
      for (const b of [...l.bodies, ...(l.zones ?? [])]) {
        const gate = 'gate' in b ? b.gate : undefined;
        if (!gate) continue;
        if (gate.switchId) {
          const fired = (l.switches ?? []).some((s) => s.targets.includes(('id' in b ? b.id : '') as string));
          expect(fired, `${l.id}: gated ${b.id} is never fired by its switch ${gate.switchId}`).toBe(true);
          const sw = (l.switches ?? []).find((s) => s.id === gate.switchId);
          expect(sw, `${l.id}: gate switch ${gate.switchId} missing`).toBeDefined();
        } else {
          expect(gate.timer !== undefined || gate.proximity !== undefined,
            `${l.id}: ${b.id} gated with no activator at all`).toBe(true);
        }
      }
      for (const o of l.objectives ?? []) {
        expect(o.text.length, `${l.id}: objective needs player-facing text`).toBeGreaterThan(0);
        if (o.kind === 'touch') {
          expect(bodyIds.has(o.targetId) || switchIds.has(o.targetId) || bumperIds.has(o.targetId),
            `${l.id}: touch objective target ${o.targetId} does not exist`).toBe(true);
        }
      }
    }
  });

  it('ships content quotas: 3 fragments, an objective, 2-4 story beats, hints on L01-L03', () => {
    const kinds = new Set<string>();
    for (const l of LEVELS) {
      expect(l.fragments ?? [], `${l.id} must ship exactly 3 fragments`).toHaveLength(3);
      expect(l.objectives?.length ?? 0, `${l.id} needs at least one objective`).toBeGreaterThanOrEqual(1);
      const storyCount = l.story?.length ?? 0;
      expect(storyCount, `${l.id} story beats`).toBeGreaterThanOrEqual(2);
      expect(storyCount, `${l.id} story beats`).toBeLessThanOrEqual(4);
      for (const t of l.story ?? []) {
        expect(t.lines.length, `${l.id} trigger ${t.id} must be <= 2 lines`).toBeLessThanOrEqual(2);
        for (const line of t.lines) {
          expect(VALID_WHO.has(line.who), `${l.id} unknown speaker`).toBe(true);
          expect(line.text.length, `${l.id} empty line`).toBeGreaterThan(0);
        }
      }
      for (const o of l.objectives ?? []) kinds.add(o.kind);
    }
    // every objective kind is used somewhere in the campaign
    for (const k of ['pinsMax', 'orbit', 'touch', 'noHazard', 'secret']) {
      expect(kinds.has(k), `objective kind ${k} never used`).toBe(true);
    }
    for (const l of LEVELS.slice(0, 3)) {
      expect(l.hint?.length ?? 0, `${l.id} needs a hint`).toBeGreaterThan(0);
    }
  });
});

// -------------------------------------------------------- distinctness (R1)

describe('region 1 teaching order (variety rule)', () => {
  const byId = new Map(LEVELS.map((l) => [l.id, l]));

  it('introduces exactly one mechanic per level, in order', () => {
    const l01 = byId.get('L01')!;
    expect(l01.bodies.every((b) => b.kind === 'attractor'), 'L01: attractor only').toBe(true);
    expect(l01.hazards ?? []).toHaveLength(0);
    expect(l01.zones ?? []).toHaveLength(0);

    expect((byId.get('L02')!.hazards ?? []).some((h) => h.kind === 'barrier'), 'L02: +barrier').toBe(true);

    expect(byId.get('L03')!.objectives?.some((o) => o.kind === 'orbit'), 'L03: orbit objective').toBe(true);

    expect(byId.get('L04')!.bodies.some((b) => b.kind === 'repulsor'), 'L04: repulsor').toBe(true);

    expect(byId.get('L05')!.zones?.some((z) => z.kind === 'void'), 'L05: void zone').toBe(true);

    const l06 = byId.get('L06')!;
    expect(l06.pinBudget, 'L06: pins must matter (budget >= 2)').toBeGreaterThanOrEqual(2);
    expect((l06.hint ?? '').toLowerCase()).toContain('pin');

    expect(byId.get('L07')!.bodies.length, 'L07: two-body field').toBeGreaterThanOrEqual(2);
  });

  it('gives each region at least one documented wow-moment', () => {
    for (const [id, marker] of [['L13', 'CASCADE'], ['L18', 'WOW'], ['L24', 'WAKES']] as const) {
      const l = byId.get(id)!;
      expect(`${l.concept} ${l.hint ?? ''}`.toUpperCase()).toContain(marker);
    }
  });
});

// ----------------------------------------------------------- solver sweeps

describe('solver: every level is playable', () => {
  it('allows meaningful progress toward the hole from the tee', () => {
    const rows: string[] = [];
    const byRegion = new Map<number, string[]>();
    for (const l of LEVELS) {
      const r = sweepLevel(l);
      const limit = r.teeHoleDist * 0.25;
      const row =
        `${l.id} ${l.name}: minDist ${r.minDist.toFixed(0)} (limit ${limit.toFixed(0)})` +
        ` @ ${r.bestAngleDeg}deg/${r.bestPower}`;
      rows.push(row);
      const list = byRegion.get(l.region) ?? [];
      list.push(`${l.id} margin ${(limit - r.minDist).toFixed(0)}`);
      byRegion.set(l.region, list);
      expect(r.minDist, `${l.id} ${l.name}: best of 360 shots only reaches ${r.minDist.toFixed(0)}, ` +
        `needs < ${limit.toFixed(0)} (0.25x tee-hole). Fix the level, not the solver.`).toBeLessThan(limit);
      if (l.id === 'L06') expect(r.usedPin, 'L06 sweep must place its documented tutorial pin').toBe(true);
    }
    console.info(`[solver sweep]\n${rows.join('\n')}`);
    for (const [region, list] of [...byRegion.entries()].sort()) {
      console.info(`[R${region} min-dist margins] ${list.join(' | ')}`);
    }
  }, 240_000);

  it('gives par<=2 levels a direct-ish line to the hole', () => {
    for (const l of LEVELS.filter((x) => x.par <= 2)) {
      const r = sweepLevel(l);
      expect(r.minDist, `${l.id} ${l.name}: par ${l.par} but best line misses by ${r.minDist.toFixed(0)} (needs < 100)`)
        .toBeLessThan(100);
    }
  }, 240_000);
});
