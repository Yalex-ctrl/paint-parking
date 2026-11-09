import { DELTA, type Dir } from '../core/grid';
import { EXIT_LEN, ROAD_MARGIN } from './coords';
import type { Level } from '../game/types';

/**
 * The way a vehicle takes when it leaves, computed ONCE when the level is prepared (nothing is computed or allocated while it
 * plays): straight out of its place to the road, a rounded turn onto the road, along the road (round the lot, by the shortest way)
 * to the road of exit, a rounded turn onto it, and away. The road is two-way: a vehicle on the right of the lot goes down the right
 * side, one on the left goes down the left side, both meeting at the road of exit in the middle of the bottom. Pure geometry: the
 * road is not a game rule, nothing can be hit on it.
 */
export type Route = {
  /** Positions every `ROUTE_STEP` or so, and the unit heading there. */
  xs: Float32Array;
  zs: Float32Array;
  hx: Float32Array;
  hz: Float32Array;
  /** Distance along the route of each sample. */
  ss: Float32Array;
  count: number;
  length: number;
  /** The distance at which the vehicle reaches the road (the end of the straight out of its place). */
  laneLen: number;
  /** The distance at which it reaches the junction with the road of exit (where every vehicle goes through the same place). */
  junction: number;
};

/** Spacing of the samples. */
export const ROUTE_STEP = 0.1;
/** Radius of the turns. */
export const TURN_RADIUS = 0.5;
/** The vehicle is gone when it has driven this far down the road of exit. */
export const EXIT_RUN = EXIT_LEN - 0.4;

/** Facing angle (around Y) of something that looks along the heading (hx, hz): 0 faces +X, a quarter turn faces +Z or -Z. */
export const yawOf = (hx: number, hz: number): number => Math.atan2(-hz, hx);

type P = [number, number];

/** The corners of the way of a vehicle that leaves the place (x0, z0) driving `dir`, in a lot of this size. */
export function waypoints(level: Pick<Level, 'rows' | 'cols'>, x0: number, z0: number, dir: Dir): P[] {
  const X = level.cols / 2 + ROAD_MARGIN;
  const Z = level.rows / 2 + ROAD_MARGIN;
  const out: P[] = [[x0, z0]];
  const push = (x: number, z: number) => {
    const last = out[out.length - 1];
    if (Math.hypot(last[0] - x, last[1] - z) > 1e-6) out.push([x, z]);
  };
  switch (dir) {
    case 'D':
      push(x0, Z);
      push(0, Z);
      break;
    case 'R':
      push(X, z0);
      push(X, Z);
      push(0, Z);
      break;
    case 'L':
      push(-X, z0);
      push(-X, Z);
      push(0, Z);
      break;
    case 'U': {
      // The shorter side round: the one the vehicle is nearer to.
      const side = x0 >= 0 ? 1 : -1;
      push(x0, -Z);
      push(side * X, -Z);
      push(side * X, Z);
      push(0, Z);
      break;
    }
  }
  push(0, Z + EXIT_RUN);
  return out;
}

