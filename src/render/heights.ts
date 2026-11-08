import type { Level } from '../game/types';
import { PLATEAU_H, WALL_H, cellX, cellZ } from './coords';
import { SLIDE_ARCH_TOP, SLIDE_RAIL_ABOVE } from './slidePath';

/**
 * The heights of a level: the floor is low (0) or on a platform (PLATEAU_H), a ramp goes from one to the other across its tile. These
 * are the functions the board, the ball, the paint, the particles and the camera all ask, so they agree about where the floor is.
 */
const DIR_VEC: Record<string, [number, number]> = { U: [-1, 0], D: [1, 0], L: [0, -1], R: [0, 1] };

const keyOf = (level: Level, r: number, c: number) => r * level.cols + c;

type HeightMap = { raised: Set<number>; ramps: Map<number, [number, number]> };
const cache = new WeakMap<Level, HeightMap>();

function maps(level: Level): HeightMap {
  let m = cache.get(level);
  if (!m) {
    m = { raised: new Set((level.features.raised ?? []).map(([r, c]) => keyOf(level, r, c))), ramps: new Map((level.features.ramps ?? []).map((k) => [keyOf(level, k.r, k.c), DIR_VEC[k.up]])) };
    cache.set(level, m);
  }
  return m;
}

export const isRampCell = (level: Level, r: number, c: number): boolean => maps(level).ramps.has(keyOf(level, r, c));
export const isPlatformCell = (level: Level, r: number, c: number): boolean => maps(level).raised.has(keyOf(level, r, c));

/** Height of the floor in the middle of a tile (a ramp is half way). */
export function tileHeight(level: Level, r: number, c: number): number {
  const m = maps(level);
  const k = keyOf(level, r, c);
  return m.raised.has(k) ? PLATEAU_H : m.ramps.has(k) ? PLATEAU_H / 2 : 0;
}

/** Height of the floor under a world point: low, platform, or the slope of a ramp (0 at its low edge, PLATEAU_H at the platform edge). */
export function groundY(level: Level, x: number, z: number): number {
  const c = Math.floor(x + level.cols / 2);
  const r = Math.floor(z + level.rows / 2);
  const m = maps(level);
  const k = keyOf(level, r, c);
  if (m.raised.has(k)) return PLATEAU_H;
  const up = m.ramps.get(k);
  if (up) {
    // Position along the axis of the ramp, from the low edge (0) to the platform edge (1).
    const along = up[0] !== 0 ? (z - cellZ(level, r)) * up[0] : (x - cellX(level, c)) * up[1];
    return PLATEAU_H * Math.min(1, Math.max(0, along + 0.5));
  }
  return 0;
}

/** Slope of a ramp (height gained per tile along it) and the length of its surface over one tile. */
export const RAMP_SLOPE = PLATEAU_H;
export const RAMP_STRETCH = Math.hypot(1, RAMP_SLOPE);

/** The unit vector of the surface of a ramp that rises toward `up` (a direction of the plan): what a flat tile is turned to lie on it. */
export function rampNormal(up: string): [number, number, number] {
  const [dr, dc] = DIR_VEC[up];
  const x = -RAMP_SLOPE * dc;
  const z = -RAMP_SLOPE * dr;
  const l = Math.hypot(x, 1, z);
  return [x / l, 1 / l, z / l];
}

/** The highest point of the level (ball and chutes included): the camera frames up to there. */
export function topHeight(level: Level): number {
  let top = WALL_H;
  if ((level.features.raised ?? []).length) top = Math.max(top, WALL_H + PLATEAU_H);
  if ((level.features.slides ?? []).length) {
    // The highest point of a chute: the top of its arches over the highest wall it crosses.
    for (const s of level.features.slides) {
      for (const [r, c] of s.path) top = Math.max(top, wallTop(level, r, c) + SLIDE_RAIL_ABOVE + SLIDE_ARCH_TOP);
    }
  }
  return top;
}

/**
 * Top of the wall in a cell. The walls that only look at a platform rise from it, so they stand PLATEAU_H higher than the ones of the
 * low floor: the platform reads as another storey with its own walls. The walls between a platform and the low floor, and
 * everything else, are WALL_H.
 */
export function wallTop(level: Level, r: number, c: number): number {
  return tallWalls(level).has(keyOf(level, r, c)) ? WALL_H + PLATEAU_H : WALL_H;
}

const tallCache = new WeakMap<Level, Set<number>>();
/** The wall cells (row * cols + col) that rise from a platform: wall cells with a platform tile on a side and no low floor or ramp on another. */
export function tallWalls(level: Level): Set<number> {
  let set = tallCache.get(level);
  if (!set) {
    set = new Set();
    const raised = maps(level).raised;
    if (raised.size > 0) {
      for (let r = 0; r < level.rows; r++) {
        for (let c = 0; c < level.cols; c++) {
          if (level.grid[r][c] !== '#') continue;
          let platform = false;
          let low = false;
          for (const [dr, dc] of Object.values(DIR_VEC)) {
            const rr = r + dr;
            const cc = c + dc;
            if (rr < 0 || cc < 0 || rr >= level.rows || cc >= level.cols || level.grid[rr][cc] !== '.') continue;
            if (raised.has(keyOf(level, rr, cc))) platform = true;
            else low = true;
          }
          // A wall that also looks at the low floor or a ramp keeps the usual height: a taller one would hide the tile behind it.
          if (platform && !low) set.add(keyOf(level, r, c));
        }
      }
    }
    tallCache.set(level, set);
  }
  return set;
}
