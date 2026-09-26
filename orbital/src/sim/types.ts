// ORBITAL — sim types. This is the data contract for levels and runtime state.
// Pure data: no rendering, no DOM, no engine imports.

export interface Vec2 { x: number; y: number }

// ---------------------------------------------------------------- level schema

export type BodyKind = 'attractor' | 'repulsor' | 'pulse' | 'path' | 'anchor' | 'unstable';

export type Material =
  | 'rock' | 'ice' | 'metal' | 'glass' | 'gas' | 'crystal'
  | 'machine' | 'molten' | 'organic';

/** Waypoint path (world units/sec along the polyline). */
export interface PathDef {
  points: Vec2[];
  speed: number;
  mode: 'loop' | 'pingpong';
}

/** Circular orbit around another body. */
export interface OrbitPathDef {
  parent: string;
  r: number;
  speed: number; // radians/sec, signed
  phase: number;
}

/** Activation conditions. A gated body starts inactive. */
export interface GateDef {
  /** Fires (latches on) when this switch activates. */
  switchId?: string;
  /** After `delay` seconds, cycles: on for `on`, off for `period - on`. */
  timer?: { delay: number; period: number; on: number };
  /** Active only while the ball is within this radius. */
  proximity?: number;
}

export interface BodyDef {
  id: string;
  kind: BodyKind;
  x: number;
  y: number;
  /** Collision + visual radius. 0 = massless point (anchor). */
  radius: number;
  /** Gravitational parameter mu (accel = mu / (d^2 + SOFTENING)). */
  mu: number;
  influenceR: number;
  material: Material;
  /** Contact kills the stroke (molten stars, shredders). */
  deadly?: boolean;
  // --- pulse
  pulsePeriod?: number;
  pulsePhase?: number;
  /** Fraction of mu at the pulse trough (default 0.35). */
  pulseMin?: number;
  // --- path (either waypoint path or parent orbit)
  path?: PathDef | OrbitPathDef;
  // --- unstable
  muMin?: number;
  muMax?: number;
  /** Seconds between instability retargets (default 1.2). */
  wanderT?: number;
  // --- gating
  gate?: GateDef;
}

export type ZoneKind = 'void' | 'flipper' | 'amp' | 'damp' | 'corridor';

export interface ZoneDef {
  id: string;
  kind: ZoneKind;
  /** Circular zones (void/flipper/amp/damp). */
  x?: number;
  y?: number;
  radius?: number;
  /** void: 0..1 cancel fraction · amp: 1.5..3 · damp: 0.3..0.6. flipper is fixed -0.85. */
  strength?: number;
  /** Corridor capsule: pull to axis, accelerate along it. */
  a?: Vec2;
  b?: Vec2;
  corridorR?: number;
  /** Corridor acceleration magnitude (u/s^2), not inverse-square. */
  accel?: number;
  dir?: 1 | -1;
  gate?: GateDef;
}

export type HazardDef =
  | { id: string; kind: 'barrier'; a: Vec2; b: Vec2 }
  | { id: string; kind: 'bumper'; x: number; y: number; r: number; boost: number }
  | { id: string; kind: 'beam'; x: number; y: number; len: number; r: number; spin: number; phase?: number };

export interface SwitchDef {
  id: string;
  x: number;
  y: number;
  r: number;
  mode: 'once' | 'toggle';
  /** Body/zone ids activated when fired. */
  targets: string[];
}

export interface WormholeDef {
  id: string;
  x: number;
  y: number;
  r: number;
  exitId: string;
  /** Velocity rotation on transfer, radians. */
  angleDelta?: number;
}

export interface HoleDef {
  x: number;
  y: number;
  captureR?: number; // default 20
  path?: PathDef;    // THE MOVING GREEN
}

export type ObjectiveDef =
  | { id: string; kind: 'pinsMax'; value: number; text: string }
  | { id: string; kind: 'orbit'; value?: number; text: string }
  | { id: string; kind: 'touch'; targetId: string; text: string }
  | { id: string; kind: 'noHazard'; text: string }
  | { id: string; kind: 'secret'; x: number; y: number; r: number; text: string };

export type StoryWho = 'milo' | 'coursekeeper' | 'sprocket' | 'announcer' | 'log';

export interface StoryLine { who: StoryWho; text: string }

export interface StoryTrigger {
  id: string;
  on:
    | { type: 'start' }
    | { type: 'stroke'; number: number }
    | { type: 'firstBounce' }
    | { type: 'sink' }
    | { type: 'zone'; x: number; y: number; r: number };
  lines: StoryLine[];
}