/** Rounds the corners of a polyline with arcs and samples it. */
export function buildRoute(level: Pick<Level, 'rows' | 'cols'>, x0: number, z0: number, dir: Dir): Route {
  const w = waypoints(level, x0, z0, dir);
  const xs: number[] = [];
  const zs: number[] = [];
  const hxs: number[] = [];
  const hzs: number[] = [];
  const ss: number[] = [];
  let s = 0;
  let laneLen = -1;
  let junction = -1;
  const add = (x: number, z: number, hx: number, hz: number) => {
    if (xs.length > 0) s += Math.hypot(x - xs[xs.length - 1], z - zs[zs.length - 1]);
    xs.push(x);
    zs.push(z);
    hxs.push(hx);
    hzs.push(hz);
    ss.push(s);
  };
  const unit = (a: P, b: P): P => {
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
  };
  // The position and the unit heading at the start of the first piece.
  let cursor: P = w[0];
  for (let i = 1; i < w.length; i++) {
    const dirIn = unit(w[i - 1], w[i]);
    const hasNext = i + 1 < w.length;
    const dirOut = hasNext ? unit(w[i], w[i + 1]) : dirIn;
    const lenIn = Math.hypot(w[i][0] - w[i - 1][0], w[i][1] - w[i - 1][1]);
    const lenOut = hasNext ? Math.hypot(w[i + 1][0] - w[i][0], w[i + 1][1] - w[i][1]) : 0;
    const r = hasNext ? Math.min(TURN_RADIUS, lenIn * 0.5, lenOut * 0.5) : 0;
    // The straight part of this piece: from the cursor to the start of the next arc.
    const stop: P = [w[i][0] - dirIn[0] * r, w[i][1] - dirIn[1] * r];
    const straight = Math.hypot(stop[0] - cursor[0], stop[1] - cursor[1]);
    const n = Math.max(1, Math.round(straight / ROUTE_STEP));
    for (let k = i === 1 ? 0 : 1; k <= n; k++) add(cursor[0] + ((stop[0] - cursor[0]) * k) / n, cursor[1] + ((stop[1] - cursor[1]) * k) / n, dirIn[0], dirIn[1]);
    if (i === 1) laneLen = s;
    cursor = stop;
    if (!hasNext || r <= 1e-6) continue;
    // The last bend is the one onto the road of exit: the junction.
    if (i === w.length - 2) junction = s;
    // A quarter circle: the centre is on the side of the turn.
    const cx = stop[0] + dirOut[0] * r;
    const cz = stop[1] + dirOut[1] * r;
    const steps = Math.max(2, Math.round((r * Math.PI) / 2 / ROUTE_STEP));
    for (let k = 1; k <= steps; k++) {
      const phi = ((Math.PI / 2) * k) / steps;
      const c = Math.cos(phi);
      const sn = Math.sin(phi);
      add(cx - dirOut[0] * r * c + dirIn[0] * r * sn, cz - dirOut[1] * r * c + dirIn[1] * r * sn, dirIn[0] * c + dirOut[0] * sn, dirIn[1] * c + dirOut[1] * sn);
    }
    cursor = [w[i][0] + dirOut[0] * r, w[i][1] + dirOut[1] * r];
  }
  if (laneLen < 0) laneLen = 0;
  // A vehicle that drives straight down onto the road of exit has no bend: its junction is where it reaches the road.
  if (junction < 0) junction = laneLen;
  return { xs: Float32Array.from(xs), zs: Float32Array.from(zs), hx: Float32Array.from(hxs), hz: Float32Array.from(hzs), ss: Float32Array.from(ss), count: xs.length, length: s, laneLen, junction };
}

export type Pose = { x: number; z: number; yaw: number; hx: number; hz: number };

/**
 * Position and heading after `d` of the way. `from` is the index of the sample the last call stopped at (the distance only goes
 * forward, so the search is a step or two); the new index is returned. Writes into `out`: nothing is allocated.
 */
export function sampleRoute(route: Route, d: number, out: Pose, from = 0): number {
  const dist = Math.min(Math.max(d, 0), route.length);
  let i = Math.min(from, route.count - 2);
  while (i > 0 && route.ss[i] > dist) i--;
  while (i < route.count - 2 && route.ss[i + 1] < dist) i++;
  const span = route.ss[i + 1] - route.ss[i];
  const t = span > 1e-9 ? (dist - route.ss[i]) / span : 0;
  out.x = route.xs[i] + (route.xs[i + 1] - route.xs[i]) * t;
  out.z = route.zs[i] + (route.zs[i + 1] - route.zs[i]) * t;
  let hx = route.hx[i] + (route.hx[i + 1] - route.hx[i]) * t;
  let hz = route.hz[i] + (route.hz[i + 1] - route.hz[i]) * t;
  const l = Math.hypot(hx, hz) || 1;
  hx /= l;
  hz /= l;
  out.hx = hx;
  out.hz = hz;
  out.yaw = yawOf(hx, hz);
  return i;
}

/** Speed of a vehicle on its way out (places per second): a quick start, then a steady pace. */
export const ACCEL = 45;
export const TOP_SPEED = 19;

/** The direction a route starts in (the heading of the vehicle leaving its place). */
export const routeStart = (dir: Dir): [number, number] => [DELTA[dir][1], DELTA[dir][0]];
