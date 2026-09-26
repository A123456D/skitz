// Build engine: WEAPON / CORE / MUTATION / RELIC. Traits combine into synergies & Ascensions.
import { G } from './state.js';
import { FX } from './fx.js';
import { A } from '../core/audio.js';
import { META } from './meta.js';
import { rand } from '../core/util.js';

export const TRAIT_COL = {
  Fire: '#ff8a4a', Lightning: '#ffe98a', Void: '#b08aff', Bleed: '#ff5a5a', Projectile: '#9fd8ff',
  Explosion: '#ffb454', Movement: '#7dff9b', Echo: '#54e6ff', Critical: '#ffd75e', Summon: '#c8a0ff',
};

const W = (id, name, path, rank, desc, traits) => ({ id, name, cat: 'WEAPON', path, rank, desc, traits, wcat: true });
const UPG = [];
// --- weapon paths (per current weapon) ---
UPG.push(
  W('siege1', 'SIEGE I', 'siege', 1, 'Shells grow. +35% damage, heavy knockback.', ['Explosion']),
  W('siege2', 'SIEGE II', 'siege', 2, 'Enormous shells that detonate on impact.', ['Explosion']),
  W('exec1', 'EXECUTIONER I', 'exec', 1, '+20% critical chance.', ['Critical']),
  W('exec2', 'EXECUTIONER II', 'exec', 2, 'Crits pierce. +50% damage to elites.', ['Critical']),
  W('sing1', 'SINGULARITY I', 'sing', 1, 'Every 4th shell is a gravity well.', ['Void']),
  W('sing2', 'SINGULARITY II', 'sing', 2, 'Every 3rd well, stronger, ending in a burst.', ['Void']),
  W('swarm1', 'SWARM I', 'swarm', 1, '+2 rounds per shot, wider spread.', ['Projectile']),
  W('swarm2', 'SWARM II', 'swarm', 2, '+2 more rounds, +25% fire rate.', ['Projectile']),
  W('venom1', 'VENOM I', 'venom', 1, 'Rounds poison. Poison eats.', ['Bleed']),
  W('venom2', 'VENOM II', 'venom', 2, 'Poisoned deaths spread to nearby enemies.', ['Bleed']),
  W('pred1', 'PREDATOR I', 'predator', 1, 'Every 7th shot marks: +marked take your focus.', ['Critical']),
  W('pred2', 'PREDATOR II', 'predator', 2, 'Your shots home in on marked prey.', ['Critical']),
  W('solar1', 'SOLAR I', 'solar', 1, 'The beam ignites what it touches.', ['Fire']),
  W('solar2', 'SOLAR II', 'solar', 2, 'Ignition spreads. Burn deepens.', ['Fire']),
  W('prism1', 'PRISM I', 'prism', 1, 'The beam splits in three.', ['Projectile']),
  W('prism2', 'PRISM II', 'prism', 2, 'Five beams, wider, hotter.', ['Projectile']),
  W('corona', 'CORONA', 'corona', 1, 'Your beam sweeps the heavens of its own accord.', ['Fire', 'Movement']),
  W('eclipse', 'ECLIPSE', 'eclipse', 1, 'The beam alternates light and void. Void pulls.', ['Void']),
);
// --- CORE ---
UPG.push(
  { id: 'orbit', name: 'ORBIT SHARDS', cat: 'CORE', max: 1, desc: 'Three shards orbit you, shredding what touches them.', traits: ['Summon'] },
  { id: 'overclock', name: 'OVERCLOCK', cat: 'CORE', max: 1, desc: '+30% fire rate. Every 8th shot is a free critical.', traits: ['Critical', 'Projectile'] },
  { id: 'secondwind', name: 'SECOND WIND', cat: 'CORE', max: 1, desc: 'Once this run: refuse to die. Return at half health.', traits: [] },
  { id: 'longstride', name: 'LONG STRIDE', cat: 'CORE', max: 1, desc: '+18% speed. Your dash tears through enemies.', traits: ['Movement'] },
  { id: 'overflow', name: 'HEARTFRAME OVERFLOW', cat: 'CORE', max: 1, desc: '+1 Echo slot. Echoes hit 10% harder.', traits: ['Echo'] },
  { id: 'magnet', name: 'DEEP MAGNET', cat: 'CORE', max: 1, desc: '+60% pickup range. Fragments come to you.', traits: [] },
);
// --- MUTATION ---
UPG.push(
  { id: 'ember', name: 'EMBER ROUNDS', cat: 'MUTATION', max: 1, desc: 'Your shots set enemies alight.', traits: ['Fire'] },
  { id: 'static', name: 'CHAINS OF STATIC', cat: 'MUTATION', max: 1, desc: 'Hits arc lightning to 2 nearby enemies.', traits: ['Lightning'] },
  { id: 'hollow', name: 'HOLLOW POINTS', cat: 'MUTATION', max: 1, desc: 'Hits cause bleeding. Bleeding enemies slow.', traits: ['Bleed'] },
  { id: 'graviton', name: 'GRAVITON ROUNDS', cat: 'MUTATION', max: 1, desc: 'Hits drag enemies toward the impact.', traits: ['Void'] },
  { id: 'twin', name: 'TWIN ROUND', cat: 'MUTATION', max: 1, desc: '+1 projectile per shot, -15% damage.', traits: ['Projectile'] },
  { id: 'killbreaker', name: 'KILLBREAKER', cat: 'MUTATION', max: 1, desc: 'Enemies you shoot dead explode.', traits: ['Explosion'] },
  { id: 'dashburn', name: 'DASHBURN', cat: 'MUTATION', max: 1, desc: 'Your dash leaves a line of fire.', traits: ['Fire', 'Movement'] },
  { id: 'twinecho', name: 'TWIN ECHO', cat: 'MUTATION', max: 1, desc: 'Echoes are recorded every 7s instead of 10s.', traits: ['Echo'] },
  { id: 'rewind', name: 'REWIND', cat: 'MUTATION', max: 1, desc: 'Echoes repeat your steps backwards, attacks in reverse.', traits: ['Echo'] },
  { id: 'brokenRhythm', name: 'BROKEN RHYTHM', cat: 'MUTATION', max: 1, desc: 'Every 3rd Echo attack explodes.', traits: ['Echo', 'Explosion'] },
  { id: 'mirrorShot', name: 'MIRROR SHOT', cat: 'MUTATION', max: 1, desc: 'Echo projectiles return home, then burst outward.', traits: ['Echo'] },
  { id: 'predMemory', name: 'PREDATOR MEMORY', cat: 'MUTATION', max: 2, desc: 'Echoes hit 18% harder. They remember your targets.', traits: ['Echo', 'Critical'] },
  { id: 'secondDeath', name: 'SECOND DEATH', cat: 'MUTATION', max: 1, desc: 'When an Echo fades, it detonates.', traits: ['Echo', 'Explosion'] },
  { id: 'paradox', name: 'PARADOX', cat: 'MUTATION', max: 1, desc: 'Two overlapping Echoes merge into something stronger.', traits: ['Echo'] },
);
// --- RELIC ---
UPG.push(
  { id: 'hourglass', name: 'THE HOURGLASS', cat: 'RELIC', max: 1, desc: 'Every 30s, time grinds slow for everything but you.', traits: [], relic: true },
  { id: 'redbutton', name: 'THE RED BUTTON', cat: 'RELIC', max: 1, desc: 'Lose half your max health. Your Echoes become permanent.', traits: ['Echo'], relic: true },
  { id: 'unfinishedmap', name: 'THE UNFINISHED MAP', cat: 'RELIC', max: 1, desc: 'The arena expands as the run continues.', traits: ['Movement'], relic: true },
  { id: 'coin', name: "DEAD MAN'S COIN", cat: 'RELIC', max: 1, desc: 'Below 25% health: +50% damage dealt, -40% taken.', traits: ['Critical'], relic: true },
  { id: 'theMirror', name: 'THE MIRROR', cat: 'RELIC', max: 1, desc: 'You fade from sight. Enemies aim worse. Echoes +25% damage.', traits: ['Echo'], relic: true },
  { id: 'chrono', name: 'CHRONO ANCHOR', cat: 'RELIC', max: 1, desc: 'Echoes recorded every 8s, lasting 12s in slow replay.', traits: ['Echo'], relic: true },
);

