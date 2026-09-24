/** Run orchestrator: owns the World, ticks systems in order, handles pickups/XP/level-up flow. */
import { audio } from '../engine/audio';
import type { Input } from '../engine/input';
import { applyChoice, choiceKey, grantXp, rollChoices } from './progression';
import { getMetaRanks, type PendingChoice } from './state';
import { World } from './state';
import { stepChainCd, stepDashDamage, stepWeapons, tryChain } from './weapons';
import { stepEnemies, stepEliteMods, stepPlayer } from './physics';
import { enemyDpsScale, isBossTime, stepSpawner, DESCEND_BOSS_EVERY } from './spawn';
import { stepRunEvents } from './runEvents';
import { ENEMY } from './data/enemies';
import type { CharacterDef } from './data/characters';
import type { AttackKind, Events } from './events';

export interface RunHooks {
  onLevelUp(choices: PendingChoice[]): void;
  onEnd(state: 'dead' | 'won'): void;
  maxActive: number;
}

export class Run {
  w: World;
  ev: Events;
  private hooks: RunHooks;
  private pendingLevels = 0;
  private pendingChoices: PendingChoice[] = [];
  private comboKills = 0;
  private comboT = 0;
  /** draft agency */
  rerollsLeft: number;
  banishesLeft = 1;
  ended = false;
  /** end-screen bonus gold already granted (DESCEND re-ends the same run) */
  bankedBonus = 0;

  /**
   * Continue after clearing the arena: endless mode with steeper scaling and
   * recurring bosses. The run's sim simply resumes — death here is final.
   */
  descend(): void {
    if (this.w.endState !== 'won') return;
    this.w.endState = 'playing';
    this.w.descendLevel++;
    this.w.descendBossAcc = DESCEND_BOSS_EVERY - 20; // first depth boss arrives soon
    this.ended = false;
  }

  constructor(char: CharacterDef, seed: number, hooks: RunHooks) {
    this.hooks = hooks;
    this.w = new World(char, seed, hooks.maxActive);
    this.ev = this.makeEvents();
    this.rerollsLeft = 2 + (getMetaRanks()['insight'] ?? 0);
  }

  /** Advance one fixed sim step. */
  tick(dt: number, input: Input | null): void {
    const w = this.w;
    if (w.endState !== 'playing') {
      if (!this.ended) {
        this.ended = true;
        this.hooks.onEnd(w.endState === 'won' ? 'won' : 'dead');
      }
      return;
    }
    if (this.pendingLevels > 0) return; // sim frozen during level-up
    const jump = input?.jumpQueued ?? false;
    if (input) input.jumpQueued = false;

    w.runStats.time += dt;

    // kill-combo window for flavor toasts
    if (this.comboT > 0) {
      this.comboT -= dt;
      if (this.comboT <= 0) this.comboKills = 0;
    }

    stepPlayer(w, input?.moveX ?? 0, input?.moveY ?? 0, dt, this.ev, jump);
    input?.pollGamepad();
    stepSpawner(w, dt, this.ev, this.hooks.maxActive);
    stepWeapons(w, dt, this.ev);
    stepDashDamage(w, this.ev);
    stepEnemies(w, dt, this.ev);
    stepRunEvents(w, dt, this.ev,
      (def) => this.onEventToast?.(`${def.icon} ${def.name} — ${def.desc}`, def.dur),
      (def) => this.onEventToast?.(`${def.icon} ${def.name} — OVER`, 1200),
    );
    stepEliteMods(w, dt, this.ev);
    stepChainCd(w, dt);
    this.stepPickups(dt);
  }

  // ---------- level-up flow ----------

  private queueLevelUp(): void {
    this.pendingLevels++;
    audio.levelup();
    this.hooks.onLevelUp(this.takeChoices());
  }

