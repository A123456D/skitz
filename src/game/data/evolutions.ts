/** Weapon evolutions: maxed weapon + its paired passive transforms the weapon. */

import type { PassiveId, WeaponId } from './weapons';

export interface EvolutionDef {
  /** base weapon that transforms */
  weapon: WeaponId;
  /** paired passive requirement (any level) */
  passive: PassiveId;
  id: string;
  name: string;
  icon: string;
  desc: string;
}

export const EVOLUTIONS: EvolutionDef[] = [
  {
    weapon: 'slam', passive: 'mass', id: 'gravcrush',
    name: 'Gravity Crush', icon: '🕳️',
    desc: 'Seismic Slam implodes: enemies nearby are dragged inward, charged, then detonated by the slam (+25% dmg, wider).',
  },
  {
    weapon: 'shot', passive: 'ricochet', id: 'pinball',
    name: 'Pinball Storm', icon: '🎯',
    desc: 'Ricochet Round never stops: bolts bounce forever, gaining +5% speed per hit (they even plow through crates).',
  },
  {
    weapon: 'orbit', passive: 'velocity', id: 'sawring',
    name: 'Sawring', icon: '🪚',
    desc: 'Orbit Spikes periodically launch a spinning saw that ricochets off walls and carves through the horde.',
  },
  {
    weapon: 'dash', passive: 'impact', id: 'juggernaut',
    name: 'Juggernaut', icon: '🚂',
    desc: 'Wreck Dash becomes a rolling quake: longer, harder-hitting, and the ground trembles behind you.',
  },
  {
    weapon: 'trail', passive: 'magnet', id: 'teslaweb',
    name: 'Tesla Web', icon: '🕸️',
    desc: 'Shock Trail nodes arc lightning to nearby enemies and slow them — a crawling web of static.',
  },
  {
    weapon: 'chain', passive: 'luck', id: 'stormcaller',
    name: 'Stormcaller', icon: '🌩️',
    desc: 'Static Chain gains +1 target and every victim forks the arc once more, slowing everything it touches.',
  },
];

export function evolutionFor(weapon: WeaponId): EvolutionDef | undefined {
  return EVOLUTIONS.find((e) => e.weapon === weapon);
}
