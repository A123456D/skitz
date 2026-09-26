// HUD + subtitle + toasts. updateHud() is called per tick, so every dynamic
// region is cached: DOM writes only happen when a displayed value changes.
import type { StoryLine, World } from '../sim';
import { VOICES } from '../story/voices';
import { el } from './dom';
import { check, replay, shard, tee, teeSlash } from './glyphs';
import { strokeTerm, termPolarity } from './terms';

export interface Hud {
  root: HTMLElement;
  show(v: boolean): void;
  update(w: World, pinsPlaced: number, objectiveDone: boolean[]): void;
  clear(): void;
  toast(text: string, kind?: 'good' | 'bad' | 'neutral'): void;
  subtitle(line: StoryLine | null): void;
  /** Show/hide the UNDO PIN button (only meaningful while a world is bound). */
  setWorldBound(v: boolean): void;
  /** Fresh-level announce: pops the level-name pill (null folds it). */
  announceLevel(w: World | null): void;
  destroy(): void;
}

/** Actions the HUD bubbles up to the integrator. */
export interface HudActions {
  onPause(): void;
  /** UIHooks.onRestart — wired by the integrator. */
  onRestart(): void;
  /** Resolved lazily so the optional UIHooks.onUndoPin can appear at any time. */
  onUndoPin(): void;
  /** True only while the integrator's onUndoPin hook is present. */
  canUndoPin(): boolean;
}

const SUBTITLE_MS = 2600; // design §8/§11: ~2.6 s or until advance

