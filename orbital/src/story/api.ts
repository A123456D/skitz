// Story API contract — owned by the integrator. src/story/index.ts implements.
import type { SimEvent, StoryLine, StoryTrigger, World } from '../sim';

export interface StoryRunner {
  /** Load a level's trigger set (clears previous). */
  loadLevel(triggers: StoryTrigger[]): void;

  /** Per tick: detects zone entries + event-backed triggers, queues lines. */
  update(w: World, events: SimEvent[]): void;

  /** Subscribe to delivered lines (subtitle bar shows one at a time). */
  onLine(cb: (line: StoryLine) => void): void;

  /** Skip the currently showing line. */
  advance(): void;

  destroy(): void;
}

export function createStoryRunner(): StoryRunner {
  throw new Error('story not implemented');
}
