import { DELTA, type Dir, type Level } from '../game/types';
import type { IslandSpec } from './island';

/**
 * The island is a big slab of ground under the board, wide enough on every side to fill the whole screen: no edge and no
 * sky show while a level is played. (Its irregular rim and the slice of earth under it are only ever seen from afar, during
 * the crossing of the bridge.) Two neighbouring islands overlap; the arriving one is raised a hair so they never flicker.
 */
export const ISLAND_WIDE = 26; // cells beyond the board

/** Cells of ground beyond the board on each side. */
export const islandMargins = (_level?: Level): Record<Dir, number> => ({ U: ISLAND_WIDE, D: ISLAND_WIDE, L: ISLAND_WIDE, R: ISLAND_WIDE });

/** The island in cell coordinates of the level (the board is rows x cols from (0, 0)). */
export function islandSpecFor(level: Level): IslandSpec {
  const m = islandMargins(level);
  return { r0: -m.U, r1: level.rows - 1 + m.D, c0: -m.L, c1: level.cols - 1 + m.R, pit: new Set<number>() };
}

/** True when a disc of radius `r` centred on world (x, z) lies within the island. */
export function insideIsland(level: Level, x: number, z: number, r: number): boolean {
  const m = islandMargins(level);
  const hw = level.cols / 2;
  const hd = level.rows / 2;
  return x - r >= -hw - m.L && x + r <= hw + m.R && z - r >= -hd - m.U && z + r <= hd + m.D;
}

/** Offset (dx, dz) of a direction in the ground plane. */
export const planeStep = (d: Dir): [number, number] => [DELTA[d][1], DELTA[d][0]];
