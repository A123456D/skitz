// Stroke naming, objective evaluation, medals — the scoring half of the glue.
import type { LevelDef, ObjectiveDef, World } from '../sim';
import type { Medal } from '../save/save';

export function strokeName(strokes: number, par: number): string {
  const d = strokes - par;
  if (d <= -3) return 'ACE';
  if (d === -2) return 'STELLAR';
  if (d === -1) return 'ORBITAL';
  if (d === 0) return 'PAR';
  if (d === 1) return 'DRIFT';
  return 'WRECK';
}

/** Is an objective satisfied? `hazardHappened` spans the whole level;
 *  `secretsFound` holds objective ids whose zone the ball entered. */
export function objectiveDone(
  obj: ObjectiveDef,
  w: World,
  hazardHappened: boolean,
  secretsFound: Set<string>,
): boolean {
  switch (obj.kind) {
    case 'pinsMax':
      return w.pinsUsedTotal <= obj.value;
    case 'orbit':
      return w.orbits >= (obj.value ?? 1);
    case 'touch':
      return w.touchedIds.includes(obj.targetId);
    case 'noHazard':
      return !hazardHappened;
    case 'secret':
      return secretsFound.has(obj.id);
  }
}

export function evaluateObjectives(
  def: LevelDef,
  w: World,
  hazardHappened: boolean,
  secretsFound: Set<string>,
): boolean[] {
  return (def.objectives ?? []).map((o) => objectiveDone(o, w, hazardHappened, secretsFound));
}

export function computeMedals(
  strokes: number,
  par: number,
  objDone: boolean[],
  fragTaken: number,
  fragTotal: number,
): Medal {
  return {
    par: strokes <= par,
    obj: objDone.length > 0 && objDone.every(Boolean),
    frag: fragTotal > 0 && fragTaken === fragTotal,
  };
}

/** Secret zones live on the objective list — checked per frame while playing. */
export function secretZones(def: LevelDef): { id: string; x: number; y: number; r: number }[] {
  return (def.objectives ?? [])
    .filter((o): o is Extract<ObjectiveDef, { kind: 'secret' }> => o.kind === 'secret')
    .map((o) => ({ id: o.id, x: o.x, y: o.y, r: o.r }));
}