  /** Called by UI after the player picks a card. May immediately re-open for stacked levels. */
  resolveChoice(c: PendingChoice): PendingChoice[] | null {
    applyChoice(this.w, c);
    this.pendingLevels--;
    if (this.pendingLevels > 0) {
      this.pendingChoices = rollChoices(this.w);
      if (this.pendingChoices.length === 0) this.pendingLevels = 0; // everything maxed
      return this.pendingChoices.length > 0 ? this.pendingChoices : null;
    }
    return null;
  }

  /** Spend a reroll: fresh cards (locked card stays pinned). Returns the new hand or null. */
  reroll(): PendingChoice[] | null {
    if (this.rerollsLeft <= 0) return null;
    this.rerollsLeft--;
    this.pendingChoices = rollChoices(this.w);
    return this.pendingChoices;
  }

  /** Banish a card out of this run's pool. Returns remaining choices after removal. */
  banish(c: PendingChoice): PendingChoice[] | null {
    if (this.banishesLeft <= 0) return null;
    this.banishesLeft--;
    this.w.banished.add(choiceKey(c));
    this.pendingChoices = this.pendingChoices.filter((x) => x !== c);
    return this.pendingChoices;
  }

  /** Toggle the draft lock on a card. */
  toggleLock(c: PendingChoice): void {
    this.w.locked = this.w.locked && choiceKey(this.w.locked) === choiceKey(c) ? null : c;
  }

  get waitingChoice(): boolean {
    return this.pendingLevels > 0;
  }

  /** the hand currently on the table (for re-rendering after lock toggles) */
  currentHand(): PendingChoice[] {
    return this.pendingChoices;
  }

  /** Offer cards for a queued level-up (called by UI when opening the screen). */
  takeChoices(): PendingChoice[] {
    if (this.pendingLevels <= 0) return [];
    this.pendingChoices = rollChoices(this.w);
    if (this.pendingChoices.length === 0) {
      // pool exhausted (all upgrades maxed): drain queued levels instead of soft-locking
      this.pendingLevels = 0;
    }
    return this.pendingChoices;
  }

  // ---------- pickups ----------

  private stepPickups(dt: number): void {
    const w = this.w;
    const magnet = w.stats.magnetR;

    for (let i = 0; i < w.gCount; i++) {
      const dx = w.px - w.gx[i];
      const dy = w.py - w.gy[i];
      const d2 = dx * dx + dy * dy;

      if (!w.gmagnet[i] && d2 < magnet * magnet) w.gmagnet[i] = 1;
      if (w.gmagnet[i]) {
        const d = Math.sqrt(d2) || 1;
        const sp = 340 + (1 - Math.min(1, d / 300)) * 480;
        w.gvx[i] = (dx / d) * sp;
        w.gvy[i] = (dy / d) * sp;
      } else {
        // scatter friction
        w.gvx[i] *= 1 - 3 * dt;
        w.gvy[i] *= 1 - 3 * dt;
      }
      w.gx[i] += w.gvx[i] * dt;
      w.gy[i] += w.gvy[i] * dt;

      if (d2 < 16 * 16) {
        if (w.gkind[i] === 0) {
          grantXp(w, w.gvalue[i], () => this.queueLevelUp());
          this.ev.gemPickup();
        } else {
          const gold = Math.max(1, Math.round(w.gvalue[i] * w.stats.goldMult));
          w.runStats.goldEarned += gold;
          this.ev.goldPickup(gold);
        }
        w.removeGem(i);
        i--;
      }
    }

    // world rewards: caches and shrines
    for (const r of w.rewards) {
      if (r.taken) continue;
      const dx = w.px - r.x;
      const dy = w.py - r.y;
      if (dx * dx + dy * dy > 34 * 34) continue;
      if (r.kind === 'cache') {
        r.taken = true;
        for (let g = 0; g < 4; g++) w.spawnGem(r.x + w.rng.range(-10, 10), r.y + w.rng.range(-10, 10), 1, 3);
        this.ev.cacheLooted(r.x, r.y);
      } else {
        const kind = r.kind === 'shrine_might' ? 'might' : r.kind === 'shrine_regen' ? 'regen' : 'magnet';
        r.taken = true;
        w.buff = { kind, t: 45 };
        w.refreshStats();
        this.ev.shrineTaken(kind);
      }
    }
  }

