// UI API contract — owned by the integrator. src/ui/index.ts implements.
import type { LevelDef, StoryLine, World } from '../sim';
import type { Medal, SaveData, Settings } from '../save/save';

export type Screen = 'boot' | 'title' | 'select' | 'playing' | 'paused' | 'results' | 'settings';

export interface LevelResult {
  levelId: string;
  strokes: number;
  par: number;
  /** ACE / STELLAR / ORBITAL / PAR / DRIFT / WRECK (docs/design.md §6). */
  strokeName: string;
  medals: Medal;
  objectives: { text: string; done: boolean }[];
  fragments: { total: number; taken: number };
  nextLevelId: string | null;
  modifiers: string[];
  /** Wall-clock seconds this run took (TIME ATTACK etc.), if tracked. */
  timeSec?: number;
  /** Best previously-seen time for this level, if any. */
  bestSec?: number;
}

export interface UIHooks {
  onPlayLevel(index: number, modifiers: string[]): void;
  onResume(): void;
  onRestart(): void;
  onPause(): void;
  onQuitToMenu(): void;
  onNextLevel(): void;
  onReplay(): void;
  onSettingsChanged(s: Settings): void;
  /** Undo the last Gravity Pin of the current aim phase. */
  onUndoPin?(): void;
}

export interface UIHandle {
  show(screen: Screen): void;
  /** Bind the live world for the HUD (null = clear). */
  bindWorld(w: World | null): void;
  /** HUD per-tick refresh (strokes, pins left, fragments). */
  updateHud(w: World, pinsPlacedThisStroke: number, objectiveDone: boolean[]): void;
  setResult(r: LevelResult): void;
  showSubtitle(line: StoryLine | null): void;
  /** Short center toasts: "ORBIT COMPLETE", "SEQUENCE RESET", "SECRET FOUND". */
  toast(text: string, kind?: 'good' | 'bad' | 'neutral'): void;
  refresh(save: SaveData, levels: LevelDef[]): void;
  destroy(): void;
}

export function mountUI(_root: HTMLElement, _hooks: UIHooks): UIHandle {
  throw new Error('ui not implemented');
}
