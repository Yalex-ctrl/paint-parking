import { moveLimitOn } from '../core/config/features';
import { MONETIZATION } from '../core/config/monetization';

/**
 * Moves and stars. The optimum is one move per vehicle (each leaves once, without a collision); every collision costs one more
 * move. So `moves - optimal` is the number of collisions. All the numbers live in config/monetization.ts.
 */

/** The most moves a level allows. Null = no limit (the first levels, and the daily challenge). */
export function moveLimit(levelId: number, optimal: number): number | null {
  const m = MONETIZATION.moves;
  if (levelId <= m.freeUntilLevel) return null;
  const tier = m.limitExtra.find((t) => levelId <= t.upTo) ?? m.limitExtra[m.limitExtra.length - 1];
  return optimal + tier.extra;
}

/** The limit in force for a level: none in the daily challenge, none when the rule is switched off, else the one above. */
export const activeLimit = (levelId: number, optimal: number, daily: boolean): number | null => (daily || !moveLimitOn() ? null : moveLimit(levelId, optimal));

/** The most moves that still earn 2 stars: the optimum plus two collisions. */
export const twoStarMoves = (optimal: number): number => optimal + MONETIZATION.moves.twoStarCollisions;

/** 3 stars with no collision, 2 with one or two, 1 with more. */
export function starsFor(moves: number, optimal: number): 1 | 2 | 3 {
  if (moves <= optimal) return 3;
  if (moves <= twoStarMoves(optimal)) return 2;
  return 1;
}

/** What a level shows about moves: its minimum, its maximum (null = none) and the thresholds of the stars. */
export function levelScoring(levelId: number, optimal: number) {
  return { minimum: optimal, limit: moveLimit(levelId, optimal), twoStars: twoStarMoves(optimal) };
}

/** Stars of a save made under older rules, worked out again from the best number of moves when it is known, else kept as they were. */
export function recomputeStars(
  stars: Record<number, 1 | 2 | 3>,
  moves: Record<number, number>,
  optimalOf: (levelId: number) => number | null,
): Record<number, 1 | 2 | 3> {
  const out: Record<number, 1 | 2 | 3> = {};
  for (const key of Object.keys(stars)) {
    const id = Number(key);
    const best = moves[id];
    const optimal = optimalOf(id);
    out[id] = best !== undefined && optimal !== null ? starsFor(best, optimal) : stars[id];
  }
  return out;
}
