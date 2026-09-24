/** XP curve, level-ups and upgrade choice generation. */
import { PASSIVES, WEAPONS, MAX_PASSIVES, MAX_WEAPONS, type PassiveId, type Rarity, type WeaponId } from './data/weapons';
import { EVOLUTIONS, type EvolutionDef } from './data/evolutions';
import { ITEMS, ITEM_TIER_WEIGHT, type ItemTier } from './data/items';
import type { PendingChoice, World } from './state';

export function xpForLevel(level: number): number {
  return Math.floor(6 + level * 4 + Math.pow(level, 1.55));
}

export function grantXp(w: World, amount: number, onLevelUp: () => void): void {
  w.xp += amount * w.stats.xpMult;
  while (w.xp >= w.xpNeed) {
    w.xp -= w.xpNeed;
    w.runStats.level++;
    w.xpNeed = xpForLevel(w.runStats.level);
    onLevelUp();
  }
}

function rarityWeight(r: Rarity, luck: number): number {
  const base = r === 'common' ? 100 : r === 'rare' ? 42 : 16;
  if (r === 'common') return Math.max(40, base - luck * 10);
  return base + luck * 8;
}

function tierWeight(t: ItemTier, luck: number): number {
  if (t === 'common') return ITEM_TIER_WEIGHT.common;
  return ITEM_TIER_WEIGHT[t] * (1 + luck * 0.12);
}

/** Stable identity of a card (banish/lock key). */
export function choiceKey(c: PendingChoice): string {
  return `${c.kind}:${c.id}`;
}

/** The weapon evolution currently claimable, if any. */
export function availableEvolution(w: World): EvolutionDef | null {
  for (const evo of EVOLUTIONS) {
    if (w.evolved.has(evo.weapon)) continue;
    if ((w.weapons.get(evo.weapon) ?? 0) >= WEAPONS[evo.weapon].maxLevel && (w.passives.get(evo.passive) ?? 0) > 0) {
      return evo;
    }
  }
  return null;
}

function buildPool(w: World): Array<{ c: PendingChoice; weight: number }> {
  const pool: Array<{ c: PendingChoice; weight: number }> = [];

  // weapons (depth-gated weapons only appear once the save has earned them)
  for (const wid of Object.keys(WEAPONS) as WeaponId[]) {
    if (!w.unlockedWeapons.has(wid)) continue;
    const def = WEAPONS[wid];
    const lvl = w.weapons.get(wid) ?? 0;
    if (lvl === 0) {
      if (w.weapons.size < MAX_WEAPONS) {
        pool.push({ c: { kind: 'weapon', id: wid, isNew: true, toLevel: 1, rarity: def.rarity }, weight: rarityWeight(def.rarity, w.stats.luck) * 1.1 });
      }
    } else if (lvl < def.maxLevel) {
      pool.push({ c: { kind: 'weapon', id: wid, isNew: false, toLevel: lvl + 1, rarity: def.rarity }, weight: rarityWeight(def.rarity, w.stats.luck) });
    }
  }

  // passives
  for (const pid of Object.keys(PASSIVES) as PassiveId[]) {
    const def = PASSIVES[pid];
    const lvl = w.passives.get(pid) ?? 0;
    if (lvl === 0) {
      if (w.passives.size < MAX_PASSIVES) {
        pool.push({ c: { kind: 'passive', id: pid, isNew: true, toLevel: 1, rarity: def.rarity }, weight: rarityWeight(def.rarity, w.stats.luck) });
      }
    } else if (lvl < def.maxLevel) {
      pool.push({ c: { kind: 'passive', id: pid, isNew: false, toLevel: lvl + 1, rarity: def.rarity }, weight: rarityWeight(def.rarity, w.stats.luck) });
    }
  }

  // items
  for (const item of Object.values(ITEMS)) {
    const owned = w.items.get(item.id) ?? 0;
    if (owned < item.max) {
      pool.push({ c: { kind: 'item', id: item.id, isNew: owned === 0, toLevel: owned + 1, rarity: item.tier }, weight: tierWeight(item.tier, w.stats.luck) });
    }
  }
  return pool;
}

/**
 * Build 3 distinct upgrade choices: weapons, passives, items — plus a pinned
 * evolution card when one is claimable and the player's locked card when valid.
 * Banished cards never appear. Returns empty array only if the pool is exhausted.
 */
