// layers/objects.ts — gameplay hardware: barriers, bumpers, beams, wormholes,
// switches + conduits, fragments, debris, THE HOLE (destination, not neon),
// gravity pins + placement ghost.
//
// Every static shape is built once at level load; per-frame work is limited to
// transforms/alphas plus a tiny fixed pool of conduit pulse dots.

import { Container, Graphics, Sprite } from 'pixi.js';
import type { World } from '../../sim/types';
import { HOLE_CAPTURE_R } from '../../sim/world';
import type { PinGhost } from '../api';
import { beaconPulse, clamp, expDamp, mixRGB } from '../core';
import { AMBER, DANGER, GREEN, TexFactory } from '../textures';

const PAIR_COLORS = [0x7fd8e8, 0xe8a06f, 0xc9a0ff, 0x8affc1];

interface SwitchView {
  root: Container;
  ring: Sprite;
  glow: Sprite;
  stem: Graphics;
  conduits: { line: Sprite; tKind: 'body' | 'zone' | 'corridor'; ti: number }[];
  lit: boolean;
}

interface PulseDot {
  sp: Sprite;
  si: number;
  ti: number;
  t: number;
  active: boolean;
}

interface PinView {
  root: Container;
  shard: Sprite;
  glow: Sprite;
  ring: Sprite;
  pop: number;
}

export class ObjectsLayer {
  readonly container = new Container();
  private tex: TexFactory;

  private barriers: Container[] = [];
  private bumpers: { root: Container; flash: Sprite; pop: number; x: number; y: number; r: number }[] = [];
  private beams: { root: Container; cone: Sprite; spin: number; phase: number; hi: number }[] = [];
  private worms: { root: Container; swirl: Sprite; dir: number; partner: number; cool: boolean }[] = [];
  private switches: SwitchView[] = [];
  private pulses: PulseDot[] = [];
  private fragments: { root: Container; shard: Sprite; spark: Sprite; phase: number }[] = [];
  private debris: Sprite[] = [];
  private hole = new Container();
  private holeShade!: Sprite;   // dark backing halo — punches the green out of glare
  private greenPad!: Sprite;    // THE lit putting green (structural landmark)
  private greenBands!: Sprite;  // additive mown-band shimmer over the pad
  private holeRing!: Sprite;
  private holeCup!: Sprite;
  private holeCapture!: Sprite;
  private holeBeacon!: Sprite;  // deterministic pulse ring (core.beaconPulse)
  private holeShaft!: Sprite;   // soft vertical light above the cup
  private pins: PinView[] = [];
  private ghost: Container;
  private ghostShard!: Sprite;
  private ghostRing!: Sprite;
  private bodyIdx = new Map<string, number>();
  private zoneIdx = new Map<string, number>();
  private t = 0;
  private holeCapR = 16;
  private beaconOut = { d: 0, a: 0 };

  constructor(tex: TexFactory) {
    this.tex = tex;
    this.container.addChild(this.hole);
    this.buildHole();
    this.ghost = new Container();
    this.ghost.visible = false;
    this.container.addChild(this.ghost);
    this.buildGhost();
  }

  // ------------------------------------------------------------- build

