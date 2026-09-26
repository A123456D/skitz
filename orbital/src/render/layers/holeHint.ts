// layers/holeHint.ts — screen-space edge indicator for the OFF-SCREEN hole
// (constant on phones mid-flight, where the tight follow camera regularly
// pushes the green out of frame). A green chevron pinned to the viewport edge
// pointing at the hole, with a tiny mono distance read-out underneath
// ("metres-ish" = world units / 10, floored at 1). Eases in within ~2s of the
// hole leaving view, fades when it returns. Driven purely by syncWorld —
// results/menu states never render through syncWorld, so it can never show
// there. All geometry comes from the pure holeEdgeHint() in core.ts, which
// projects the hole with the SAME camera pan/zoom the world is rendered with
// (shake-stripped); the layer only eases/applies the result. Pooled: the
// label only rewrites when the rounded value changes.

import { Container, Sprite, Text } from 'pixi.js';
import type { Camera } from '../camera';
import { expDamp, holeEdgeHint, mixRGB, type HoleHintState } from '../core';
import { GREEN, TexFactory } from '../textures';

const EDGE_PAD = 34;      // chevron center inset from the viewport edge
const EASE_IN_RATE = 2.2; // ~99% faded-in 2s after the hole leaves the frame
const EASE_OUT_RATE = 7;  // quick, unobtrusive fade when the hole is back
const SLIDE_RATE = 12;    // edge-position easing (no popping between corners)

export class HoleHintLayer {
  readonly container = new Container();
  private arrow: Sprite;
  private label: Text;
  private alpha = 0;
  private x = 0;
  private y = 0;
  private lastMetres = -1;
  private state: HoleHintState = { show: false, x: 0, y: 0, angle: 0, metres: 0 };

  constructor(tex: TexFactory) {
    this.container.visible = false;
    this.container.eventMode = 'none';
    this.arrow = new Sprite(tex.chevron(30));
    this.arrow.anchor.set(0.5);
    this.arrow.tint = mixRGB(GREEN, 0xffffff, 0.35);
    this.label = new Text({
      text: '',
      style: {
        fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
        fontSize: 11,
        fill: mixRGB(GREEN, 0xffffff, 0.55),
        letterSpacing: 1,
      },
    });
    this.label.anchor.set(0.5);
    this.label.position.set(0, 17);
    this.container.addChild(this.arrow, this.label);
  }

  /** Force-hide without waiting for the ease-out (level load). */
  reset(): void {
    this.alpha = 0;
    this.x = 0;
    this.y = 0;
    this.container.visible = false;
    this.lastMetres = -1;
  }

  /**
   * Per-frame: project the live hole through the camera's render transform,
   * ease the chevron in/out. Zero-alloc except the label string when the
   * rounded metres value ticks.
   */
  update(dt: number, cam: Camera, holeX: number, holeY: number, ballX: number, ballY: number): void {
    // Same transform as applyToRoot/worldToScreen: s = (world - cam) * scale + view/2
    holeEdgeHint(cam.cx, cam.cy, cam.scale, cam.viewW, cam.viewH,
      holeX, holeY, ballX, ballY, EDGE_PAD, this.state);
    const target = this.state.show ? 1 : 0;
    this.alpha = expDamp(this.alpha, target, target ? EASE_IN_RATE : EASE_OUT_RATE, dt);
    this.container.visible = this.alpha > 0.02;
    if (!this.container.visible) return;

    this.x = expDamp(this.x, this.state.x, SLIDE_RATE, dt);
    this.y = expDamp(this.y, this.state.y, SLIDE_RATE, dt);
    this.container.position.set(this.x, this.y);
    this.container.alpha = this.alpha;
    this.arrow.rotation = this.state.angle;

    if (this.state.metres !== this.lastMetres) {
      this.lastMetres = this.state.metres;
      this.label.text = `${this.state.metres}m`;
    }
  }
}
