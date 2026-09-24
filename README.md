# WRECKBALL — a physics survivor for web

A 2.5D, GPU-driven survivor-like (Vampire Survivors / Megabonk lineage) with a
physical identity: you are a heavy ball, your weapons SLAM, enemies kill each
other by crashing into each other — and now you can JUMP. Rendered with a 3/4
pseudo-3D projection (tilted ground plane, y-sorted billboards, blob shadows),
raised terraces, destructible scenery and per-run biomes. Desktop + mobile.

## Play

```bash
npm install
npm run atlas      # regenerate the pixel-art atlas (already committed to public/)
npm run dev        # http://localhost:5173
npm run build      # production build -> dist/
npm run preview    # serve the production build
npm test           # vitest: sim + progression + obstacles + verticality tests
```

Dev fast-forward (useful for testing): append query params to the URL:

- `?t=300` — start the run 5 minutes in
- `?build=max` — equip a maxed weapon/passive loadout
- `?biome=ember` — force a biome (`iron`, `frost`, `ember`)
- `?fx=0` — disable the GPU post-processing stack (A/B compare)
- `?nopause=1` — keep the sim running when the tab is hidden (QA)

Press `F3` in-game for the perf overlay (fps, entity counts, particle count).

## Sound & image (pass 6)

- **Adaptive procedural music** — zero assets. A WebAudio sequencer synthesizes
  bass/arp/pad/drums per biome (each zone has its own key, chords and timbre)
  and gates four intensity layers by threat: explore → pressure → combat →
  boss. Crossfades to the new zone's theme as you cross the map.
- **GPU post stack** — hand-written dual-backend filters (`src/render/filters.ts`):
  additive glow (half-res), per-biome color grading (ColorMatrix), RGB-split
  chromatic aberration that pulses on big impacts, and a tinted vignette.
  Boss kills get a freeze-frame + camera zoom swell; huge bonks get a few
  frames of hitstop.
- **Atmosphere** — per-biome sky gradient, three parallax silhouette rings
  with lit windows, drifting ground fog, and additive glow decals under
  lamps, bumpers, jump pads and shrines.
- **Personality** — small enemies sometimes pop a rising little ghost, and
  kill-streaks toast ("MEGA BONK!").

## Jumping & verticality

- **Jump** with Space / gamepad A / the touch button. Asymmetric gravity gives
  a snappy rise and a heavy fall with a soft apex hang.
- **Airborne dodge**: while high enough you sail over contact damage, lunges
  and ground pounds — but spit still finds you at mouth height.
- **Body slam**: press jump mid-air to rocket down. Landing deals AoE damage
  and launches everything nearby, scaled by your mass and impact stats — and
  it cracks crates.
- **Terraces** are real raised ground: step up (or jump), fight from the high
  ground, fall off edges, slam down from above.

## The world

Each run spans a 3680x3680 world of four connected zones around the
crossroads plaza where you spawn:

- **THE IRON COURT** (NW) — pillars, lanes, a gentle intro
- **THE FROST FOUNDRY** (NE) — ice fields: low grip, long slides, for you and the horde alike
- **THE RUST YARD** (SW) — goo blobs slow you down; boost pad lanes fling you along
- **THE EMBER PITS** (SE) — pinball bumpers that fling enemies into each other, and jump pads for slam setups

Each zone has its own palette, glowing fissures, scattered debris and ambient
particles (dust, snow, embers). Interior walls create gates, lanes and
chokepoints. Gold caches, buff shrines (+30% damage / regen / magnet, 45s) and
treasure chests reward risky detours. Pillars and breakable crates shape every
fight; enemies bonk off pillars, slide across ice and get flung by bumpers.
Beyond the walls, a parallax skyline of ruins hints at what's out there.

## The loop

Move (WASD / arrows / touch stick / gamepad). Auto-attacks fire themselves.
Kill → collect XP gems → level up → pick 1 of 3 upgrade cards. Survive 10:00,
then BONZAR spawns — kill him to clear the arena. Gold from elites and the
end-of-run bonus buys permanent upgrades and unlocks two more balls.

- **Weapons**: Seismic Slam, Ricochet Round, Orbit Spikes, Wreck Dash,
  Shock Trail, Static Chain
- **Passives**: Dense Core, Overdrive, Vitality, Magnetism, Brute Force,
  Nanorepair, Rubber Physics, Lucky Ball
- **Enemies**: Swarmie, Imp (lunges), Spitter, Exploder (chain explosions!),
  Splitter, Tank (ground pounds), elites, and BONZAR

Charged enemies (hit by Slam/Trail/Chain) deal impact damage to anything they
crash into — chain the knockback for screen-clearing combos.

## Unlock cascade (pass 10)

- **DESCEND earns permanent content.** Depth milestones (see UPGRADES → Depth
  Milestones): depth 1 → 🔥 Ember skin, **depth 2 → ⚡ VOLT ball** (live-wire
  chain-start), **depth 3 → 🪃 Wreckang** (new weapon: boomerangs that pierce
  the horde out AND back; pairs with Vitality into **Doomrangs**), depth 4 →
  🌑 Void skin. Skins recolor the hero ball from the character screen.
