# ORBITAL: THE LAST TEE — Design Contract (v1)

Single source of truth for mechanics, content, story, art, audio, UI. Subagents build
against this file; changes to shared numbers happen here, not in code comments.

**Fantasy:** Golf meets a physics toybox meets a cinematic space adventure. You are Milo,
a sarcastic old golf ball, playing the last round on a collapsing cosmic golf course —
and gravity itself is your club.

**Core loop (verbs):** READ the field → AIM → SHAPE gravity (pins / switches) → FIRE →
ADAPT mid-flight (timing, gates) → SINK → SCORE → MASTER (objectives) → ADVANCE (story).
Every mechanic must feed one of these verbs. "Same level, different planets" is a reject.

**Identity rule:** If we removed the title, the game should still be recognizable as
ORBITAL: gravity is drawn, audible, and sculptable; the diorama feels like a place.

---

## 1. Physics (sim/ — deterministic, seeded)

- Fixed 60 Hz timestep, velocity-Verlet integration. Same inputs + seed → same outcome.
- World units ≈ pixels at zoom 1. Ball radius 10. Launch speed 0–900 u/s.
- **Gravity law:** acceleration `a = mu / (d² + SOFTENING)`, `SOFTENING = 400`, applied
  only inside `influenceR` with a smooth 15%-of-R fade at the edge (no discontinuities).
- Reference mass `mu = 5.0e6` ("standard planet") → circular-orbit speed at r=150 is
  ~183 u/s. Levels are tuned around capture speeds of 120–260 u/s.
- **Ball vs body collision:** reflect off the surface, restitution 0.55, tangential
  damping 0.92. Landing slow (< 30 u/s and local field weak) → ball settles → stroke ends.
- **Hole:** capture radius 16, sink if entry speed < 260 u/s, else a "lip out" deflection.
- **Orbit tracking:** while bound to a dominant body, accumulate signed angle; full 2π
  fires an `orbit` event (objective + style scoring).
- Stuck detection: kinetic energy < threshold for 3 s → stroke ends ("settled").
- Out of the elliptical level bounds for > 1.5 s → stroke lost ("drifted into the void").

## 2. Gravity sources (data-driven `bodies[]`)

| kind | behavior | visual language |
| --- | --- | --- |
| `attractor` | standard pull | material planet, field particles drift inward |
| `repulsor` | push away | spiky/ringed body, field particles drift outward |
| `pulse` | `mu * (min + (1-min) * (0.5+0.5*sin(2πt/T+φ)))` | body breathes in scale/brightness on period T |
| `path` | follows waypoints (`loop`/`pingpong`) or orbits a parent body | motion trail behind it |
| `anchor` | mass with radius 0, no collision | thin dashed ring, no planet |
| `unstable` | mu random-walks in [muMin, muMax], retarget every `wanderT` s | flickering/surging aura |

Every body: `material` = rock | ice | metal | glass | gas | crystal | machine | molten |
organic. Materials change the render recipe (not just tint): silhouette, surface detail,
lighting. Gating: a body may start inactive until a `switch` fires or a timer/proximity
condition is met (gravity **activation switches**, per brief).

## 3. Gravity zones (`zones[]`) — area modifiers, composable

| kind | effect | visual |
| --- | --- | --- |
| `void` | multiply all other gravity by `1 - strength` inside (dead zone) | starfield "hole", desaturated, particles fall still |
| `flipper` | negate all other gravity inside × -0.85 | inverted-color ripple, arrows reversed |
| `amp` | multiply other gravity × 1.5–3 inside | converging shimmer |
| `damp` | multiply other gravity × 0.3–0.6 inside | slow, syrupy drift |
| `corridor` | capsule: pulls to axis, then accelerates along axis (a gravity tunnel) | flowing streaks along axis |

Modifiers compose in deterministic id order: sum sources → apply zones in id order.

## 4. Gravity Pins — THE core mechanic

- Placed **during aim, before firing**; live for that shot only; cleared when the stroke ends.
- Budget = `pinBudget` per stroke (level-defined, typically 1–3). HUD shows pins as physical tee markers.
- Pin default: `mu = 1.2e6`, `influenceR = 260`, material 'pin' (amber crystal shard).
- Placement rules: not inside a body/hazard; max simultaneous = budget.
- Prediction shows pins' effect — sculpt, preview, commit. That loop IS the game.

