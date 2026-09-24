/**
 * BallRig: the ball wears its build. Every owned weapon mounts a sprite part
 * on the ball (band / cannon / rocket / coil / cell / hoop), every passive hangs
 * a charm. Parts react to live sim state (aim, dash flames, coil zaps, trail
 * pulses). Pure mirroring — never mutates sim state.
 */
import { Container, Sprite, Texture } from 'pixi.js';
import type { Atlas } from './atlas';
import type { World } from '../game/state';
import { WEAPON_ATTACHMENT, PASSIVE_CHARM, CHARM_SLOTS } from '../game/data/ballRig';

/** ball radius in px (matches the 9px sim radius at rig scale 1) */
const R = 9.5;

export class BallRig extends Container {
  /** the spinning ball itself — ghost afterimages copy this texture */
  ball: Sprite;
  private face: Sprite;
  private glow: Sprite;
  private band: Sprite;
  private hoop: Sprite;
  private cannon: Sprite;
  private rocket: Sprite;
  private flame: Sprite;
  private coil: Sprite;
  private cell: Sprite;
  private wing: Sprite;
  private charms: Sprite[] = [];
  /** per-part level scale, set by rebuild() and combined with per-frame anim in sync() */
  private partScale = new Map<Sprite, number>();

  private aimX = 1;
  private aimY = 0;
  private cannonRecoil = 0;
  private coilPulse = 0;
  private sig = '';
  private sigTimer = 0;
  private started = false;
  private onEquip: ((tint: number) => void) | null;
  private atlas: Atlas;

  constructor(atlas: Atlas, onEquip: ((tint: number) => void) | null = null) {
    super();
    this.atlas = atlas;
    this.onEquip = onEquip;
    const mk = (tex: Texture): Sprite => {
      const s = new Sprite(tex);
      s.anchor.set(0.5);
      return s;
    };
    // hoop + cell render BEHIND the ball (they wrap around its back)
    this.hoop = mk(atlas.att_hoop);
    this.cell = mk(atlas.att_cell);
    this.glow = mk(glowDiscTexture());
    this.glow.blendMode = 'add';
    this.glow.alpha = 0;
    this.glow.scale.set(0.42);
    this.ball = mk(atlas.ball_wrecker);
    this.face = mk(atlas.ball_face);
    this.face.position.set(0, -2.5);
    this.band = mk(atlas.att_band);
    this.cannon = mk(atlas.att_cannon);
    this.rocket = mk(atlas.att_rocket);
    this.flame = mk(atlas.att_flame);
    this.flame.anchor.set(0, 0.5);
    this.flame.position.set(-5.5, 0);
    this.flame.visible = false;
    this.rocket.addChild(this.flame);
    this.coil = mk(atlas.att_coil);
    this.wing = mk(atlas.att_rang);
    this.addChild(this.hoop, this.cell, this.glow, this.ball, this.face, this.band, this.cannon, this.rocket, this.coil, this.wing);
    for (let i = 0; i < CHARM_SLOTS.length; i++) {
      const c = mk(Texture.EMPTY);
      this.addChild(c);
      this.charms.push(c);
    }
    for (const part of [this.hoop, this.cell, this.band, this.cannon, this.rocket, this.coil, this.wing, ...this.charms]) part.visible = false;
    this.face.visible = false;
  }

  /** loadout signature — changes when any weapon/passive level or evolution changes */
  private static signature(w: World): string {
    let s = `${w.char.id}|`;
    for (const [id, lvl] of w.weapons) s += `${id}:${lvl}:${w.evolved.has(id) ? 1 : 0};`;
    return s + `|${[...w.passives.keys()].sort().join(',')}`;
  }

  /** rebuild part textures/visibility after a loadout change */
  private rebuild(w: World): void {
    const fresh = !this.started;
    this.started = true;
    for (const [id, lvl] of w.weapons) {
      const att = WEAPON_ATTACHMENT[id];
      const part = this.partFor(att.slot);
      if (!part) continue;
      const evolved = w.evolved.has(id);
      part.texture = this.atlas[evolved && att.evoSprite ? att.evoSprite : att.sprite] ?? Texture.EMPTY;
      part.visible = true;
      const k = 1 + 0.05 * (lvl - 1);
      this.partScale.set(part, evolved ? k * 1.12 : k);
      part.tint = 0xffffff;
    }
    const owned = [...w.passives.keys()];
    for (let i = 0; i < this.charms.length; i++) {
      const c = this.charms[i];
      const pid = owned[i];
      if (!pid) { c.visible = false; continue; }
      c.texture = this.atlas[PASSIVE_CHARM[pid]] ?? Texture.EMPTY;
      c.visible = true;
    }
    this.face.texture = this.atlas[w.char.face ?? ''] ?? Texture.EMPTY;
    this.face.visible = !!w.char.face;
    // evolved aura: tint the underglow with the newest evolution's accent
    let glowTint = 0;
    for (const id of w.evolved) glowTint = WEAPON_ATTACHMENT[id].tint;
    if (glowTint) this.glow.tint = glowTint;
    this.glow.alpha = glowTint ? 0.1 : 0;
    if (!fresh && this.onEquip) {
      const last = [...w.weapons.keys()].pop();
      this.onEquip(last ? WEAPON_ATTACHMENT[last].tint : 0xffffff);
    }
  }

  private partFor(slot: string): Sprite | null {
    switch (slot) {
      case 'band': return this.band;
      case 'hoop': return this.hoop;
      case 'aim': return this.cannon;
      case 'back': return this.rocket;
      case 'top': return this.coil;
      case 'low': return this.cell;
      case 'wing': return this.wing;
      default: return null;
    }
  }

