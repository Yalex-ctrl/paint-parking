import curveJson from '../../assets/curve.json';

/**
 * The difficulty the levels are steered by. It is the measured difficulty (swipes of the solution plus the real choices
 * along it, see difficulty.ts) of the first campaign, smoothed and made never-decreasing, read 2.5 times faster:
 * the new level N is as hard as the old level 2.5 x N. Past the end of the old campaign the same slope goes on.
 */
const OLD = curveJson.steer as number[];

/** How much faster than the first campaign the difficulty climbs. */
export const SPEEDUP = 2.5;

/** Difficulty (steering score) of the old campaign at a fractional level number. */
export function oldCurve(v: number): number {
  if (v <= 1) return OLD[0];
  const last = OLD.length;
  if (v >= last) {
    // The slope of the last hundred levels goes on.
    const slope = (OLD[last - 1] - OLD[last - 101]) / 100;
    return OLD[last - 1] + slope * (v - last);
  }
  const lo = Math.floor(v);
  const f = v - lo;
  return OLD[lo - 1] * (1 - f) + OLD[lo] * f;
}

/** Last level whose target follows the old curve at 2.5 times its speed; after it the climb slows down. */
export const FULL_SPEED_UNTIL = 500;
/** Past that level, the board is full-size and the difficulty only grows by what it can hold: this much per level. */
export const SLOW_SLOPE = 0.025;

/** The steering score wanted for level `id`. */
export function targetSteer(id: number): number {
  if (id <= FULL_SPEED_UNTIL) return oldCurve(SPEEDUP * id);
  return oldCurve(SPEEDUP * FULL_SPEED_UNTIL) + SLOW_SLOPE * (id - FULL_SPEED_UNTIL);
}

/** One level in `RELIEF_EVERY` is a little easier, to let the player breathe. */
export const RELIEF_EVERY = 8;
export const RELIEF_FACTOR = 0.78;
export const isReliefLevel = (id: number) => id > 6 && id % RELIEF_EVERY === 0;
