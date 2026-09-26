// Screen builders — TITLE, COURSE SELECT, PAUSE, RESULTS, SETTINGS.
// Aesthetic per design §11: physical tee-marker chips, thin engraved lines,
// letterspaced display type, mono numerals. No gradient buttons, no emoji.
import type { LevelDef } from '../sim';
import type { SaveData, Settings } from '../save/save';
import type { LevelResult } from './api';
import { button, div, el, esc } from './dom';
import { back, check, flag, lock, next, play, replay, shard, sliders, spark, target } from './glyphs';
import { MODIFIERS, REGIONS, strokeTerm, termPolarity } from './terms';
import { tee } from './glyphs';

// ------------------------------------------------------------ shared pieces

/** Slow CSS starfield backdrop for menu screens. */
function buildStars(): HTMLElement {
  const s = div('ob-stars');
  s.append(el('i'), el('i'), el('i'));
  return s;
}

/** The title's orbital-ring motif — two precessing rings, planet, Milo, pin flag. */
const ORBIT_SVG =
  '<svg class="ob-orbit-svg" viewBox="0 0 220 120" fill="none" stroke="currentColor" stroke-linecap="round" aria-hidden="true">' +
  '<g class="ob-ring ob-ring--a"><ellipse cx="110" cy="60" rx="88" ry="26" transform="rotate(-14 110 60)"/></g>' +
  '<g class="ob-ring ob-ring--b"><ellipse cx="110" cy="60" rx="62" ry="44" transform="rotate(24 110 60)"/></g>' +
  '<circle class="ob-orbit-planet" cx="110" cy="60" r="11"/>' +
  '<path class="ob-orbit-flag" d="M110 34 V18 M110 18 L121 21.5 L110 25"/>' +
  '<circle class="ob-orbit-ball" cx="198" cy="60" r="4"/>' +
  '</svg>';

// ------------------------------------------------------------------- TITLE

export interface TitlePane {
  root: HTMLElement;
  /** Sync the DAILY TEE chip from save data (the `daily` field is read defensively). */
  refresh(save: SaveData): void;
}

/**
 * DAILY TEE sits directly under PLAY. The integrator's daily mode lands as an
 * optional `onPlayDaily` hook (click is a safe no-op until then) and an
 * optional `daily` field on SaveData (save/save.ts is not ours to edit):
 * `{ date: 'YYYY-MM-DD', levelId, modifier?, strokes? }`. Sub line reads
 * "L11 · HEAVY"; once today's tee has been played it flips to the best score.
 */
export function buildTitle(
  onPlay: () => void,
  onSettings: () => void,
  onDaily: () => void,
): TitlePane {
  const root = el('section', 'ob-screen ob-title');
  root.append(buildStars());
  const core = div('ob-title-core');
  core.append(div('ob-orbit', ORBIT_SVG));
  core.append(el('h1', 'ob-wordmark', 'ORBITAL'));
  core.append(el('div', 'ob-tagline', 'THE&nbsp;LAST&nbsp;TEE'));
  const actions = div('ob-title-actions');
  const mainCol = div('ob-title-main');
  const bPlay = button('ob-chip ob-chip--primary ob-int', `${play(14)}<span>PLAY</span>`);
  bPlay.addEventListener('click', onPlay);
  const bDaily = button('ob-chip ob-chip--ghost ob-int ob-daily', tee(13));
  const dailyLabel = el('span', 'ob-daily-label', 'DAILY TEE');
  const dailySub = el('span', 'ob-daily-sub');
  const dailyBest = el('span', 'ob-daily-best');
  dailySub.style.display = 'none';
  dailyBest.style.display = 'none';
  const dailyText = div('ob-daily-text');
  dailyText.append(dailyLabel, dailySub, dailyBest);
  bDaily.append(dailyText);
  bDaily.addEventListener('click', onDaily);
  mainCol.append(bPlay, bDaily);
  const bSet = button('ob-chip ob-int', `${sliders(14)}<span>SETTINGS</span>`);
  bSet.addEventListener('click', onSettings);
  actions.append(mainCol, bSet);
  core.append(actions);
  core.append(el('div', 'ob-whisper', 'a course at the end of the universe'));
  root.append(core);

  // Local calendar date as YYYY-MM-DD — the same shape the integrator formats
  // into daily.date, but resolved in the player's own timezone.
  const localToday = (): string => {
    const d = new Date();
    const p = (n: number): string => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };

  return {
    root,
    refresh(sv: SaveData): void {
      type DailyEx = { date?: string; levelId?: string; modifier?: string; strokes?: number };
      const d: DailyEx | undefined = (sv as SaveData & { daily?: DailyEx }).daily;

      const sub =
        d && typeof d.levelId === 'string' && d.levelId
          ? [d.levelId, d.modifier].filter((x) => typeof x === 'string' && x).join(' · ')
          : '';
      dailySub.textContent = sub;
      dailySub.style.display = sub ? '' : 'none';

      const n = d?.strokes;
      let best = '';
      if (d?.date === localToday() && typeof n === 'number' && n > 0) {
        best = `BEST ${n} ${n === 1 ? 'STROKE' : 'STROKES'}`;
      }
      dailyBest.textContent = best;
      dailyBest.style.display = best ? '' : 'none';
    },
  };
}

