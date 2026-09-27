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
  HEAD f25102b + icon/redesign WIP 245632b-era — see "WIP state" below).
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

## CURRENT STATE (verified)
- All 24 levels solver-audited sinkable within par (tools/level-audit.ts — beam search,
  keep using it for any level change; aces on concept holes were killed deliberately).
- Live build includes: drag-back aiming (save v2), full-arc 8s preview, power meter,
  1.45x world pace, 24 world themes (superseded by pending redesign below), camera
  energy, cosmic mass-pitched SFX, haptics, Daily Tee, boosts, offline SW, slim aim line.
- Phone: APK INSTALLED and running (verified via adb screencap) but with the OLD atom
  icon. The NEW icon APK was built (has new icon + splash) but the phone dropped off
  USB before install — REBUILD + REINSTALL when phone reconnects (gradle already green).

## WIP STATE in source repo (f25102b, uncommitted→committed as WIP)
- public/icon.svg + assets/ = NEW icon identity (glowing cup + gravity arc + Milo on
  teal space). assets/icon.png is the approved look — this is the design direction.
- orbital/android/ = Capacitor wrap (verified buildable).
- src/render/* = PARTIAL 2.5D redesign from a cancelled agent — UNVERIFIED, possibly
  half-done. The new session must either finish or revert src/render to the last good
  state (commit 245632b) before shipping. Verify via tsc + 84 tests + browser.

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
- Exact brief that was interrupted (dispatch as general-purpose agent, ~60min): rewrite
  themes.ts to 24 teal-family variations; bake sphere shading + atmosphere + drop
  shadows into textures.ts/bodies.ts; ball contact-shadow (milo.ts); parallax
  differential 0.3/0.6/1; camera springier + flight zoom 1.22 + deeper launch/sink
  punches; retint preview/trail/pins/fragments to icon family. Keep cup = brightest
  landmark; no aim zoom (owner verdict); tsc clean; 84 tests green; no per-frame alloc.

## HUB REPO STATE (C:\Users\PC\Projects\skitz-site) — READ BEFORE TOUCHING
- main @ 53a5836 = "ORBITAL new icon identity" — COMMITTED LOCALLY, **NOT PUSHED**.
- A concurrent session is doing PC CONTROLLER + WRECKBALL work in the same repo; remote
  main is AHEAD (PC CONTROLLER 6e88936, WRECKBALL passes). An interactive rebase was
  ABORTED to reach this clean state (this session).
- Stashes: @{0} = concurrent session's pc-controller WIP (theirs — leave/reconcile with
  them), @{1} = older wreckball WIP. Untracked: wreckball new-hash assets + pc-controller-aura/.
- Recovery: `git pull --rebase origin main` (if untracked wreckball assets collide, move
  them to /tmp, retry, restore) → `git push origin main` → verify, then `npx wrangler
  pages deploy` from website/ — THE ICON SWAP MAY NOT BE LIVE YET (last deploy output
  was cut; redeploy to be safe).
- Old wreckball-reconcile backup: /tmp/wreckball-untracked-backup (may be gone after reboot).

## NEXT STEPS (suggested order)
1. Pull/rebase/push hub repo (recovery above) + wrangler redeploy (icon live).
2. Reconnect phone (USB, authorize) → rebuild not needed if APK current → adb install
   -r → launch → adb screencap verify new icon on launcher.
3. Dispatch the 2.5D redesign brief (above) as general-purpose agent.
4. Finish-or-revert the partial src/render WIP (f25102b) during that pass.
5. Re-run tools/level-audit.ts after any sim/level change (24/24 within par = gate).
6. Full vitest (84) + browser QA + commit + push + redeploy.