  // ---------- sim -> fx events ----------

  private makeEvents(): Events {
    const w = this.w;
    return {
      hitEnemy: (x, y, dmg) => {
        this.fx?.hitNumber(x, y, dmg);
      },
      enemyDeath: (x, y, type, elite) => {
        this.fx?.deathBurst(x, y, type, elite);
        audio.bonk(0.5);
        if (elite) audio.gold();
        if (type === ENEMY.boss) {
          this.fx?.bossKillFx();
          return;
        }
        this.comboKills++;
        this.comboT = 2;
        if (this.comboKills === 12) this.onToast?.('MEGA BONK!');
        else if (this.comboKills === 20) this.onToast?.('UNSTOPPABLE!');
        else if (this.comboKills === 30) {
          this.onToast?.('ABSOLUTELY WRECKED!!');
          this.fx?.screenImpact(0.5);
        }
      },
      impact: (x, y, force) => {
        this.fx?.impactFx(x, y, force);
        if (force > 0.25) {
          audio.bonk(force);
          this.fx?.shake(2 + force * 5, 0.12);
          tryChain(w, x, y, 6 + 26 * force, this.ev);
        }
        if (force > 0.85) this.fx?.screenImpact(force);
      },
      wallBonk: (x, y, force) => {
        this.fx?.impactFx(x, y, force);
        if (force > 0.3) audio.bonk(force * 0.8);
      },
      explosion: (x, y, radius) => {
        this.fx?.explosionFx(x, y, radius);
        audio.slam();
        this.fx?.shake(6, 0.25);
      },
      slam: (x, y, radius) => {
        this.fx?.slamFx(x, y, radius);
        audio.slam();
        this.fx?.shake(7, 0.28);
      },
      zap: (x1, y1, x2, y2) => {
        this.fx?.zapFx(x1, y1, x2, y2);
      },
      playerHurt: (dmg) => {
        audio.hurt();
        this.fx?.shake(5, 0.2);
        this.fx?.hurtFlash();
        this.fx?.screenImpact(0.4);
        void dmg;
      },
      levelUp: () => {},
      goldPickup: () => {
        audio.gold();
        this.fx?.goldBurst(this.w.px, this.w.py);
      },
      gemPickup: () => {
        audio.gem();
      },
      bossSpawn: (x, y, type) => {
        audio.boss();
        this.fx?.shake(14, 0.8);
        this.fx?.bossWarn(x, y, type);
      },
      playerAttack: (kind) => {
        this.fx?.playerAttackFx(kind);
        if (kind === 'shot') audio.shot();
        if (kind === 'dash') audio.hiss();
      },
      enemyAttack: (x, y, kind: AttackKind) => {
        this.fx?.telegraph(x, y, kind);
        if (kind === 'charge') audio.roar();
        else audio.hiss();
      },
      eruption: (x, y, radius) => {
        this.fx?.eruptionFx(x, y, radius);
        audio.zap();
      },
      pound: (x, y, radius) => {
        this.fx?.poundFx(x, y, radius);
        audio.pound();
        this.fx?.shake(9, 0.3);
      },
      crateHit: (x, y) => {
        this.fx?.crateHitFx(x, y);
        audio.thud();
      },
      obstacleBreak: (x, y) => {
        this.fx?.obstacleBreakFx(x, y);
        audio.smash();
        this.fx?.shake(4, 0.15);
      },
      playerJump: () => {
        audio.jump();
        this.fx?.jumpPuff(this.w.px, this.w.py);
      },
      playerLand: (x, y) => {
        audio.thud();
        this.fx?.landDust(x, y);
      },
      playerSlamStart: () => {
        audio.hiss();
      },
      groundSlam: (x, y, radius) => {
        audio.slamLand();
        this.fx?.groundSlamFx(x, y, radius);
        this.fx?.shake(11, 0.32);
      },
      bumperHit: (x, y) => {
        audio.jump();
        this.fx?.bumperFx(x, y);
      },
      jumpPad: (x, y) => {
        audio.jump();
        this.fx?.jumpPuff(x, y);
      },
      boostPad: (x, y) => {
        audio.hiss();
        this.fx?.landDust(x, y);
      },
      zoneChange: (name) => {
        this.onZoneToast?.(name);
      },
      shrineTaken: (kind) => {
        audio.gold();
        this.onShrineToast?.(kind);
      },
      cacheLooted: (x, y) => {
        audio.gold();
        this.fx?.goldBurst(x, y);
      },
      chestOpened: (x, y) => {
        audio.smash();
        this.fx?.goldBurst(x, y);
        this.fx?.shake(4, 0.15);
      },
      gravityPull: (x, y, radius) => {
        this.fx?.gravityPullFx(x, y, radius);
      },
      tremor: (x, y, radius) => {
        this.fx?.tremorFx(x, y, radius);
        audio.thud();
      },
      meteor: (x, y, radius) => {
        this.fx?.meteorFx(x, y, radius);
        audio.thud();
        this.fx?.shake(3, 0.12);
      },
      bossEnrage: (x, y, type) => {
        audio.roar();
        this.fx?.bossEnrageFx(x, y);
        this.fx?.shake(14, 0.7);
        this.fx?.screenImpact(0.85);
        this.onToast?.(type === ENEMY.krusher ? 'KRUSHER CALLS THE PIT!' : 'BONZAR IS FURIOUS!');
      },
    };
  }

