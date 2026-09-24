/**
 * In-run item layer: 24 items across three tiers. The synergy web hubs on the
 * bonk stats (impact / knock / mass) — items amplify the physics identity,
 * not just raw DPS. Legendaries are build-defining and always carry a downside.
 */

export type ItemTier = 'common' | 'rare' | 'legendary';

/** Stat modification keys applied by items (see World.computeStats). */
export interface ItemMods {
  dmgPct?: number;
  hpPct?: number;
  hpFlat?: number;
  speedPct?: number;
  knockPct?: number;
  impactPct?: number;
  /** added to cooldownMult (higher = faster cooldowns) */
  cdPct?: number;
  areaPct?: number;
  massPct?: number;
  magnetPct?: number;
  goldPct?: number;
  xpPct?: number;
  regenFlat?: number;
  luckFlat?: number;
  ricochetFlat?: number;
  contactDpsFlat?: number;
}

export interface ItemDef {
  id: string;
  name: string;
  icon: string;
  tier: ItemTier;
  desc: string;
  mods: ItemMods;
  /** max copies per run */
  max: number;
}

const def = (id: string, name: string, icon: string, tier: ItemTier, desc: string, mods: ItemMods, max: number): ItemDef =>
  ({ id, name, icon, tier, desc, mods, max });

export const ITEMS: Record<string, ItemDef> = {
  // ---------- common: small pure bonuses ----------
  ball_bearings: def('ball_bearings', 'Ball Bearings', '⚙️', 'common', '+8% move speed.', { speedPct: 0.08 }, 5),
  grease: def('grease', 'Grease', '🛢️', 'common', '+6% cooldown rate — weapons cycle faster.', { cdPct: 0.06 }, 5),
  chipped_tooth: def('chipped_tooth', 'Chipped Tooth', '🦷', 'common', '+10% knockback dealt. Shove harder.', { knockPct: 0.1 }, 5),
  scrap_plate: def('scrap_plate', 'Scrap Plate', '🛡️', 'common', '+20 max HP.', { hpFlat: 20 }, 5),
  heavy_bolts: def('heavy_bolts', 'Heavy Bolts', '🔩', 'common', '+8% damage.', { dmgPct: 0.08 }, 5),
  wide_axle: def('wide_axle', 'Wide Axle', '📐', 'common', '+8% area — bigger slams, eruptions and orbits.', { areaPct: 0.08 }, 5),
  spring_coil: def('spring_coil', 'Spring Coil', '🌀', 'common', '+10% mass. Shove harder, resist more.', { massPct: 0.1 }, 4),
  firebell: def('firebell', 'Firebell', '🔔', 'common', '+12% impact damage — rams, slams and crash kills.', { impactPct: 0.12 }, 4),
  coin_magnet: def('coin_magnet', 'Coin Magnet', '🧲', 'common', '+15% pickup range.', { magnetPct: 0.15 }, 4),
  spark_plug: def('spark_plug', 'Spark Plug', '🔌', 'common', 'Regenerate +0.5 HP/s.', { regenFlat: 0.5 }, 4),
  loaded_dice: def('loaded_dice', 'Loaded Dice', '🎲', 'common', '+1 Luck — better rarity odds.', { luckFlat: 1 }, 3),
  tip_jar: def('tip_jar', 'Tip Jar', '🫙', 'common', '+10% gold earned.', { goldPct: 0.1 }, 4),

  // ---------- rare: behavior changers ----------
  rage_core: def('rage_core', 'Rage Core', '💢', 'rare', '+25% damage, −10% max HP.', { dmgPct: 0.25, hpPct: -0.1 }, 2),
  splitter_rounds: def('splitter_rounds', 'Splitter Rounds', '➰', 'rare', 'All bolts gain +1 ricochet.', { ricochetFlat: 1 }, 2),
  honey_core: def('honey_core', 'Honey Core', '🍯', 'rare', '+35% mass, −8% move speed. A very serious ball.', { massPct: 0.35, speedPct: -0.08 }, 2),
  nitro_valve: def('nitro_valve', 'Nitro Valve', '🧪', 'rare', '+18% move speed, −10% max HP.', { speedPct: 0.18, hpPct: -0.1 }, 2),
  resonance_fork: def('resonance_fork', 'Resonance Fork', '🍴', 'rare', '+25% impact damage and +15% knockback.', { impactPct: 0.25, knockPct: 0.15 }, 2),
  phantom_gears: def('phantom_gears', 'Phantom Gears', '👻', 'rare', '+20% area.', { areaPct: 0.2 }, 2),
  treasure_maps: def('treasure_maps', 'Treasure Maps', '🗺️', 'rare', '+30% gold and +10% XP.', { goldPct: 0.3, xpPct: 0.1 }, 2),
  thorn_shell: def('thorn_shell', 'Thorn Shell', '🌵', 'rare', 'Deal 8 contact DPS to enemies touching you.', { contactDpsFlat: 8 }, 2),

  // ---------- legendary: build-defining tradeoffs ----------
  wrecking_pact: def('wrecking_pact', "Wrecking Ball's Pact", '💥', 'legendary', '+80% impact damage and +30% knockback, −30% max HP. The world is your weapon.', { impactPct: 0.8, knockPct: 0.3, hpPct: -0.3 }, 1),
  glass_cannon: def('glass_cannon', 'Glass Cannon', '🔮', 'legendary', '+45% damage, −40% max HP. Live fast.', { dmgPct: 0.45, hpPct: -0.4 }, 1),
  temporal_grease: def('temporal_grease', 'Temporal Grease', '⏳', 'legendary', '+35% cooldown rate, −20% damage. Everything, right now.', { cdPct: 0.35, dmgPct: -0.2 }, 1),
  singularity_seed: def('singularity_seed', 'Singularity Seed', '🕳️', 'legendary', '+50% area and +25% knockback, −12% move speed. Own every room.', { areaPct: 0.5, knockPct: 0.25, speedPct: -0.12 }, 1),
};

export const ITEM_TIER_WEIGHT: Record<ItemTier, number> = { common: 36, rare: 14, legendary: 5 };
