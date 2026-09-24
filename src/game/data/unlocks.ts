/**
 * Depth unlocks: DESCEND milestones that permanently unlock content.
 * Evaluated at run end via save.grantDepthUnlocks — the cascade that gives
 * endless mode stakes.
 */

export interface UnlockDef {
  id: string;
  name: string;
  icon: string;
  /** DESCEND depth reached to earn this */
  depth: number;
  desc: string;
}

export const DEPTH_UNLOCKS: UnlockDef[] = [
  { id: 'u_skin_ember', name: 'EMBER SKIN', icon: '🔥', depth: 1, desc: 'Wrecker skin: a molten ember shell.' },
  { id: 'u_volt', name: 'VOLT BALL', icon: '⚡', depth: 2, desc: 'New ball: a live wire that starts with Static Chain.' },
  { id: 'u_boomer', name: 'WRECKANG', icon: '🪃', depth: 3, desc: 'New weapon: boomerangs that carve out and back.' },
  { id: 'u_skin_void', name: 'VOID SKIN', icon: '🌑', depth: 4, desc: 'Wrecker skin: a light-devouring void shell.' },
];

export function unlockDef(id: string): UnlockDef | undefined {
  return DEPTH_UNLOCKS.find((u) => u.id === id);
}

/** Skins: which atlas ball sprite each skin id maps to (WRECKER family). */
export const SKINS: Array<{ id: string; name: string; sprite: string; unlockId: string | null }> = [
  { id: 'default', name: 'DEFAULT', sprite: 'ball_wrecker', unlockId: null },
  { id: 'ember', name: 'EMBER', sprite: 'ball_wrecker_ember', unlockId: 'u_skin_ember' },
  { id: 'void', name: 'VOID', sprite: 'ball_wrecker_void', unlockId: 'u_skin_void' },
];
