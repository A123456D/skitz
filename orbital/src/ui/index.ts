// UI system entry — mountUI(root, hooks) → UIHandle (src/ui/api.ts contract).
// The root overlay never blocks the canvas: pointer-events pass through except
// on .ob-int interactive elements. Menu navigation (title ↔ select ↔ settings)
// is UI-internal; game-flow actions go through the hooks.
import './ui.css';
import type { LevelDef, StoryLine, World } from '../sim';
import type { Medal, SaveData, Settings } from '../save/save';
import type { LevelResult, Screen, UIHandle, UIHooks } from './api';
import { buildHud, type Hud } from './hud';
import { buildInstallChip } from './install';
import {
  buildPause,
  buildResults,
  buildSelect,
  buildSettings,
  buildTitle,
  type ResultsPane,
  type SelectPane,
  type SettingsPane,
} from './screens';
import { buildTutorial, type Tutorial } from './tutorial';

const DEFAULT_SETTINGS: Settings = { audio: 0.8, music: 0.7, prediction: true, shake: true, aimForward: false };

/**
 * The integrator adds `onUndoPin?: () => void` to UIHooks (src/ui/api.ts stays
 * read-only for us). Read it defensively so the HUD degrades to a disabled
 * button until the hook lands. Same story for the optional first-run-tutorial
 * hooks: `tutorialDone` short-circuits the overlay, `onTutorialDone` records
 * completion on the integrator's side.
 */
type UIHooksEx = UIHooks & {
  onUndoPin?: () => void;
  tutorialDone?: () => boolean;
  onTutorialDone?: () => void;
};

export function mountUI(root: HTMLElement, hooks: UIHooks): UIHandle {
  root.classList.add('ob-root');
  const hx = hooks as UIHooksEx;

  // --- build layers
  const hud: Hud = buildHud({
    onPause: hooks.onPause,
    onRestart: hooks.onRestart,
    onUndoPin: () => hx.onUndoPin?.(),
    // Checked per change, not per click: the button stays disabled until the
    // integrator's optional hook is actually present.
    canUndoPin: () => typeof hx.onUndoPin === 'function',
  });
  const title = buildTitle(
    () => show('select'), // title PLAY opens the Course map
    () => {
      settingsFrom = 'title';
      show('settings');
    },
  );
  const select: SelectPane = buildSelect(
    () => show('title'),
    (index, modifiers) => hooks.onPlayLevel(index, modifiers),
  );
  const pause = buildPause({
    onResume: hooks.onResume,
    onRestart: hooks.onRestart,
    onSettings: () => {
      settingsFrom = 'paused';
      show('settings');
    },
    onQuit: () => {
      hooks.onQuitToMenu();
      show('select');
    },
  });
  const results: ResultsPane = buildResults({
    onNext: hooks.onNextLevel,
    onReplay: hooks.onReplay,
    onMenu: () => {
      hooks.onQuitToMenu();
      show('select');
    },
  });
  let settingsFrom: Screen = 'title';
  const settings: SettingsPane = buildSettings(
    { ...DEFAULT_SETTINGS },
    (s) => hooks.onSettingsChanged(s),
    () => show(settingsFrom),
  );

  // PWA install chip rides inside the title's action row — it is only ever
  // visible while the title screen is, and vanishes entirely when the event
  // never fires or the app already runs standalone.
  const install = buildInstallChip();
  title.querySelector('.ob-title-actions')?.append(install.root);

  // First-run gesture tutorial — self-contained overlay; the show() switcher
  // below is its only input, the sim never knows about it.
  const tutorial: Tutorial = buildTutorial(
    () => hx.tutorialDone?.() === true,
    () => hx.onTutorialDone?.(),
  );

  root.append(title, select.root, hud.root, pause, results.root, settings.root, tutorial.root);

  // --- screen switching (UI-internal; the integrator can drive it too)
  const screens: Record<Exclude<Screen, 'boot' | 'playing'>, HTMLElement> = {
    title,
    select: select.root,
    paused: pause,
    results: results.root,
    settings: settings.root,
  };

  function show(screen: Screen): void {
    for (const name of Object.keys(screens) as (keyof typeof screens)[]) {
      screens[name].classList.toggle('is-active', name === screen);
    }
    // The HUD stays under the pause overlay; it clears on every other screen.
    hud.show(screen === 'playing' || screen === 'paused');
    // The tutorial only ever opens on 'playing'; any other screen folds it.
    tutorial.onScreen(screen);
  }

  return {
    show,

    bindWorld(w: World | null): void {
      if (!w) hud.clear();
      hud.setWorldBound(w !== null);
    },

    updateHud(w: World, pinsPlacedThisStroke: number, objectiveDone: boolean[]): void {
      hud.update(w, pinsPlacedThisStroke, objectiveDone);
    },

    setResult(r: LevelResult): void {
      results.setResult(r);
    },

    showSubtitle(line: StoryLine | null): void {
      hud.subtitle(line);
    },

    toast(text, kind): void {
      hud.toast(text, kind);
    },

    refresh(save: SaveData, levels: LevelDef[]): void {
      select.refresh(save, levels);
      settings.apply(save.settings);
    },

    destroy(): void {
      tutorial.destroy();
      install.destroy();
      hud.destroy();
      root.classList.remove('ob-root');
      root.innerHTML = '';
    },
  };
}

// Re-exported so the integrator (and tests elsewhere) can import Medal against
// the same type the UI reads from save data.
export type { Medal, SaveData, Settings };
