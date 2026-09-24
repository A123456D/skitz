// Speaker registry for the subtitle bar. Shape fixed; consumed by UI + story.
import type { StoryWho } from '../sim';

export interface Voice {
  name: string;
  color: string;
}

export const VOICES: Record<StoryWho, Voice> = {
  milo: { name: 'MILO', color: '#e8ecf4' },
  coursekeeper: { name: 'THE COURSEKEEPER', color: '#6fd6e8' },
  sprocket: { name: 'SPROCKET', color: '#ffb347' },
  announcer: { name: 'COURSE ANNOUNCER', color: '#b7e07c' },
  log: { name: 'MAINTENANCE LOG', color: '#8b93a7' },
};
