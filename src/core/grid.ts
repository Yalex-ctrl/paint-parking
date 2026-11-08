/** Directions on a grid, shared by every game built on the core. Row grows downward. */
export type Dir = 'U' | 'D' | 'L' | 'R';

export const DIRS: readonly Dir[] = ['U', 'D', 'L', 'R'];

/** [dRow, dCol] for each direction. */
export const DELTA: Record<Dir, readonly [number, number]> = {
  U: [-1, 0],
  D: [1, 0],
  L: [0, -1],
  R: [0, 1],
};

export const OPPOSITE: Record<Dir, Dir> = { U: 'D', D: 'U', L: 'R', R: 'L' };

export type Cell = readonly [row: number, col: number];

/** 'H' for left / right, 'V' for up / down. */
export type Axis = 'H' | 'V';

export const axisOf = (d: Dir): Axis => (d === 'L' || d === 'R' ? 'H' : 'V');
