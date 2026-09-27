# ORBITAL — HANDOFF (2026-09-27, session end)

Read this first in the new session. Then read docs/design.md and the memory entry
(orbital-gravity-golf-project) — they carry the full history.

## What ORBITAL is
Gravity-golf: Milo, the last golf ball, on a collapsing cosmic course. Deterministic
fixed-step sim (60Hz, velocity Verlet), Gravity Pins, 24 handcrafted holes in 4 regions,
Daily Tee, mid-air boosts, medals/times/modifiers. Mobile-first landscape, PWA + Android
APK (Capacitor). Teal/emerald cosmic-diorama identity.

## Where everything lives
- **Source**: C:\Users\PC\.zcode\workspace\default\orbital (repo skitz.git, branch main,
  pushed through 7781e0e — 2.5D redesign complete).
- **Live**: https://skitz-games.pages.dev/games/orbital/web (hub catalog /games/orbital/).
- **Hub repo**: C:\Users\PC\Projects\skitz-site (SKITZ-GAMES) — see "HUB REPO STATE" below,
  it is mid-tangle.
- **Deploy**: hub deploys ONLY via `npx wrangler pages deploy` from website/ (git push
  does NOT deploy). Game build: `npm run build` in orbital/, copy dist/ →
  website/public/games/orbital/web/, `npm run build` in website/, then wrangler.
- **Dev**: port 5185 strictPort. QA params: ?level=N ?seed=X ?pred=0 ?fx=full|lite ?nopause=1.
- **Phone**: APK project orbital/android (Capacitor, appId com.skitzgames.orbital).
  Build: gradlew.bat assembleDebug (needs gradle.properties org.gradle.java.home =
  C:/Program Files/Android/Android Studio/jbr, android.useAndroidX=true — already set).
  Install: adb install -r app/build/outputs/apk/debug/app-debug.apk. Device RZCW60203JL.

## CURRENT STATE (verified 2026-09-27, late)
- **THE 2.5D ICON REDESIGN IS DONE, TESTED, AND LIVE.** The interrupted brief
  (below) landed fully: themes.ts = 24 teal-family variations; bodies.ts sphere
  shading + atmosphere halos + drop shadows; milo.ts contact shadow; background
  parallax 0.3x/0.6x/1x; camera 1.22x flight punch; preview/pins/fragments
  retinted to the icon family (RELIC emerald for player things, amber = machinery
  only). Committed 7781e0e (84/84 tests) and browser-verified.
- **LIVE on the hub** (skitz-games.pages.dev/games/orbital/web, bundle
  index-Dl8KAOIM.js verified in production HTML). Deployed via a DETACHED WORKTREE
  of skitz-site main (see HUB REPO STATE — detached deploy needs `--branch main`
  or it goes out as a preview, and dist/pc/downloads/*linux*.tar.gz must be
  stripped: >25MiB Pages cap).
- All 24 levels solver-audited sinkable within par (tools/level-audit.ts —
  keep using it for any level change; aces on concept holes were killed
  deliberately). No sim/level changes since the audit.

## THE PENDING DIRECTION (owner's latest ask, interrupted)
"Redesign the game around the icon look. Make it 3D, fast and fluid."
- Identity: every level = the icon's world (teal/emerald space, glowing green cup,
  dotted arcs, planet limbs, Milo). Coherent family, variation within it — NOT the old
  24-hue rainbow.
- Depth: 2.5D pipeline — sphere-shaded planets w/ atmosphere + terminator + specular +
  soft drop shadows; ball contact-shadow by surface proximity; deeper parallax
  (0.3x/0.6x/1x); springier camera, flight zoom 1.22x.
- Literal 3D (Three.js rebuild) = a separate new-game decision; do NOT start it without
  asking. The 2.5D pass delivers the icon look + fluidity first.
- Exact brief that was interrupted — **COMPLETED 2026-09-27 (7781e0e): themes.ts 24
  teal-family variations; sphere shading + atmosphere + drop shadows in
  textures.ts/bodies.ts; ball contact-shadow (milo.ts); parallax 0.3/0.6/1; camera
  springier + flight zoom 1.22 + deeper launch/sink punches; preview/trail/pins/
  fragments retinted to icon family. Cup = brightest landmark; no aim zoom (owner
  verdict); tsc clean; 84 tests green; no per-frame alloc — all verified.**

## HUB REPO STATE (C:\Users\PC\Projects\skitz-site) — READ BEFORE TOUCHING
- main @ 83d8496 = [ahead 19, behind 2] — PUSH STILL PENDING. Contains the orbital
  build refresh (93c460d) + concurrent sessions' PC Controller / Mouse & Keys commits.
  The 2 behind are wreckball-only (no conflicts expected).
- A CONCURRENT SESSION WORKS IN THIS TREE LIVE — it committed mid-rebase during the
  last deploy attempt. DO NOT rebase/stash while it's active; the previous tangle
  (aborted interactive rebase) started exactly this way. When the tree is quiet:
  `git pull --rebase origin main` → `git push origin main`.
- Deploy recipe that WORKS while the tree is busy (used 2026-09-27):
  `git worktree add /tmp/skitz-deploy <commit> --detach` → cd worktree/website →
  `npm ci && npm run build` → `rm dist/pc/downloads/*linux*.tar.gz` (25MiB cap) →
  `npx wrangler pages deploy --branch main` (--branch is REQUIRED from a detached
  worktree or it deploys as a preview, not production) → verify bundle hash in the
  live HTML → `git worktree remove /tmp/skitz-deploy --force`.
- Stashes: @{0} = concurrent session's pc-controller WIP (theirs — leave), @{1} =
  older wreckball WIP. Untracked: pc-controller-site/, wreckball assets — theirs.

## NEXT STEPS (suggested order)
1. Reconnect phone (USB, authorize) → APK already current (app-debug.apk has new
   icon + splash, gradle green) → `adb install -r android/app/build/outputs/apk/debug/
   app-debug.apk` → launch → `adb screencap` verify new icon on launcher.
2. Push skitz-site when the concurrent session goes quiet (recipe above).
3. If the brief below is ever revisited (literal 3D = Three.js new game), it is a
   separate owner decision — do NOT start it without asking.
4. Re-run tools/level-audit.ts after any sim/level change (24/24 within par = gate).
5. Full vitest (84) + browser QA + commit + push orbital + worktree-deploy hub.
