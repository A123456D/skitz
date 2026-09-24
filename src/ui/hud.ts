/** In-run DOM HUD: HP/XP bars, timer, stats, weapon slots, boss bar, event chip, toasts, hurt vignette. */
import type { Run } from '../game/run';
import { PASSIVES, WEAPONS } from '../game/data/weapons';
import { ENEMY, ENEMY_DEFS } from '../game/data/enemies';
import { eventDef } from '../game/runEvents';

interface HudEls {
  timer: HTMLElement;
  hpFill: HTMLElement;
  hpText: HTMLElement;
  xpFill: HTMLElement;
  xpText: HTMLElement;
  zone: HTMLElement;
  lvl: HTMLElement;
  kills: HTMLElement;
  gold: HTMLElement;
  slots: HTMLElement;
  bossBar: HTMLElement;
  bossFill: HTMLElement;
  eventChip: HTMLElement;
  toast: HTMLElement;
  vignette: HTMLElement;
}

let els: HudEls | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;

export function buildHud(): void {
  if (els) return;
  const root = document.getElementById('ui-root')!;
  root.insertAdjacentHTML('beforeend', `
  <div id="hud">
    <div class="hud-corner tl">
      <span class="lv" id="hud-lvl">LV 1</span>
      <span id="hud-kills">☠ 0</span>
    </div>
    <div class="hud-corner tr">
      <span class="gold" id="hud-gold">🪙 0</span>
    </div>
    <div class="hud-top">
      <div id="hud-timer">0:00</div>
      <div id="hud-zone" style="font-size:calc(var(--ui-scale)*0.8);color:var(--ink-dim);letter-spacing:0.14em;text-shadow:0 1px 0 #000;"></div>
      <div class="bar" id="hud-hp"><i></i><span id="hud-hp-text"></span></div>
      <div class="bar" id="hud-xp"><i></i><span id="hud-xp-text"></span></div>
    </div>
    <div class="hud-bottom" id="hud-slots"></div>
    <div class="bar hidden" id="hud-boss" style="position:absolute;top:14%;left:50%;transform:translateX(-50%);width:min(80vw,480px);height:10px;">
      <i style="background:linear-gradient(180deg,#ff8098,#ff2e50)"></i>
    </div>
    <div id="hud-event" class="hidden" style="position:absolute;top:18%;left:50%;transform:translateX(-50%);font-weight:700;letter-spacing:0.1em;color:#ffd76a;text-shadow:0 1px 0 #000,0 0 12px rgba(255,160,40,0.5);font-size:calc(var(--ui-scale)*1.1);"></div>
    <div id="toast"></div>
    <div id="hurt-vignette" style="position:absolute;inset:0;pointer-events:none;opacity:0;box-shadow: inset 0 0 120px 40px rgba(255,40,70,0.55);transition:opacity 120ms;"></div>
  </div>
  <button id="pause-btn" aria-label="pause">II</button>`);

  const q = (id: string) => document.getElementById(id)!;
  els = {
    timer: q('hud-timer'),
    zone: q('hud-zone'),
    hpFill: q('hud-hp').querySelector('i')!,
    hpText: q('hud-hp-text'),
    xpFill: q('hud-xp').querySelector('i')!,
    xpText: q('hud-xp-text'),
    lvl: q('hud-lvl'),
    kills: q('hud-kills'),
    gold: q('hud-gold'),
    slots: q('hud-slots'),
    bossBar: q('hud-boss'),
    bossFill: q('hud-boss').querySelector('i')!,
    eventChip: q('hud-event'),
    toast: q('toast'),
    vignette: q('hurt-vignette'),
  };
}

export function hudPauseButton(): HTMLElement {
  return document.getElementById('pause-btn')!;
}

export function toast(msg: string, ms = 1400): void {
  if (!els) return;
  els.toast.textContent = msg;
  els.toast.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els!.toast.classList.remove('show'), ms);
}

export function hurtFlash(): void {
  if (!els) return;
  els.vignette.style.opacity = '1';
  setTimeout(() => {
    if (els) els.vignette.style.opacity = '0';
  }, 130);
}

function fmtTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function updateHud(run: Run): void {
  if (!els) return;
  const w = run.w;
  els.timer.textContent = fmtTime(w.runStats.time);
  els.zone.textContent = w.zoneName(w.px, w.py);
  els.hpFill.style.width = `${Math.max(0, Math.min(100, (w.hp / w.stats.maxHp) * 100))}%`;
  els.hpText.textContent = `${Math.ceil(w.hp)} / ${Math.ceil(w.stats.maxHp)}`;
  els.xpFill.style.width = `${Math.min(100, (w.xp / w.xpNeed) * 100)}%`;
  els.xpText.textContent = `${Math.floor(w.xp)}/${w.xpNeed}`;
  els.lvl.textContent = `LV ${w.runStats.level}`;
  els.kills.textContent = `☠ ${w.runStats.kills}`;
  els.gold.textContent = `🪙 ${w.runStats.goldEarned}`;

  let html = '';
  for (const [id, lvl] of w.weapons) {
    html += `<div class="slot" title="${WEAPONS[id].name}${w.evolved.has(id) ? ' — EVOLVED' : ''}">${WEAPONS[id].icon}<small>${lvl}</small></div>`;
  }
  for (const [id, lvl] of w.passives) {
    html += `<div class="slot" title="${PASSIVES[id].name}">${PASSIVES[id].icon}<small>${lvl}</small></div>`;
  }
  // items: show up to 5 badges, then a counter
  const itemEntries = Array.from(w.items.entries()).filter(([, n]) => n > 0);
  for (const [id, count] of itemEntries.slice(0, 5)) {
    html += `<div class="slot item" title="${id} ×${count}">${'📦'}<small>${count}</small></div>`;
  }
  if (itemEntries.length > 5) {
    html += `<div class="slot item" title="more items">+${itemEntries.length - 5}</div>`;
  }
  els.slots.innerHTML = html;

  let bossIdx = -1;
  for (let i = w.eCount - 1; i >= 0; i--) {
    if (ENEMY_DEFS[w.etype[i]].boss) { bossIdx = i; break; }
  }
  if (w.bossAlive && bossIdx >= 0) {
    els.bossBar.classList.remove('hidden');
    els.bossFill.style.width = `${Math.max(0, (w.ehp[bossIdx] / w.emaxhp[bossIdx]) * 100)}%`;
    els.bossBar.classList.toggle('enraged', w.bossEnraged);
  } else {
    els.bossBar.classList.add('hidden');
  }

  // active run-event chip with remaining seconds
  const def = eventDef(w);
  if (def) {
    els.eventChip.classList.remove('hidden');
    els.eventChip.textContent = `${def.icon} ${def.name} ${Math.ceil(w.eventT)}s`;
  } else if (w.descendLevel > 0) {
    els.eventChip.classList.remove('hidden');
    els.eventChip.textContent = `⚔ DESCEND ${w.descendLevel}`;
  } else {
    els.eventChip.classList.add('hidden');
  }
}

export function bossName(): string {
  return ENEMY_DEFS[ENEMY.boss].name;
}
