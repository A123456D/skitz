// Story runner — pure trigger/queue logic, DOM-free so it is unit-testable.
// Detection: which triggers fire this tick (start / stroke / firstBounce /
// sink / zone entry). Delivery: one line at a time via onLine subscribers;
// the next line goes out only after advance() OR LINE_AUTO_SECONDS of sim time.
// The UI owns min-display time; the runner owns serialization + dedupe.
import type { SimEvent, StoryLine, StoryTrigger, World } from '../sim';
import type { StoryRunner } from './api';

/** Sim-seconds a line holds before the runner auto-advances (UI shows ~2.6s). */
export const LINE_AUTO_SECONDS = 2.8;

/** Clamp on sim-time delta per update (tab suspension / level restart guard). */
const MAX_DELTA = 0.5;

type LineCb = (line: StoryLine) => void;

export function createStoryRunner(): StoryRunner {
  let triggers: StoryTrigger[] = [];
  const fired = new Set<string>();
  const queue: StoryLine[] = [];
  let cbs: LineCb[] = [];

  // Level-latched detection state (reset by loadLevel).
  let started = false;
  let bounceSeen = false;
  let sinkSeen = false;

  // Delivery state.
  let current: StoryLine | null = null;
  let lineElapsed = 0;
  let lastT = 0;
  let haveLastT = false;

  function fire(t: StoryTrigger): void {
    if (fired.has(t.id)) return; // a trigger fires once per level load
    fired.add(t.id);
    queue.push(...t.lines);
  }

  /** Deliver the next queued line if nothing is showing. */
  function deliverNext(): void {
    if (current !== null) return;
    const next = queue.shift();
    if (!next) return;
    current = next;
    lineElapsed = 0;
    for (const cb of cbs) cb(next);
  }

  function finishCurrent(): void {
    current = null;
    deliverNext();
  }

  /** Single pass in trigger-definition order → deterministic queue ordering. */
  function evaluate(w: World): void {
    for (const t of triggers) {
      if (fired.has(t.id)) continue;
      const c = t.on;
      let hit: boolean;
      switch (c.type) {
        case 'start':
          hit = started;
          break;
        case 'stroke':
          // >= so a paused/merged tick can never skip past the number.
          hit = w.strokes >= c.number;
          break;
        case 'firstBounce':
          hit = bounceSeen;
          break;
        case 'sink':
          hit = sinkSeen;
          break;
        case 'zone': {
          // Ball center inside the trigger radius ("entry" == first tick inside;
          // the fired-set makes it once per load, matching the design contract).
          const dx = w.ball.x - c.x;
          const dy = w.ball.y - c.y;
          hit = dx * dx + dy * dy <= c.r * c.r;
          break;
        }
      }
      if (hit) fire(t);
    }
  }

  return {
    loadLevel(trs: StoryTrigger[]): void {
      triggers = trs;
      fired.clear();
      queue.length = 0;
      started = false;
      bounceSeen = false;
      sinkSeen = false;
      current = null;
      lineElapsed = 0;
      haveLastT = false;
      lastT = 0;
    },

    update(w: World, events: SimEvent[]): void {
      // --- internal clock runs on sim time: pausing the sim freezes the
      // story timer, which is the desired behavior for a subtitle bar.
      if (haveLastT) {
        const d = w.t - lastT;
        if (d > 0) lineElapsed += Math.min(d, MAX_DELTA);
      }
      lastT = w.t;
      haveLastT = true;

      if (!started) started = true; // 'start' fires on first update

      if (events) {
        for (const e of events) {
          if (e.type === 'bounce') bounceSeen = true;
          else if (e.type === 'sink') sinkSeen = true;
        }
      }

      evaluate(w);

      if (current !== null && lineElapsed >= LINE_AUTO_SECONDS) finishCurrent();
      else deliverNext();
    },

    onLine(cb: (line: StoryLine) => void): void {
      cbs.push(cb);
    },

    advance(): void {
      if (current !== null) finishCurrent();
    },

    destroy(): void {
      triggers = [];
      fired.clear();
      queue.length = 0;
      cbs = [];
      started = false;
      bounceSeen = false;
      sinkSeen = false;
      current = null;
      haveLastT = false;
    },
  };
}
