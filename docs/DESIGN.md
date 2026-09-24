# WRECKBALL — Design Bible & Decision Log

## Vision (locked 2026-09-23)

**"The world is your weapon."** A pixel-art physics survivor-like where the *environment*
is the deepest build axis — knock enemies into bumpers, pillars, crates, terraces, and
each other. The bonk physics is the identity; every system must feed it.

**Presentation target:** Halls of Torment's map density and moody atmosphere + Megabonk's
color, comedy, and personality. Moody edges, playful center — never grim.

**Ambition bar:** surpass Brotato / Vampire Survivors on physics-driven build depth.

## Art bible (pass 6)

- Style: chunky pixel art, base-anchored 3/4 projection, `GROUND_TILT` ground plane.
- Palette: per-biome tint over neutral-gray atlas tiles; each biome has `accent` (FX/lights),
  `sky` gradient (top/bottom), `fog` color, and a `grade` (saturation/contrast/tint).
- Post stack: AdvancedBloom (threshold ~0.55, half-res) → biome ColorMatrix grade →
  RGB-split chromatic (rest state 0, pulses on big impacts) → tinted vignette overlay.
  `?fx=0` disables the whole stack (A/B + weak devices).
- Backdrop: sky gradient + 3 parallax silhouette layers (0.05 / 0.12 / 0.2) with lit
  windows; drifting ground fog; additive glow decals under lights/bumpers/shrines.
- FX language: player FX warm (gold/orange), weapon FX per-weapon identity, enemy
  telegraphs red/amber, enemy projectiles hollow purple. Blooms are earned: only bright
  FX, windows, gems and glowcracks cross the bloom threshold.
- Death language: enemies burst into particles + shards; small enemies occasionally pop a
  rising little ghost (comedy, Megabonk-style).

## Art bible v2 (pass 10 — the authorship pass)

The engine is not the bottleneck; authorship is. V2 commits to executing the existing
identity properly. Same style name, deeper everything.

- **Terrain is material, not tint.** Each biome gets generated ground with real material
  story (iron: cracked steel plates + rivets + seams; frost: packed snow, ice cracks,
  drifts; rust: rusted grating, oil stains, junk decals; ember: scorched basalt + glowing
  lava veins). Base tile + scattered decal sprites, seeded per run. Per-biome tints stay
  as a secondary grade over authored neutral textures, never the only source of identity.
- **Lighting language.** Ambient darkness is the default; light is *earned* and *pooled*:
  lamps, glowcracks, lava veins, bumpers, shrines and the boss arena pool soft colored
  light on the ground (additive falloff discs, not flat circles). Every standing structure
  (walls, terraces, pillars, crates) gets baked contact AO at its base and a directional
  cast shadow. Key light = one source per biome (moon / foundry glow / low sun / forge
  glare) drawn in the sky. Bloom stays earned: pools, windows, veins, gems, bright FX.
- **Backdrop is a place.** Rect silhouettes are dead. Per-biome generated skyline strips
  (iron: gantries + chimneys; frost: glaciers + foundry stacks; rust: junk heaps + cranes;
  ember: furnace silos + volcano cones) at the same 3 parallax depths, windows lit in
  biome windowColor, far layers pushed back by tint (atmospheric perspective).
- **Actors are silhouettes first.** Every enemy class gets silhouette hardware that reads
  at gameplay size in a pile: Imp horns + spikes, Spitter barrel mouth, Exploder fuse +
  crack lines, Splitter seam, Tank plates + treads; Swarmie stays the smooth baseline
  mook so the contrast reads. Each gets 2 idle frames (breathe) + windup + action frame;
  squash/stretch stays layered on top. Uniqueness diff (silhouette + accent + motion)
  re-run for every entity after any change.
- **UI is pixel, not emoji.** All HUD/menu icons are generated pixel sprites (coin, skull,
  heart, chest, bolt, gem, timer, reroll/banish/lock glyphs) served as a sprite sheet with
  CSS classes; the retro-terminal bones of the UI stay.
- **Density target:** Halls of Torment ground clutter density — decals, debris, stains and
  wreck marks make the floor tell the story of the fights that happened there (scorch
  craters fade over ~20s after big impacts).


## Ball rig bible (pass 8)

- **The ball wears its build.** The hero is WRECKER: a construction-yellow wrecking ball
  (20×20, matches its 9px sim radius) with a steel shackle cap and an upright "determined"
  face overlay (`ball_face`) — the ball spins beneath the face, hamster-style. BOUNCY
  (pink rubber) and SPIKER (green spiked) keep their own identities; faces are per-character
  opt-in (`CharacterDef.face`).
