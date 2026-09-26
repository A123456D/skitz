// Story runner unit tests — pure logic, fake World objects (no sim ticking).
import { describe, expect, it } from 'vitest';
import { createStoryRunner, LINE_AUTO_SECONDS } from '../src/story';
import type { LevelDef, SimEvent, StoryTrigger, World } from '../src/sim';

// ------------------------------------------------------------------- helpers

const DEF: LevelDef = {
  id: 'L01', name: 'Test', region: 1, concept: 'test', par: 2, pinBudget: 1,
  tee: { x: 0, y: 0 }, hole: { x: 100, y: 0 },
  bounds: { cx: 0, cy: 0, rx: 600, ry: 400 },
  bodies: [],
};

function makeWorld(over: Partial<World> = {}): World {
  const base: World = {
    def: DEF,
    seed: 1,
    rng: () => 0.5,
    gravityScale: 1,
    t: 0,
    strokes: 0,
    boostsLeft: 1,
    ball: {
      x: 0, y: 0, vx: 0, vy: 0, flying: false, settled: false, dead: false,
      sunk: false, spin: 0, orbitBody: null, orbitAngleAcc: 0, slowTime: 0,
      outOfBoundsT: 0, wormCool: 0, hazardTouched: false, bounces: 0,
    },
    bodies: [], zones: [], hazards: [], debris: [], pins: [], switches: [],
    seqProgress: 0, wormholes: [], fragments: [],
    holeX: 100, holeY: 0, holeT: 0, holeDir: 1, holeSegLens: null, holeSegTotal: 0,
    pinsUsedTotal: 0, orbits: 0, strokeEnded: null,
    events: [], orbitPrevAngle: null, touchedIds: [], nextPinId: 1,
  };
  return { ...base, ...over };
}

/** Recorder for delivered lines ("who:text" strings). */
function recorder() {
  const got: string[] = [];
  return { got, push: (l: { who: string; text: string }) => void got.push(`${l.who}:${l.text}`) };
}

const line = (who: StoryTrigger['lines'][number]['who'], text: string) => ({ who, text });

// -------------------------------------------------------------------- tests

describe('story runner — trigger detection', () => {
  it('fires a start trigger on the first update', () => {
    const r = createStoryRunner();
    const rec = recorder();
    r.onLine(rec.push);
    r.loadLevel([{ id: 's1', on: { type: 'start' }, lines: [line('milo', 'hello')] }]);
    expect(rec.got).toEqual([]);
    r.update(makeWorld(), []);
    expect(rec.got).toEqual(['milo:hello']);
  });

  it('fires a zone trigger once the ball enters its radius', () => {
    const r = createStoryRunner();
    const rec = recorder();
    r.onLine(rec.push);
    r.loadLevel([{ id: 'z1', on: { type: 'zone', x: 200, y: 0, r: 50 }, lines: [line('log', 'zone')] }]);
    const w = makeWorld();
    w.ball.x = 140; // 60 away — outside
    r.update(w, []);
    expect(rec.got).toEqual([]);
    w.ball.x = 170; // inside
    r.update(w, []);
    expect(rec.got).toEqual(['log:zone']);
  });

  it('fires a stroke trigger when w.strokes reaches the number', () => {
    const r = createStoryRunner();
    const rec = recorder();
    r.onLine(rec.push);
    r.loadLevel([{ id: 'st2', on: { type: 'stroke', number: 2 }, lines: [line('coursekeeper', 'second')] }]);
    const w = makeWorld();
    w.strokes = 1;
    r.update(w, []);
    expect(rec.got).toEqual([]);
    w.strokes = 2;
    r.update(w, []);
    expect(rec.got).toEqual(['coursekeeper:second']);
  });

  it('fires firstBounce once, on the first bounce event only', () => {
    const r = createStoryRunner();
    const rec = recorder();
    r.onLine(rec.push);
    r.loadLevel([{ id: 'b1', on: { type: 'firstBounce' }, lines: [line('milo', 'bonk')] }]);
    const w = makeWorld();
    const ev: SimEvent[] = [{ type: 'bounce', x: 10, y: 0, speed: 100 }];
    r.update(w, ev);
    expect(rec.got).toEqual(['milo:bonk']);
    r.advance();
    r.update(w, ev); // second bounce — must not refire
    expect(rec.got).toEqual(['milo:bonk']);
  });

  it('fires a sink trigger on the sink event', () => {
    const r = createStoryRunner();
    const rec = recorder();
    r.onLine(rec.push);
    r.loadLevel([{ id: 'sk1', on: { type: 'sink' }, lines: [line('announcer', 'Spectacular!')] }]);
    const w = makeWorld();
    r.update(w, [{ type: 'sink', x: 0, y: 0 }]);
    expect(rec.got).toEqual(['announcer:Spectacular!']);
  });

  it('never fires the same trigger twice per level load (dedupe)', () => {
    const r = createStoryRunner();
    const rec = recorder();
    r.onLine(rec.push);
    // Two start triggers with distinct ids → both fire (once each).
    r.loadLevel([
      { id: 'a', on: { type: 'start' }, lines: [line('milo', 'one')] },
      { id: 'b', on: { type: 'start' }, lines: [line('milo', 'two')] },
    ]);
    r.update(makeWorld(), []);
    expect(rec.got).toEqual(['milo:one']); // second waits in the queue
    r.advance();
    expect(rec.got).toEqual(['milo:one', 'milo:two']);
    r.advance();
    r.update(makeWorld(), []); // new tick, same load → nothing new
    expect(rec.got).toEqual(['milo:one', 'milo:two']);
  });

  it('loadLevel resets the fired set (triggers can fire again)', () => {
    const r = createStoryRunner();
    const rec = recorder();
    r.onLine(rec.push);
    const triggers: StoryTrigger[] = [{ id: 's', on: { type: 'start' }, lines: [line('milo', 'again')] }];
    r.loadLevel(triggers);
    r.update(makeWorld(), []);
    expect(rec.got).toEqual(['milo:again']);
    r.loadLevel(triggers);
    r.update(makeWorld(), []);
    expect(rec.got).toEqual(['milo:again', 'milo:again']);
  });
});

