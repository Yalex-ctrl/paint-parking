import type { Level } from './types';

/** Largest side (in tiles of floor) of a level played by the home screen: small enough to read at a glance. */
export const DEMO_MAX_SIDE = 7;
/** How many levels the home screen cycles through in a visit. */
export const DEMO_POOL = 8;

const floor = (l: Level) => ({ w: l.cols - 2, h: l.rows - 2 });
const small = (l: Level) => floor(l).w <= DEMO_MAX_SIDE && floor(l).h <= DEMO_MAX_SIDE && l.solution.length >= 3 && l.solution.length <= 16;

/**
 * The levels the home screen plays by itself: only ones the player has already finished (the levels before `current`), and
 * small ones; a new player (nothing finished yet) gets levels 1 to 10. `random` picks the order, so each visit differs.
 */
export function pickDemoLevels(levels: Level[], current: number, random: () => number = Math.random): Level[] {
  let pool = levels.filter((l) => l.id < current && small(l));
  if (pool.length === 0) pool = levels.filter((l) => l.id <= 10 && small(l));
  if (pool.length === 0) pool = levels.slice(0, 10);
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, DEMO_POOL);
}