- **Every owned weapon mounts a part** (`data/ballRig.ts` is the single source of truth;
  `render/ballRig.ts` mirrors it): slam → hazard iron band (`att_band`), shot → aiming
  cannon (`att_cannon`), orbit → steel gyro hoop behind the ball (`att_hoop`), dash →
  rocket pack with a live flame while dashing (`att_rocket`), trail → capacitor cell that
  breathes with the trail cadence (`att_cell`), chain → tesla coil that flash-pulses when
  an arc leaves the ball (`att_coil`). Each has an EVOLVED variant (violet gravity band,
  gold pinball cannon, sawblade ring, twin-nozzle juggernaut rocket, tesla-web cell,
  stormcaller coil) plus an additive underglow tinted by the newest evolution's accent.
- **Every owned passive hangs a charm** outside the silhouette (hex nut, speed chevrons,
  horseshoe magnet, heart, med cross, impact star, rubber pad, clover).
- Parts react to live sim state: cannon eases toward `facing` and recoil-kicks on fire,
  rocket flips to the rear and roars its flame during dash, coil flashes on zap,
  cell pulses on armed trail nodes, charms bob. Parts stay upright while the ball rolls
  (gyro-harness look). Level scales a part +5%/level; evolution +12%.
- **Visualization gate:** `tests/ball-rig.test.ts` fails CI if any weapon/passive/evolution
  lacks its sprite or if a referenced sprite is missing from the atlas. New weapons MUST
  ship graphics.
- Gaining a part pops an equip flash (accent ring + sparkle burst at the ball).
- Tooling: `npm run atlas` regenerates `public/atlas.*` from `tools/gen-atlas.ts`;
  `tools/preview-atlas.ts` renders enlarged sprite sheets for review;
  `tools/crop-zoom.mjs` upscales game screenshots for close inspection.

## Music bible (pass 6)

Procedural WebAudio sequencer, zero assets. Per-biome theme (root/scale/chords/waveform).
Four intensity layers, gated by threat: L0 pad+sub (explore) → L1 bass pulse (pressure) →
L2 arp+hats (combat) → L3 drums+octave arp (boss). Theme follows the player's current
zone. Master bus: SFX + music through a compressor (chaos must not clip).

## Decision log