describe('story runner — queue ordering + delivery', () => {
  it('delivers serially in trigger-definition order, one line at a time', () => {
    const r = createStoryRunner();
    const rec = recorder();
    r.onLine(rec.push);
    // Both match on the very first update: zone covers the tee (0,0).
    r.loadLevel([
      { id: 'z', on: { type: 'zone', x: 0, y: 0, r: 10 }, lines: [line('log', 'z1'), line('log', 'z2')] },
      { id: 's', on: { type: 'start' }, lines: [line('milo', 's1')] },
    ]);
    r.update(makeWorld(), []);
    expect(rec.got).toEqual(['log:z1']); // first line only
    r.advance();
    expect(rec.got).toEqual(['log:z1', 'log:z2']);
    r.advance();
    expect(rec.got).toEqual(['log:z1', 'log:z2', 'milo:s1']);
    r.advance();
    expect(rec.got).toEqual(['log:z1', 'log:z2', 'milo:s1']); // queue empty
  });

  it('queues lines that fire while another line is showing', () => {
    const r = createStoryRunner();
    const rec = recorder();
    r.onLine(rec.push);
    r.loadLevel([
      { id: 's', on: { type: 'start' }, lines: [line('milo', 'first')] },
      { id: 'z', on: { type: 'zone', x: 0, y: 0, r: 10 }, lines: [line('milo', 'second')] },
    ]);
    r.update(makeWorld(), []); // both fire now; 'first' shows
    expect(rec.got).toEqual(['milo:first']);
    r.advance();
    expect(rec.got).toEqual(['milo:first', 'milo:second']);
  });

  it('auto-advances after LINE_AUTO_SECONDS of sim time', () => {
    const r = createStoryRunner();
    const rec = recorder();
    r.onLine(rec.push);
    r.loadLevel([
      { id: 's', on: { type: 'start' }, lines: [line('milo', 'a'), line('milo', 'b')] },
    ]);
    const w = makeWorld();
    r.update(w, []);
    expect(rec.got).toEqual(['milo:a']);
    // Advance sim time in <= MAX_DELTA steps until the timer laps the line.
    for (let i = 0; i < 20 && rec.got.length < 2; i++) {
      w.t += 0.25;
      r.update(w, []);
    }
    expect(rec.got).toEqual(['milo:a', 'milo:b']);
    expect(w.t).toBeGreaterThanOrEqual(LINE_AUTO_SECONDS);
  });

  it('advance() with nothing showing is a safe no-op', () => {
    const r = createStoryRunner();
    const rec = recorder();
    r.onLine(rec.push);
    r.loadLevel([]);
    expect(() => r.advance()).not.toThrow();
    expect(rec.got).toEqual([]);
  });

  it('destroy() stops delivery and survives further updates', () => {
    const r = createStoryRunner();
    const rec = recorder();
    r.onLine(rec.push);
    r.loadLevel([{ id: 's', on: { type: 'start' }, lines: [line('milo', 'x')] }]);
    r.destroy();
    expect(() => r.update(makeWorld(), [])).not.toThrow();
    expect(rec.got).toEqual([]);
  });
});