// ----------------------------------------------------------- COURSE SELECT

const NODE_GAP = 78;
const TRACK_H = 128;
const WAVE = 20;

export interface SelectPane {
  root: HTMLElement;
  refresh(save: SaveData, levels: LevelDef[]): void;
}

export function buildSelect(
  onBack: () => void,
  onPlayLevel: (index: number, modifiers: string[]) => void,
): SelectPane {
  const root = el('section', 'ob-screen ob-select');
  root.append(buildStars());

  const head = el('header', 'ob-select-head');
  const bBack = button('ob-chip ob-chip--ghost ob-int', `${back(13)}<span>MENU</span>`);
  bBack.addEventListener('click', onBack);
  head.append(bBack, el('div', 'ob-select-title', '<h2>THE COURSE</h2><span class="ob-select-sub">twenty-four holes · four regions</span>'));

  const map = div('ob-map ob-int');
  const detail = div('ob-detail');

  let save: SaveData | null = null;
  let levels: LevelDef[] = [];
  let sel = -1;
  const mods = new Set<string>();

  function select(i: number): void {
    sel = i;
    map.querySelectorAll('.ob-node.is-sel').forEach((n) => n.classList.remove('is-sel'));
    const node = map.querySelector(`.ob-node[data-i="${i}"]`);
    node?.classList.add('is-sel');
    node?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    renderDetail();
  }

  function renderDetail(): void {
    const d = levels[sel];
    if (!d || !save) {
      detail.classList.remove('is-open');
      return;
    }
    detail.classList.add('is-open');
    detail.innerHTML = '';
    const info = div('ob-detail-info');
    let html = `<div class="ob-detail-name">${esc(d.id)} · ${esc(d.name)}</div>` +
      `<div class="ob-detail-concept">${esc(d.concept)}</div>` +
      `<div class="ob-detail-meta">PAR ${d.par} · ${d.pinBudget} PIN${d.pinBudget === 1 ? '' : 'S'}</div>`;
    if (d.hint) html += `<div class="ob-detail-hint">${esc(d.hint)}</div>`;
    info.innerHTML = html;

    const modsRow = div('ob-mods');
    for (const m of MODIFIERS) {
      const b = button(
        'ob-mod ob-int' + (mods.has(m.id) ? ' is-on' : ''),
        `<span class="ob-mod-label">${esc(m.id)}</span><span class="ob-mod-blurb">${esc(m.blurb)}</span>`,
      );
      b.title = m.blurb;
      b.setAttribute('aria-pressed', String(mods.has(m.id)));
      b.addEventListener('click', () => {
        if (mods.has(m.id)) mods.delete(m.id);
        else mods.add(m.id);
        b.classList.toggle('is-on', mods.has(m.id));
        b.setAttribute('aria-pressed', String(mods.has(m.id)));
      });
      modsRow.append(b);
    }

    const bPlay = button('ob-chip ob-chip--primary ob-int', `${play(14)}<span>TEE OFF</span>`);
    bPlay.addEventListener('click', () => {
      if (sel >= 0) onPlayLevel(sel, [...mods]);
    });

    detail.append(info, modsRow, bPlay);
  }

  function makeNode(d: LevelDef, index: number, k: number, accent: string): HTMLButtonElement {
    const locked = save !== null && index > save.unlockedLevel;
    const b = button('ob-node ob-int' + (locked ? ' is-locked' : ''), '');
    b.dataset.i = String(index);
    // Deterministic winding: same math as the connector polyline below.
    b.style.left = `${NODE_GAP / 2 + k * NODE_GAP - 27}px`;
    b.style.top = `${TRACK_H / 2 + Math.sin(k * 1.05) * WAVE - 27}px`;
    b.style.setProperty('--ob-node-accent', accent);
    if (locked) {
      b.disabled = true;
      b.innerHTML = `<span class="ob-node-lock">${lock(17)}</span>`;
      return b;
    }
    const m = save?.medals[d.id];
    const fg = save?.fragments[d.id] ?? [];
    const medal = (on: boolean, glyph: string) =>
      `<span class="ob-nmedal${on ? ' is-on' : ''}">${glyph}</span>`;
    const pips = [0, 1, 2]
      .map((i) => `<i class="${fg.includes(i) ? 'is-on' : ''}"></i>`)
      .join('');
    b.innerHTML =
      `<span class="ob-node-num">${index + 1}</span>` +
      `<span class="ob-node-medals">${medal(!!m?.par, flag(10))}${medal(!!m?.obj, target(10))}${medal(!!m?.frag, spark(10))}</span>` +
      `<span class="ob-node-pips">${pips}</span>`;
    b.addEventListener('click', () => select(index));
    b.addEventListener('dblclick', () => onPlayLevel(index, [...mods]));
    return b;
  }

  function refresh(sv: SaveData, lv: LevelDef[]): void {
    save = sv;
    levels = lv;
    map.innerHTML = '';
    const byRegion: LevelDef[][] = [[], [], [], []];
    lv.forEach((d) => {
      byRegion[d.region - 1]?.push(d);
    });
    REGIONS.forEach((reg, ri) => {
      const list = byRegion[ri];
      if (!list) return;
      const sec = el('section', 'ob-region');
      const rh = div('ob-region-head');
      rh.innerHTML =
        `<span class="ob-region-numeral">${reg.numeral}</span>` +
        `<h3 style="color:${reg.accent}">${esc(reg.name)}</h3>` +
        `<span class="ob-region-rule"></span>` +
        `<span class="ob-region-count">${list.length} HOLES</span>`;
      sec.append(rh);
      const track = div('ob-track');
      track.style.width = `${list.length * NODE_GAP + NODE_GAP}px`;
      track.style.height = `${TRACK_H}px`;
      track.style.setProperty('--ob-node-accent', reg.accent);
      // Connector: dashed star-map path threading the node centers.
      const pts = list
        .map((_, k) => `${NODE_GAP / 2 + k * NODE_GAP},${TRACK_H / 2 + Math.sin(k * 1.05) * WAVE}`)
        .join(' ');
      const path = `<svg class="ob-track-path" width="${list.length * NODE_GAP + NODE_GAP}" height="${TRACK_H}">` +
        `<polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2 7"/></svg>`;
      track.innerHTML = path;
      list.forEach((d, k) => {
        const index = lv.indexOf(d);
        track.append(makeNode(d, index, k, reg.accent));
      });
      sec.append(track);
      map.append(sec);
    });
    // Default to the newest unlocked hole.
    select(Math.max(0, Math.min(sv.unlockedLevel, lv.length - 1)));
  }

  root.append(head, map, detail);
  return { root, refresh };
}