  /** arc lightning just left the ball — flash the coil */
  pulseCoil(): void {
    if (this.coil.visible) this.coilPulse = 0.12;
  }

  /** swap the ball body for the run's character texture */
  setBall(tex: Texture): void {
    this.ball.texture = tex;
  }

  /** a bolt was fired — kick the cannon back along its aim */
  pulseCannon(): void {
    if (this.cannon.visible) this.cannonRecoil = 0.09;
  }

  /**
   * Per-frame mirror. The rig container's position/scale (squash/stretch) and
   * the ball spin are driven by the caller; parts animate here.
   */
  sync(w: World, dt: number, time: number, rolling: number): void {
    // loadout changes are rare — poll the signature on a budget, not per frame
    this.sigTimer -= dt;
    if (this.sigTimer <= 0) {
      this.sigTimer = 0.25;
      const sig = BallRig.signature(w);
      if (sig !== this.sig) {
        this.sig = sig;
        this.rebuild(w);
      }
    }

    // aim eases toward facing (cannon leads, rocket trails)
    const k = 1 - Math.exp(-10 * dt);
    this.aimX += (w.facingX - this.aimX) * k;
    this.aimY += (w.facingY - this.aimY) * k;
    const alen = Math.hypot(this.aimX, this.aimY) || 1;
    const ax = this.aimX / alen;
    const ay = this.aimY / alen;
    const aim = Math.atan2(ay * 0.85, ax);

    this.ball.rotation = rolling;

    const bandK = this.partScale.get(this.band) ?? 1;
    if (this.band.visible) {
      this.band.position.set(0, 4.2);
      this.band.scale.set(bandK, bandK * 0.62);
    }
    if (this.hoop.visible) {
      const hk = this.partScale.get(this.hoop) ?? 1;
      this.hoop.position.set(0, 1.2);
      this.hoop.scale.set(hk, hk);
      this.hoop.rotation = Math.sin(time * 2.2) * 0.05;
    }
    if (this.cannon.visible) {
      this.cannonRecoil = Math.max(0, this.cannonRecoil - dt);
      const u = this.cannonRecoil / 0.09;
      const ck = this.partScale.get(this.cannon) ?? 1;
      const dist = R + 1.5 - u * 3;
      this.cannon.rotation = aim;
      this.cannon.position.set(Math.cos(aim) * dist, Math.sin(aim) * dist * 0.85);
      this.cannon.scale.set(ck * (1 - u * 0.12), ck * (1 + u * 0.1));
    }
    if (this.rocket.visible) {
      const rk = this.partScale.get(this.rocket) ?? 1;
      this.rocket.rotation = aim;
      this.rocket.position.set(-Math.cos(aim) * (R - 1), -Math.sin(aim) * (R - 1) * 0.85 + 0.5);
      this.rocket.scale.set(rk, rk);
      // flame roars while dashing, else sputters out
      const on = w.dashT > 0;
      this.flame.visible = on;
      if (on) {
        const flicker = 1 + Math.sin(time * 46) * 0.22 + Math.random() * 0.14;
        this.flame.scale.set((1.4 + Math.min(1, Math.hypot(w.pvx, w.pvy) / 300) * 0.8) * flicker, (0.9 + Math.sin(time * 31) * 0.18) * flicker);
        this.flame.tint = Math.sin(time * 40) > 0 ? 0xffb14b : 0xff7a3f;
      }
    }
    if (this.coil.visible) {
      this.coilPulse = Math.max(0, this.coilPulse - dt);
      const ck = this.partScale.get(this.coil) ?? 1;
      this.coil.position.set(1, -R - 4.5);
      this.coil.rotation = Math.sin(time * 3.1) * 0.06;
      this.coil.tint = this.coilPulse > 0 ? 0xaee2ff : Math.sin(time * 5) > 0.86 ? 0xdcf0ff : 0xffffff;
      this.coil.scale.set(ck * (this.coilPulse > 0 ? 1.25 : 1));
    }
    if (this.cell.visible) {
      const tk = this.partScale.get(this.cell) ?? 1;
      const armed = w.trailAcc < 0.12;
      const breathe = 1 + Math.sin(time * 6) * 0.06 + (armed ? 0.15 : 0);
      this.cell.position.set(-ax * 3 - 2, R - 1.5);
      this.cell.scale.set(tk * breathe, tk * breathe);
      this.cell.tint = armed ? 0xc8f8ff : 0xffffff;
    }
    if (this.wing.visible) {
      // a boomerang on the rack spins along when one is in the air
      let rangOut = false;
      for (let i = 0; i < w.bCount; i++) {
        if (w.bkind[i] === 2) { rangOut = true; break; }
      }
      const wk = this.partScale.get(this.wing) ?? 1;
      this.wing.position.set(-7.5, -6.5);
      this.wing.rotation = rangOut ? time * 14 : Math.sin(time * 3) * 0.15 - 0.5;
      this.wing.scale.set(wk, wk);
    }
    for (let i = 0; i < this.charms.length; i++) {
      const c = this.charms[i];
      if (!c.visible) continue;
      const slot = CHARM_SLOTS[i];
      c.position.set(slot.x, slot.y + Math.sin(time * 3 + i * 1.9) * 1.2);
      c.rotation = Math.sin(time * 2 + i) * 0.12;
      c.scale.set(0.85);
    }
    if (this.glow.alpha > 0) {
      this.glow.alpha = 0.09 + Math.sin(time * 2.4) * 0.03;
      this.glow.scale.set(0.42 + Math.sin(time * 2.4) * 0.02);
    }
  }
}

/** small radial glow for the evolved aura */
let discTex: Texture | null = null;
function glowDiscTexture(): Texture {
  if (discTex) return discTex;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,0.8)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  discTex = Texture.from(c);
  return discTex;
}
