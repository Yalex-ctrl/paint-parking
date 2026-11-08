import { slideLength, type V3 } from './slidePath';

/**
 * How the ball moves down a chute: its speed follows from its height (it slows down climbing the funnel, speeds up coming down to
 * the exit) and from the bends (a little slower in a tight one), and the whole ride is tabulated once, so the position at any time is
 * a lookup and does not depend on the frame rate. Pure maths: tested without a screen.
 */
/** Speed (cells/s) at which the ball enters the chute (it arrives at cruising speed and the funnel eats some of it). */
export const RIDE_ENTRY_SPEED = 7;
/** How much one unit of height is worth in speed (cells/s)^2: a gentle gravity, so the ride lasts long enough to enjoy. */
export const RIDE_GRAVITY = 12;
/** The ball never goes slower than this in a chute (it never stops there), nor faster than this. */
export const RIDE_MIN_SPEED = 3.5;
export const RIDE_MAX_SPEED = 11;
/** Share of the speed lost in the sharpest bend. */
export const RIDE_BEND_DRAG = 0.22;

export type RideSample = {
  p: V3;
  /** Unit tangent (the way the ball goes). */
  t: V3;
  speed: number;
  /** Sideways acceleration felt in the bend, signed (+ to the right of the ball), 0 on a straight. */
  lean: number;
  /** Distance along the chute and share of it (0..1). */
  s: number;
  u: number;
};

export type Ride = {
  points: V3[];
  length: number;
  duration: number;
  sample: (time: number) => RideSample;
};

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Tabulates the ride along a centre line (see slidePath.slideCenterline). */
export function planRide(points: V3[]): Ride {
  const n = points.length;
  const seg: number[] = [0];
  for (let i = 1; i < n; i++) seg.push(seg[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1], points[i][2] - points[i - 1][2]));
  const length = seg[n - 1];

  // Tangents and the turning rate (radians per unit length, on the ground plane) at each point.
  const tang: V3[] = points.map((_, i) => norm(sub(points[Math.min(n - 1, i + 1)], points[Math.max(0, i - 1)])));
  const turn: number[] = points.map((_, i) => {
    if (i === 0 || i === n - 1) return 0;
    const a = Math.atan2(tang[i - 1][0], tang[i - 1][2]);
    const b = Math.atan2(tang[i + 1][0], tang[i + 1][2]);
    let d = b - a;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return d / Math.max(1e-6, seg[i + 1] - seg[i - 1]);
  });

  // Speed at each point: energy from the height, less the drag of the bend.
  const y0 = points[0][1];
  const speed = points.map((p, i) => {
    const v2 = RIDE_ENTRY_SPEED * RIDE_ENTRY_SPEED + 2 * RIDE_GRAVITY * (y0 - p[1]);
    const bend = Math.min(1, Math.abs(turn[i]) / 3);
    return Math.max(RIDE_MIN_SPEED, Math.min(RIDE_MAX_SPEED, Math.sqrt(Math.max(0, v2)) * (1 - RIDE_BEND_DRAG * bend)));
  });

  // Time at each point: the length of each piece over its mean speed.
  const time: number[] = [0];
  for (let i = 1; i < n; i++) time.push(time[i - 1] + (seg[i] - seg[i - 1]) / ((speed[i] + speed[i - 1]) / 2));
  const duration = time[n - 1];

  const sample = (at: number): RideSample => {
    const t = Math.max(0, Math.min(duration, at));
    let i = 1;
    while (i < n - 1 && time[i] < t) i++;
    const k = (t - time[i - 1]) / Math.max(1e-9, time[i] - time[i - 1]);
    const lerp = (a: number, b: number) => a + (b - a) * k;
    const p: V3 = [lerp(points[i - 1][0], points[i][0]), lerp(points[i - 1][1], points[i][1]), lerp(points[i - 1][2], points[i][2])];
    const tn = norm([lerp(tang[i - 1][0], tang[i][0]), lerp(tang[i - 1][1], tang[i][1]), lerp(tang[i - 1][2], tang[i][2])]);
    const v = lerp(speed[i - 1], speed[i]);
    const rate = lerp(turn[i - 1], turn[i]);
    const s = lerp(seg[i - 1], seg[i]);
    return { p, t: tn, speed: v, lean: Math.max(-1, Math.min(1, (rate * v) / 14)), s, u: length > 0 ? s / length : 1 };
  };
  return { points, length, duration, sample };
}

/** Length of a centre line, re-exported for the callers that only need it. */
export { slideLength };
