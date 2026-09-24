/**
 * BallRig attachment tables: which sprite each owned weapon/passive mounts on
 * the ball, and where. Pure data (no pixi imports) so tests can enforce the
 * "everything visualized" rule: a weapon without graphics fails CI here.
 */
import type { PassiveId, WeaponId } from './weapons';
import { EVOLUTIONS } from './evolutions';

/** Mount points on the rig (rig-local px offsets from ball center are in render/ballRig.ts). */
export type Slot = 'band' | 'hoop' | 'aim' | 'back' | 'top' | 'low';

export interface WeaponAttachment {
  sprite: string;
  /** sprite used once the weapon is evolved */
  evoSprite?: string;
  slot: Slot;
  /** accent used for the equip flash + underglow */
  tint: number;
}

export const WEAPON_ATTACHMENT: Record<WeaponId, WeaponAttachment> = {
  slam: { sprite: 'att_band', evoSprite: 'att_band_gc', slot: 'band', tint: 0xffa63f },
  shot: { sprite: 'att_cannon', evoSprite: 'att_cannon_pb', slot: 'aim', tint: 0xffe27a },
  orbit: { sprite: 'att_hoop', evoSprite: 'att_hoop_sr', slot: 'hoop', tint: 0x9fb4d8 },
  dash: { sprite: 'att_rocket', evoSprite: 'att_rocket_jg', slot: 'back', tint: 0xff5470 },
  trail: { sprite: 'att_cell', evoSprite: 'att_cell_tw', slot: 'low', tint: 0x4de1ff },
  chain: { sprite: 'att_coil', evoSprite: 'att_coil_sc', slot: 'top', tint: 0x8fb7ff },
};

/** evolution id -> evolved attachment sprite override (must match evoSprite). */
export const EVO_ATTACHMENT: Record<string, string> = Object.fromEntries(
  EVOLUTIONS.map((e) => {
    const att = WEAPON_ATTACHMENT[e.weapon];
    return [e.id, att.evoSprite ?? att.sprite];
  }),
);

/** passive id -> charm sprite hung on the ball. */
export const PASSIVE_CHARM: Record<PassiveId, string> = {
  mass: 'charm_mass',
  velocity: 'charm_velocity',
  magnet: 'charm_magnet',
  vitality: 'charm_vitality',
  regen: 'charm_regen',
  impact: 'charm_impact',
  ricochet: 'charm_ricochet',
  luck: 'charm_luck',
};

/** Deterministic charm anchor order (fill slots left→right as passives are acquired). */
export const CHARM_SLOTS: Array<{ x: number; y: number }> = [
  { x: -14, y: 6 },
  { x: 14, y: 6 },
  { x: -15, y: -1 },
  { x: 15, y: -1 },
];
