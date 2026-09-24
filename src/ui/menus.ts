/** DOM menus: title, character select, shop, pause, end screens. */
import { CHARACTERS } from '../game/data/characters';
import { META_UPGRADES, metaCost } from '../game/data/metaShop';
import { DEPTH_UNLOCKS, SKINS, unlockDef } from '../game/data/unlocks';
import { getSave, persist, selectCharacter, unlockCharacter, buyMetaRank, setSkin, skinUnlocked } from '../save/save';
import { audio } from '../engine/audio';

const depthOf = (unlockId: string | null): number => (unlockId ? unlockDef(unlockId)?.depth ?? 0 : 0);

interface MenuHooks {
  onPlay(): void;
  onShop(): void;
  onCharSelect(): void;
  onBack(): void;      // from submenus to title
  onResume(): void;
  onQuitRun(): void;
  onRetry(): void;
  onDescend?(): void;
  refresh(): void;     // rebuild current screen after gold changes
}

let hooks: MenuHooks | null = null;
let built = false;
let screens: Record<string, HTMLElement> = {};

export function initMenus(h: MenuHooks): void {
  hooks = h;
  if (built) return;
  built = true;
  const root = document.getElementById('ui-root')!;
  for (const id of ['title', 'chars', 'shop', 'pause', 'end']) {
    const el = document.createElement('div');
    el.id = `screen-${id}`;
    el.className = 'screen hidden';
    root.appendChild(el);
    screens[id] = el;
  }
  showTitle();
}

export function hideAllScreens(): void {
  for (const el of Object.values(screens)) el.classList.add('hidden');
}

function show(id: keyof typeof screens): HTMLElement {
  hideAllScreens();
  screens[id].classList.remove('hidden');
  return screens[id];
}

// ---------------- title ----------------

export function showTitle(): void {
  const s = getSave();
  const el = show('title');
  el.innerHTML = `
    <div class="title">WRECKBALL</div>
    <div class="subtitle">A PHYSICS SURVIVOR — SLAM · RICOCHET · CRUSH</div>
    <div class="gold-chip">🪙 ${s.gold}</div>
    <div class="menu-col">
      <button class="btn primary" id="m-play">▶ PLAY</button>
      <button class="btn" id="m-chars">BALLS</button>
      <button class="btn" id="m-shop">UPGRADES</button>
      <button class="btn" id="m-sfx">SFX: ${s.settings.sfx ? 'ON' : 'OFF'}</button>
    </div>
    <div class="row"><button class="btn" id="m-fs" style="min-width:0;padding:calc(var(--ui-scale)*0.8) calc(var(--ui-scale)*1.4);font-size:calc(var(--ui-scale)*0.9);">⛶ FULLSCREEN</button></div>
    <div class="stat-line">BEST: ${fmtTime(s.best.time)} · ${s.best.kills} KILLS · LV ${s.best.level}${s.best.wins > 0 ? ` · ${s.best.wins} WIN${s.best.wins > 1 ? 'S' : ''}` : ''}${s.best.depth > 0 ? ` · DEPTH ${s.best.depth}` : ''}</div>
    <div class="subtitle" style="opacity:0.7">WASD / ARROWS / TOUCH STICK · AUTO-ATTACKS FIRE THEMSELVES</div>`;
  el.querySelector('#m-play')!.addEventListener('click', () => { audio.click(); hooks?.onPlay(); });
  el.querySelector('#m-chars')!.addEventListener('click', () => { audio.click(); hooks?.onCharSelect(); });
  el.querySelector('#m-shop')!.addEventListener('click', () => { audio.click(); hooks?.onShop(); });
  el.querySelector('#m-sfx')!.addEventListener('click', (e) => {
    s.settings.sfx = !s.settings.sfx;
    audio.sfxOn = s.settings.sfx;
    persist();
    (e.currentTarget as HTMLElement).textContent = `SFX: ${s.settings.sfx ? 'ON' : 'OFF'}`;
    audio.click();
  });
  const fsBtn = el.querySelector('#m-fs') as HTMLElement | null;
  if (fsBtn) {
    if (!document.fullscreenEnabled) fsBtn.style.display = 'none';
    fsBtn.addEventListener('click', () => {
      audio.click();
      const doc = document as Document & { webkitFullscreenElement?: Element };
      const root = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
      if (document.fullscreenElement ?? doc.webkitFullscreenElement) void document.exitFullscreen();
      else {
        const req = root.requestFullscreen?.() ?? root.webkitRequestFullscreen?.();
        void req?.then(() => {
          const so = screen.orientation as (ScreenOrientation & { lock?: (o: string) => Promise<void> }) | undefined;
          try { void so?.lock?.('landscape'); } catch { /* unsupported */ }
        }).catch(() => { /* denied */ });
      }
    });
  }
}

