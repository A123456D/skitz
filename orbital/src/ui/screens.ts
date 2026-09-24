// Screen builders — TITLE, COURSE SELECT, PAUSE, RESULTS, SETTINGS.
// Aesthetic per design §11: physical tee-marker chips, thin engraved lines,
// letterspaced display type, mono numerals. No gradient buttons, no emoji.
import type { LevelDef } from '../sim';
import type { SaveData, Settings } from '../save/save';
import type { LevelResult } from './api';
import { button, div, el, esc } from './dom';
import { back, check, flag, lock, next, play, replay, shard, sliders, spark, target } from './glyphs';
import { MODIFIERS, REGIONS, strokeTerm, termPolarity } from './terms';

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

export function buildTitle(onPlay: () => void, onSettings: () => void): HTMLElement {
  const root = el('section', 'ob-screen ob-title');
  root.append(buildStars());
  const core = div('ob-title-core');
  core.append(div('ob-orbit', ORBIT_SVG));
  core.append(el('h1', 'ob-wordmark', 'ORBITAL'));
  core.append(el('div', 'ob-tagline', 'THE&nbsp;LAST&nbsp;TEE'));
  const actions = div('ob-title-actions');
  const bPlay = button('ob-chip ob-chip--primary ob-int', `${play(14)}<span>PLAY</span>`);
  const bSet = button('ob-chip ob-int', `${sliders(14)}<span>SETTINGS</span>`);
  bPlay.addEventListener('click', onPlay);
  bSet.addEventListener('click', onSettings);
  actions.append(bPlay, bSet);
  core.append(actions);
  core.append(el('div', 'ob-whisper', 'a course at the end of the universe'));
  root.append(core);
  return root;
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

  card.append(head, term, score, medals, objs, frags, modsRow, actions);
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

  const s: Settings = { ...initial };
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

  const toggleRow = (label: string, key: 'prediction' | 'shake'): HTMLButtonElement => {
    const row = div('ob-set-row');
    row.append(el('span', 'ob-set-label', label));
    const b = button(
      'ob-toggle ob-int' + (s[key] ? ' is-on' : ''),
      '<span class="ob-toggle-track"><span class="ob-toggle-thumb"></span></span>' +
        `<span class="ob-toggle-state">${s[key] ? 'ON' : 'OFF'}</span>`,
    );
    b.setAttribute('aria-pressed', String(s[key]));
    b.addEventListener('click', () => {
      s[key] = !s[key];
      b.classList.toggle('is-on', s[key]);
      b.setAttribute('aria-pressed', String(s[key]));
      b.querySelector('.ob-toggle-state')!.textContent = s[key] ? 'ON' : 'OFF';
      emit();
    });
    row.append(b);
    panel.append(row);
    return b;
  };
  const predToggle = toggleRow('PREDICTION', 'prediction');
  const shakeToggle = toggleRow('SCREENSHAKE', 'shake');

  const bBack = button('ob-chip ob-int ob-set-back', `${back(13)}<span>BACK</span>`);
  bBack.addEventListener('click', onBack);
  panel.append(bBack);
  root.append(panel);

  return {
    root,
    apply(n: Settings): void {
      s.audio = n.audio;
      s.music = n.music;
      s.prediction = n.prediction;
      s.shake = n.shake;
      audioSlider.value = String(Math.round(s.audio * 100));
      musicSlider.value = String(Math.round(s.music * 100));
      predToggle.classList.toggle('is-on', s.prediction);
      predToggle.setAttribute('aria-pressed', String(s.prediction));
      predToggle.querySelector('.ob-toggle-state')!.textContent = s.prediction ? 'ON' : 'OFF';
      shakeToggle.classList.toggle('is-on', s.shake);
      shakeToggle.setAttribute('aria-pressed', String(s.shake));
      shakeToggle.querySelector('.ob-toggle-state')!.textContent = s.shake ? 'ON' : 'OFF';
    },
  };
}