| Date | Decision | Why |
|------|----------|-----|
| 2026-09-24 | Pass 10 art overhaul approved: keep Pixi engine, no rewrite; strike visuals before content depth | Explore audit: engine outguns Brotato's; ~70% of screen pixels (floor+backdrop) are least-authored; user priority is "look like a real indie title" |
| 2026-09-24 | Terrain = authored per-biome textures + decals (not multiply tints over one gray tile); lighting = pooled additive + baked AO + cast shadows (no render-texture lightmap) | Biggest pixel win per unit of risk; a true lightmap multiply pass is high-risk on the dual-backend WebGPU/GLSL setup and the visual goal (pools + falloff + AO) is achievable without it |
| 2026-09-24 | `docs/GAME-BRIEF.md` added as the portable game explanation (user asked for a paste-ready ChatGPT brief) | Doubles as pitch doc; DESIGN.md stays the internal bible |
| 2026-09-24 | Pass C events are a single-slot director (one event at a time, 50-78s gaps, armed at 1:10) | Overlapping events would be unreadable chaos; gaps keep events feeling like moments, not weather |
| 2026-09-24 | Event damage modifiers live at the `damageEnemy` choke point (`evDmgMult`), cooldown boost at the single cd use site (`evCdBoost`) | Two fields beat 20 call-site patches; refreshStats can never wipe a mid-event buff |
| 2026-09-24 | BONZAR phase 2 triggers at ≤50% hp inside `damageEnemy` (not a timer) | Drama ties to the player's own progress — you PUSHED him over the edge |
| 2026-09-24 | DESCEND reuses the same run (endState won → playing, `descendLevel++`) instead of a new mode | Score/gold/loadout continuity is the fantasy ("one more depth"); banked bonus gold prevents re-granting across multiple endings |
| 2026-09-24 | During DESCEND, normal spawns resume + a fresh BONZAR every 90s (killing it = 12-coin payout + 30% heal) | The arena stays a bonk sandbox instead of a pure bullet-hell; bosses become a rhythm, not a wall |
| 2026-09-24 | Pass 8 BallRig: weapon parts mount on a non-rotating harness while the ball spins inside it (face included) | Rotating parts would make the cannon/coil spin uselessly; the gyro-harness keeps every part's identity readable and lets attachments aim/react to sim state |
| 2026-09-24 | Rig polls its loadout signature every 0.25s instead of per frame | Signature building allocates strings; level-ups are rare — hot loop stays ~zero-alloc |
| 2026-09-24 | Wrecker becomes construction-yellow (was gray) | User direction "make it yellow" + wrecking balls are painted construction-yellow; bouncy/spiker keep pink/green so all three stay distinct by silhouette+color |
| 2026-09-22 | PixiJS v8 WebGPU-first, custom SoA 60Hz physics | GPU-first preference; physics IS the game — no Rapier/Matter |
| 2026-09-23 | Depth audit verdict: core bonk physics is deep; draft/events/endgame/presentation are the shallowness | Evidence: 14-card pool no rerolls, zero in-run events, hard-stop win, music stub never implemented, zero post FX |
| 2026-09-23 | One new dep: `pixi-filters` (bloom + rgb split). Grade = core ColorMatrixFilter; vignette = tinted gradient sprite; music = hand-rolled WebAudio | Smallest possible dep surface; keeps zero-alloc GPU identity |
| 2026-09-23 | **REVERSED**: pixi-filters 6.1.5 blacks out on Pixi v8 WebGPU (bisected live: AdvancedBloom AND RGBSplit each kill the frame; core ColorMatrixFilter works). Wrote our own dual-backend GLSL+WGSL filters (`render/filters.ts`: 12-tap GlowFilter + ChromaticFilter) and removed the dep. New deps: zero | WebGPU is the primary backend; a filter lib that can't render there is dead weight — two tiny shaders beat a broken dependency |
| 2026-09-23 | Music intensity = layer gating (not volume ducking) | Silencing the mix when calm feels broken; layers keep the world alive |
| 2026-09-23 | Post-stack order: bloom → grade → rgb-split, world only (HUD is DOM, untouched) | Bloom must see the world's bright FX; HUD/UI text must stay crisp |
| 2026-09-23 | Hitstop lives in main sim gate, not the loop | Loop stays generic; hitstop is a game-layer presentation decision |
| 2026-09-23 | Enemies stay the only damage threat (no ambient hazards) | Standing user decision from traversal scoping — structures kill via *player* physics |
| 2026-09-23 | Pass order A → B → D → C | A fastest perceived-quality win; B fixes #1 gameplay gap; D builds on A's atmosphere; C (endgame/events) needs B+D content to draw from |
| 2026-09-23 | GameLoop watchdog: a 100ms setInterval drives a frame whenever rAF stalls >500ms (occluded webviews throttle rAF to zero) | Discovered during QA: embedded/occluded browser killed rAF entirely, freezing the sim with zero errors; watchdog keeps unattended QA and background tabs alive at throttled speed, inert during normal play |
| 2026-09-23 | `window.__wb` dev introspection hook (app/renderer/post/camera/loop/audio/run/phase) | Live scene-graph + state probing from page console made every QA bisect exact instead of guesswork |
| 2026-09-24 | Pass 10: content unlocks are DEPTH-gated (achievements), never gold | Endless mode needed stakes; gold is already a currency — depth is the new scoreboard. Cascade lives in `data/unlocks.ts` + `save.grantDepthUnlocks`, evaluated once at run end |
| 2026-09-24 | KRUSHER takes even depths (BONZAR odd), enrages by SUMMONING instead of shrapnel | Same-phase differentiation with one data-driven branch; summons feed the bonk chains BONZAR's ring doesn't |
| 2026-09-24 | Wreckang = bkind 2 bolt with out/return phases + per-enemy iframes (eorbIframe reuse) | True boomerang arc beats retarget-bounce; pierce-both-directions is the weapon's identity |

## Pass 10 verification log (2026-09-24) — Unlock Cascade + KRUSHER + Wreckang + VOLT

- 146 vitest tests green (15 new: save v1→v2 migration, cascade grant/no-regrant, skin
  gating, draft gating (boomer absent until earned / base six always), KRUSHER depth-2
  parity + summon-enrage (imps+exploders, no shrapnel), boomerang out-and-back catch +
  double-hit pierce), `tsc` clean.
- Live: seeded-save flow (title shows DEPTH 3), char select shows VOLT unlocked + 3 skin
  swatches (EMBER selected, VOID 🔒4), VOLT in-game (cyan tesla ball, coil + wing rig
  parts), boomerang volley fired (bkind 2, wing spins while airborne), depth-2 KRUSHER
  summoned via spawner parity — enrage at 50% summoned pit children, `.bar.enraged` pulsed
  on the (now boss-generic) HUD bar; DESCEND death end screen = "WRECKED IN THE DEPTHS"
  with no descend offer. Zero console errors.
- Environment gotcha: sibling sessions created `crucible/` + `feral/` in the shared
  workspace → their file churn force-reloaded the dev server mid-verification (evaluate
  hangs). Fixed: added them to vite watch.ignored + restarted. One tab wedged from the
  restart race — not a code bug.
