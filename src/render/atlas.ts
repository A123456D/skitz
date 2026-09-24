import { Assets, Texture, Rectangle } from 'pixi.js';

export type Atlas = Record<string, Texture>;

interface AtlasJson {
  frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }>;
}

/** Loads atlas.png + atlas.json into per-frame textures (robust across Pixi v8 minors). */
export async function loadAtlas(): Promise<Atlas> {
  const base = document.querySelector('base')?.getAttribute('href') ?? './';
  const tex = await Assets.load<Texture>(`${base}atlas.png`);
  const res = await fetch(`${base}atlas.json`);
  const json = (await res.json()) as AtlasJson;
  const out: Atlas = {};
  for (const [name, f] of Object.entries(json.frames)) {
    out[name] = new Texture({
      source: tex.source,
      frame: new Rectangle(f.frame.x, f.frame.y, f.frame.w, f.frame.h),
    });
  }
  return out;
}
