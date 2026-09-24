/**
 * Pooled sprite particle system. All particles share one texture so Pixi
 * batches them into a single draw call; per-particle sim is trivial math.
 */
import { Container, Sprite, Texture } from 'pixi.js';

interface P {
  s: Sprite;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  grav: number;
  drag: number;
  vrot: number;
  active: boolean;
}

export class ParticleSys {
  private pool: P[] = [];
  container = new Container();

  constructor(tex: Texture, cap: number) {
    for (let i = 0; i < cap; i++) {
      const s = new Sprite(tex);
      s.anchor.set(0.5);
      s.visible = false;
      this.container.addChild(s);
      this.pool.push({ s, vx: 0, vy: 0, life: 0, maxLife: 1, size: 1, grav: 0, drag: 0, vrot: 0, active: false });
    }
  }

  spawn(
    x: number, y: number, vx: number, vy: number,
    life: number, size: number, tint: number,
    grav = 0, drag = 2, rot = 0, vrot = 0,
  ): void {
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i];
      if (p.active) continue;
      p.active = true;
      p.s.visible = true;
      p.s.position.set(x, y);
      p.s.tint = tint;
      p.vx = vx;
      p.vy = vy;
      p.life = life;
      p.maxLife = life;
      p.size = size;
      p.grav = grav;
      p.drag = drag;
      p.vrot = vrot;
      p.s.rotation = rot;
      p.s.scale.set(size);
      p.s.alpha = 1;
      return;
    }
  }

  burst(x: number, y: number, count: number, speed: number, life: number, size: number, tint: number, rng: () => number): void {
    for (let i = 0; i < count; i++) {
      const a = rng() * Math.PI * 2;
      const s = speed * (0.4 + rng() * 0.9);
      this.spawn(x, y, Math.cos(a) * s, Math.sin(a) * s, life * (0.6 + rng() * 0.7), size, tint);
    }
  }

  update(dt: number): void {
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i];
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        p.s.visible = false;
        continue;
      }
      const t = p.life / p.maxLife;
      p.vy += p.grav * dt;
      const d = 1 - Math.min(0.95, p.drag * dt);
      p.vx *= d;
      p.vy *= d;
      p.s.x += p.vx * dt;
      p.s.y += p.vy * dt;
      p.s.alpha = t;
      p.s.rotation += p.vrot * dt;
      const sc = p.size * (0.35 + 0.65 * t);
      p.s.scale.set(sc);
    }
  }

  get activeCount(): number {
    let n = 0;
    for (const p of this.pool) if (p.active) n++;
    return n;
  }
}