// ------------------------------------------------------------------- PAUSE

export function buildPause(a: {
  onResume(): void;
  onRestart(): void;
  onSettings(): void;
  onQuit(): void;
}): HTMLElement {
  const root = el('section', 'ob-screen ob-pause');
  const panel = div('ob-pause-panel');
  panel.append(el('div', 'ob-pause-title', 'ROUND SUSPENDED'));
  const col = div('ob-col');
  const mk = (label: string, cls: string, fn: () => void): HTMLButtonElement => {
    const b = button(`${cls} ob-int`, `<span>${label}</span>`);
    b.addEventListener('click', fn);
    return b;
  };
  col.append(
    mk('RESUME', 'ob-chip ob-chip--primary', a.onResume),
    mk('RESTART', 'ob-chip', a.onRestart),
    mk('SETTINGS', 'ob-chip', a.onSettings),
    mk('QUIT TO COURSE', 'ob-chip', a.onQuit),
  );
  panel.append(col);
  root.append(panel);
  return root;
}

// ----------------------------------------------------------------- RESULTS

export interface ResultsPane {
  root: HTMLElement;
  setResult(r: LevelResult): void;
}

export function buildResults(a: {
  onNext(): void;
  onReplay(): void;
  onMenu(): void;
}): ResultsPane {
  const root = el('section', 'ob-screen ob-results');
  const card = div('ob-card');
  const head = div('ob-card-head');
  const term = div('ob-term');
  const score = div('ob-card-score');
  const medals = div('ob-medals');
  // Optional run-time readout — LevelResult may gain timeSec/bestSec from the
  // integrator; the line stays hidden entirely while the fields are absent.
  const timeLine = div('ob-card-time');
  timeLine.style.display = 'none';
  const objs = div('ob-card-objs');
  const frags = div('ob-card-frags');
  const modsRow = div('ob-card-mods');
  const actions = div('ob-card-actions');

  const bNext = button('ob-chip ob-chip--primary ob-int', `${next(14)}<span>NEXT</span>`);
  const bReplay = button('ob-chip ob-int', `${replay(14)}<span>REPLAY</span>`);
  const bMenu = button('ob-chip ob-int', `<span>COURSE</span>`);
  bNext.addEventListener('click', a.onNext);
  bReplay.addEventListener('click', a.onReplay);
  bMenu.addEventListener('click', a.onMenu);
  actions.append(bNext, bReplay, bMenu);

  card.append(head, term, score, medals, timeLine, objs, frags, modsRow, actions);
  root.append(card);

  const medalRow = (glyph: string, label: string, earned: boolean): string =>
    `<div class="ob-medal${earned ? ' is-earned' : ''}"><span class="ob-medal-glyph">${glyph}</span><span class="ob-medal-label">${label}</span><span class="ob-medal-check">${check(12)}</span></div>`;

  return {
    root,
    setResult(r: LevelResult): void {
      const modTags = r.modifiers.length
        ? `<span class="ob-head-mods">${r.modifiers.map((m) => esc(m)).join(' · ')}</span>`
        : '';
      head.innerHTML = `<span class="ob-head-level">${esc(r.levelId)}</span>${modTags}`;

      // Color coding from the actual diff (strokeName is display text from the
      // integrator; polarity must follow the numbers, not the string).
      const diff = r.strokes - r.par;
      term.textContent = r.strokeName;
      term.className = `ob-term ob-term--${termPolarity(strokeTerm(diff))}`;
      score.textContent = `${r.strokes} STROKE${r.strokes === 1 ? '' : 'S'} · PAR ${r.par}`;

      medals.innerHTML =
        medalRow(flag(14), 'PAR OR BETTER', r.medals.par) +
        medalRow(target(14), 'ALL OBJECTIVES', r.medals.obj) +
        medalRow(spark(14), 'ALL FRAGMENTS', r.medals.frag);

      // Defensive optional read: timeSec/bestSec are not in the contract yet.
      const rx = r as LevelResult & { timeSec?: number; bestSec?: number };
      const hasTime = typeof rx.timeSec === 'number' && Number.isFinite(rx.timeSec);
      const hasBest = typeof rx.bestSec === 'number' && Number.isFinite(rx.bestSec);
      if (hasTime) {
        timeLine.textContent =
          `TIME ${rx.timeSec!.toFixed(1)}s` + (hasBest ? ` · BEST ${rx.bestSec!.toFixed(1)}s` : '');
        timeLine.style.display = '';
      } else {
        timeLine.textContent = '';
        timeLine.style.display = 'none';
      }

      objs.innerHTML = r.objectives.length
        ? r.objectives
            .map(
              (o) =>
                `<div class="ob-obj${o.done ? ' is-done' : ''}"><span class="ob-obj-check">${check(11)}</span><span>${esc(o.text)}</span></div>`,
            )
            .join('')
        : '<div class="ob-obj-none">NO OPTIONAL OBJECTIVES</div>';

      const pips = Array.from({ length: r.fragments.total }, (_, i) =>
        `<i class="${i < r.fragments.taken ? 'is-on' : ''}"></i>`).join('');
      frags.innerHTML =
        `<span class="ob-frags-label">${shard(12)} FRAGMENTS ${r.fragments.taken}/${r.fragments.total}</span>` +
        `<span class="ob-pips">${pips}</span>`;

      modsRow.innerHTML = r.modifiers.length
        ? r.modifiers.map((m) => `<span class="ob-modtag">${esc(m)}</span>`).join('')
        : '';

      bNext.disabled = !r.nextLevelId;
    },
  };
}

