import { DELTA, type Dir } from '../core/grid';
import { ROAD_MARGIN } from './coords';
import type { Level } from '../game/types';

/**
 * The way a vehicle takes when it leaves: straight out of its place to the road, a rounded turn onto the road (always the same way
 * round the lot, clockwise seen from above), then away along the road. Pure geometry: the road is not a game rule, nothing can be
 * hit on it.
 */
export type ExitPath = {
  x0: number;
  z0: number;
  /** Unit heading when leaving the place. */
  hx: number;
  hz: number;
  /** Unit heading after the turn. */
  tx: number;
  tz: number;
  len1: number;
  radius: number;
  arcLen: number;
  len2: number;
  total: number;
};

/** The turn radius on the road (smaller than the distance from the sidewalk to the middle of the road). */
export const TURN_RADIUS = 0.85;
/** How far the vehicle goes along the road after the turn: far enough to be out of the screen. */
export const ROAD_RUN = 16;

/** Facing angle (around Y) of something that looks along the heading (hx, hz): 0 faces +X, a quarter turn faces +Z or -Z. */
export const yawOf = (hx: number, hz: number): number => Math.atan2(-hz, hx);

export function exitPath(level: Pick<Level, 'rows' | 'cols'>, x0: number, z0: number, dir: Dir): ExitPath {
  const [dr, dc] = DELTA[dir];
  const hx = dc;
  const hz = dr;
  // Clockwise seen from above: right -> down -> left -> up.
  const tx = hz === 0 ? 0 : -hz;
  const tz = hx;
  // Distance from the start to the middle of the road along the heading.
  const half = hx !== 0 ? level.cols / 2 : level.rows / 2;
  const start = hx !== 0 ? x0 * hx : z0 * hz;
  const toRoad = half + ROAD_MARGIN - start;
  const radius = TURN_RADIUS;
  const len1 = Math.max(0, toRoad - radius);
  const arcLen = (radius * Math.PI) / 2;
  return { x0, z0, hx, hz, tx, tz, len1, radius, arcLen, len2: ROAD_RUN, total: len1 + arcLen + ROAD_RUN };
}

export type Pose = { x: number; z: number; yaw: number };

/** Position and facing after `d` of the way. Writes into `out` (nothing is allocated). */
export function samplePath(p: ExitPath, d: number, out: Pose): Pose {
  const dist = Math.min(Math.max(d, 0), p.total);
  if (dist <= p.len1) {
    out.x = p.x0 + p.hx * dist;
    out.z = p.z0 + p.hz * dist;
    out.yaw = yawOf(p.hx, p.hz);
    return out;
  }
  if (dist <= p.len1 + p.arcLen) {
    const phi = (dist - p.len1) / p.radius;
    const sx = p.x0 + p.hx * p.len1;
    const sz = p.z0 + p.hz * p.len1;
    const cx = sx + p.tx * p.radius;
    const cz = sz + p.tz * p.radius;
    const s = Math.sin(phi);
    const c = Math.cos(phi);
    out.x = cx - p.tx * p.radius * c + p.hx * p.radius * s;
    out.z = cz - p.tz * p.radius * c + p.hz * p.radius * s;
    out.yaw = yawOf(p.hx * c + p.tx * s, p.hz * c + p.tz * s);
    return out;
  }
  const rest = dist - p.len1 - p.arcLen;
  const ex = p.x0 + p.hx * p.len1 + (p.tx + p.hx) * p.radius;
  const ez = p.z0 + p.hz * p.len1 + (p.tz + p.hz) * p.radius;
  out.x = ex + p.tx * rest;
  out.z = ez + p.tz * rest;
  out.yaw = yawOf(p.tx, p.tz);
  return out;
}

/** Distance covered after `t` seconds from a standstill: a smooth start, then a steady speed. */
export const ACCEL = 7;
export const TOP_SPEED = 8.5;
export function distanceAt(t: number): number {
  const tTop = TOP_SPEED / ACCEL;
  if (t <= tTop) return 0.5 * ACCEL * t * t;
  return 0.5 * ACCEL * tTop * tTop + TOP_SPEED * (t - tTop);
}
