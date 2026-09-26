# ECHOBOUND — design contract (MVP)

**Hook:** a survivor roguelite where your past becomes your weapon. Every ~10s the game
records what you did; that recording comes back as an **Echo** that fights beside you.
Upgrade the Echoes, not just yourself.

## Pillars (violating any of these is a bug)

1. **The Echo is the game.** Echoes must visibly replay your real movement + aim + fire
   timing. Echo upgrades change *what kind of past self you build*, not just numbers.
2. **Readability under chaos.** Team colors never break: player/echoes = cool
   (cyan/magenta/white), enemies = warm (rust/bone/ember), pickups = green/gold.
   Telegraphs before every boss/elites hit. Outlines on every sprite.
3. **Power changes behaviour.** Every upgrade does something mechanical. Stat-only rolls
   must carry a twist. Synergies (trait pairs) and Ascensions (trait sets) transform play.
4. **Feedback on everything.** Pop / crack / flash / shake / hitstop scaled to the event.
   Music layers up with intensity.
5. **Deterministic-enough Echoes.** Echo playback replays recorded snapshots; never
   re-simulates physics. Pause (level-up) freezes the recorder too.

## MVP scope (this build)

- 1 biome: **The Collapsed City** (parallax ruins, barrels, generators, oil, barricades)
- 1 character playable (**The Warden**), **The Runner** unlockable
- 3 weapons with evolution paths: **Gravecaster / Widow / Sunspike**
- Echo system: 10s recording ring buffer, replayed ghosts, echo-slot cap, echo-modifying
  upgrades, trait synergies (Afterburn, Stormshot, Collapse, Velocity, Memory Leak),
  Ascensions (THUNDER GOD, SUPERNOVA)
- 9 enemy roles (Husk, Lancer, Mourner, Thief, Leech, Mirror, Time Eater, Parasite,
  Witness→adapts) + elite mutations (Teleport/Explode/Reflect/Regen/Split/Phase/Echothief)
- 2 bosses: **The Clockwork Saint** (mini, ~6:30 — copies & steals your Echoes) and
  **The Hollow King** (final, ~12:30 — resurrects and reads your habits)
- Upgrades in 4 categories: WEAPON / CORE / MUTATION / RELIC (6 relics incl. The Red
  Button, The Mirror, The Hourglass)
- Run: ~13–15 min to victory. Meta: localStorage unlocks, 12-entry story codex.

## Systems contract

- Fixed 60Hz sim, accumulator loop, `?fast=N` multiplies steps (debug).
- Recorder = ring of per-tick snapshots `{x,y,aim,firing}` (600 ticks). Echo = entity
  replaying the buffer; echo bullets flagged `src:'echo'` so all echo mods resolve centrally.
- All damage funnels through `enemies.hurt(e, amt, opts)` — traits, dots, witness resist,
  on-death chains resolve there. One door.
- Enemy AI has a **job**, never "walks at you" twice: see enemies.js header table.
- Perf budget: ≤140 enemies, ≤600+500 bullets, ≤3000 particles, 1 atlas draw + additive
  layers @60fps. Pools everywhere; no per-frame allocations in hot loops where avoidable.
- Audio = procedural WebAudio only. No external assets anywhere in the project.

## File map

```
src/core/    util input audio
src/art/     art.js (procedural atlas)
src/render/  renderer.js bg.js
src/game/    state fx meta player weapons echo enemies bosses upgrades world director
src/ui/      hud.js
src/main.js  loop + screens
```

## Later (not in MVP)

Biomes 2–5, characters (Oracle/Hollow/Engineer/Paradox/Archivist), challenge runs
(Fractured Runs), environmental upgrade interactions depth, mobile-first polish pass,
PWA, gamepad.
