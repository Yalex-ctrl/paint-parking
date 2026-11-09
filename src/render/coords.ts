import type { Level } from '../game/types';

/**
 * The parking is OPEN on the road: no wooden border round it. Its limit is a thin white line on the ground; right outside it the road
 * goes round, so every row and every column of places ends on the road and a vehicle that drives straight on is seen leaving.
 */
/** Width of the road that goes round the lot (about one place). */
export const ROAD_W = 1.0;
/** Between the white line at the edge of the lot and the road. */
export const ROAD_GAP = 0.12;
/** From the edge of the lot to the middle of the road. */
export const ROAD_MARGIN = ROAD_GAP + ROAD_W / 2;
/** Where the road ends and the grass begins, past the road. */
export const PLATE_MARGIN = ROAD_GAP + ROAD_W + 0.3;
/** The ground (grass) is this far below the asphalt. */
export const GROUND_DROP = 0.06;
/** Kept for the code that still speaks of the thickness under the lot: there is none now, the lot lies on the grass. */
export const SLAB_H = 0;
/** Height of the top of the asphalt of the places. */
export const ASPHALT_Y = 0.02;
/** How high a vehicle's body goes, for the highlight and the crown. */
export const VEHICLE_H = 0.62;

/** World X of a grid column (the lot is centred on the origin). */
export const cellX = (level: Pick<Level, 'cols'>, c: number) => c - level.cols / 2 + 0.5;
/** World Z of a grid row. */
export const cellZ = (level: Pick<Level, 'rows'>, r: number) => r - level.rows / 2 + 0.5;

/** Free ground between the road of a level and the road of the next one: the exit road runs across it. */
export const LINK_GAP = 2.2;
/** The length of the road of exit, from the middle of the bottom road to the middle of the top road of the next level. */
export const EXIT_LEN = 2 * PLATE_MARGIN + LINK_GAP - 2 * ROAD_MARGIN;

/** Where the next level waits: straight below the current one, the exit road joining the two. */
export function linkOffset(current: Pick<Level, 'rows'>, next: Pick<Level, 'rows'>): [number, number, number] {
  return [0, 0, current.rows / 2 + PLATE_MARGIN + LINK_GAP + PLATE_MARGIN + next.rows / 2];
}

/** The grid cell under a world point, or null outside the lot. */
export function cellAt(level: Pick<Level, 'rows' | 'cols'>, x: number, z: number): [number, number] | null {
  const c = Math.floor(x + level.cols / 2);
  const r = Math.floor(z + level.rows / 2);
  return r >= 0 && r < level.rows && c >= 0 && c < level.cols ? [r, c] : null;
}
