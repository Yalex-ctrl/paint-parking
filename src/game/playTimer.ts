/**
 * The clock of the chests of play time. It only counts time that is really play: the app is on screen, a level (or the daily
 * challenge) is in progress, nothing hides it (a menu, a pop-up, an ad, the tour), and the player made a swipe in the last
 * `windowMs` (30 s). Pure: the caller gives it the time and the situation once a second.
 */
export type PlayContext = { appActive: boolean; levelActive: boolean; blocked: boolean };

export class PlayTimer {
  private last: number | null = null;
  private lastSwipeAt = -Infinity;

  constructor(private readonly windowMs: number) {}

  /** The player swiped. */
  swipe(now: number): void {
    this.lastSwipeAt = now;
  }

  /** Called regularly: the seconds of active play since the last call (0 when the situation does not count). */
  tick(now: number, ctx: PlayContext): number {
    // A long gap (the app was asleep) is not play: at most a second and a half at a time.
    const dt = this.last === null ? 0 : Math.min(1.5, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    if (!ctx.appActive || !ctx.levelActive || ctx.blocked) return 0;
    if (now - this.lastSwipeAt > this.windowMs) return 0;
    return dt;
  }

  /** The app came back from the background: the gap is not counted. */
  skip(now: number): void {
    this.last = now;
  }
}
