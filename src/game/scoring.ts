import { moveLimitOn } from '../config/features';
import { MONETIZATION } from '../config/monetization';

/**
 * The most moves a level allows. Null = no limit (the first levels, and the daily challenge). Rounded up, and never less than
 * `minExtra` moves over the optimum. All the numbers live in config/monetization.ts.
 */
export function moveLimit(levelId: number, optimal: number): number | null {
  const m = MONETIZATION.moves;
  if (levelId <= m.freeUntilLevel) return null;
  const tier = m.limitFactor.find((t) => levelId <= t.upTo) ?? m.limitFactor[m.limitFactor.length - 1];
  return Math.max(Math.ceil(optimal * tier.factor), optimal + m.minExtra);
}

/** The limit in force for a level: none in the daily challenge, none when the rule is switched off, else the one above. */
export const activeLimit = (levelId: number, optimal: number, daily: boolean): number | null => (daily || !moveLimitOn() ? null : moveLimit(levelId, optimal));

/** The most moves that still earn 2 stars: optimum x 1.25, rounded up, at least one more than the optimum. */
export function twoStarMoves(optimal: number): number {
  const m = MONETIZATION.moves;
  return Math.max(Math.ceil(optimal * m.twoStarFactor), optimal + m.twoStarMinExtra);
}

/** 3 stars at the optimum, 2 up to `twoStarMoves`, 1 for anything else (a level can only be finished within its limit). */
export function starsFor(moves: number, optimal: number): 1 | 2 | 3 {
  if (moves <= optimal) return 3;
  if (moves <= twoStarMoves(optimal)) return 2;
  return 1;
}

/** What a level shows about moves: its minimum, its maximum (null = none) and the thresholds of the stars. */
export function levelScoring(levelId: number, optimal: number) {
  return { minimum: optimal, limit: moveLimit(levelId, optimal), twoStars: twoStarMoves(optimal) };
}

/**
 * Stars of a save made under older rules, worked out again from the best number of moves when it is known (the stars then
 * follow the new thresholds), else kept as they were.
 */
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

/** Rough difficulty used to order levels: longer optimal solutions, more dead ends and bigger boards are harder. */
export function difficultyScore(opts: {
  optimalMoves: number;
  deadEnds: number;
  floorCount: number;
  states: number;
}): number {
  const { optimalMoves, deadEnds, floorCount, states } = opts;
  return Math.round((optimalMoves * 4 + deadEnds * 2 + floorCount * 0.5 + Math.log2(states + 1) * 3) * 10) / 10;
}