export function allUpgrades() { return UPG; }
function def(id) { return UPG.find((u) => u.id === id); }

const SYN = [
  { id: 'afterburn', need: ['Fire', 'Echo'], name: 'AFTERBURN', desc: 'Echoes leave burning footprints' },
  { id: 'stormshot', need: ['Lightning', 'Projectile'], name: 'STORMSHOT', desc: 'Your bullets chain lightning' },
  { id: 'collapse', need: ['Explosion', 'Void'], name: 'COLLAPSE', desc: 'Explosions pull enemies in before they detonate' },
  { id: 'velocity', need: ['Movement', 'Echo'], name: 'VELOCITY', desc: 'Echoes replay faster and hit harder' },
  { id: 'memleak', need: ['Bleed', 'Echo'], name: 'MEMORY LEAK', desc: 'Echo kills leak hostile memories that fight for you' },
];
const ASC = [
  { id: 'thunder', need: ['Lightning', 'Echo', 'Critical', 'Movement'], name: 'THUNDER GOD', desc: 'Your Echoes become lightning entities' },
  { id: 'supernova', need: ['Fire', 'Explosion', 'Void'], name: 'SUPERNOVA', desc: 'Your explosions leave miniature stars' },
];

export function checkCombos() {
  for (const s of SYN) {
    if (!G.syn[s.id] && s.need.every((t) => (G.traits[t] || 0) > 0)) {
      G.syn[s.id] = true;
      banner(s.name, s.desc, '#54e6ff');
      A.sfx('levelup');
    }
  }
  for (const s of ASC) {
    if (G.ascension !== s.id && s.need.every((t) => (G.traits[t] || 0) > 0)) {
      G.ascension = s.id;
      banner('ASCENSION · ' + s.name, s.desc.toUpperCase(), '#ffd75e');
      FX.flash(0.7, '#ffffff'); FX.shake(0.7); FX.slowmo(1);
      A.sfx('ascend');
      META.event('ascend');
      if (s.id === 'thunder') G.player.critBonus = (G.player.critBonus || 0) + 0.15;
    }
  }
}