export function buildHud(actions: HudActions): Hud {
  const root = el('div', 'ob-hud');

  // --- top-left: strokes vs par, scorecard numerals + live golf term
  const strokesBox = el('div', 'ob-strokes');
  const strokesNum = el('span', 'ob-strokes-num', '—');
  const strokesPar = el('span', 'ob-strokes-par', 'PAR —');
  const termChip = el('span', 'ob-termchip is-idle', '');
  const strokesRow = el('div', 'ob-strokes-row');
  strokesRow.append(strokesNum, strokesPar);
  strokesBox.append(strokesRow, termChip);

  // --- bottom-left: remaining pins as physical tee markers
  const pinsBox = el('div', 'ob-pins');

  // --- top-right: objectives chip, fragment pips, restart, undo pin, pause
  const objChip = el('div', 'ob-objectives');
  const fragsRow = el('div', 'ob-frags');
  // Icon buttons share the pause button's 48 px hit box — the smallest target
  // that stays reliably tappable on touch (WCAG 2.5.5 AAA).
  const mkIconBtn = (glyph: string, label: string): HTMLButtonElement => {
    const b = el('button', 'ob-pausebtn ob-int', `<span class="ob-glyph">${glyph}</span>`);
    b.type = 'button';
    b.setAttribute('aria-label', label);
    b.title = label;
    return b;
  };
  const restartBtn = mkIconBtn(replay(16, 2.2), 'Restart');
  restartBtn.addEventListener('click', actions.onRestart);
  const undoBtn = mkIconBtn(teeSlash(16, 1.7), 'Undo pin');
  undoBtn.classList.add('ob-undobtn');
  undoBtn.addEventListener('click', actions.onUndoPin);
  // Hidden until a world is bound; disabled until the hook exists AND pins
  // are down — both re-checked cheaply on change only (see caches below).
  undoBtn.disabled = true;
  undoBtn.style.display = 'none';
  const pauseBtn = mkIconBtn(pauseIcon(), 'Pause');
  pauseBtn.addEventListener('click', actions.onPause);
  const statusTop = el('div', 'ob-status-top');
  statusTop.append(fragsRow, restartBtn, undoBtn, pauseBtn);
  const status = el('div', 'ob-status');
  status.append(objChip, statusTop);

  root.append(strokesBox, pinsBox, status);

  // ------------------------------------------------------------- caches

  let strokes = -1;
  let par = -1;
  let term = '';
  let pinsKey = '';
  let fragsKey = '';
  let objsKey = '';
  let flying = false;
  let undoKey = '';
  let worldBound = false;

  /** Undo enablement = hook present AND at least one pin standing. */
  function syncUndo(w: World): void {
    const can = worldBound && actions.canUndoPin() && w.pins.length > 0;
    const key = can ? '1' : '0';
    if (key === undoKey) return;
    undoKey = key;
    undoBtn.disabled = !can;
    undoBtn.classList.toggle('is-off', !can);
  }

  function renderPins(w: World, pinsPlaced: number): void {
    const budget = Math.max(0, w.def.pinBudget);
    const left = Math.max(0, budget - Math.max(0, pinsPlaced));
    const key = `${budget}/${left}`;
    if (key === pinsKey) return;
    pinsKey = key;
    let html = `<span class="ob-pins-label">PINS</span><span class="ob-pins-row">`;
    for (let i = 0; i < budget; i++) {
      html += `<span class="ob-tee${i < left ? '' : ' is-spent'}">${tee(15)}</span>`;
    }
    html += '</span>';
    pinsBox.innerHTML = html;
  }

  function renderFrags(w: World): void {
    const frags = w.fragments;
    const key = frags.map((f) => (f.taken ? 1 : 0)).join('');
    if (key === fragsKey) return;
    fragsKey = key;
    let html = '';
    for (let i = 0; i < frags.length; i++) {
      html += `<span class="ob-shard${frags[i].taken ? ' is-on' : ''}">${shard(13)}</span>`;
    }
    fragsRow.innerHTML = html;
  }

  function renderObjectives(w: World, objectiveDone: boolean[]): void {
    const objs = w.def.objectives ?? [];
    const key =
      objs.map((o) => o.text).join('|') + '#' + objs.map((_, i) => (objectiveDone[i] ? 1 : 0)).join('');
    if (key === objsKey) return;
    objsKey = key;
    if (objs.length === 0) {
      objChip.innerHTML = '';
      objChip.style.display = 'none';
      return;
    }
    objChip.style.display = '';
    objChip.innerHTML = objs
      .map((o, i) => {
        const done = objectiveDone[i] === true;
        return `<div class="ob-obj${done ? ' is-done' : ''}"><span class="ob-obj-check">${check(11)}</span><span>${o.text}</span></div>`;
      })
      .join('');
  }

  // ------------------------------------------------------------- subtitle

  const subtitleEl = el('div', 'ob-subtitle');
  const subWho = el('span', 'ob-who');
  const subLine = el('span', 'ob-line');
  subtitleEl.append(subWho, subLine);
  // Tap the bar to dismiss early (the runner's advance() is wired by the integrator).
  subtitleEl.addEventListener('click', () => subtitle(null));
  let subTimer = 0;
  function subtitle(line: StoryLine | null): void {
    if (subTimer) {
      clearTimeout(subTimer);
      subTimer = 0;
    }
    if (!line) {
      subtitleEl.classList.remove('is-active');
      return;
    }
    const v = VOICES[line.who];
    subWho.textContent = v ? v.name : line.who.toUpperCase();
    subWho.style.color = v ? v.color : 'var(--ink)';
    subLine.textContent = line.text;
    subtitleEl.classList.add('is-active');
    subTimer = window.setTimeout(() => {
      subTimer = 0;
      subtitleEl.classList.remove('is-active');
    }, SUBTITLE_MS);
  }

  // ------------------------------------------------------------ level pill
  // Fresh-level announce bound to bindWorld (the integrator rebinds only on
  // level entry — resume-from-pause never does). The whole entrance/hold/exit
  // envelope is one CSS animation; JS only (re)adds the class.

  const levelPill = el('div', 'ob-levelpill');
  let levelKey = '';

  function announceLevel(w: World | null): void {
    const key = w ? `${w.def.id}|${w.def.name}` : '';
    if (key === levelKey) return;
    levelKey = key;
    levelPill.classList.remove('is-in');
    if (!w) return;
    levelPill.textContent = `${w.def.id} · ${w.def.name}`.toUpperCase();
    void levelPill.offsetWidth; // force reflow so rebinding restarts the animation
    levelPill.classList.add('is-in');
  }

  // --------------------------------------------------------------- toasts

  const toastsEl = el('div', 'ob-toasts');  function toast(text: string, kind: 'good' | 'bad' | 'neutral' = 'neutral'): void {
    while (toastsEl.children.length >= 3) toastsEl.firstElementChild?.remove();
    const t = el('div', `ob-toast ob-toast--${kind}`);
    t.textContent = text;
    toastsEl.append(t);
    t.addEventListener('animationend', () => t.remove(), { once: true });
  }

  function pauseIcon(): string {
    return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M9 5 V19 M15 5 V19"/></svg>';
  }

  // Subtitle + toasts ride inside the HUD layer: they only ever fire during
  // play, and hiding them with the HUD on results/menu is the desired behavior.
  root.append(subtitleEl, toastsEl, levelPill);

  return {
    root,
    subtitle,
    toast,
    announceLevel,

    show(v: boolean): void {
      root.classList.toggle('is-active', v);
      if (!v) subtitle(null);
    },

    update(w: World, pinsPlaced: number, objectiveDone: boolean[]): void {
      // Strokes + par
      if (w.strokes !== strokes || w.def.par !== par) {
        strokes = w.strokes;
        par = w.def.par;
        strokesNum.textContent = String(strokes);
        strokesPar.textContent = `PAR ${par}`;
      }
      // Live golf term (hidden until the first stroke is away)
      const t = strokes > 0 ? strokeTerm(strokes - par) : '';
      if (t !== term) {
        term = t;
        termChip.textContent = t;
        termChip.className = 'ob-termchip' + (t ? ` ob-term--${termPolarity(t)}` : ' is-idle');
      }
      renderPins(w, pinsPlaced);
      renderFrags(w);
      renderObjectives(w, objectiveDone);
      syncUndo(w);
      // Minimal HUD during flight: pins/objectives recede, score + pause stay.
      if (w.ball.flying !== flying) {
        flying = w.ball.flying;
        root.classList.toggle('is-flight', flying);
      }
    },

    clear(): void {
      strokes = -1;
      par = -1;
      term = '';
      pinsKey = '';
      fragsKey = '';
      objsKey = '';
      flying = false;
      root.classList.remove('is-flight');
      strokesNum.textContent = '—';
      strokesPar.textContent = 'PAR —';
      termChip.textContent = '';
      termChip.className = 'ob-termchip is-idle';
      pinsBox.innerHTML = '';
      fragsRow.innerHTML = '';
      objChip.innerHTML = '';
      undoKey = '';
      undoBtn.disabled = true;
      undoBtn.classList.add('is-off');
      // Fold the level pill and forget its level so re-entering the same hole
      // after quitting re-announces.
      levelKey = '';
      levelPill.classList.remove('is-in');
      subtitle(null);
    },

    setWorldBound(v: boolean): void {
      worldBound = v;
      // Rendered only while a world is bound; visibility is not a per-tick concern.
      undoBtn.style.display = v ? '' : 'none';
      if (!v) {
        undoKey = '0';
        undoBtn.disabled = true;
        undoBtn.classList.add('is-off');
      }
    },

    destroy(): void {
      if (subTimer) {
        clearTimeout(subTimer);
        subTimer = 0;
      }
    },
  };
}