// ---------------------------------------------------------------- SETTINGS

/**
 * Settings gains `aimForward?: boolean` from the integrator (save/save.ts is
 * not ours to edit). Model it as an intersection so the code is structurally
 * compatible before AND after the field lands; absent = pull back.
 */
type SettingsEx = Settings & { aimForward?: boolean };

export interface SettingsPane {
  root: HTMLElement;
  /** Sync the controls from a Settings object without emitting onChange. */
  apply(s: Settings): void;
}

export function buildSettings(
  initial: Settings,
  onChange: (s: Settings) => void,
  onBack: () => void,
): SettingsPane {
  const root = el('section', 'ob-screen ob-settings');
  const panel = div('ob-set-panel');
  panel.append(el('h2', 'ob-set-title', 'CALIBRATION'));

  const s: SettingsEx = { ...initial };
  const emit = (): void => onChange({ ...s });

  const sliderRow = (label: string): HTMLInputElement => {
    const row = div('ob-set-row');
    row.append(el('span', 'ob-set-label', label));
    const r = el('input', 'ob-range ob-int');
    r.type = 'range';
    r.min = '0';
    r.max = '100';
    r.step = '1';
    r.value = String(Math.round((label === 'AUDIO' ? s.audio : s.music) * 100));
    row.append(r);
    panel.append(row);
    return r;
  };
  const audioSlider = sliderRow('AUDIO');
  const musicSlider = sliderRow('MUSIC');
  audioSlider.addEventListener('input', () => {
    s.audio = Number(audioSlider.value) / 100;
    emit();
  });
  musicSlider.addEventListener('input', () => {
    s.music = Number(musicSlider.value) / 100;
    emit();
  });

  type ToggleKey = 'prediction' | 'shake' | 'aimForward';
  /**
   * Generic toggle row. `labels` overrides the ON/OFF state text — the aim
   * style is a mode switch, not a boolean, so it reads PULL BACK / POINT
   * FORWARD. Inverted semantics (true = point forward) live entirely in the
   * label pairing; the stored value stays a plain boolean.
   */
  const toggleRow = (
    label: string,
    key: ToggleKey,
    labels: readonly [string, string] = ['OFF', 'ON'],
  ): { btn: HTMLButtonElement; sync(): void } => {
    const row = div('ob-set-row');
    row.append(el('span', 'ob-set-label', label));
    const state = (): boolean => s[key] === true;
    const b = button(
      'ob-toggle ob-int' + (state() ? ' is-on' : ''),
      '<span class="ob-toggle-track"><span class="ob-toggle-thumb"></span></span>' +
        `<span class="ob-toggle-state">${state() ? labels[1] : labels[0]}</span>`,
    );
    const sync = (): void => {
      b.classList.toggle('is-on', state());
      b.setAttribute('aria-pressed', String(state()));
      b.querySelector('.ob-toggle-state')!.textContent = state() ? labels[1] : labels[0];
    };
    b.setAttribute('aria-pressed', String(state()));
    b.addEventListener('click', () => {
      s[key] = !state();
      sync();
      emit();
    });
    row.append(b);
    panel.append(row);
    return { btn: b, sync };
  };
  const predToggle = toggleRow('PREDICTION', 'prediction');
  const shakeToggle = toggleRow('SCREENSHAKE', 'shake');
  const aimToggle = toggleRow('AIM STYLE', 'aimForward', ['PULL BACK', 'POINT FORWARD']);

  const bBack = button('ob-chip ob-int ob-set-back', `${back(13)}<span>BACK</span>`);
  bBack.addEventListener('click', onBack);
  panel.append(bBack);
  root.append(panel);

  return {
    root,
    apply(n: Settings): void {
      const nx = n as SettingsEx;
      s.audio = n.audio;
      s.music = n.music;
      s.prediction = n.prediction;
      s.shake = n.shake;
      // Absent field = pull back (false), never undefined leakage into state.
      s.aimForward = nx.aimForward === true;
      audioSlider.value = String(Math.round(s.audio * 100));
      musicSlider.value = String(Math.round(s.music * 100));
      predToggle.sync();
      shakeToggle.sync();
      aimToggle.sync();
    },
  };
}
