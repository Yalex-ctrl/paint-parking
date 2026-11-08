import { freeVehicles, type Board, type GameState } from './engine';

/**
 * Help for beginners and the hint. Both point at a vehicle that can leave right now (the solver's order decides which one), so
 * tapping it never causes a collision.
 */
export type Hint = {
  vehicle: number;
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

/** The next vehicle to tap: the first of the solution that is free now. Null when the lot is empty. */
export function nextHint(board: Board, state: GameState): Hint | null {
  const free = freeVehicles(board, state);
  if (free.length === 0) return null;
  return { vehicle: board.level.solution.find((id) => free.includes(id)) ?? free[0] };
}
