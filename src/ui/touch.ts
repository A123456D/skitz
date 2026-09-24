/** Visual virtual joystick + jump button (DOM), driven by the Input state each frame. */
import type { Input } from '../engine/input';

let base: HTMLElement | null = null;
let knob: HTMLElement | null = null;

export function initTouchUi(input: Input, isMobile: boolean): void {
  const root = document.getElementById('ui-root')!;
  base = document.createElement('div');
  base.id = 'joy-base';
  base.style.cssText = `
    position:absolute; width:96px; height:96px; border-radius:50%;
    border:3px solid rgba(255,255,255,0.25); background:rgba(0,0,0,0.15);
    pointer-events:none; display:none; transform:translate(-50%,-50%); z-index:20;`;
  knob = document.createElement('div');
  knob.id = 'joy-knob';
  knob.style.cssText = `
    position:absolute; width:42px; height:42px; border-radius:50%;
    background:rgba(255,210,63,0.5); border:3px solid rgba(255,210,63,0.8);
    pointer-events:none; display:none; transform:translate(-50%,-50%); z-index:21;`;
  root.appendChild(base);
  root.appendChild(knob);

  if (isMobile) {
    const jumpBtn = document.createElement('button');
    jumpBtn.id = 'jump-btn';
    jumpBtn.textContent = '▲';
    jumpBtn.setAttribute('aria-label', 'jump');
    jumpBtn.style.cssText = `
      position:absolute; right:calc(env(safe-area-inset-right, 0px) + 18px);
      bottom:calc(env(safe-area-inset-bottom, 0px) + 72px);
      width:72px; height:72px; border-radius:50%;
      font-size:26px; font-weight:900; color:var(--ink);
      background:rgba(0,0,0,0.3); border:3px solid rgba(255,255,255,0.35);
      display:none; z-index:22; font-family:inherit; touch-action:none;`;
    jumpBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      input.jumpQueued = true;
      jumpBtn.style.transform = 'scale(0.92)';
    });
    jumpBtn.addEventListener('pointerup', () => { jumpBtn.style.transform = 'scale(1)'; });
    jumpBtn.addEventListener('pointercancel', () => { jumpBtn.style.transform = 'scale(1)'; });
    root.appendChild(jumpBtn);
    (window as unknown as { __jumpBtn?: HTMLElement }).__jumpBtn = jumpBtn;
  }
}

export function updateTouchUi(input: Input, inRun: boolean): void {
  if (!base || !knob) return;
  const joy = input.joyVisible && inRun;
  base.style.display = joy ? 'block' : 'none';
  knob.style.display = joy ? 'block' : 'none';
  if (joy) {
    base.style.left = `${input.joyBaseX}px`;
    base.style.top = `${input.joyBaseY}px`;
    knob.style.left = `${input.joyKnobX}px`;
    knob.style.top = `${input.joyKnobY}px`;
  }
  const jb = (window as unknown as { __jumpBtn?: HTMLElement }).__jumpBtn;
  if (jb) jb.style.display = inRun ? 'block' : 'none';
}
