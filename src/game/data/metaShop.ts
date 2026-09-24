/** Permanent meta upgrades bought with gold between runs. */

export interface MetaUpgradeDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  maxRank: number;
  /** cost of each rank purchase: base * growth^rank */
  baseCost: number;
  growth: number;
  /** effect per rank */
  perRank: Partial<{
    dmgPct: number;
    hpPct: number;
    speedPct: number;
    knockPct: number;
    magnetPct: number;
    goldPct: number;
    xpPct: number;
    impactPct: number;
  }>;
}

export const META_UPGRADES: MetaUpgradeDef[] = [
  { id: 'might', name: 'Might', icon: '💪', desc: '+6% all damage per rank', maxRank: 5, baseCost: 50, growth: 1.9, perRank: { dmgPct: 0.06, impactPct: 0.06 } },
  { id: 'bulk', name: 'Bulk', icon: '🛡️', desc: '+10% max HP per rank', maxRank: 5, baseCost: 40, growth: 1.8, perRank: { hpPct: 0.10 } },
  { id: 'swift', name: 'Swiftness', icon: '👟', desc: '+4% move speed per rank', maxRank: 5, baseCost: 45, growth: 1.8, perRank: { speedPct: 0.04 } },
  { id: 'shove', name: 'Shove', icon: '🧲', desc: '+8% knockback dealt per rank', maxRank: 5, baseCost: 55, growth: 1.9, perRank: { knockPct: 0.08 } },
  { id: 'greed', name: 'Greed', icon: '🪙', desc: '+12% gold earned per rank', maxRank: 5, baseCost: 60, growth: 2.0, perRank: { goldPct: 0.12 } },
  { id: 'insight', name: 'Insight', icon: '📘', desc: '+8% XP gained per rank', maxRank: 5, baseCost: 50, growth: 1.9, perRank: { xpPct: 0.08 } },
];

export function metaCost(def: MetaUpgradeDef, currentRank: number): number {
  return Math.round(def.baseCost * Math.pow(def.growth, currentRank));
}