export interface DebrisDef {
  x: number;
  y: number;
  r: number;
  vx?: number;
  vy?: number;
}

export interface LevelDef {
  id: string; // 'L01'
  name: string;
  region: 1 | 2 | 3 | 4;
  /** One-line central idea (the variety rule — see docs/design.md §7). */
  concept: string;
  par: number;
  /** Max simultaneous Gravity Pins per stroke. */
  pinBudget: number;
  /** Mid-air boosts per stroke (default 1 — tap during flight to nudge). */
  boosts?: number;
  tee: Vec2;
  hole: HoleDef;
  /** Elliptical play area; leaving it for >1.5 s loses the ball to the void. */
  bounds: { cx: number; cy: number; rx: number; ry: number };
  bodies: BodyDef[];
  zones?: ZoneDef[];
  hazards?: HazardDef[];
  debris?: DebrisDef[];
  wormholes?: WormholeDef[];
  switches?: SwitchDef[];
  /** Required firing order for 'once' switches; out-of-order contact resets progress. */
  sequence?: string[];
  fragments?: Vec2[];
  objectives?: ObjectiveDef[];
  story?: StoryTrigger[];
  hint?: string;
}

// ------------------------------------------------------------- runtime state

export interface BodyState extends BodyDef {
  cx: number;
  cy: number;
  active: boolean;
  muCurrent: number;
  // waypoint path
  pathT?: number;
  pathDir?: 1 | -1;
  segLens?: number[];
  pathTotal?: number;
  // parent orbit
  orbitAngle?: number;
  // unstable
  unstableTarget?: number;
  unstableT?: number;
  // gate latch (switch-fired) — proximity gates compute each tick instead
  latched?: boolean;
}

export interface ZoneState extends ZoneDef {
  active: boolean;
  latched?: boolean;
}

export interface HazardState {
  def: HazardDef;
  id: string;
}

export interface DebrisState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  alive: boolean;
}

export interface PinState {
  id: number;
  x: number;
  y: number;
  mu: number;
  influenceR: number;
}

export interface BallState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  flying: boolean;
  settled: boolean;
  dead: boolean;
  sunk: boolean;
  /** Visual roll accumulator (radians). */
  spin: number;
  // orbit tracking
  orbitBody: string | null;
  orbitAngleAcc: number;
  // timers
  slowTime: number;
  outOfBoundsT: number;
  wormCool: number;
  hazardTouched: boolean;
  bounces: number;
}

export type StrokeEndReason = 'sunk' | 'settled' | 'hazard' | 'voided';

export type SimEvent =
  | { type: 'launch'; x: number; y: number; vx: number; vy: number }
  | { type: 'boost'; x: number; y: number; vx: number; vy: number }
  | { type: 'bounce'; x: number; y: number; speed: number }
  | { type: 'hazard'; x: number; y: number }
  | { type: 'sink'; x: number; y: number }
  | { type: 'lipout'; x: number; y: number; speed: number }
  | { type: 'settled'; x: number; y: number }
  | { type: 'voided'; x: number; y: number }
  | { type: 'orbit'; bodyId: string }
  | { type: 'switch'; switchId: string; ok: boolean }
  | { type: 'sequenceReset' }
  | { type: 'fragment'; index: number; x: number; y: number }
  | { type: 'pinPlace'; x: number; y: number }
  | { type: 'pinDeny'; x: number; y: number }
  | { type: 'wormhole'; x: number; y: number }
  | { type: 'strokeEnd'; reason: StrokeEndReason };

export interface World {
  def: LevelDef;
  seed: number;
  rng: () => number;
  gravityScale: number;
  t: number;
  ball: BallState;
  bodies: BodyState[];
  zones: ZoneState[];
  hazards: HazardState[];
  debris: DebrisState[];
  pins: PinState[];
  switches: { def: SwitchDef; hit: boolean; on: boolean }[];
  seqProgress: number;
  wormholes: { def: WormholeDef; cool: number }[];
  fragments: { x: number; y: number; taken: boolean }[];
  holeX: number;
  holeY: number;
  holeT: number;
  holeDir: 1 | -1;
  holeSegLens: number[] | null;
  holeSegTotal: number;
  strokes: number;
  pinsUsedTotal: number;
  boostsLeft: number;
  orbits: number;
  strokeEnded: StrokeEndReason | null;
  events: SimEvent[];
  /** Previous relative angle to the dominant body (orbit integration). */
  orbitPrevAngle: number | null;
  /** Body/switch ids the ball has touched this level ('touch' objectives). */
  touchedIds: string[];
  nextPinId: number;
}