  build(w: World): void {
    this.t = 0;
    this.bodyIdx.clear();
    this.zoneIdx.clear();
    w.bodies.forEach((b, i) => this.bodyIdx.set(b.id, i));
    w.zones.forEach((z, i) => this.zoneIdx.set(z.id, i));

    // clear dynamic children (keep hole + ghost)
    for (const c of [...this.container.children]) {
      if (c !== this.hole && c !== this.ghost) c.destroy({ children: true });
    }
    this.container.addChild(this.hole, this.ghost);
    this.barriers.length = 0;
    this.bumpers.length = 0;
    this.beams.length = 0;
    this.worms.length = 0;
    this.switches.length = 0;
    this.fragments.length = 0;
    this.debris.length = 0;
    this.pins.length = 0;   // pooled pin views were destroyed with the container
    this.pulses.length = 0;

    // --- barriers: energy segment, chevron marks, end caps
    for (let i = 0; i < w.hazards.length; i++) {
      const h = w.hazards[i];
      const d = h.def;
      if (d.kind === 'barrier') {
        const g = new Container();
        const core = new Graphics();
        const dx = d.b.x - d.a.x;
        const dy = d.b.y - d.a.y;
        const len = Math.max(1, Math.hypot(dx, dy));
        const ux = dx / len;
        const uy = dy / len;
        // outer additive sheath
        core.moveTo(d.a.x, d.a.y);
        core.lineTo(d.b.x, d.b.y);
        core.stroke({ width: 9, color: DANGER, alpha: 0.16 });
        // core beam
        core.moveTo(d.a.x, d.a.y);
        core.lineTo(d.b.x, d.b.y);
        core.stroke({ width: 3, color: 0xff8a66, alpha: 0.95 });
        // chevron marks pointing along the segment
        const n = Math.max(1, Math.round(len / 46));
        for (let i = 1; i < n; i++) {
          const t = i / n;
          const px = d.a.x + dx * t;
          const py = d.a.y + dy * t;
          const cx = px - ux * 6;
          const cy = py - uy * 6;
          core.moveTo(cx + uy * 6, cy - ux * 6);
          core.lineTo(px + uy * 6, py - ux * 6);
          core.lineTo(px - uy * 6, py + ux * 6);
          core.stroke({ width: 2.5, color: 0xffd0c0, alpha: 0.8 });
        }
        // end caps
        core.circle(d.a.x, d.a.y, 5).fill({ color: 0xffd0c0, alpha: 0.9 });
        core.circle(d.b.x, d.b.y, 5).fill({ color: 0xffd0c0, alpha: 0.9 });
        g.addChild(core);
        this.container.addChild(g);
        this.barriers.push(g);
      } else if (d.kind === 'bumper') {
        const root = new Container();
        root.x = d.x;
        root.y = d.y;
        const halo = new Sprite(this.tex.glow(64));
        halo.anchor.set(0.5);
        halo.tint = AMBER;
        halo.alpha = 0.28;
        halo.width = d.r * 3.4;
        halo.height = d.r * 3.4;
        const pad = new Graphics();
        pad.circle(0, 0, d.r).fill({ color: 0x2c3038, alpha: 0.9 });
        pad.circle(0, 0, d.r).stroke({ width: 3, color: AMBER, alpha: 0.9 });
        pad.circle(0, 0, d.r * 0.55).stroke({ width: 2, color: AMBER, alpha: 0.5 });
        pad.circle(0, 0, d.r * 0.18).fill({ color: 0xffffff, alpha: 0.9 });
        const flash = new Sprite(this.tex.ringThin(64, 4));
        flash.anchor.set(0.5);
        flash.tint = 0xffffff;
        flash.alpha = 0;
        flash.width = d.r * 2.6;
        flash.height = d.r * 2.6;
        root.addChild(halo, pad, flash);
        this.container.addChild(root);
        this.bumpers.push({ root, flash, pop: 0, x: d.x, y: d.y, r: d.r });
      } else if (d.kind === 'beam') {
        const root = new Container();
        root.x = d.x;
        root.y = d.y;
        // warning sweep cone — leads the arm so the danger is readable early
        const cone = new Sprite(this.tex.cone(256));
        cone.anchor.set(0, 0.5);
        cone.tint = DANGER;
        cone.alpha = 0.2;
        cone.blendMode = 'add';
        const cs = d.len * 1.25 / 256;
        cone.scale.set(cs);
        // the arm itself + hub
        const arm = new Graphics();
        arm.roundRect(-4, -d.r, d.len + 8, d.r * 2, d.r);
        arm.fill({ color: 0x58201c, alpha: 0.95 });
        arm.roundRect(-4, -d.r, d.len + 8, d.r * 2, d.r);
        arm.stroke({ width: 2, color: DANGER, alpha: 0.95 });
        arm.rect(0, -1.5, d.len, 3).fill({ color: 0xffb8a0, alpha: 0.85 });
        const hub = new Graphics();
        hub.circle(0, 0, Math.max(7, d.r * 1.6)).fill({ color: 0x2a2226 });
        hub.circle(0, 0, Math.max(7, d.r * 1.6)).stroke({ width: 2, color: 0x8a5a50, alpha: 0.9 });
        root.addChild(cone, arm, hub);
        this.container.addChild(root);
        this.beams.push({ root, cone, spin: d.spin, phase: d.phase ?? 0, hi: i });
      }
    }

    // --- wormholes: matched-color swirling pairs, counter-phase rotation
    for (let i = 0; i < w.wormholes.length; i++) {
      const def = w.wormholes[i].def;
      const partner = w.wormholes.findIndex((o) => o.def.id === def.exitId);
      const color = PAIR_COLORS[Math.min(i, Math.max(0, partner)) % PAIR_COLORS.length];
      const root = new Container();
      root.x = def.x;
      root.y = def.y;
      const glow = new Sprite(this.tex.glow(128));
      glow.anchor.set(0.5);
      glow.tint = color;
      glow.alpha = 0.3;
      glow.width = def.r * 3;
      glow.height = def.r * 3;
      glow.blendMode = 'add';
      const swirl = new Sprite(this.tex.swirl(128));
      swirl.anchor.set(0.5);
      swirl.tint = color;
      const s = (def.r * 2) / 128;
      swirl.scale.set(s);
      const rim = new Sprite(this.tex.ringThin(64, 3));
      rim.anchor.set(0.5);
      rim.tint = color;
      rim.alpha = 0.7;
      rim.width = def.r * 2.1;
      rim.height = def.r * 2.1;
      root.addChild(glow, swirl, rim);
      this.container.addChild(root);
      this.worms.push({ root, swirl, dir: i % 2 === 0 ? 1 : -1, partner, cool: false });
    }

    // --- switches: tee-marker pads + conduits to targets
    for (const s of w.switches) {
      const d = s.def;
      const root = new Container();
      root.x = d.x;
      root.y = d.y;
      const stem = new Graphics();
      // golf-tee profile: stem + base bar under the pad
      stem.moveTo(-3, d.r * 0.6);
      stem.lineTo(3, d.r * 0.6);
      stem.lineTo(5, d.r * 0.6 + 10);
      stem.lineTo(-5, d.r * 0.6 + 10);
      stem.closePath();
      stem.fill({ color: 0x39424c, alpha: 0.9 });
      stem.rect(-9, d.r * 0.6 + 10, 18, 3).fill({ color: 0x59626e, alpha: 0.9 });
      const pad = new Graphics();
      pad.circle(0, 0, d.r).fill({ color: 0x22282f, alpha: 0.92 });
      pad.circle(0, 0, d.r).stroke({ width: 2, color: 0x59626e, alpha: 1 });
      pad.circle(0, 0, d.r * 0.45).fill({ color: 0x39424c, alpha: 1 });
      const glow = new Sprite(this.tex.glow(64));
      glow.anchor.set(0.5);
      glow.tint = AMBER;
      glow.alpha = 0;
      glow.width = d.r * 5;
      glow.height = d.r * 5;
      glow.blendMode = 'add';
      const ring = new Sprite(this.tex.ringThin(64, 4));
      ring.anchor.set(0.5);
      ring.tint = AMBER;
      ring.alpha = 0.25;
      ring.width = d.r * 2.2;
      ring.height = d.r * 2.2;
      root.addChild(glow, stem, pad, ring);
      const view: SwitchView = { root, ring, glow, stem, conduits: [], lit: false };
      // conduit lines: thin stretched streak sprites, endpoints tracked live
      for (const tid of d.targets) {
        const bi = this.bodyIdx.get(tid);
        const zi = this.zoneIdx.get(tid);
        if (bi === undefined && zi === undefined) continue;
        const line = new Sprite(this.tex.streak(64, 6));
        line.anchor.set(0, 0.5);
        line.tint = AMBER;
        line.alpha = 0.1;
        this.container.addChildAt(line, 0);
        view.conduits.push({
          line,
          tKind: bi !== undefined ? 'body' : zi !== undefined && w.zones[zi].a ? 'corridor' : 'zone',
          ti: bi !== undefined ? bi : (zi as number),
        });
      }
      this.container.addChild(root);
      this.switches.push(view);
    }

    // conduit pulse dots (fixed pool)
    for (let i = 0; i < 16; i++) {
      const sp = new Sprite(this.tex.glow(32));
      sp.anchor.set(0.5);
      sp.tint = AMBER;
      sp.blendMode = 'add';
      sp.visible = false;
      sp.scale.set(0.35);
      this.container.addChild(sp);
      this.pulses.push({ sp, si: 0, ti: 0, t: 0, active: false });
    }

    // --- fragments: glowing shards with bob + sparkle
    for (let i = 0; i < w.fragments.length; i++) {
      const f = w.fragments[i];
      const root = new Container();
      const glow = new Sprite(this.tex.glow(64));
      glow.anchor.set(0.5);
      glow.tint = AMBER;
      glow.alpha = 0.3;
      glow.width = 56;
      glow.height = 56;
      glow.blendMode = 'add';
      const shard = new Sprite(this.tex.shard(24, 40));
      shard.anchor.set(0.5);
      shard.tint = 0xffe2b0;
      shard.scale.set(0.55);
      shard.rotation = 0.3;
      const spark = new Sprite(this.tex.star(28));
      spark.anchor.set(0.5);
      spark.tint = 0xffffff;
      spark.scale.set(0.5);
      root.addChild(glow, shard, spark);
      root.x = f.x;
      root.y = f.y;
      this.container.addChild(root);
      this.fragments.push({ root, shard, spark, phase: i * 2.1 });
    }

    // --- debris: small physics rocks
    for (let i = 0; i < w.debris.length; i++) {
      const d = w.debris[i];
      const sp = new Sprite(this.tex.body('rock', `debris${i}`, Math.max(8, d.r)));
      sp.anchor.set(0.5);
      // texture body radius = texW/2 - 4
      sp.scale.set(d.r / (sp.texture.width / 2 - 4));
      sp.alpha = 0.92;
      this.container.addChild(sp);
      this.debris.push(sp);
    }

    // --- moving hole path dots
    if (w.def.hole.path) {
      const pts = w.def.hole.path.points;
      const dots = new Graphics();
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        const segLen = Math.hypot(b.x - a.x, b.y - a.y);
        const steps = Math.max(1, Math.round(segLen / 42));
        for (let s = 0; s < steps; s++) {
          const t = s / steps;
          dots.circle(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, 2.2);
        }
      }
      dots.fill({ color: GREEN, alpha: 0.28 });
      this.container.addChildAt(dots, 0);
    }

