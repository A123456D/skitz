/** Event bus: sim -> render/juice/audio effects. Cleared every rendered frame. */
export type AttackKind = 'lunge' | 'spit' | 'pound' | 'charge';

export interface Events {
  hitEnemy(x: number, y: number, dmg: number): void;
  enemyDeath(x: number, y: number, type: number, elite: boolean): void;
  impact(x: number, y: number, force: number): void;
  wallBonk(x: number, y: number, force: number): void;
  explosion(x: number, y: number, radius: number): void;
  slam(x: number, y: number, radius: number): void;
  zap(x1: number, y1: number, x2: number, y2: number): void;
  playerHurt(dmg: number): void;
  levelUp(): void;
  goldPickup(value: number): void;
  gemPickup(): void;
  bossSpawn(x: number, y: number, type: number): void;
  /** the player's weapon fired — drives per-weapon player animation */
  playerAttack(kind: 'slam' | 'shot' | 'dash'): void;
  /** an enemy began winding up a special attack — telegraph fx + audio */
  enemyAttack(x: number, y: number, kind: AttackKind): void;
  /** shock-trail node erupted */
  eruption(x: number, y: number, radius: number): void;
  /** tank/BONZAR ground pound: aoe shockwave at x,y */
  pound(x: number, y: number, radius: number): void;
  /** a crate took damage but survived */
  crateHit(x: number, y: number): void;
  /** a crate shattered */
  obstacleBreak(x: number, y: number): void;
  /** the ball jumped */
  playerJump(): void;
  /** the ball touched down (no slam) */
  playerLand(x: number, y: number): void;
  /** body-slam initiated mid-air */
  playerSlamStart(x: number, y: number): void;
  /** body-slam connected with the ground: AoE at x,y */
  groundSlam(x: number, y: number, radius: number): void;
  /** a pinball bumper flung something */
  bumperHit(x: number, y: number): void;
  /** a jump pad launched the player */
  jumpPad(x: number, y: number): void;
  /** a boost pad kicked in */
  boostPad(x: number, y: number): void;
  /** the player entered a new zone */
  zoneChange(name: string): void;
  /** a shrine buff was claimed */
  shrineTaken(kind: 'might' | 'regen' | 'magnet'): void;
  /** a gold cache was looted */
  cacheLooted(x: number, y: number): void;
  /** a chest was broken open */
  chestOpened(x: number, y: number): void;
  /** Gravity Crush pulls enemies toward a point before the slam lands */
  gravityPull(x: number, y: number, radius: number): void;
  /** Juggernaut tremor: a light shockwave trails the dash */
  tremor(x: number, y: number, radius: number): void;
  /** METEOR SHOWER: a meteor detonated at x,y (lighter than a full explosion) */
  meteor(x: number, y: number, radius: number): void;
  /** a boss dropped below half hp: phase 2 begins (type: ENEMY id) */
  bossEnrage(x: number, y: number, type: number): void;
}