// ---------------- character select ----------------

export async function showCharSelect(): Promise<void> {
  const s = getSave();
  const el = show('chars');
  el.innerHTML = `
    <div class="title" style="font-size:calc(var(--ui-scale)*2.2)">CHOOSE YOUR BALL</div>
    <div id="char-list" class="menu-col" style="min-width:min(92vw,440px)"></div>
    <div class="row">
      <button class="btn" id="c-back">← BACK</button>
    </div>`;
  const list = el.querySelector('#char-list')!;
  for (const c of CHARACTERS) {
    const unlocked = s.unlockedChars.includes(c.id);
    const depthLocked = !unlocked && !!c.unlockDepth;
    const row = document.createElement('button');
    row.className = `char-row ${s.selectedChar === c.id ? 'selected' : ''} ${unlocked ? '' : 'locked'}`;
    row.innerHTML = `
      <canvas width="24" height="24" data-sprite="${c.sprite}"></canvas>
      <div class="info">
        <b>${c.name}${unlocked ? '' : depthLocked ? ` — ⚔ DEPTH ${c.unlockDepth}` : ` — 🔒 ${c.cost} 🪙`}</b>
        <small>${c.blurb}<br>${c.perk}</small>
      </div>`;
    row.addEventListener('click', () => {
      audio.click();
      if (unlocked) {
        selectCharacter(c.id);
        hooks?.refresh();
        void showCharSelect();
      } else if (depthLocked) {
        toastMsg(`REACH DESCEND DEPTH ${c.unlockDepth} TO UNLOCK ${c.name}`);
      } else if (unlockCharacter(c.id)) {
        audio.gold();
        selectCharacter(c.id);
        hooks?.refresh();
        void showCharSelect();
      } else {
        toastMsg('NOT ENOUGH GOLD');
      }
    });
    list.appendChild(row);
    // WRECKER skins: recolor swatches under the hero row
    if (c.id === 'wrecker') {
      const skinRow = document.createElement('div');
      skinRow.className = 'skin-row';
      for (const skin of SKINS) {
        const open = skinUnlocked(skin.id);
        const swatch = document.createElement('button');
        swatch.className = `skin-swatch ${s.skin === skin.id ? 'selected' : ''} ${open ? '' : 'locked'}`;
        swatch.innerHTML = `<canvas width="24" height="24" data-sprite="${skin.sprite}"></canvas><small>${open ? skin.name : `🔒 ${depthOf(skin.unlockId)}`}</small>`;
        swatch.addEventListener('click', (e) => {
          e.stopPropagation();
          audio.click();
          if (!open) {
            toastMsg(`REACH DESCEND DEPTH ${depthOf(skin.unlockId)} TO UNLOCK`);
            return;
          }
          setSkin(skin.id);
          void showCharSelect();
        });
        skinRow.appendChild(swatch);
      }
      list.appendChild(skinRow);
    }
  }
  el.querySelector('#c-back')!.addEventListener('click', () => { audio.click(); hooks?.onBack(); });
  // draw thumbnails from the atlas
  try {
    const [img, atlas] = await Promise.all([
      loadImage('./atlas.png'),
      fetch('./atlas.json').then((r) => r.json()),
    ]);
    for (const canvas of Array.from(el.querySelectorAll('canvas'))) {
      const name = canvas.getAttribute('data-sprite')!;
      const f = atlas.frames[name]?.frame;
      if (!f) continue;
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      // center the sprite (frames vary in size) at 1x inside the 24px canvas
      ctx.drawImage(img, f.x, f.y, f.w, f.h, (24 - f.w) / 2, (24 - f.h) / 2, f.w, f.h);
    }
  } catch {
    // thumbnails are decorative
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = src;
  });
}

function toastMsg(msg: string): void {
  import('./hud').then((m) => m.toast(msg));
}

// ---------------- shop ----------------

