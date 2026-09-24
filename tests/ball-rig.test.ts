/**
 * Visualization gate: every weapon, passive, evolution and character face MUST
 * have a sprite that (a) exists in the atlas and (b) is wired into the ball rig.
 * A new weapon without graphics fails here — "everything must be visualized".
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { WEAPONS, PASSIVES } from '../src/game/data/weapons';
import { WEAPON_ATTACHMENT, PASSIVE_CHARM, EVO_ATTACHMENT } from '../src/game/data/ballRig';
import { EVOLUTIONS, evolutionFor } from '../src/game/data/evolutions';
import { CHARACTERS } from '../src/game/data/characters';
import { evolveWeapon } from './helpers';

const atlasFrames: Record<string, unknown> = JSON.parse(
  readFileSync(new URL('../public/atlas.json', import.meta.url), 'utf8'),
).frames;

const inAtlas = (name: string | undefined): boolean => !!name && name in atlasFrames;

describe('ball rig visualization gate', () => {
  it('every weapon mounts an attachment with a valid slot and atlas sprite', () => {
    const slots = new Set(['band', 'hoop', 'aim', 'back', 'top', 'low', 'wing']);
    for (const id of Object.keys(WEAPONS) as Array<keyof typeof WEAPONS>) {
      const att = WEAPON_ATTACHMENT[id];
      expect(att, `weapon ${id} has no attachment`).toBeDefined();
      expect(slots.has(att.slot), `weapon ${id} slot ${att.slot} invalid`).toBe(true);
      expect(inAtlas(att.sprite), `weapon ${id} sprite ${att.sprite} missing from atlas`).toBe(true);
    }
  });

  it('every weapon evolution has its evolved sprite in the atlas', () => {
    for (const evo of EVOLUTIONS) {
      const att = WEAPON_ATTACHMENT[evo.weapon];
      expect(inAtlas(att.evoSprite), `evolution ${evo.id} evoSprite missing from atlas`).toBe(true);
      expect(EVO_ATTACHMENT[evo.id]).toBe(att.evoSprite);
    }
  });

  it('every passive has a charm sprite in the atlas', () => {
    for (const id of Object.keys(PASSIVES) as Array<keyof typeof PASSIVES>) {
      expect(inAtlas(PASSIVE_CHARM[id]), `passive ${id} charm missing from atlas`).toBe(true);
    }
  });

  it('every character face overlay exists in the atlas', () => {
    for (const c of CHARACTERS) {
      if (c.face) expect(inAtlas(c.face), `character ${c.id} face ${c.face} missing`).toBe(true);
    }
  });

  it('evolving a weapon flips its rig attachment to the evolved sprite', () => {
    // sanity: the evolution path can never silently unlink the rig
    expect(evolutionFor('slam')?.id).toBe('gravcrush');
    expect(EVO_ATTACHMENT.gravcrush).toBe(WEAPON_ATTACHMENT.slam.evoSprite);
  });
});
