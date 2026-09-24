// ORBITAL — level index. Sole export: the 24-level campaign, ids L01..L24.
// Region data lives in region1..4.ts; palettes stay in palettes.ts.
import type { LevelDef } from '../sim';
import { R1_LEVELS } from './region1';
import { R2_LEVELS } from './region2';
import { R3_LEVELS } from './region3';
import { R4_LEVELS } from './region4';

export const LEVELS: LevelDef[] = [...R1_LEVELS, ...R2_LEVELS, ...R3_LEVELS, ...R4_LEVELS];
