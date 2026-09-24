/** Versioned localStorage save: gold, meta ranks, unlocked characters, best stats. */
import { setMetaRankGetter } from '../game/state';
import { CHARACTERS } from '../game/data/characters';

const KEY = 'wreckball.save.v1';

export interface SaveData {
  v: 1;
  gold: number;
  metaRanks: Record<string, number>;
  unlockedChars: string[];
  selectedChar: string;
  best: { time: number; kills: number; level: number; wins: number };
  settings: { sfx: boolean; music: boolean };
}

const DEFAULT: SaveData = {
  v: 1,
  gold: 0,
  metaRanks: {},
  unlockedChars: ['wrecker'],
  selectedChar: 'wrecker',
  best: { time: 0, kills: 0, level: 0, wins: 0 },
  settings: { sfx: true, music: true },
};

let cache: SaveData = load();

function load(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT, metaRanks: {}, unlockedChars: [...DEFAULT.unlockedChars], best: { ...DEFAULT.best }, settings: { ...DEFAULT.settings } };
    const data = JSON.parse(raw) as SaveData;
    if (data.v !== 1) return loadDefault();
    // merge defaults for forward-compat
    return {
      ...DEFAULT,
      ...data,
      metaRanks: data.metaRanks ?? {},
      unlockedChars: data.unlockedChars?.length ? data.unlockedChars : [...DEFAULT.unlockedChars],
      best: { ...DEFAULT.best, ...data.best },
      settings: { ...DEFAULT.settings, ...data.settings },
    };
  } catch {
    return loadDefault();
  }
}

function loadDefault(): SaveData {
  return { ...DEFAULT, metaRanks: {}, unlockedChars: [...DEFAULT.unlockedChars], best: { ...DEFAULT.best }, settings: { ...DEFAULT.settings } };
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

export function recordRun(time: number, kills: number, level: number, won: boolean): void {
  if (time > cache.best.time) cache.best.time = time;
  if (kills > cache.best.kills) cache.best.kills = kills;
  if (level > cache.best.level) cache.best.level = level;
  if (won) cache.best.wins++;
  persist();
}

setMetaRankGetter(() => cache.metaRanks);
