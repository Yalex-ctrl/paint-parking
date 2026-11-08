import type { Cell, Level } from '../game/types';

/** Height of the wall tops above the floor (the walls that stand on a platform rise PLATEAU_H higher: see heights.wallTop). */
export const WALL_H = 0.85;
/** Underside of walls / top of the base slab. */
export const BASE_Y = -0.12;
/** The grass plane the board stands on (the slab is 0.3 thick). */
export const GROUND_Y = BASE_Y - 0.3;
export const BALL_R = 0.41;
/** Height of a platform (the raised floor of the levels with "étages") above the low floor. */
export const PLATEAU_H = 0.6;

/** World X of a grid column (board centred on the origin). */
export const cellX = (level: Level, c: number) => c - level.cols / 2 + 0.5;
/** World Z of a grid row. */
export const cellZ = (level: Level, r: number) => r - level.rows / 2 + 0.5;
export const cellWorld = (level: Level, [r, c]: Cell): [number, number] => [cellX(level, c), cellZ(level, r)];
