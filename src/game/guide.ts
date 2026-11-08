import { freeVehicles, openDirs, type Board, type GameState } from './engine';
import type { Dir } from '../core/grid';

/**
 * Help for beginners and the hint. Both point at a vehicle that can leave right now and the way it leaves (the solver's order
 * decides which one), so following them never causes a collision.
 */
export type Hint = {
  vehicle: number;
  dir: Dir;
  /** True when a tap does it (the vehicle leaves forward); otherwise a swipe backward is needed. */
  tap: boolean;
};

/** After this long without a move (ms), the levels 2-5 show the help. */
export const GUIDE_IDLE_MS = 5000;

/** The levels that have the help hand: all of the first five. */
export const GUIDE_LAST_LEVEL = 5;

/** The hint button exists from this level on (the first levels have the hand instead). */
export const HINT_FROM_LEVEL = 6;

/** Level 1: the hand shows every move. Levels 2-5: after `GUIDE_IDLE_MS` of doing nothing. Later: never. */
export function guideMode(levelId: number): 'always' | 'idle' | 'off' {
  if (levelId === 1) return 'always';
  return levelId <= GUIDE_LAST_LEVEL ? 'idle' : 'off';
}

export const hintAvailable = (levelId: number): boolean => levelId >= HINT_FROM_LEVEL;

/** The next vehicle to move: the first of the solution that is free now, forward if it can. Null when the lot is empty. */
export function nextHint(board: Board, state: GameState): Hint | null {
  const free = freeVehicles(board, state);
  if (free.length === 0) return null;
  const inOrder = board.level.solution.find((id) => free.includes(id)) ?? free[0];
  const open = openDirs(board, state, inOrder);
  const forward = board.level.vehicles[inOrder].dir;
  const dir = open.includes(forward) ? forward : open[0];
  return { vehicle: inOrder, dir, tap: dir === forward };
}