export function rollChoices(w: World, count = 3): PendingChoice[] {
  const pool = buildPool(w).filter((p) => !w.banished.has(choiceKey(p.c)));

  const choices: PendingChoice[] = [];
  const taken = new Set<string>();
  const tryPin = (c: PendingChoice | null): void => {
    if (!c) return;
    const k = choiceKey(c);
    if (taken.has(k)) return;
    if (c.kind === 'evolution') {
      taken.add(k);
      choices.push(c);
    } else if (pool.some((p) => choiceKey(p.c) === k)) {
      taken.add(k);
      choices.push(c);
    }
  };

  // a claimable evolution is always offered first
  const evo = availableEvolution(w);
  if (evo) {
    tryPin({ kind: 'evolution', id: evo.id, isNew: true, toLevel: 1, rarity: 'epic' });
  }
  // the locked card reappears (unless it IS the evolution just pinned)
  tryPin(w.locked);

  for (let n = choices.length; n < count && pool.length > 0; n++) {
    let total = 0;
    for (const p of pool) if (!taken.has(choiceKey(p.c))) total += p.weight;
    if (total <= 0) break;
    let roll = w.rng.next() * total;
    let picked: PendingChoice | null = null;
    for (const p of pool) {
      if (taken.has(choiceKey(p.c))) continue;
      roll -= p.weight;
      if (roll <= 0) {
        picked = p.c;
        break;
      }
    }
    if (!picked) break;
    taken.add(choiceKey(picked));
    choices.push(picked);
  }
  return choices;
}

export function applyChoice(w: World, c: PendingChoice): void {
  if (c.kind === 'weapon') {
    const id = c.id as WeaponId;
    const cur = w.weapons.get(id) ?? 0;
    if (cur === 0) w.addWeapon(id);
    else w.weapons.set(id, cur + 1);
  } else if (c.kind === 'passive') {
    const id = c.id as PassiveId;
    w.passives.set(id, (w.passives.get(id) ?? 0) + 1);
  } else if (c.kind === 'item') {
    w.items.set(c.id, (w.items.get(c.id) ?? 0) + 1);
  } else if (c.kind === 'evolution') {
    const evo = EVOLUTIONS.find((e) => e.id === c.id);
    if (evo && !w.evolved.has(evo.weapon)) {
      w.evolved.add(evo.weapon);
    }
  }
  w.locked = null;
  w.refreshStats();
}

/** Human-readable delta for a card, e.g. "DMG 14 → 20 · CD 2.4 → 2.2s" */
export function choiceDetail(c: PendingChoice): string {
  if (c.kind === 'weapon') {
    const def = WEAPONS[c.id as WeaponId];
    if (c.isNew) return def.desc;
    const cur = def.levels[c.toLevel - 2];
    const next = def.levels[c.toLevel - 1];
    const bits: string[] = [];
    if (next.dmg !== cur.dmg) bits.push(`DMG ${cur.dmg}→${next.dmg}`);
    if (next.cd !== cur.cd) bits.push(`CD ${cur.cd}s→${next.cd}s`);
    if ((next.count ?? 0) !== (cur.count ?? 0)) bits.push(`COUNT ${cur.count}→${next.count}`);
    if ((next.radius ?? 0) !== (cur.radius ?? 0)) bits.push(`AREA ${cur.radius}→${next.radius}`);
    if ((next.bounces ?? 0) !== (cur.bounces ?? 0)) bits.push(`BOUNCE ${cur.bounces}→${next.bounces}`);
    return bits.join(' · ');
  }
  if (c.kind === 'passive') {
    return PASSIVES[c.id as PassiveId].desc;
  }
  if (c.kind === 'item') {
    const def = ITEMS[c.id];
    const owned = c.toLevel - 1;
    return def.desc + (owned > 0 ? ` (owned ×${owned})` : '');
  }
  const evo = EVOLUTIONS.find((e) => e.id === c.id);
  return evo ? evo.desc : '';
}

/** Card title line for the level-up UI. */
export function choiceName(c: PendingChoice): string {
  if (c.kind === 'weapon') return WEAPONS[c.id as WeaponId].name;
  if (c.kind === 'passive') return PASSIVES[c.id as PassiveId].name;
  if (c.kind === 'item') return ITEMS[c.id].name;
  return EVOLUTIONS.find((e) => e.id === c.id)?.name ?? c.id;
}

export function choiceIcon(c: PendingChoice): string {
  if (c.kind === 'weapon') return WEAPONS[c.id as WeaponId].icon;
  if (c.kind === 'passive') return PASSIVES[c.id as PassiveId].icon;
  if (c.kind === 'item') return ITEMS[c.id].icon;
  return EVOLUTIONS.find((e) => e.id === c.id)?.icon ?? '⭐';
}
