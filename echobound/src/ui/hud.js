// All DOM UI: HUD, title, select, level-up, relics, pause, results, codex, touch sticks
import { G } from '../game/state.js';
import { META, CODEX } from '../game/meta.js';
import { fmtTime, clamp } from '../core/util.js';
import { TRAIT_COL, ownedLabel } from '../game/upgrades.js';
import { A } from '../core/audio.js';
import { I } from '../core/input.js';

const CAT_COL = { WEAPON: '#54e6ff', CORE: '#7dff9b', MUTATION: '#ff5ad2', RELIC: '#ffd75e' };
const $ = (html) => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild || d; };

export const HUD = {
  root: null, els: {}, bannerQ: [], bannerT: 0, echoChipsN: -1,
  onKey: null,

  init() {
    this.root = document.getElementById('ui');
    const u = this.root;
    u.appendChild(this.els.hud = $(`<div id="hud">
      <div class="hud-tl"><div class="hpwrap"><div class="hpfill"></div></div><div class="hpmeta"><span class="lvl">LV 1</span><span class="hpt">100</span></div></div>
      <div class="hud-tc"><div class="timer">0:00</div><div class="wave">COLLAPSED CITY</div></div>
      <div class="hud-tr">KILLS <b class="kills">0</b><br>ECHOES <b class="echs">0</b></div>
      <div class="hud-bl"><div class="echos" style="display:flex;gap:8px"></div><div class="dashbox">DASH <span class="dpct">100%</span></div></div>
      <div class="hud-banner"><div class="btitle"></div><div class="bsub"></div></div>
      <div class="bossbar"><div class="bossname"></div><div class="bosswrap"><div class="bossfill"></div></div></div>
      <div id="bossdialog"></div>
    </div>`));
    // overlays
    const ov = (id, inner) => { const e = $(`<div class="overlay" id="${id}"></div>`); e.appendChild(inner); u.appendChild(e); return e; };
    this.els.levelup = ov('levelup', $(''));
    this.els.pause = ov('pause', this.pauseModal());
    this.els.title = ov('title', this.titleModal());
    this.els.select = ov('select', $(''));
    this.els.results = ov('results', $(''));
    this.els.codex = ov('codex', $(''));
    this.els.help = ov('help', this.helpModal());
    // touch
    const st = $(`<div id="sticks"><div class="stick" id="stL"><div class="nub"></div></div><div class="stick" id="stR"><div class="nub"></div></div></div>`);
    u.appendChild(st);
    const db = $(`<div id="dashbtn">DASH</div>`);
    db.addEventListener('touchstart', (e) => { e.preventDefault(); I.dashBtn = true; }, { passive: false });
    u.appendChild(db);
    if (I.touch) { st.classList.add('on'); db.classList.add('on'); }
    // debug
    u.appendChild(this.els.dbg = $(`<div id="dbg"></div>`));
    if (G.Q.has('dbg')) this.els.dbg.classList.add('on');

    addEventListener('keydown', (e) => { if (this.onKey) this.onKey(e); });
  },

  // ---------- modals ----------
  titleModal() {
    const d = document.createElement('div'); d.className = 'modal'; d.style.textAlign = 'center';
    d.innerHTML = `
      <div class="logo"><span class="g2">ECHOBOUND</span><span class="g1">ECHOBOUND</span>ECHOBOUND</div>
      <div class="tag">your past becomes your weapon</div>
      <div class="title-btns">
        <button class="btn primary" id="btStart">BEGIN RUN</button>
        <button class="btn" id="btCodex">CODEX</button>
        <button class="btn" id="btHelp">HOW TO PLAY</button>
      </div>
      <div class="setrow">
        <div class="tgl" data-set="shake">SCREEN SHAKE</div>
        <div class="tgl" data-set="auto">AUTOFIRE</div>
        <div class="tgl" data-set="aimline">AIM LINE</div>
        <div class="tgl" data-set="mute">MUTE</div>
      </div>
      <div class="title-meta"><span>BEST <b class="tbest">--:--</b></span><span>RUNS <b class="truns">0</b></span><span>WINS <b class="twins">0</b></span><span>FRAGMENTS <b class="tcod">0/${CODEX.length}</b></span></div>`;
    d.querySelector('#btStart').onclick = () => { A.ensure(); A.sfx('ui'); this.els.title.classList.remove('on'); this.showSelect(this.selectCb); };
    d.querySelector('#btCodex').onclick = () => { A.sfx('ui'); this.showCodex(); };
    d.querySelector('#btHelp').onclick = () => { A.sfx('ui'); this.els.help.classList.add('on'); };
    d.querySelectorAll('.tgl').forEach((t) => {
      const k = t.dataset.set;
      t.onclick = () => {
        META.d.set[k] = META.d.set[k] ? 0 : 1; META.save(); this.syncToggles();
        if (k === 'mute') { A.ensure(); if (A.toggleMute()) t.classList.add('on'); else t.classList.remove('on'); A.muted = !!META.d.set.mute; if (!A.muted && A.master) A.master.gain.value = 0.55; }
      };
    });
    this.titleEl = d;
    return d;
  },
  syncToggles() {
    if (!this.titleEl) return;
    this.titleEl.querySelectorAll('.tgl').forEach((t) => t.classList.toggle('on', !!META.d.set[t.dataset.set]));
  },
  showTitle() {
    this.hideAll();
    const d = META.d;
    this.titleEl.querySelector('.tbest').textContent = fmtTime(d.best);
    this.titleEl.querySelector('.truns').textContent = d.runs;
    this.titleEl.querySelector('.twins').textContent = d.wins;
    this.titleEl.querySelector('.tcod').textContent = d.codex.length + '/' + CODEX.length;
    this.syncToggles();
    this.els.title.classList.add('on');
    G.screen = 'title';
  },
  helpModal() {
    const d = document.createElement('div'); d.className = 'modal';
    d.innerHTML = `
      <h2 style="letter-spacing:.2em">HOW TO PLAY</h2>
      <div class="help-grid">
        <div><span class="kbd">W A S D</span>move</div>
        <div><span class="kbd">MOUSE</span>aim</div>
        <div><span class="kbd">HOLD LMB</span>fire</div>
        <div><span class="kbd">SPACE</span>dash</div>
        <div><span class="kbd">ESC</span>pause</div>
      </div>
      <p style="font-size:13px;color:#aeb6c8;line-height:1.8;max-width:440px;margin:0 auto">
        Every <b style="color:var(--cyan)">10 seconds</b> the Heartframe records you.<br>
        That recording returns as an <b style="color:var(--cyan)">ECHO</b> — a ghost that repeats your
        movement, aim and fire, fighting beside you.<br><br>
        Move like the build you want to become. Echo upgrades change what your past does.
        Barrels explode. Generators overload to lightning. Oil burns.</p>
      <div style="margin-top:20px"><button class="btn primary" id="btHelpOk">UNDERSTOOD</button></div>`;
    d.querySelector('#btHelpOk').onclick = () => { d.parentElement.classList.remove('on'); if (G.modal === 'help') G.modal = null; };
    return d;
  },
  pauseModal() {
    const d = document.createElement('div'); d.className = 'modal';
    d.innerHTML = `
      <h2 style="letter-spacing:.3em">PAUSED</h2>
      <div class="pause-list">
        <div><b>WASD</b> move · <b>MOUSE</b> aim · <b>HOLD LMB</b> fire · <b>SPACE</b> dash · <b>M</b> mute</div>
        <div class="pstats" style="margin-top:10px;color:var(--cyan)"></div>
      </div>
      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
        <button class="btn primary" id="btResume">RESUME</button>
        <button class="btn" id="btRestart">RESTART</button>
        <button class="btn" id="btQuit">ABANDON RUN</button>
      </div>`;
    d.querySelector('#btResume').onclick = () => this.togglePause(false);
    d.querySelector('#btRestart').onclick = () => { this.els.pause.classList.remove('on'); G.paused = false; this.restartCb && this.restartCb(); };
    d.querySelector('#btQuit').onclick = () => { this.els.pause.classList.remove('on'); G.paused = false; G.quitFlag = true; };
    return d;
  },
  togglePause(on) {
    if (G.screen !== 'run') return;
    G.paused = on ?? !G.paused;
    this.els.pause.classList.toggle('on', G.paused);
    if (G.paused) {
      this.els.pause.querySelector('.pstats').innerHTML = ownedLabel() || 'NO UPGRADES YET — YOUR PAST IS EMPTY';
    }
  },

  showSelect(cb) {
    this.selectCb = cb;
    const el = this.els.select;
    el.innerHTML = '';
    const d = document.createElement('div'); d.className = 'modal';
    const chars = [
      { id: 'warden', nm: 'THE WARDEN', ds: 'Balanced. The first Memory Warden. Dash often, aim true.', lock: null },
      { id: 'runner', nm: 'THE RUNNER', ds: '+25% pace of foot. Every 450 units traveled spawns a Velocity Echo that replays you at double speed.', lock: 'runner' },
    ];
    const weps = [
      { id: 'grave', nm: 'GRAVECASTER', ds: 'Slow cannon. Enormous shells. Siege, execution, or gravity wells.', lock: null },
      { id: 'widow', nm: 'WIDOW', ds: 'Automatic SMG. Swarm, venom, or marked prey.', lock: null },
      { id: 'sun', nm: 'SUNSPIKE', ds: 'Searing beam. Solar burn, prism split, or the eclipse.', lock: 'sun' },
    ];
    d.innerHTML = `<h2 style="letter-spacing:.3em">PREPARE THE HEARTFRAME</h2>`;
    d.insertAdjacentHTML('beforeend', `<div class="sel-sec">memory warden</div>`);
    const rowC = document.createElement('div'); rowC.className = 'sel-row';
    for (const c of chars) {
      const locked = c.lock && !META.unlocked(c.lock);
      rowC.insertAdjacentHTML('beforeend', `<div class="selcard ${locked ? 'locked' : ''}" data-c="${c.id}"><div class="nm">${c.nm}</div><div class="ds">${c.ds}</div>${locked ? '<div class="lock">LOCKED — defeat the Clockwork Saint</div>' : ''}</div>`);
    }
    d.appendChild(rowC);
    d.insertAdjacentHTML('beforeend', `<div class="sel-sec">weapon</div>`);
    const rowW = document.createElement('div'); rowW.className = 'sel-row';
    for (const w of weps) {
      const locked = w.lock && !META.unlocked(w.lock);
      rowW.insertAdjacentHTML('beforeend', `<div class="selcard ${locked ? 'locked' : ''}" data-w="${w.id}"><div class="nm">${w.nm}</div><div class="ds">${w.ds}</div>${locked ? '<div class="lock">LOCKED — survive to 6:00 in one run</div>' : ''}</div>`);
    }
    d.appendChild(rowW);
    d.insertAdjacentHTML('beforeend', `<div class="go"><button class="btn primary" id="btGo">ENTER THE FRACTURE</button> <span class="kbd" style="margin-left:8px">ENTER</span></div>`);
    el.appendChild(d);
    let sel = { char: 'warden', weapon: 'grave' };
    const refresh = () => {
      d.querySelectorAll('[data-c]').forEach((n) => n.classList.toggle('on', n.dataset.c === sel.char));
      d.querySelectorAll('[data-w]').forEach((n) => n.classList.toggle('on', n.dataset.w === sel.weapon));
    };
    d.querySelectorAll('[data-c]').forEach((n) => n.onclick = () => { if (n.classList.contains('locked')) return; sel.char = n.dataset.c; A.sfx('ui'); refresh(); });
    d.querySelectorAll('[data-w]').forEach((n) => n.onclick = () => { if (n.classList.contains('locked')) return; sel.weapon = n.dataset.w; A.sfx('ui'); refresh(); });
    const go = () => { A.sfx('ui'); el.classList.remove('on'); cb(sel.char, sel.weapon); };
    d.querySelector('#btGo').onclick = go;
    this.selectEnter = go;
    refresh();
    el.classList.add('on');
    this.onKey = (e) => {
      if (e.code === 'Enter' && el.classList.contains('on')) { this.onKey = null; go(); }
    };
  },

  // ---------- level up / relic ----------
  openChoices(title, sub, picks, onPick) {
    G.modal = 'choices';
    const el = this.els.levelup;
    el.innerHTML = '';
    const d = document.createElement('div'); d.className = 'modal';
    d.innerHTML = `<div class="lu-title">${title}</div><div class="lu-sub">${sub}</div>`;
    const cards = document.createElement('div'); cards.className = 'cards';
    const RAR_COL = { common: '#5a6a86', rare: '#ff5ad2', epic: '#ffd75e' };
    picks.forEach((p, i) => {
      const col = CAT_COL[p.cat] || '#54e6ff';
      const rar = p.rar || 'common';
      const c = document.createElement('div'); c.className = 'card';
      c.style.setProperty('--cat', col);
      c.style.setProperty('--rarb', RAR_COL[rar]);
      c.style.animationDelay = (i * 0.07) + 's';
      const stk = (G.owned[p.id] || 0);
      c.innerHTML = `
        <div class="cat">${p.cat}${p.relic ? ' · RELIC' : ''}</div>
        <div class="nm">${p.name}</div>
        <div class="ds">${p.desc}</div>
        <div class="tr">${(p.traits || []).map((t) => `<span class="trait" style="color:${TRAIT_COL[t] || '#8b93a7'};border-color:${TRAIT_COL[t] || '#8b93a7'}55">${t.toUpperCase()}</span>`).join('')}</div>
        <div class="rarity rar-${rar}">${rar.toUpperCase()}</div>
        ${stk ? `<div class="stk">LV ${stk}</div>` : ''}
        <div class="key"><span class="kbd">${i + 1}</span></div>`;
      c.onclick = () => done(i);
      cards.appendChild(c);
    });
    d.appendChild(cards);
    if (title !== 'RELIC') {
      d.insertAdjacentHTML('beforeend', `<div class="lu-foot"><button class="btn" id="btSkip">SKIP — PATCH +15 HP</button><span class="kbd">ESC</span></div>`);
      d.querySelector('#btSkip').onclick = () => done(-1);
    }
    el.appendChild(d);
    el.classList.add('on');
    const done = (i) => {
      el.classList.remove('on'); G.modal = null; this.onKey = null;
      A.sfx('ui');
      onPick(i >= 0 ? picks[i] : null);
    };
    this.onKey = (e) => {
      if (e.code === 'Digit1') done(0);
      else if (e.code === 'Digit2' && picks[1]) done(1);
      else if (e.code === 'Digit3' && picks[2]) done(2);
      else if (e.code === 'Escape' && title !== 'RELIC') done(-1);
    };
  },

  results(win, info, cb) {
    this.hideAll();
    const el = this.els.results;
    el.innerHTML = '';
    const d = document.createElement('div'); d.className = 'modal';
    const arch = win
      ? ['"You stitched a self out of ten seconds at a time. Sloppy sutures. It held."', '"I filed this under victories. The drawer screams, but it closes."'][Math.min(1, (info.deaths || 0))]
      : ['"Run %N. Severed at %T. Your echoes kept fighting for six seconds after you. They always do — they just have not been told."', '"Death is a hole in the recording. I hate the holes the most."'][Math.min(1, (info.runs || 0) % 2)];
    const archTxt = arch.replace('%N', info.runs).replace('%T', fmtTime(info.time));
    d.innerHTML = `
      <div class="big ${win ? 'win' : 'lose'}">${win ? 'THE FRACTURE RECEDS' : 'MEMORY SEVERED'}</div>
      <div class="res-sub">${win ? 'the hollow king has been unwritten — for now' : 'the city keeps what it kills'}</div>
      <div class="res-grid">
        <div class="res-stat"><div class="v">${fmtTime(info.time)}</div><div class="k">survived</div></div>
        <div class="res-stat"><div class="v">${info.level}</div><div class="k">level</div></div>
        <div class="res-stat"><div class="v">${info.kills}</div><div class="k">kills</div></div>
        <div class="res-stat"><div class="v">${info.echoes}</div><div class="k">echoes</div></div>
        <div class="res-stat"><div class="v">${info.echoPct}%</div><div class="k">damage from echoes</div></div>
      </div>
      <div class="arch"><div class="who">THE ARCHIVIST</div>${archTxt}</div>
      <div class="res-unlocks">${info.unlocks.join('<br>') || ''}</div>
      <div class="res-traits">${info.build || ''}</div>
      <div style="display:flex;gap:10px;justify-content:center">
        <button class="btn primary" id="btRetry">RUN IT BACK</button>
        <button class="btn" id="btTitle">TITLE</button>
      </div>`;
    el.appendChild(d);
    d.querySelector('#btRetry').onclick = () => { el.classList.remove('on'); cb('retry'); };
    d.querySelector('#btTitle').onclick = () => { el.classList.remove('on'); cb('title'); };
    el.classList.add('on');
    G.screen = 'results';
  },

  showCodex() {
    const el = this.els.codex;
    el.innerHTML = '';
    const d = document.createElement('div'); d.className = 'modal';
    d.innerHTML = `<h2 style="letter-spacing:.3em;margin-bottom:14px">MEMORY CODEX</h2>`;
    for (const c of CODEX) {
      const has = META.codexHas(c.id);
      d.insertAdjacentHTML('beforeend', `<div class="codex-row ${has ? '' : 'locked'}">
        <div class="t">${has ? c.t : '████████'}</div>
        ${has ? `<div class="x">${c.x}</div>` : `<div class="how">${c.how.toUpperCase()}</div>`}
      </div>`);
    }
    d.insertAdjacentHTML('beforeend', `<div style="margin-top:14px;text-align:center"><button class="btn" id="btCx">CLOSE</button></div>`);
    el.appendChild(d);
    d.querySelector('#btCx').onclick = () => el.classList.remove('on');
    el.classList.add('on');
  },

  // ---------- run HUD ----------
  hideAll() { for (const k of ['hud', 'levelup', 'pause', 'title', 'select', 'results', 'codex', 'help']) this.els[k] && this.els[k].classList && this.els[k].classList.remove('on'); },
  showHud() { this.els.hud.classList.add('on'); },

  banner(t, s, col = '#54e6ff') {
    this.bannerQ.push({ t, s, col });
  },
  tickBanner(dt) {
    const b = this.els.hud.querySelector('.hud-banner');
    if (!b) return;
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) b.classList.remove('on');
    } else if (this.bannerQ.length) {
      const { t, s, col } = this.bannerQ.shift();
      if (!t && !s) return;
      const bt = b.querySelector('.btitle'), bs = b.querySelector('.bsub');
      bt.textContent = t; bs.textContent = s || '';
      bt.style.textShadow = `0 0 30px ${col}88, 3px 3px 0 #000a`;
      bs.style.color = col;
      // retrigger animation
      bt.style.animation = 'none'; void bt.offsetWidth; bt.style.animation = '';
      b.classList.add('on');
      this.bannerT = 2.4;
    }
  },

  sync(dt) {
    if (G.screen !== 'run') return;
    const P = G.player;
    const e = this.els.hud;
    e.querySelector('.hpfill').style.transform = `scaleX(${clamp(P.hp / P.maxHp, 0, 1)})`;
    e.querySelector('.hpt').textContent = Math.ceil(P.hp) + ' / ' + P.maxHp;
    e.querySelector('.lvl').textContent = 'LV ' + P.level;
    e.querySelector('.hpwrap').classList.toggle('hplow', P.hp < P.maxHp * 0.25);
    const t = G.time;
    e.querySelector('.timer').textContent = fmtTime(t);
    const min = t / 60;
    e.querySelector('.wave').textContent = G.boss ? (G.boss.type === 'saint' ? 'THE CLOCKWORK SAINT' : 'THE HOLLOW KING') : min < 1.5 ? 'COLLAPSED CITY · PROBES' : min < 4 ? 'HOLD THE STREETS' : min < 6.5 ? 'THEY REMEMBER YOU' : min < 10 ? 'THE FRACTURE DEEPENS' : 'EVERYTHING AT ONCE';
    e.querySelector('.kills').textContent = G.stats.kills;
    e.querySelector('.echs').textContent = G.stats.echoes;
    e.querySelector('.dpct').textContent = Math.round((1 - clamp(P.dashCd / (P.char === 'runner' ? 1 : 1.6), 0, 1)) * 100) + '%';
    // echo chips
    const live = G.echoes.filter((x) => !x.dead);
    const box = e.querySelector('.echos');
    if (live.length !== this.echoChipsN) {
      this.echoChipsN = live.length;
      box.innerHTML = '';
      live.forEach((x) => {
        const d = document.createElement('div'); d.className = 'echobox' + (x.hostile ? ' hostile' : '');
        d.innerHTML = `<div class="ring"><svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="19" fill="none" stroke="${x.hostile ? '#ff5a5a' : '#54e6ff'}" stroke-width="3" stroke-dasharray="119.4" stroke-dashoffset="0"/></svg><div class="eface">${x.hostile ? '☾' : '☄'}</div></div><div class="elabel">${x.hostile ? 'FOE' : 'ECHO'}</div>`;
        box.appendChild(d);
      });
    }
    box.querySelectorAll('.echobox').forEach((n, i) => {
      const x = live[i];
      const f = clamp(x.t / x.dur, 0, 1);
      n.querySelector('circle').style.strokeDashoffset = 119.4 * (1 - f);
    });
    // boss bar
    const bb = e.querySelector('.bossbar');
    if (G.boss && !G.boss.dead) {
      bb.classList.add('on');
      e.querySelector('.bossname').textContent = G.boss.type === 'saint' ? 'THE CLOCKWORK SAINT · PHASE ' + G.boss.phase : 'THE HOLLOW KING' + (G.boss.res ? ' · RISEN x' + G.boss.res : '');
      e.querySelector('.bossfill').style.transform = `scaleX(${clamp(G.boss.hp / G.boss.maxHp, 0, 1)})`;
    } else bb.classList.remove('on');
    // boss dialog
    const bd = document.getElementById('bossdialog');
    if (G.hkDialog && G.hkDialog.t > 0) { G.hkDialog.t -= dt; bd.textContent = G.hkDialog.txt; bd.classList.add('on'); }
    else bd.classList.remove('on');
    this.tickBanner(dt);
    // touch sticks visuals
    if (I.touch) {
      const sl = document.getElementById('stL'), sr = document.getElementById('stR');
      for (const [s, el2] of [[I.stickL, sl], [I.stickR, sr]]) {
        if (s.active) { el2.style.display = 'block'; el2.style.left = (s.ox - 55) + 'px'; el2.style.top = (s.oy - 55) + 'px'; el2.querySelector('.nub').style.transform = `translate(${s.dx * 33}px,${s.dy * 33}px)`; }
        else el2.style.display = 'none';
      }
    }
  },
};
