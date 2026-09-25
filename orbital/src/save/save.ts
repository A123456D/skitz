// Versioned localStorage save. try/catch everywhere (private mode throws);
// migrate via chain when the version bumps. Never save per-frame.

const KEY = 'orbital.save';
const VERSION = 1;

export interface Medal { par: boolean; obj: boolean; frag: boolean }

export interface Settings {
  audio: number; // 0..1 sfx bus
  music: number; // 0..1 music bus
  prediction: boolean;
  shake: boolean;
  /** true = drag toward the target fires toward it; false = slingshot pull. */
  aimForward: boolean;
}

export interface SaveData {
  v: number;
  unlockedLevel: number; // highest index reachable in course select
  medals: Record<string, Medal>;
  fragments: Record<string, number[]>;
  settings: Settings;
  /** Best completion time per level id, seconds. */
  bestTimes: Record<string, number>;
}

const DEFAULTS: SaveData = {
  v: VERSION,
  unlockedLevel: 0,
  medals: {},
  fragments: {},
  settings: { audio: 0.8, music: 0.7, prediction: true, shake: true, aimForward: false },
  bestTimes: {},
};

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS, medals: {}, fragments: {}, settings: { ...DEFAULTS.settings } };
    const data = JSON.parse(raw) as Partial<SaveData>;
    if (data.v !== VERSION) return migrate(data);
    return {
      ...DEFAULTS,
      ...data,
      settings: { ...DEFAULTS.settings, ...(data.settings ?? {}) },
      medals: data.medals ?? {},
      fragments: data.fragments ?? {},
      bestTimes: data.bestTimes ?? {},
    };
  } catch {
    return { ...DEFAULTS, medals: {}, fragments: {}, settings: { ...DEFAULTS.settings } };
  }
}

export function writeSave(data: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // private mode / quota — play continues unsaved
  }
}

function migrate(_old: Partial<SaveData>): SaveData {
  // v1 is the first version; unknown future versions fall back to defaults.
  return { ...DEFAULTS, medals: {}, fragments: {}, settings: { ...DEFAULTS.settings } };
}
