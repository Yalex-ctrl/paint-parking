import type { Level } from '../game/types';

/** Width of the sidewalk (wood) around the lot. */
export const SIDEWALK = 0.4;
/** Width of the road that goes round the sidewalk. */
export const ROAD_W = 1.7;
/** From the edge of the lot to the middle of the road. */
export const ROAD_MARGIN = SIDEWALK + ROAD_W / 2;
/** Thickness of the wooden plate the lot stands on (its top is the ground level, y = 0). */
export const SLAB_H = 0.3;
/** Height of the top of the asphalt of the places (just above the slab so nothing fights for the same depth). */
export const ASPHALT_Y = 0.02;
/** How high a vehicle's body goes, for the highlight and the crown. */
export const VEHICLE_H = 0.62;

/** World X of a grid column (the lot is centred on the origin). */
export const cellX = (level: Pick<Level, 'cols'>, c: number) => c - level.cols / 2 + 0.5;
/** World Z of a grid row. */
export const cellZ = (level: Pick<Level, 'rows'>, r: number) => r - level.rows / 2 + 0.5;

/** Free ground between the plate of a level and the plate of the next one, where the road that links them runs. */
export const LINK_GAP = 2.2;
/** How far past the edge of the lot the plate goes (sidewalk, road and a margin of wood). */
export const PLATE_MARGIN = SIDEWALK + ROAD_W + 0.25;

/** Where the next level waits: straight below the current one, a road between the two. */
export function linkOffset(current: Pick<Level, 'rows'>, next: Pick<Level, 'rows'>): [number, number, number] {
  return [0, 0, current.rows / 2 + PLATE_MARGIN + LINK_GAP + PLATE_MARGIN + next.rows / 2];
}

/** The grid cell under a world point, or null outside the lot. */
export function cellAt(level: Pick<Level, 'rows' | 'cols'>, x: number, z: number): [number, number] | null {
  const c = Math.floor(x + level.cols / 2);
  const r = Math.floor(z + level.rows / 2);
  return r >= 0 && r < level.rows && c >= 0 && c < level.cols ? [r, c] : null;
}