- Fixed during verify: HUD boss bar scanned for BONZAR's type id only → now any
  `ENEMY_DEFS[].boss`; `bossSpawn`/`bossEnrage` events carry the boss type for per-boss
  warn toasts/ring colors.

## Pass 9 verification log (2026-09-24) — Run & Endgame

- 77 vitest tests green (11 new: director gating/announce/expire, meteor detonation vs an
  enemy, frenzy spawn×3 + damage×1.5, overcharge mults, gold-rush coin rain, boss enrage
  threshold/shove/shrapnel, descend resume + depth bosses + scaling), `tsc` clean.
- Live: director fired naturally in a running client (GOLD RUSH + METEOR SHOWER observed,
  HUD chip counting down); meteor telegraph rings render with closing inner fills and the
  falling rocks streak in; boss dropped to 50% → `bossEnraged` + pulsing red boss bar +
  12-bullet shrapnel ring verified; boss kill → ARENA CLEARED with **⚔ DESCEND — DEPTH 1**
  → click → sim resumed at depth 1, spawns flowed, next event rolled on its own.
- Perf: 2s of depth-1 sim at 207 enemies = 0.1ms (≈20,000× real time); rAF dips in QA were
  pane-occlusion throttling, not sim cost (watchdog kept the sim alive as designed).
- Zero console errors across the whole session.

## Pass 8 verification log (2026-09-24)

- 66 vitest tests green (5 new ball-rig gate tests), `tsc --noEmit` clean.
- Atlas previewed enlarged (silhouette/palette check on all 23 new sprites; velocity charm,
  jugg rocket, and face redrawn once after review).
- `?build=max` live: full rig renders (coil top, cannon aiming with live bolts, rocket,
  band, charms hanging clear of the silhouette); forced evolutions live via `__wb` swapped
  band/cannon/coil to violet-band/gold-cannon/storm-coil and fired the equip-flash path.
- ~69 fps visible over a 41s sample (worst frame 27ms), zero console errors, 196+ kills in
  an unattended max-build run; occluded-tab rAF stall handled by the existing watchdog.
- Char select: yellow WRECKER thumbnail + face, 24px canvas, neighbors unchanged.

## Pass 7 verification log (2026-09-23)

- 68 vitest tests green (14 new: item mods, copy caps, banish/lock/evolution gating, all 6 evolution behaviors, all 7 elite modifiers), `tsc` clean, `vite build` clean.
- Draft screen: items + lock/banish tools + reroll render correctly; reroll changes the hand and decrements (verified live: hand changed, 2→1).
- Evolution: Gravity Crush appears pinned-first with green glow at Slam5+DenseCore; picking it sets `evolved` and the pull/charge behavior verified in sim.
- Sustained combat with evolutions: 366 kills to 5:05 blind-burst, death path clean.
- Elite modifiers: all 7 spawned in a lineup — distinct tint + aura ring each (screenshot verified).

### Pass 7 decisions
- Items are a THIRD card kind (not a separate shop); ~46%→~40% draw mass after weight trim — item weight trim (36/14/5) applied when tests showed weapon/passive crowding.
- Multiplicative item pcts are ADDITIVE across copies (linear, not exponential) — keeps stacking predictable and lets legendaries carry big numbers without exploding.
- Evolutions pin FIRST in the hand when claimable (guaranteed offer, VS-style moment); lock yields to evolution on conflict.
- Elite mod assignment: 85% of elites (from 4:00), boss excluded, Juggernaut restricted to enemies that own a special attack (else Frostbound).
- `eslow` is applied BEFORE damage in chain/tesla code — applying after a lethal hit writes into swap-removed slots (caught by tests).
- Bolt arena bounds were hard-coded 2600 on the 3680 map (latent bug from the zone pass) — fixed to ARENA_W/H.

## Pass 6 verification log (2026-09-23)

- 52 vitest tests green (incl. 6 new music-planner tests), `tsc --noEmit` clean, `vite build` clean.
- WebGPU: custom GlowFilter + ChromaticFilter + ColorMatrix grade + vignette all render (bisected live after pixi-filters black-screen; grade-only and full-stack screenshots verified).
- Adaptive music: AudioContext running, sequencer stepping (step 26 at probe), ember theme (126bpm root40) matched starting zone, musicGain faded to 0.4.
- Combat scene at 144fps rAF: horde + damage numbers + tracer bolts + orbit ring + gem drops + ghost pop all rendering; 129 kills idle-tank run.
- Boss path: BONZAR spawned at t=600.0, killed t=626.7 via deterministic tick-burst, `endState=won`, boss-kill hitstop armed (hitstopT 0.42).
- Known QA constraint: occluded desktop window throttles rAF and timers (watchdog mitigates); verify visuals with the window foregrounded.