    // capture-radius hint scales with the level's actual capture size
    const cap = w.def.hole.captureR ?? HOLE_CAPTURE_R;
    this.holeCapR = cap;
    this.holeCapture.width = this.holeCapture.height = cap * 3.4;
    this.holeCup.width = this.holeCup.height = cap * 1.7;
    this.holeRing.width = this.holeRing.height = cap * 2.5;
    // the lit green: ~112 world units across (100-120 target) at default capture
    const pad = cap * 7;
    this.greenPad.width = this.greenPad.height = pad;
    this.greenBands.width = this.greenBands.height = pad;
    // dark backing extends past the pad so its edge melts into darkness
    this.holeShade.width = this.holeShade.height = cap * 9.2;
    this.holeShaft.width = cap * 3.2;
    this.holeShaft.height = cap * 9;

    this.syncPins(w);
  }

  private buildHole(): void {
    const h = this.hole;
    // dark backing halo — the lit green sits on a dark disc so it punches out
    // of sun glare, pale aurora, anything bright
    this.holeShade = new Sprite(this.tex.glow(128));
    this.holeShade.anchor.set(0.5);
    this.holeShade.tint = 0x03060a;
    this.holeShade.alpha = 0.66;
    this.holeShade.width = 145;
    this.holeShade.height = 145;
    // THE GREEN: a lit putting pad (~112 world across) with mown bands and
    // radial falloff — the brightest warm landmark in every level
    this.greenPad = new Sprite(this.tex.greenPad(512));
    this.greenPad.anchor.set(0.5);
    this.greenPad.alpha = 1;
    this.greenPad.width = 112;
    this.greenPad.height = 112;
    this.greenBands = new Sprite(this.tex.greenBands(512));
    this.greenBands.anchor.set(0.5);
    this.greenBands.blendMode = 'add';
    this.greenBands.alpha = 0.14;
    this.greenBands.width = 112;
    this.greenBands.height = 112;
    // capture radius — barely-there dashed hint
    this.holeCapture = new Sprite(this.tex.ringDashed(128, 20));
    this.holeCapture.anchor.set(0.5);
    this.holeCapture.tint = GREEN;
    this.holeCapture.alpha = 0.15;
    this.holeCapture.width = 100;
    this.holeCapture.height = 100;
    // dark cup — maximum contrast against the lit pad
    this.holeCup = new Sprite(this.tex.dot(64));
    this.holeCup.anchor.set(0.5);
    this.holeCup.tint = 0x0a150e;
    this.holeCup.width = 26;
    this.holeCup.height = 26;
    // bright thick cup ring — the lit lip of the green
    this.holeRing = new Sprite(this.tex.ringThin(128, 10));
    this.holeRing.anchor.set(0.5);
    this.holeRing.tint = mixRGB(GREEN, 0xffffff, 0.55);
    this.holeRing.width = 34;
    this.holeRing.height = 34;
    // beacon pulse: one pooled ring, pure phase function (core.beaconPulse)
    this.holeBeacon = new Sprite(this.tex.ringThin(128, 8));
    this.holeBeacon.anchor.set(0.5);
    this.holeBeacon.tint = mixRGB(GREEN, 0xffffff, 0.3);
    this.holeBeacon.alpha = 0;
    // soft vertical light shaft above the cup (anti-glare, "last light")
    this.holeShaft = new Sprite(this.tex.shaft(96, 256));
    this.holeShaft.anchor.set(0.5, 1);
    this.holeShaft.blendMode = 'add';
    this.holeShaft.tint = 0xd9f2d0;
    this.holeShaft.alpha = 0.16;
    this.holeShaft.width = 51;
    this.holeShaft.height = 144;
    this.holeShaft.position.set(0, -4);
    h.addChild(
      this.holeShade, this.greenPad, this.greenBands, this.holeCapture,
      this.holeCup, this.holeRing, this.holeBeacon, this.holeShaft,
    );
  }

  private buildGhost(): void {
    const g = this.ghost;
    this.ghostRing = new Sprite(this.tex.ringThin(64, 4));
    this.ghostRing.anchor.set(0.5);
    this.ghostRing.width = 90;
    this.ghostRing.height = 90;
    this.ghostShard = new Sprite(this.tex.shard(32, 56));
    this.ghostShard.anchor.set(0.5, 1);
    this.ghostShard.y = 8;
    this.ghostShard.scale.set(0.9);
    g.addChild(this.ghostRing, this.ghostShard);
  }

  // ------------------------------------------------------------- commands

  setPinGhost(ghost: PinGhost | null): void {
    if (!ghost) {
      this.ghost.visible = false;
      return;
    }
    this.ghost.visible = true;
    this.ghost.x = ghost.x;
    this.ghost.y = ghost.y;
    const c = ghost.valid ? AMBER : 0x8a2a22;
    this.ghostShard.tint = c;
    this.ghostShard.alpha = ghost.valid ? 0.6 : 0.32;
    this.ghostRing.tint = c;
    this.ghostRing.alpha = ghost.valid ? 0.4 : 0.25;
  }

  /** Bounce flash on the bumper nearest the impact (or none). */
  bumperHit(x: number, y: number): void {
    for (const b of this.bumpers) {
      if (Math.hypot(x - b.x, y - b.y) < b.r + 26) b.pop = 1;
    }
  }

  /** Amber pulse traveling switch -> each target along its conduit. */
  fireSwitchPulse(si: number): void {
    const sv = this.switches[si];
    if (!sv) return;
    for (let ti = 0; ti < sv.conduits.length; ti++) {
      const p = this.pulses.find((q) => !q.active);
      if (!p) return;
      p.active = true;
      p.si = si;
      p.ti = ti;
      p.t = 0;
      p.sp.visible = true;
    }
  }

  // ------------------------------------------------------------- update

  update(w: World, dt: number): void {
    this.t += dt;

    // barriers pulse as one living field
    const barrierAlpha = 0.8 + 0.2 * Math.sin(this.t * 2.4);
    for (const b of this.barriers) b.alpha = barrierAlpha;

    // bumpers: impact pop spring-back
    for (const b of this.bumpers) {
      if (b.pop > 0) {
        b.pop = Math.max(0, b.pop - dt * 5);
        const f = b.pop;
        b.root.scale.set(1 + 0.28 * f);
        b.flash.alpha = f * 0.8;
        b.flash.width = b.r * (2.6 + f * 1.2);
        b.flash.height = b.flash.width;
      }
    }

    // beams: arm rotation + leading warning sweep
    for (const bv of this.beams) {
      const h = w.hazards[bv.hi]?.def;
      if (!h || h.kind !== 'beam') continue;
      bv.root.rotation = bv.phase + bv.spin * w.t;
      // lead angle: where the arm WILL be — proportional to spin (rad/s * 0.45 s)
      bv.cone.rotation = bv.spin * 0.45;
    }

    // wormholes: counter-phase swirl, cooldown dimming
    for (let i = 0; i < w.wormholes.length; i++) {
      const wv = this.worms[i];
      if (!wv) continue;
      wv.swirl.rotation += dt * 1.4 * wv.dir;
      wv.cool = w.wormholes[i].cool > 0;
      wv.root.alpha = expDamp(wv.root.alpha, wv.cool ? 0.4 : 1, 8, dt);
    }

    // switches: lit state + live conduit endpoints
    for (let i = 0; i < w.switches.length; i++) {
      const s = w.switches[i];
      const sv = this.switches[i];
      if (!sv) continue;
      const lit = s.def.mode === 'once' ? s.hit : s.on;
      sv.lit = lit;
      sv.glow.alpha = expDamp(sv.glow.alpha, lit ? 0.5 : 0, 6, dt);
      sv.ring.alpha = lit ? 0.85 : 0.25;
      sv.ring.rotation += dt * (lit ? 0.8 : 0.1);
      for (const c of sv.conduits) {
        const tp = this.targetPos(w, c.tKind, c.ti);
        if (!tp) continue;
        const dx = tp.x - s.def.x;
        const dy = tp.y - s.def.y;
        const len = Math.max(1, Math.hypot(dx, dy));
        c.line.x = s.def.x;
        c.line.y = s.def.y;
        c.line.rotation = Math.atan2(dy, dx);
        c.line.width = len;
        c.line.height = 6;
        c.line.alpha = expDamp(c.line.alpha, lit ? 0.42 : 0.1, 6, dt);
      }
    }

    // conduit pulse dots
    for (const p of this.pulses) {
      if (!p.active) continue;
      p.t += dt / 0.45;
      const sv = this.switches[p.si];
      const c = sv?.conduits[p.ti];
      const tp = sv && c ? this.targetPos(w, c.tKind, c.ti) : null;
      if (p.t >= 1 || !tp) {
        p.active = false;
        p.sp.visible = false;
        continue;
      }
      p.sp.x = sv.root.x + (tp.x - sv.root.x) * p.t;
      p.sp.y = sv.root.y + (tp.y - sv.root.y) * p.t;
      p.sp.alpha = Math.sin(p.t * Math.PI);
    }

    // fragments: bob + twinkle, hide when taken
    for (let i = 0; i < w.fragments.length; i++) {
      const f = w.fragments[i];
      const fv = this.fragments[i];
      if (!fv) continue;
      fv.root.visible = !f.taken;
      if (!f.taken) {
        fv.root.y = f.y + Math.sin(this.t * 1.7 + fv.phase) * 5;
        fv.shard.rotation = 0.3 + Math.sin(this.t * 0.8 + fv.phase) * 0.15;
        const tw = 0.35 + 0.65 * Math.max(0, Math.sin(this.t * 3.1 + fv.phase * 2.7));
        fv.spark.alpha = tw;
        fv.spark.scale.set(0.35 + tw * 0.3);
      }
    }

    // debris sync
    for (let i = 0; i < w.debris.length; i++) {
      const d = w.debris[i];
      const sp = this.debris[i];
      if (!sp) continue;
      sp.visible = d.alive;
      if (d.alive) {
        sp.x = d.x;
        sp.y = d.y;
        sp.rotation += dt * clamp(Math.hypot(d.vx, d.vy) * 0.004, 0.1, 2) * (d.vx >= 0 ? 1 : -1);
      }
    }

    // --- THE HOLE: the lit green breathes very slightly; the mown-band
    // shimmer drifts out of phase (slow, subtle, alive)
    this.hole.x = w.holeX;
    this.hole.y = w.holeY;
    this.holeRing.rotation += dt * 0.2;
    const near = 1 - clamp(Math.hypot(w.ball.x - w.holeX, w.ball.y - w.holeY) / 140, 0, 1);
    this.greenPad.alpha = 0.96 + Math.sin(this.t * 0.4) * 0.04; // always lit
    const padScale = 1 + Math.sin(this.t * 0.4 + 1.1) * 0.018;
    this.greenBands.scale.set(padScale);
    this.greenBands.alpha = 0.12 + near * 0.08;
    this.holeCapture.alpha = 0.1 + near * 0.2;
    this.holeShaft.alpha = 0.14 + Math.sin(this.t * 0.9) * 0.03;
    this.holeShaft.rotation = Math.sin(this.t * 0.7) * 0.02;
    // beacon pulse: pure, deterministic phase (asserted in tests) — 50% duty
    beaconPulse(w.t, this.holeCapR, this.beaconOut);
    this.holeBeacon.width = this.holeBeacon.height = this.beaconOut.d;
    this.holeBeacon.alpha = this.beaconOut.a;
    // --- pins
    for (let i = 0; i < this.pins.length; i++) {
      const pv = this.pins[i];
      const live = i < w.pins.length;
      pv.root.visible = live;
      if (!live) continue;
      const p = w.pins[i];
      pv.root.x = p.x;
      pv.root.y = p.y;
      if (pv.pop > 0) {
        pv.pop = Math.max(0, pv.pop - dt * 3);
        pv.root.scale.set(1 + pv.pop * 0.5);
        pv.glow.alpha = 0.3 + pv.pop * 0.5;
      }
      pv.ring.alpha = 0.1 + 0.08 * (0.5 + 0.5 * Math.sin(this.t * 2 + i));
      pv.shard.rotation = Math.sin(this.t * 1.1 + i * 2) * 0.06;
    }
  }

  /** Sync pin views to the world's pin list; returns the placed index for bloom. */
  syncPins(w: World): void {
    while (this.pins.length < Math.max(3, w.def.pinBudget)) {
      const root = new Container();
      const glow = new Sprite(this.tex.glow(64));
      glow.anchor.set(0.5);
      glow.tint = AMBER;
      glow.alpha = 0.3;
      glow.width = 90;
      glow.height = 90;
      glow.blendMode = 'add';
      const tee = new Graphics();
      // small tee marker the shard stands on
      tee.moveTo(-4, 10);
      tee.lineTo(4, 10);
      tee.lineTo(6, 16);
      tee.lineTo(-6, 16);
      tee.closePath();
      tee.fill({ color: 0x39424c, alpha: 0.95 });
      tee.rect(-9, 16, 18, 2.5).fill({ color: 0x59626e, alpha: 0.95 });
      const shard = new Sprite(this.tex.shard(32, 56));
      shard.anchor.set(0.5, 1);
      shard.tint = AMBER;
      shard.y = 10;
      shard.scale.set(0.85);
      const ring = new Sprite(this.tex.ringDashed(128, 24));
      ring.anchor.set(0.5);
      ring.tint = AMBER;
      ring.width = 170;
      ring.height = 170;
      ring.alpha = 0.12;
      root.addChild(ring, glow, tee, shard);
      this.container.addChild(root);
      this.pins.push({ root, shard, glow, ring, pop: 0 });
    }
  }

  pinPlacedBloom(): void {
    // newest pin pops
    for (let i = this.pins.length - 1; i >= 0; i--) {
      if (this.pins[i].root.visible) {
        this.pins[i].pop = 1;
        break;
      }
    }
  }

  private targetPos(w: World, kind: 'body' | 'zone' | 'corridor', ti: number): { x: number; y: number } | null {
    if (kind === 'body') {
      const b = w.bodies[ti];
      return b ? { x: b.cx, y: b.cy } : null;
    }
    const z = w.zones[ti];
    if (!z) return null;
    if (kind === 'corridor' && z.a && z.b) {
      return { x: (z.a.x + z.b.x) / 2, y: (z.a.y + z.b.y) / 2 };
    }
    if (z.x !== undefined && z.y !== undefined) return { x: z.x, y: z.y };
    return null;
  }
}