  /** Render fx sink, injected by main after renderer exists. */
  fx: FxSink | null = null;
  /** zone-entry toast hook */
  onZoneToast: ((name: string) => void) | null = null;
  onShrineToast: ((kind: 'might' | 'regen' | 'magnet') => void) | null = null;
  /** flavor toast hook (combo streaks etc.) */
  onToast: ((msg: string) => void) | null = null;
  /** run-event banners: (message, duration seconds) */
  onEventToast: ((msg: string, durS: number) => void) | null = null;
}

export interface FxSink {
  hitNumber(x: number, y: number, dmg: number): void;
  deathBurst(x: number, y: number, type: number, elite: boolean): void;
  impactFx(x: number, y: number, force: number): void;
  explosionFx(x: number, y: number, radius: number): void;
  slamFx(x: number, y: number, radius: number): void;
  zapFx(x1: number, y1: number, x2: number, y2: number): void;
  shake(mag: number, dur: number): void;
  hurtFlash(): void;
  goldBurst(x: number, y: number): void;
  bossWarn(x: number, y: number, type: number): void;
  playerAttackFx(kind: 'slam' | 'shot' | 'dash'): void;
  telegraph(x: number, y: number, kind: AttackKind): void;
  eruptionFx(x: number, y: number, radius: number): void;
  poundFx(x: number, y: number, radius: number): void;
  bumperFx(x: number, y: number): void;
  crateHitFx(x: number, y: number): void;
  obstacleBreakFx(x: number, y: number): void;
  jumpPuff(x: number, y: number): void;
  landDust(x: number, y: number): void;
  groundSlamFx(x: number, y: number, radius: number): void;
  /** screen-level impact: chromatic aberration pulse (+ hitstop for huge forces) */
  screenImpact(force: number): void;
  /** the boss died: freeze-frame + zoom swell */
  bossKillFx(): void;
  /** Gravity Crush implosion pull */
  gravityPullFx(x: number, y: number, radius: number): void;
  /** Juggernaut tremor ring + dust */
  tremorFx(x: number, y: number, radius: number): void;
  /** Meteor Shower impact: dust ring + embers (lighter than explosionFx) */
  meteorFx(x: number, y: number, radius: number): void;
  /** BONZAR phase 2: red shockwave rings + sparks */
  bossEnrageFx(x: number, y: number): void;
}

export function isBossPhase(time: number): boolean {
  return isBossTime(time);
}

export function dpsScaleNow(time: number): number {
  return enemyDpsScale(time);
}
