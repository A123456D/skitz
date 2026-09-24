/** Elite modifiers: elites carry a behavior gimmick with its own tint + aura, never just stats. */

export const ELITE_MOD = {
  none: 0,
  frostbound: 1,
  volatile: 2,
  vampiric: 3,
  juggernaut: 4,
  splitting: 5,
  greedy: 6,
  stormtouched: 7,
} as const;

export type EliteModId = (typeof ELITE_MOD)[keyof typeof ELITE_MOD];

export interface EliteModDef {
  id: EliteModId;
  name: string;
  tint: number;
  auraTint: number;
  desc: string;
}

export const ELITE_MODS: Record<number, EliteModDef> = {
  [ELITE_MOD.frostbound]: { id: 1, name: 'Frostbound', tint: 0x9fe8ff, auraTint: 0x9fe8ff, desc: 'An icy aura slows you when close.' },
  [ELITE_MOD.volatile]: { id: 2, name: 'Volatile', tint: 0xff8a4d, auraTint: 0xff6a3d, desc: 'Detonates into charged shrapnel on death.' },
  [ELITE_MOD.vampiric]: { id: 3, name: 'Vampiric', tint: 0xd24dff, auraTint: 0xb24dff, desc: 'Drains life into nearby enemies.' },
  [ELITE_MOD.juggernaut]: { id: 4, name: 'Juggernaut', tint: 0xc8d2ec, auraTint: 0x9fb4d8, desc: 'Nearly immune to knockback and slightly faster.' },
  [ELITE_MOD.splitting]: { id: 5, name: 'Splitting', tint: 0x57e389, auraTint: 0x57e389, desc: 'Splits in two when it dies.' },
  [ELITE_MOD.greedy]: { id: 6, name: 'Greedy', tint: 0xffd76a, auraTint: 0xffd23f, desc: 'Runs from you — carries a fortune in gold.' },
  [ELITE_MOD.stormtouched]: { id: 7, name: 'Stormtouched', tint: 0xc8e8ff, auraTint: 0x8fb7ff, desc: 'Hurls periodic static bolts at you.' },
};

export const ELITE_MOD_COUNT = 7;
/** chance an eligible elite carries a modifier */
export const ELITE_MOD_CHANCE = 0.85;