## 5. Objects & hazards

- `barrier` — deadly energy segment. `bumper` — elastic reflect + boost. `beam` — rotating
  deadly arm. Wormhole pair — transfer preserving speed, optional rotation delta, 0.5 s cooldown.
- `debris` — small physics-driven rocks (attracted by gravity, collide with bodies).
  Debris can capture into orbit, trigger switches, block shots — debris is material, not just walls.
- `switch` — circle trigger linked to body ids; modes `once` | `toggle` | `sequence`
  (sequence must be hit in `order`, wrong hit resets). Visual conduit links switch → target.
- `fragments` — 3 collectibles per level on risky lines (persistent collect state).
- `hole` — static or on a `path` (THE MOVING GREEN).

## 6. Scoring & objectives

- Stroke terms (golf flavor, cosmic words): **ACE / STELLAR / ORBITAL / PAR / DRIFT / WRECK**
  (−3/-2/-1/0/+1/+2 vs par, beyond = WRECK).
- Three medals per level: ⛳ strokes ≤ par · 🎯 all optional objectives · ✨ all 3 fragments.
- Objective kinds: `parMax`, `pinsMax` (≤ N pins total), `orbit` (complete ≥ 1 orbit),
  `touch` (a marked object), `noHazard`, `secret` (hidden trigger zone found).
- Replay modifiers (level-select toggles, score multipliers): HEAVY (gravity ×1.5),
  DRIFTWOOD (gravity ×0.6), PIN FAMINE (budget −1), ONE SHOT (par 1), TIME ATTACK.

## 7. Campaign — 24 levels, 4 regions (every level = one named IDEA)

**R1 THE PRACTICE ORBIT** (teach; clean celestial architecture, calm): 
1 First Contact (pure attractor, par 2) · 2 The Bend (bend around a barrier) · 
3 Capture (must orbit then escape at the right point — THE ORBIT) · 4 Pushback (repulsor slingshot) ·
5 Still Air (dead zone: momentum is everything) · 6 The Tee (pins tutorial: an impossible line,
solvable only with a pin) · 7 Binary (two-body slingshot chain).

**R2 THE GRAVEYARD** (wrecks, debris, unease): 
8 Driftwood (debris as cover AND tool) · 9 The Wreck (rotating beams, THE TINY GAP) ·
10 Bad Weather (unstable mass — read the surging field) · 11 The Slingshot (timing a moving planet —
ALIGNMENT) · 12 The False Path (direct route is a trap; real route swings wide) ·
13 The Cascade (one pin drops debris onto a switch, chain reaction) · 14 The Moving Green (hole orbits).

**R3 THE GIANTS** (huge bodies, long arcs, awe): 
15 The Giant (one enormous mass dominates; par via long orbit) · 16 Pinball Orbit (alternate
attract/repel) · 17 The Artery (corridor run) · 18 Figure Eight (orbit two giants in sequence) ·
19 The Forge (amp/damp fields shape the route) · 20 Deep Field (weak gravity, momentum dominates) ·
21 The Sequence (switches in order — THE MACHINE).

**R4 THE GRAND COURSE** (finale teaser, everything combined): 
22 The Gauntlet · 23 The Chorus (multi-body chaos, readable) · 24 The Last Tee (the Course's
calibration cradle wakes when Milo arrives — cliffhanger).

Level validation: static checks (hole not inside a body, bounds cover all objects, par
reachable heuristic, budget ≥ objective needs) + distinctness review (each level's
`concept` names its idea; no two levels share idea + archetype).

## 8. Story — told in ≤ 2-line beats, mostly environmental

**Milo arc:** confused (R1) → curious (R2) → suspicious (R3) → fascinated/aware (R4).
**Recurring entities:**
- **THE COURSEKEEPER** — ancient maintenance AI, formal, fading; calls Milo
  "CALIBRATION ASSET 7". Milo: "The name's Milo."
- **SPROCKET** — broken one-wheel drone; beeps, nudges fragments toward Milo, follows
  between levels (visible in menus by R3).
- **THE ANNOUNCER** — tournament PA that still thinks the Grand Open is running
  ("Spectacular! The crowd goes wild!") in empty sectors. Comic, then eerie.
