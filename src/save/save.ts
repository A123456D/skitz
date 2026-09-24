/** Versioned localStorage save: gold, meta ranks, unlocked characters, best stats, depth unlocks. */
import { setMetaRankGetter } from '../game/state';
import { CHARACTERS } from '../game/data/characters';
import { DEPTH_UNLOCKS } from '../game/data/unlocks';

const KEY = 'wreckball.save.v1';

export interface SaveData {
  v: 2;
  gold: number;
  metaRanks: Record<string, number>;
  unlockedChars: string[];
  selectedChar: string;
  best: { time: number; kills: number; level: number; wins: number; depth: number };
  settings: { sfx: boolean; music: boolean };
  /** earned depth-unlock ids (see data/unlocks.ts) */
  unlocks: string[];
  /** active WRECKER skin id (see data/unlocks.ts SKINS) */
  skin: string;
}

const DEFAULT: SaveData = {
  v: 2,
  gold: 0,
  metaRanks: {},
  unlockedChars: ['wrecker'],
  selectedChar: 'wrecker',
  best: { time: 0, kills: 0, level: 0, wins: 0, depth: 0 },
  settings: { sfx: true, music: true },
  unlocks: [],
  skin: 'default',
};

/** v1 → v2: depth bests + unlock cascade fields. */
export function migrateSave(raw: unknown): SaveData {
  const d = (raw ?? {}) as Partial<SaveData> & { v?: number; best?: Partial<SaveData['best']> };
  return {
    ...DEFAULT,
    ...d,
    v: 2,
    metaRanks: d.metaRanks ?? {},
    unlockedChars: d.unlockedChars?.length ? d.unlockedChars : [...DEFAULT.unlockedChars],
    best: { ...DEFAULT.best, ...(d.best ?? {}) },
    settings: { ...DEFAULT.settings, ...(d.settings ?? {}) },
    unlocks: d.unlocks ?? [],
    skin: d.skin ?? 'default',
  };
}

function loadDefault(): SaveData {
  return migrateSave(null);
}

let cache: SaveData = load();

function load(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return loadDefault();
    return migrateSave(JSON.parse(raw));
  } catch {
    return loadDefault();
  }
}

export function getSave(): SaveData {
  return cache;
}

export function persist(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // storage unavailable (private mode) — play without persistence
  }
}

export function addGold(g: number): void {
  cache.gold += g;
  persist();
}

export function buyMetaRank(id: string, cost: number): boolean {
  if (cache.gold < cost) return false;
  cache.gold -= cost;
  cache.metaRanks[id] = (cache.metaRanks[id] ?? 0) + 1;
  persist();
  return true;
}

export function unlockCharacter(id: string): boolean {
  const def = CHARACTERS.find((c) => c.id === id);
  if (!def || cache.unlockedChars.includes(id)) return false;
  if (def.unlockDepth) return false; // achievement-gated, never purchasable
  if (cache.gold < def.cost) return false;
  cache.gold -= def.cost;
  cache.unlockedChars.push(id);
  persist();
  return true;
}

export function selectCharacter(id: string): void {
  if (!cache.unlockedChars.includes(id)) return;
  cache.selectedChar = id;
  persist();
}

/** Grant every depth unlock the player has now earned. Returns the NEW ids. */
export function grantDepthUnlocks(depth: number): string[] {
  const gained: string[] = [];
  for (const def of DEPTH_UNLOCKS) {
    if (depth >= def.depth && !cache.unlocks.includes(def.id)) {
      cache.unlocks.push(def.id);
      gained.push(def.id);
      if (def.id === 'u_volt' && !cache.unlockedChars.includes('volt')) {
        cache.unlockedChars.push('volt');
      }
    }
  }
  if (gained.length > 0) persist();
  return gained;
}

export function skinUnlocked(id: string): boolean {
  const skin = SKIN_UNLOCK_IDS[id];
  return !skin || cache.unlocks.includes(skin);
}

export function setSkin(id: string): void {
  if (!skinUnlocked(id)) return;
  cache.skin = id;
  persist();
}

export function recordRun(time: number, kills: number, level: number, won: boolean, depth = 0): void {
  if (time > cache.best.time) cache.best.time = time;
  if (kills > cache.best.kills) cache.best.kills = kills;
  if (level > cache.best.level) cache.best.level = level;
  if (depth > cache.best.depth) cache.best.depth = depth;
  if (won) cache.best.wins++;
  persist();
}

/** test hook: reset the in-memory cache (does not wipe real storage) */
export function __resetSaveForTests(): void {
  cache = loadDefault();
}

setMetaRankGetter(() => cache.metaRanks);

// skin id -> unlock id (for skinUnlocked without a circular import)
const SKIN_UNLOCK_IDS: Record<string, string | undefined> = {
  default: undefined,
  ember: 'u_skin_ember',
  void: 'u_skin_void',
};
