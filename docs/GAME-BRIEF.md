# WRECKBALL — Game Brief

*A paste-ready explanation of the game: pitch, systems, current state, gaps, goals.*
*Live: https://a123456d.github.io/skitz/ · Engine: PixiJS v8 (WebGPU-first) + custom TS physics · ~8.6k lines TypeScript, zero runtime deps beyond pixi.js*

---

## Pitch (one sentence)

A pixel-art physics survivor-like where **the world is your weapon** — you are a living wrecking ball, and instead of aiming guns you build a machine of mass, momentum and knockback that turns the horde, the bumpers, the pillars and the terrain itself into your damage.

## The core loop (verbs)

**roll → bonk → chain → collect → draft → repeat.**

Auto-fire weapons mean the only inputs are movement, jump and body-slam; the depth is in *what you build* and *where you fight*. Enemies you slam at speed become "charged" — their crashes hurt whatever they hit, so a single good hit can cascade into a screen-clearing wreck. Knockback physics (mass, restitution, knock-resist per enemy) is the identity system; every other system feeds it.

## Systems & content inventory (current)

| System | Contents |
|---|---|
| **Weapons (6)** | Seismic Slam (charges victims), Ricochet Round (bouncing bolts), Orbit Spikes, Wreck Dash (rocket dash), Shock Trail (erupting tremors), Static Chain (impact lightning) — max 4/run |
| **Passives (8)** | Dense Core, Overdrive, Vitality, Magnetism, Brute Force, Nanorepair, Rubber Physics, Lucky Ball — max 4/run |
| **Items (24)** | 12 common / 8 rare / 4 legendary, mostly stat mods; legendaries are big tradeoffs (e.g. Wrecking Ball's Pact: +80% impact, −30% max HP) |
| **Evolutions (6)** | VS-style weapon+passive transformations: Gravity Crush, Pinball Storm, Sawring, Juggernaut, Tesla Web, Stormcaller — each changes sim behavior + ball rig |
| **Enemies (7+boss)** | Swarmie, Imp (lunge), Spitter (ranged), Exploder (chain blast), Splitter, Tank (ground pound), elites w/ 7 behavior mods; BONZAR boss (2 phases: charge telegraph → enrage shockwave + shrapnel ring) |
| **Draft tools** | 3-card level-ups, 2 rerolls, banish, lock; luck-weighted rarity |
| **Run events (4)** | Meteor Shower, Gold Rush, Enemy Frenzy, Overcharge — single-slot director every 50–78s |
| **World** | Fixed 3680² map, 4 zones: Iron Court (intro), Frost Foundry (ice = low grip), Rust Yard (goo slows, boost lanes), Ember Pits (pinball bumpers, jump pads); terraces, pillars, breakable crates, shrines, chests |
| **Presentation** | Per-biome color grade, bloom, chromatic aberration, vignette, fog, ambient particles, hitstop, screenshake, pooled particles/damage numbers, kill-streak toasts (MEGA BONK → ABSOLUTELY WRECKED) |
| **Audio** | Fully procedural: 20 synth SFX + 4 per-biome adaptive music themes × 4 threat-gated intensity layers |
| **Meta** | Persistent gold → 6-upgrade shop (5 ranks each), 3 characters (WRECKER/BOUNCY/SPIKER), records screen |
| **Endgame** | Win = kill BONZAR at 10:00 → **DESCEND** endless mode: same run resumes, +45% enemy HP/depth, fresh boss every 90s, death final |

Run length ~10–11 min to clear; desktop + mobile (touch controls, 44px targets).

## Art direction

Chunky pixel art, base-anchored 3/4 view (ground tilted, actors billboarded). Per-biome palette/grade/atmosphere data-driven from one `biomes.ts`. The hero ball *wears its build*: every weapon mounts a reacting part (cannon aims + recoils, rocket roars on dash, coil flashes on zap), every passive hangs a charm. Enemies are procedural shaded spheres with eyes; squash/stretch/tint is the animation.

## Presentation target

**Halls of Torment's** density and moody atmosphere + **Megabonk's** color and comedy. Moody edges, playful center — never grim.

## Honest gap list (why it doesn't compete yet)

**Visuals** — the engine (WebGPU, custom bloom/grade filters, pooled GPU particles) is *not* the bottleneck; authorship is:
1. The floor is one 16px gray tile multiplied per biome — ~70% of screen pixels, zero material identity, no shadows, no light falloff.
2. The backdrop "skyline" is flat colored rectangles with window holes.
3. No real lighting: every glow is a fake additive sprite; nothing receives light.
4. Enemies are single-frame blobs with eyes — no silhouette hardware, no animation frames; a 60-enemy pile reads as one shape.
5. UI icons are emoji (☠ 🪙 📦).

**Structure** —
1. One map, one boss, one run shape; long-term variety is card RNG.
2. Items are flat stat sticks; no conditional synergies ("when X, then Y").
3. Meta is a stub: 6×5 stat ranks + 2 gold-gated characters; no unlock tree, achievements, difficulty modifiers.
4. No in-run economy (Brotato's wave-shop loop); no consumables.
5. DESCEND scales numbers, not content.

## Goals

1. **Look 100× better without touching the engine**: authored terrain per biome (materials, AO, cast shadows), a real lighting pass (light pools, contact shadows, earned bloom), generated skyline backdrops, multi-frame enemies with role silhouettes, pixel UI kit. *(Pass 10 — in progress.)*
2. **Depth to match**: in-run economy, bosses #2/#3, weapon #7, conditional synergy items, unlock tree + difficulty modifiers, map variety. *(Passes 11+ — designed next.)*
3. Bar to clear: a stranger watching a 20-second clip should say "that looks like a real indie title" before reading a single word about it.

## Dev cheats (QA)

`?t=600` (skip to boss) · `?build=max` (full rig) · `?biome=frost|rust|ember` (force zone) · `?fx=0` (post stack off). Dev server: port 5180 (strict). Tests: `npx vitest run` (7 files incl. graphics-completeness gates).
