/** Level-up card overlay: pauses the sim until the player picks one of N cards.
 *  Supports reroll, banish and lock (draft agency). */
import type { PendingChoice } from '../game/state';
import { choiceDetail, choiceIcon, choiceName } from '../game/progression';
import { audio } from '../engine/audio';

export interface LevelUpCallbacks {
  pick(c: PendingChoice): void;
  reroll(): void;
  banish(c: PendingChoice): void;
  lock(c: PendingChoice): void;
}

export interface LevelUpState {
  level: number;
  rerollsLeft: number;
  banishesLeft: number;
  lockedKey: string | null;
}

let container: HTMLElement | null = null;
let cb: LevelUpCallbacks | null = null;
let currentChoices: PendingChoice[] = [];
let state: LevelUpState | null = null;

export function initLevelUp(callbacks: LevelUpCallbacks): void {
  cb = callbacks;
  const root = document.getElementById('ui-root')!;
  container = document.createElement('div');
  container.id = 'levelup';
  container.className = 'screen hidden';
  root.appendChild(container);
}

const KIND_LABEL: Record<PendingChoice['kind'], string> = {
  weapon: 'WEAPON',
  passive: 'PASSIVE',
  item: 'ITEM',
  evolution: 'EVOLUTION',
};

function render(): void {
  if (!container || !cb || !state) return;
  container.innerHTML = `
    <h2>LEVEL ${state.level}</h2>
    <div class="subtitle">CHOOSE YOUR POWER</div>
    <div class="cards"></div>
    <button id="lu-reroll" class="reroll-btn" ${state.rerollsLeft > 0 ? '' : 'disabled'}>🎲 REROLL (${state.rerollsLeft})</button>`;
  const cards = container.querySelector('.cards')!;
  for (const c of currentChoices) {
    const btn = document.createElement('button');
    const locked = state!.lockedKey === `${c.kind}:${c.id}`;
    btn.className = `card rarity-${c.rarity}${c.kind === 'evolution' ? ' evolution' : ''}${locked ? ' locked' : ''}`;
    btn.innerHTML = `
      <div class="card-head">
        <span class="icon">${choiceIcon(c)}</span>
        <div>
          <div class="name">${choiceName(c)}</div>
          <div class="tag">${KIND_LABEL[c.kind]} · ${String(c.rarity).toUpperCase()}${c.kind === 'item' && !c.isNew ? ` · ×${c.toLevel - 1}→${c.toLevel}` : c.isNew ? ' · NEW!' : ` · LV ${c.toLevel}`}</div>
        </div>
      </div>
      <div class="desc">${choiceDetail(c)}</div>
      <div class="lvl">${c.kind === 'evolution' ? '★ TRANSFORM' : c.isNew ? '★ UNLOCK' : `${c.kind === 'item' ? 'OWN' : 'LV'} ${c.toLevel - 1} → ${c.toLevel}`}</div>
      <div class="card-tools">
        <button class="tool lock${locked ? ' on' : ''}" title="Lock this card for later rolls">🔒</button>
        <button class="tool banish" title="Banish this card from the run" ${state!.banishesLeft > 0 ? '' : 'disabled'}>🚫</button>
      </div>`;    btn.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('.tool.lock')) {
        audio.click();
        cb!.lock(c);
        return;
      }
      if (target.closest('.tool.banish')) {
        audio.click();
        cb!.banish(c);
        return;
      }
      audio.click();
      hide();
      cb!.pick(c);
    });
    cards.appendChild(btn);
  }
  container.querySelector('#lu-reroll')?.addEventListener('click', () => {
    if (state!.rerollsLeft <= 0) return;
    audio.click();
    cb!.reroll();
  });
  container.classList.remove('hidden');
}

export function showLevelUp(choices: PendingChoice[], opts: LevelUpState): void {
  currentChoices = choices;
  state = opts;
  render();
}

/** Re-render in place after reroll/banish/lock (hand changed, no level change). */
export function updateLevelUp(choices: PendingChoice[], rerollsLeft: number, banishesLeft: number, lockedKey: string | null): void {
  if (!container || container.classList.contains('hidden')) return;
  currentChoices = choices;
  if (state) {
    state.rerollsLeft = rerollsLeft;
    state.banishesLeft = banishesLeft;
    state.lockedKey = lockedKey;
  }
  render();
}

export function hideLevelUp(): void {
  container?.classList.add('hidden');
}

function hide(): void {
  container?.classList.add('hidden');
}
