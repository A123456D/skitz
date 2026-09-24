/** Pooled floating damage numbers using a runtime-installed BitmapFont. */
import { BitmapFont, BitmapText, Container } from 'pixi.js';

interface D {
  t: BitmapText;
  life: number;
  vy: number;
  vx: number;
}

let pool: D[] = [];
const CAP = 64;

export function installDamageFont(): void {
  BitmapFont.install({
    name: 'wbf',
    style: {
      fontFamily: 'Courier New, monospace',
      fontSize: 16,
      fontWeight: 'bold',
      fill: 0xffffff,
    },
  });
}

export function damageNumberLayer(): Container {
  const c = new Container();
  for (let i = 0; i < CAP; i++) {
    const t = new BitmapText({ text: '', style: { fontFamily: 'wbf', fontSize: 16 } });
    t.anchor = 0.5;
    t.visible = false;
    c.addChild(t);
    pool.push({ t, life: 0, vy: 0, vx: 0 });
  }
  return c;
}

export function spawnNumber(x: number, y: number, text: string, tint: number, scale = 1): void {
  // round-robin overwrite oldest-ish: find dead slot else slot 0
  let slot = pool.find((d) => d.life <= 0);
  if (!slot) slot = pool[0];
  slot.life = 0.55;
  slot.vy = -46 - Math.random() * 24;
  slot.vx = (Math.random() - 0.5) * 40;
  slot.t.text = text;
  slot.t.tint = tint;
  slot.t.scale.set(scale);
  slot.t.alpha = 1;
  slot.t.position.set(x + (Math.random() - 0.5) * 8, y - 6);
  slot.t.visible = true;
}

export function updateNumbers(dt: number): void {
  for (const d of pool) {
    if (d.life <= 0) continue;
    d.life -= dt;
    if (d.life <= 0) {
      d.t.visible = false;
      continue;
    }
    d.t.y += d.vy * dt;
    d.t.x += d.vx * dt;
    d.vy += 90 * dt;
    d.t.alpha = Math.min(1, d.life * 2.4);
  }
}
