// Shared UI vocabulary — stroke terms, modifiers, region display metadata.

/** design.md §6 — ACE…WRECK for −3…+2 vs par (beyond = WRECK). */
export const STROKE_TERMS = ['ACE', 'STELLAR', 'ORBITAL', 'PAR', 'DRIFT', 'WRECK'] as const;
export type StrokeTerm = (typeof STROKE_TERMS)[number];

export function strokeTerm(diff: number): StrokeTerm {
  if (diff <= -3) return 'ACE';
  if (diff === -2) return 'STELLAR';
  if (diff === -1) return 'ORBITAL';
  if (diff === 0) return 'PAR';
  if (diff === 1) return 'DRIFT';
  return 'WRECK';
}

export type TermPolarity = 'sub' | 'par' | 'over';

/** Sub-par reads warm (accent), par neutral, over-par muted. */
export function termPolarity(term: StrokeTerm): TermPolarity {
  const i = STROKE_TERMS.indexOf(term);
  if (i < 3) return 'sub';
  return i === 3 ? 'par' : 'over';
}

export interface ModifierDef {
  id: string;
  blurb: string;
}

/** design.md §6 replay modifiers — ids are passed straight to onPlayLevel. */
export const MODIFIERS: ModifierDef[] = [
  { id: 'HEAVY', blurb: 'gravity × 1.5' },
  { id: 'DRIFTWOOD', blurb: 'gravity × 0.6' },
  { id: 'PIN FAMINE', blurb: 'pin budget −1' },
  { id: 'ONE SHOT', blurb: 'par 1' },
  { id: 'TIME ATTACK', blurb: 'beat the clock' },
];

export interface RegionMeta {
  id: 1 | 2 | 3 | 4;
  name: string;
  numeral: string;
  accent: string;
}

// Inlined from src/levels/palettes.ts (ui→levels imports are not permitted) —
// keep the accent hexes in sync with REGION_PALETTES there.
export const REGIONS: RegionMeta[] = [
  { id: 1, name: 'THE PRACTICE ORBIT', numeral: 'I', accent: '#7fd8e8' },
  { id: 2, name: 'THE GRAVEYARD', numeral: 'II', accent: '#e8a06f' },
  { id: 3, name: 'THE GIANTS', numeral: 'III', accent: '#ffc46b' },
  { id: 4, name: 'THE GRAND COURSE', numeral: 'IV', accent: '#c9a0ff' },
];