- **KRUSHER, the pit's drill guardian** — even-depth DESCEND bosses are a new
  beast: a hazard-striped drill dome that pounds shockwaves and, at half HP,
  **summons the pit's children** instead of BONZAR's shrapnel ring.

## Run & endgame (pass 9)

- **Run events** — after 1:10 the world throws moments at you every ~1 minute:
  ☄️ **Meteor Shower** (telegraphed rings crush enemies — and you), 🪙 **Gold Rush**
  (every kill rains double-value coins), 😈 **Enemy Frenzy** (3× spawns, +50% damage
  taken — a piñata with teeth), ⚡ **Overcharge** (+40% damage, +33% attack speed).
  A HUD chip counts the event down.
- **BONZAR phase 2** — drop the boss below half HP and he ENRAGES: shockwave shove,
  a 12-bullet shrapnel ring, faster charges, faster attacks, a molten pulse and a
  screaming-red boss bar.
- **DESCEND (endless)** — clearing the arena no longer hard-stops the run: retire with
  your gold or **⚔ DESCEND** for endless depths (+45% enemy HP per depth, more elites,
  spawn rate +35%/depth) and a fresh BONZAR every ~90s — killing one pays 12 coins and
  heals 30%. Depth shows on the end screen; DESCEND deaths are final but still count as
  a cleared arena.

## The ball rig (pass 8)

- **You are what you carry.** The hero ball is now construction **yellow** with a steel
  shackle cap and an upright determined face — the ball spins beneath the face while a
  gyro-harness keeps every mounted part upright.
- **Every weapon is a visible part on the ball**: Seismic Slam → hazard iron band,
  Ricochet Round → cannon that eases toward your facing and recoil-kicks when it fires,
  Orbit Spikes → steel gyro hoop, Wreck Dash → rocket pack whose flame roars while
  dashing, Shock Trail → capacitor cell that breathes with the trail cadence, Static
  Chain → tesla coil that flash-pulses every time an arc leaves the ball.
- **Evolutions transform the parts** (violet gravity band, gold pinball cannon, sawblade
  ring, twin-nozzle juggernaut rocket, tesla-web cell, stormcaller coil) and light an
  additive underglow in the evolution's accent.
- **Every passive hangs a charm** off the silhouette (hex nut, speed chevrons, magnet,
  heart, med cross, impact star, rubber pad, clover).
- Gaining a part pops an accent-colored equip flash; a CI gate
  (`tests/ball-rig.test.ts`) fails the build if any weapon/passive/evolution ever ships
  without its graphics.

## Build depth (pass 7)

- **Draft agency** — every level-up: 🎲 reroll (2 per run, +1 per Insight rank),
  🚫 banish a card out of the run, 🔒 lock a card to pin it into future hands.
- **Item layer** — 24 items across three tiers that join the level-up draft.
  Rares change behavior; **legendaries are build-defining tradeoffs** (Wrecking
  Ball's Pact: +80% impact & +30% knockback, −30% max HP). The synergy web hubs
  on impact / knock / mass — items amplify the physics, not just DPS.
- **Weapon evolutions** — max a weapon and own its paired passive to unlock a
  transformation card: Gravity Crush (Slam+Dense Core, implodes), Pinball Storm
  (Ricochet+Rubber, eternal accelerating bolts), Sawring (Orbit+Overdrive,
  launches wall-ricocheting saws), Juggernaut (Dash+Brute Force, rolling quake),
  Tesla Web (Trail+Magnetism, arcing static that slows), Stormcaller
  (Chain+Lucky, forking arcs).
- **Elite modifiers** — elites carry one of seven behavior gimmicks with its own
  tint + aura ring: Frostbound (chilling aura), Volatile (charged shrapnel on
  death), Vampiric (drains into nearby enemies), Juggernaut (near knock-immune),
  Splitting, Greedy (flees with a fortune), Stormtouched (static bolts).

## Tech

- **PixiJS v8** — WebGPU renderer with automatic WebGL2/Canvas fallback
- **2.5D pipeline**: tilted ground plane, billboard sprites, y-sorted actor
  layer, z-axis jump physics, blob shadows that track height
- Hand-rolled fixed-timestep (60 Hz) sim: struct-of-arrays entity pools,
  swap-remove, zero per-tick allocation; uniform spatial hash broadphase;
  impulse-based knockback physics with mass and restitution
- One texture atlas, pooled sprites, pooled particles, pooled BitmapText
  damage numbers — a handful of draw calls total
- Post-processing: custom GLSL+WGSL filter pairs (glow, chromatic) written
  directly against the Pixi v8 Filter API — pixi-filters 6.1.5 blacks out on
  WebGPU, so we ship two tiny shaders instead of a broken dependency
- DOM-overlay UI (HUD, cards, menus) with safe-area insets and touch targets
- Versioned localStorage save; deterministic seeded RNG in the sim
- Frame loop watchdog: drives throttled frames when rAF stalls in occluded
  webviews so background tabs and automated QA keep running

