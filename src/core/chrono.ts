/**
 * The chronometer of a level: it starts at the first swipe (the time spent thinking before it does not count), stops when the ball
 * goes through the exit, and is paused while a menu, a pop-up, an ad or the background hides the game. Pure: the callers give it the
 * time (milliseconds).
 */
export class Chrono {
  private startedAt: number | null = null;
  private pausedAt: number | null = null;
  private paused = 0;
  private stoppedAt: number | null = null;

  /** Back to the start (a new level, a restart). */
  reset(): void {
    this.startedAt = null;
    this.pausedAt = null;
    this.paused = 0;
    this.stoppedAt = null;
  }

  /** The first swipe: starts it (does nothing if it already runs). */
  start(now: number): void {
    if (this.startedAt === null) this.startedAt = now;
  }

  pause(now: number): void {
    if (this.startedAt !== null && this.pausedAt === null && this.stoppedAt === null) this.pausedAt = now;
  }

  resume(now: number): void {
    if (this.pausedAt !== null) {
      this.paused += now - this.pausedAt;
      this.pausedAt = null;
    }
  }

  /** The ball is out: the time stops. */
  stop(now: number): void {
    if (this.startedAt === null || this.stoppedAt !== null) return;
    this.resume(now);
    this.stoppedAt = now;
  }

  get started(): boolean {
    return this.startedAt !== null;
  }

  /** Elapsed play time in seconds (0 before the first swipe). */
  seconds(now: number): number {
    if (this.startedAt === null) return 0;
    const end = this.stoppedAt ?? this.pausedAt ?? now;
    return Math.max(0, (end - this.startedAt - this.paused) / 1000);
  }
}
