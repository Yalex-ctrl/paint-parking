/**
 * How the ball moves along its path: the speed curve (a short ease-out acceleration at the start, then a constant speed) and the
 * arc it draws through a bend. Pure maths, so the motion is the same at any frame rate.
 */
export const START_SPEED = 3;
export const CRUISE_SPEED = 13;
export const ACCEL_SECONDS = 0.08;
/** Radius (cells) of the arc the ball draws through a bend. */
export const TURN_R = 0.5;

/**
 * Distance rolled (cells) after `t` seconds of rolling: the integral of a speed that goes from START_SPEED to CRUISE_SPEED along an
 * ease-out curve in ACCEL_SECONDS, then stays constant. A closed form, so any frame length gives the same position.
 */
export function rolledDistance(t: number): number {
  const T = ACCEL_SECONDS;
  const d = CRUISE_SPEED - START_SPEED;
  if (t <= 0) return 0;
  if (t < T) {
    const p = t / T;
    return START_SPEED * t + d * T * (p * p - (p * p * p) / 3);
  }
  return START_SPEED * T + d * T * (2 / 3) + CRUISE_SPEED * (t - T);
}

/** The speed (cells/s) after `t` seconds of rolling. */
export const rollSpeed = (t: number): number => (t >= ACCEL_SECONDS ? CRUISE_SPEED : START_SPEED + (CRUISE_SPEED - START_SPEED) * (1 - (1 - t / ACCEL_SECONDS) ** 2));

/**
 * A point on the quarter circle through a bend (`u` from 0 to 1): the circle has radius TURN_R and centre (cx, cz); the ball comes
 * in along (inX, inZ) and goes out along (outX, outZ). At u = 0 it is where the straight run ends, at u = 1 where the next one starts.
 */
export function arcPoint(cx: number, cz: number, inX: number, inZ: number, outX: number, outZ: number, u: number): { x: number; z: number } {
  const ang = (u * Math.PI) / 2;
  return { x: cx + TURN_R * (-outX * Math.cos(ang) + inX * Math.sin(ang)), z: cz + TURN_R * (-outZ * Math.cos(ang) + inZ * Math.sin(ang)) };
}

/** The heading (unit vector) at `u` on that arc: it turns smoothly from the way in to the way out. */
export function arcHeading(inX: number, inZ: number, outX: number, outZ: number, u: number): { x: number; z: number } {
  const ang = (u * Math.PI) / 2;
  return { x: inX * Math.cos(ang) + outX * Math.sin(ang), z: inZ * Math.cos(ang) + outZ * Math.sin(ang) };
}