export function showShop(): void {
  const s = getSave();
  const el = show('shop');
  el.innerHTML = `
    <div class="title" style="font-size:calc(var(--ui-scale)*2.2)">PERMANENT UPGRADES</div>
    <div class="gold-chip">🪙 ${s.gold}</div>
    <div class="shop-list"></div>
    <button class="btn" id="s-back">← BACK</button>`;
  const list = el.querySelector('.shop-list')!;
  for (const def of META_UPGRADES) {
    const rank = s.metaRanks[def.id] ?? 0;
    const maxed = rank >= def.maxRank;
    const cost = metaCost(def, rank);
    const pips = Array.from({ length: def.maxRank }, (_, i) => `<i class="${i < rank ? 'on' : ''}"></i>`).join('');
    const row = document.createElement('div');
    row.className = 'shop-row';
    row.innerHTML = `
      <span style="font-size:22px">${def.icon}</span>
      <div class="info">
        <b>${def.name}</b>
        <small>${def.desc}</small>
        <div class="pips">${pips}</div>
      </div>
      <button class="buy" ${maxed || s.gold < cost ? 'disabled' : ''}>${maxed ? 'MAX' : `🪙 ${cost}`}</button>`;
    row.querySelector('.buy')!.addEventListener('click', () => {
      if (buyMetaRank(def.id, cost)) {
        audio.gold();
        hooks?.refresh();
        showShop();
      }
    });
    list.appendChild(row);
  }
  // depth milestones: the unlock cascade
  const heading = document.createElement('div');
  heading.className = 'shop-heading';
  heading.textContent = `DEPTH MILESTONES — BEST ${s.best.depth}`;
  list.appendChild(heading);
  for (const def of DEPTH_UNLOCKS) {
    const earned = s.unlocks.includes(def.id);
    const row = document.createElement('div');
    row.className = `shop-row milestone ${earned ? 'earned' : ''}`;
    row.innerHTML = `
      <span style="font-size:22px">${earned ? '✅' : '⚔'}</span>
      <div class="info">
        <b>${def.icon} ${def.name}</b>
        <small>${def.desc}</small>
      </div>
      <span class="depth-tag">${earned ? 'EARNED' : `DEPTH ${def.depth}`}</span>`;
    list.appendChild(row);
  }
  el.querySelector('#s-back')!.addEventListener('click', () => { audio.click(); hooks?.onBack(); });
}

// ---------------- pause ----------------

export function showPause(): void {
  const el = show('pause');
  el.innerHTML = `
    <div class="title" style="font-size:calc(var(--ui-scale)*2.2)">PAUSED</div>
    <div class="menu-col">
      <button class="btn primary" id="p-resume">▶ RESUME</button>
      <button class="btn" id="p-quit">✕ GIVE UP</button>
    </div>`;
  el.querySelector('#p-resume')!.addEventListener('click', () => { audio.click(); hooks?.onResume(); });
  el.querySelector('#p-quit')!.addEventListener('click', () => { audio.click(); hooks?.onQuitRun(); });
}

// ---------------- end ----------------

export function showEnd(
  won: boolean,
  stats: { time: number; kills: number; level: number; gold: number; goldTotal: number; depth?: number; unlocked?: string[] },
  descend?: { nextDepth: number },
): void {
  const el = show('end');
  const depthLine = stats.depth ? ` · DEPTH <b>${stats.depth}</b>` : '';
  const unlockBanner = stats.unlocked && stats.unlocked.length > 0
    ? `<div class="unlock-banner">🔓 NEW UNLOCK: <b>${stats.unlocked.join(' · ')}</b></div>`
    : '';
  el.innerHTML = `
    <div class="title" style="color:${won ? 'var(--good)' : 'var(--danger)'}">${won ? 'ARENA CLEARED!' : stats.depth ? 'WRECKED IN THE DEPTHS' : 'WRECKED'}</div>
    <div class="stat-line">
      SURVIVED <b>${fmtTime(stats.time)}</b>${depthLine} · KILLS <b>${stats.kills}</b> · LEVEL <b>${stats.level}</b><br>
      GOLD COLLECTED <b>🪙 ${stats.gold}</b> · TOTAL <b>🪙 ${stats.goldTotal}</b>
    </div>
    ${unlockBanner}
    <div class="menu-col">
      ${descend ? `<button class="btn primary" id="e-descend">⚔ DESCEND — DEPTH ${descend.nextDepth}</button>` : ''}
      <button class="btn ${descend ? '' : 'primary'}" id="e-retry">↻ RUN IT AGAIN</button>
      <button class="btn" id="e-menu">☰ MAIN MENU</button>
    </div>`;
  if (descend) el.querySelector('#e-descend')!.addEventListener('click', () => { audio.click(); hooks?.onDescend?.(); });
  el.querySelector('#e-retry')!.addEventListener('click', () => { audio.click(); hooks?.onRetry(); });
  el.querySelector('#e-menu')!.addEventListener('click', () => { audio.click(); hooks?.onBack(); });
}

function fmtTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
