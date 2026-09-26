// First-run gesture tutorial — three auto-advancing cards over a dimmed layer.
// Shown once per device: localStorage 'orbital.tutorial.v1' (try/catch guarded,
// private-mode storage throws), plus optional integrator hooks read
// defensively — UIHooks may grow tutorialDone/onTutorialDone at any time.
// Pure DOM overlay, non-blocking to the game sim: the dim layer passes pointer
// events straight through to the canvas (aiming keeps working underneath);
// only the card and SKIP chip opt back in. The sim is never paused or queried.
import type { Screen } from './api';
import { button, div, el } from './dom';

const STORE_KEY = 'orbital.tutorial.v1';
/** Per-card dwell time — long enough to read, short enough to not annoy. */
const CARD_MS = 2500;

const STEPS: readonly string[] = [
  'DRAG anywhere to aim — release to fire',
  'TAP to drop a Gravity Pin — it bends your shot',
  'Land on the lit green — arrive slow and it drops in',
];

function storeDone(): boolean {
  try {
    return window.localStorage.getItem(STORE_KEY) === '1';
  } catch {
    return false; // storage blocked — session/hooks decide from here on
  }
}

function markStoreDone(): void {
  try {
    window.localStorage.setItem(STORE_KEY, '1');
  } catch {
    // private mode — the integrator's onTutorialDone hook is the fallback record
  }
}

export interface Tutorial {
  root: HTMLElement;
  /** Drive from the screen switcher; only 'playing' can open the overlay. */
  onScreen(s: Screen): void;
  destroy(): void;
}

export function buildTutorial(externallyDone: () => boolean, onDone: () => void): Tutorial {
  const root = div('ob-tut');
  const card = div('ob-tut-card ob-int');
  const step = el('span', 'ob-tut-step');
  const text = el('div', 'ob-tut-text');
  const dots = div('ob-tut-dots');
  const dotEls = STEPS.map(() => el('i'));
  dots.append(...dotEls);
  const foot = div('ob-tut-foot');
  const hint = el('span', 'ob-tut-hint', 'TAP TO CONTINUE');
  const skip = button('ob-chip ob-chip--ghost ob-int ob-tut-skip', '<span>SKIP</span>');
  foot.append(hint, skip);
  card.append(step, text, dots, foot);
  root.append(card);

  let idx = 0;
  let timer = 0;
  let open = false;
  let done = storeDone();

  const clearTimer = (): void => {
    if (timer) {
      clearTimeout(timer);
      timer = 0;
    }
  };

  function render(): void {
    step.textContent = `TIP ${idx + 1} OF ${STEPS.length}`;
    text.textContent = STEPS[idx] ?? '';
    dotEls.forEach((d, i) => d.classList.toggle('is-on', i <= idx));
  }

  function finish(): void {
    clearTimer();
    open = false;
    root.classList.remove('is-on');
    if (!done) {
      done = true;
      markStoreDone();
      onDone();
    }
  }

  function advance(): void {
    if (idx + 1 < STEPS.length) {
      idx += 1;
      render();
      arm();
    } else {
      finish();
    }
  }

  function arm(): void {
    clearTimer();
    timer = window.setTimeout(() => {
      timer = 0;
      advance();
    }, CARD_MS);
  }

  // Tap-to-advance on the card itself (the whole card is the touch target);
  // SKIP jumps straight to done — skipping still counts as "shown once".
  // stopPropagation keeps the card's advance handler out of the way.
  card.addEventListener('click', advance);
  skip.addEventListener('click', (e) => {
    e.stopPropagation();
    finish();
  });

  return {
    root,

    onScreen(s: Screen): void {
      if (s === 'playing') {
        // Re-checked on every opening: a prior session's flag or the
        // integrator's hook can complete the tutorial at any point.
        if (done || open) return;
        let ext = false;
        try {
          ext = externallyDone() === true;
        } catch {
          ext = false; // a misbehaving hook never blocks the game
        }
        if (ext) {
          done = true;
          return;
        }
        open = true;
        root.classList.add('is-on');
        render();
        arm();
      } else if (open) {
        // Left 'playing' mid-tutorial (pause/results): fold the overlay and
        // stop the clock; the next show('playing') resumes on this card.
        clearTimer();
        open = false;
        root.classList.remove('is-on');
      }
    },

    destroy(): void {
      clearTimer();
    },
  };
}
