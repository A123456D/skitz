/**
 * GPU post-processing stack: AdvancedBloom → biome color grade → RGB-split
 * chromatic aberration → tinted vignette overlay. Filters live on the world
 * container only (HUD is DOM and stays crisp). Owns the hitstop timer the
 * sim gate reads. `?fx=0` skips constructing this entirely.
 */
import { Application, ColorMatrixFilter, Container, Sprite, Texture, type ColorMatrix } from 'pixi.js';
import { ChromaticFilter, GlowFilter } from './filters';
import type { Biome } from '../game/data/biomes';

export interface GradeSpec { sat: number; con: number; bright: number; tint: [number, number, number] }

/** Compose saturation × contrast × tint × brightness into a ColorMatrix (4x5, row-major). */
export function gradeMatrix(g: GradeSpec): ColorMatrix {
  const { sat: s, con: C, tint } = g;
  const lr = 0.213, lg = 0.715, lb = 0.072;
  const [tr, tg, tb] = tint;
  const off = -0.5 * C + 0.5;
  const m = new Array(20).fill(0) as ColorMatrix;
  m[0] = (lr * (1 - s) + s) * C * tr; m[1] = lg * (1 - s) * C * tr; m[2] = lb * (1 - s) * C * tr; m[4] = off * tr;
  m[5] = lr * (1 - s) * C * tg; m[6] = (lg * (1 - s) + s) * C * tg; m[7] = lb * (1 - s) * C * tg; m[9] = off * tg;
  m[10] = lr * (1 - s) * C * tb; m[11] = lg * (1 - s) * C * tb; m[12] = (lb * (1 - s) + s) * C * tb; m[14] = off * tb;
  m[18] = 1;
  return m;
}

function copyMatrix(m: ColorMatrix): ColorMatrix {
  const out = new Array(20).fill(0) as ColorMatrix;
  for (let i = 0; i < 20; i++) out[i] = m[i];
  return out;
}

function radialTexture(size = 512): Texture {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(size / 2, size / 2, size * 0.18, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.14)');
  grad.addColorStop(1, 'rgba(255,255,255,0.85)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return Texture.from(c);
}

export class PostFx {
  /** world container wrapper carrying bloom/grade/rgb filters */
  readonly root = new Container();
  /** screen-space overlay (vignette) above the world */
  readonly overlay = new Container();

  hitstopT = 0;

  private bloom: GlowFilter;
  private grade: ColorMatrixFilter;
  private rgb: ChromaticFilter;
  private vignette: Sprite;
  private chroma = 0;
  private chromaTarget = 0;
  private gradeFrom: ColorMatrix;
  private gradeTo: ColorMatrix;
  private gradeT = 1;
  private baseVignetteAlpha = 0;
  /** lite mode (phones): chroma off, softer bloom/vignette — `?fx=full` opts out */
  private lite: boolean;

  constructor(app: Application, worldRoot: Container, isMobile: boolean) {
    this.bloom = new GlowFilter({ threshold: 0.55, strength: isMobile ? 0.55 : 0.9 });
    this.bloom.resolution = isMobile ? 0.65 : 0.5; // bloom is soft — render sub-res
    this.grade = new ColorMatrixFilter();
    this.rgb = new ChromaticFilter();

    this.gradeFrom = gradeMatrix({ sat: 1, con: 1, bright: 1, tint: [1, 1, 1] });
    this.gradeTo = gradeMatrix({ sat: 1, con: 1, bright: 1, tint: [1, 1, 1] });
    this.grade.matrix = this.gradeFrom;

    this.lite = isMobile;
    this.root.filters = isMobile ? [this.bloom, this.grade] : [this.bloom, this.grade, this.rgb];
    this.root.addChild(worldRoot);

    this.vignette = new Sprite(radialTexture());
    this.vignette.anchor.set(0.5);
    this.vignette.alpha = isMobile ? 0.45 : 0.85;
    this.overlay.addChild(this.vignette);

    app.stage.addChild(this.root);
    app.stage.addChild(this.overlay);
  }

  setBiome(b: Biome): void {
    this.gradeTo = gradeMatrix(b.grade);
    this.gradeFrom = copyMatrix(this.grade.matrix);
    this.gradeT = 0;
    this.vignette.tint = b.vignetteTint;
    this.baseVignetteAlpha = b.vignetteAlpha;
    this.vignette.alpha = this.lite ? Math.min(0.45, this.baseVignetteAlpha * 0.6) : this.baseVignetteAlpha;
  }

  /** Chromatic pulse on big impacts; force 0..1+. */
  screenImpact(force: number): void {
    this.chromaTarget = Math.min(1.4, Math.max(this.chromaTarget, force));
  }

  /** Boss kill: freeze-frame request + heavy aberration. */
  bossKill(): void {
    this.hitstopT = Math.max(this.hitstopT, 0.42);
    this.chromaTarget = 1.4;
  }

  /** Consume one sim step of hitstop. Returns true while frozen. */
  tickHitstop(dt: number): boolean {
    if (this.hitstopT <= 0) return false;
    this.hitstopT -= dt;
    return this.hitstopT > 0;
  }

  update(dt: number): void {
    // chromatic aberration decays exponentially (disabled in lite mode)
    this.chromaTarget = Math.max(0, this.chromaTarget - dt * 3.2);
    this.chroma += (this.chromaTarget - this.chroma) * Math.min(1, dt * 22);
    const c = this.lite ? 0 : this.chroma * 0.007;
    this.rgb.split = [-c, c * 0.22, c, -c * 0.22];

    // biome grade crossfade
    if (this.gradeT < 1) {
      this.gradeT = Math.min(1, this.gradeT + dt / 1.1);
      const t = this.gradeT * this.gradeT * (3 - 2 * this.gradeT);
      const m = new Array(20).fill(0) as ColorMatrix;
      for (let i = 0; i < 20; i++) m[i] = this.gradeFrom[i] + (this.gradeTo[i] - this.gradeFrom[i]) * t;
      this.grade.matrix = m;
    }
  }

  resize(w: number, h: number): void {
    const cover = Math.hypot(w, h) * 1.05;
    this.vignette.width = cover;
    this.vignette.height = cover;
    this.vignette.position.set(w / 2, h / 2);
    this.overlay.position.set(0, 0);
  }
}