let bannerRef = null;
export function setBanner(fn) { bannerRef = fn; }
function banner(t, s, col) { if (bannerRef) bannerRef(t, s, col); }

// ---------------- offers ----------------
export function offerChoices(n = 3) {
  const P = G.player;
  const pool = [];
  const paths = { grave: ['siege', 'exec', 'sing'], widow: ['swarm', 'venom', 'predator'], sun: ['solar', 'prism', 'corona', 'eclipse'] }[P.weapon] || [];
  const seen = new Set();
  for (const u of UPG) {
    if (seen.has(u.id)) continue;
    if (u.wcat) {
      if (!paths.includes(u.path)) continue;
      const cur = G.weapState[P.weapon][u.path] || 0;
      if (u.rank !== cur + 1) continue;
    } else if (u.relic) {
      if (G.time < 240) continue; // relics enter the pool after minute 4 (guaranteed after Saint)
      if ((G.owned[u.id] || 0) >= (u.max ?? 1)) continue;
      if (Math.random() > 0.35) continue;
    } else {
      if ((G.owned[u.id] || 0) >= (u.max ?? 1)) continue;
    }
    seen.add(u.id);
    pool.push(u);
  }
  const picks = [];
  while (picks.length < n && pool.length) {
    const u = pool.splice((Math.random() * pool.length) | 0, 1)[0];
    picks.push(u);
  }
  while (picks.length < n) picks.push({ id: '_repair', name: 'MEMORY PATCH', cat: 'CORE', desc: 'Restore 30 health. Nothing is free, but this is close.', traits: [] });
  return picks;
}

export function offerRelics(n = 3) {
  const pool = UPG.filter((u) => u.relic && !(G.owned[u.id] > 0));
  const picks = [];
  while (picks.length < n && pool.length) picks.push(pool.splice((Math.random() * pool.length) | 0, 1)[0]);
  while (picks.length < n) picks.push({ id: '_repair', name: 'MEMORY PATCH', cat: 'CORE', desc: 'Restore 40 health instead.', traits: [] });
  return picks;
}

export function applyUpgrade(u) {
  if (u.id === '_repair') { G.player.hp = Math.min(G.player.maxHp, G.player.hp + 30); A.sfx('levelup'); return; }
  G.owned[u.id] = (G.owned[u.id] || 0) + 1;
  for (const t of u.traits || []) G.traits[t] = (G.traits[t] || 0) + 1;
  if (u.wcat) G.weapState[G.player.weapon][u.path] = u.rank;
  if (u.id === 'secondwind') G.player.secondWind = true;
  if (u.id === 'longstride') G.player.speed *= 1.18;
  if (u.id === 'redbutton') { G.player.maxHp = Math.round(G.player.maxHp * 0.5); G.player.hp = Math.min(G.player.hp, G.player.maxHp); META.event('redbutton'); banner('THE RED BUTTON', 'YOUR ECHOES ARE PERMANENT NOW', '#ff5a5a'); }
  if (u.id === 'theMirror') banner('THE MIRROR', 'ONLY YOUR ECHOES REMAIN VISIBLE', '#b08aff');
  if (u.id === 'orbit') { G.orbA = 0; }
  checkCombos();
}

export function ownedLabel() {
  const parts = [];
  for (const id in G.owned) {
    const d = def(id);
    if (d) parts.push(d.name + (G.owned[id] > 1 ? ' x' + G.owned[id] : ''));
  }
  for (const s of SYN) if (G.syn[s.id]) parts.push('◆ ' + s.name);
  if (G.ascension) parts.push('★ ' + ASC.find((a) => a.id === G.ascension).name);
  return parts.join(' · ');
}