- **THE DRIFT** — never speaks: a faint nebula shape that mirrors Milo's trail.
**Mystery clues (environmental, scattered):** calibration records ("ASSET 7 — tolerance
0.0003°, do not substitute"), a shelf of worn balls labeled 1–6, glyphs matching Milo's
dimple-marking on Course machinery, machines that wake only when Milo is near, locked
"recalibration" doors. Final beat of L24: the cradle scans Milo → "WELCOME HOME, ASSET 7."

Story delivery: bottom subtitle bar, non-blocking, triggered by zone entry / events
(stroke 2, first bounce, sink). No cutscenes > 6 s.

## 9. Art direction — premium cosmic diorama (NOT neon space mobile game)

- Depth: 3 parallax layers (nebula wash → distant megastructure silhouettes → midground
  props) + vignette + one region sun. Nothing floats on empty black.
- Planets: distinct silhouette + material recipe per `material` (craters/strata, ice
  cracks + specular, metal panels + rivets, gas banding, crystal facets, machine conduits,
  molten fissure glow, organic membranes). No recolored duplicates.
- Lighting: single strong key (region sun) + terminator shading + thin rim light; glow
  reserved for gameplay meaning (gravity, hazards, hole, pins).
- Milo: ~24 px white ball, two seam arcs, three dimples in a triangle (the glyph),
  brow-line eyes, squash & stretch on launch/impact, spins with travel, expression set:
  idle/aim/panic(fast)/squash(impact)/joy(sink)/dizzy(fail). Idle: slow blink + tiny wobble.
- Readability contract: gravity source vs repulsor vs hazard vs collectible vs hole vs pin
  must be distinct in silhouette + color at gameplay zoom. Danger = red-orange; gravity =
  cyan; interactive/amber for pins and switches; hole = warm lit green ring (a "green",
  not a neon target).
- VFX: gravity field particles (direction = force), orbit trail with speed→color ramp,
  launch stretch, impact dust, pin placement bloom, sink celebration (localized, no spam).

## 10. Audio (WebAudio synth, zero assets)

- Master → compressor; music/sfx buses. Cap ~24 voices.
- Region beds: R1 calm pads → R2 metallic drones → R3 deep resonance → R4 tense shimmer.
- Gravity sources HUM: pitch ~ log(mass), gain ~ 1/d, panned by screen x. Pins: bright
  crystalline chord while active. Capture: swell; sink: deep thoom + rising arpeggio;
  lip-out: dull knock. Milo: rare short chirps (curious/quips), never a running commentary.
- UI: soft tick on hover, tee "tak" on select. Restart must be instant (< 150 ms) — R key
  or button, no confirm dialog.

## 11. UI system (DOM overlay, no default engine look)

- Screens: TITLE (slow diorama behind logo) · COURSE SELECT (the Course as a winding
  star-map path; region headers; medals; modifier toggles) · HUD (strokes vs par in
  scorecard type, pins as tees, objective chip, fragments ×3, pause) · PAUSE · RESULTS
  (scorecard card: stroke name, medals, objectives, next/replay) · SETTINGS (audio,
  prediction on/off, screenshake) · STORY beats as subtitles.
- Aesthetic: physical tee-marker chips, thin engraved lines, mono numerals, generous
  spacing, one display font + one mono. No gradient buttons, no drop-shadow-everything.
- Input: pointer drag to aim (slingshot-style pull OR drag-from-ball, both → same vector),
  power from drag length with soft cap; keyboard fine-tune (arrows) + space charge as
  alternative; touch = same pointer path, ≥ 48 px targets.

## 12. Tech contract

- `src/sim/` — pure TS, zero imports from render/ui/DOM. Owns determinism, seeds, events.
  Trajectory prediction = same integrator (predict.ts), so previews never lie.
- `src/render/` — Pixi v8; reads sim state each frame; owns all drawing, camera, VFX.
- `src/levels/` — data (`data/*.json` + index) + validator tests; sim owns the schema types.
- `src/ui/`, `src/audio/`, `src/story/` — DOM UI, WebAudio, dialogue data/runner.
- `src/game/` — glue state machine (menu → level intro → aim/fire/flight → results), input.
- `src/save/` — versioned localStorage (progress, medals, fragments, settings).
- QA params: `?level=N` jump, `?seed=X`, `?pred=0`, `?fx=0`, `?nopause=1`.
- No physics library. No monolithic files. No per-frame allocations in sim/render hot paths.
