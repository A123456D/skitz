/**
 * Fixed-timestep loop with accumulator. Sim runs at a constant 60Hz so
 * physics is deterministic; render runs per display frame.
 */
export const SIM_HZ = 60;
export const SIM_DT = 1 / SIM_HZ;

export class GameLoop {
  private raf = 0;
  private last = 0;
  private acc = 0;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  running = false;

  simMs = 0; // smoothed sim cost
  fps = 0;

  constructor(
    private readonly sim: (dt: number) => void,
    private readonly render: (alpha: number, frameDt: number) => void,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.acc = 0;
    this.raf = requestAnimationFrame(this.frame);
    // rAF stalls entirely in occluded/hidden webviews — keep the sim alive
    // (throttled) so automated QA and background tabs still advance.
    this.watchdog = setInterval(() => {
      const now = performance.now();
      if (this.running && now - this.last > 500) this.frame(now);
    }, 100);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    if (this.watchdog !== null) {
      clearInterval(this.watchdog);
      this.watchdog = null;
    }
  }

  private frame = (now: number): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.frame);

    let frameDt = (now - this.last) / 1000;
    this.last = now;
    if (frameDt > 0.25) frameDt = 0.25; // tab-switch guard

    const t0 = performance.now();
    this.acc += frameDt;
    let steps = 0;
    while (this.acc >= SIM_DT && steps < 5) {
      this.sim(SIM_DT);
      this.acc -= SIM_DT;
      steps++;
    }
    if (steps === 5) this.acc = 0; // panic: don't spiral
    this.simMs += (performance.now() - t0 - this.simMs) * 0.1;

    const alpha = this.acc / SIM_DT;
    this.render(alpha, frameDt);

    this.fps += (1 / Math.max(frameDt, 1e-4) - this.fps) * 0.05;
  };
}
