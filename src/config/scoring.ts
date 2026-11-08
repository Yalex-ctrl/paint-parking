/**
 * The points of a level (not the stars, which only count moves; not the coins, which points never give). Every number is here.
 *
 * score = (points of moves + points of time) x (1 + level / 100), rounded to ten; x0.7 when a hint was used.
 */
export const SCORING = {
  /** Points for the moves: this x (optimum / moves played), 1000 at the optimum. */
  movePoints: 1000,
  /** Points for the time: all of it up to the target time, then down in a straight line to 0 at `zeroAtFactor` x the target. */
  timePoints: 1000,
  /** Target time (s) = base + perOptimum x the optimum number of moves. */
  targetBaseSec: 3,
  targetPerOptimumSec: 1.5,
  zeroAtFactor: 3,
  /** The multiplier of difficulty is 1 + level number / this. */
  difficultyDivisor: 100,
  /** The daily challenge counts as this level for the multiplier (as hard as levels 150 to 200). */
  dailyLevelEquivalent: 175,
  /** Scores are rounded to this. */
  roundTo: 10,
  /** What a score is multiplied by when a hint was used in the level (and there is no "Parfait"). */
  hintFactor: 0.7,
  /** How long the number runs from 0 to the score on the end-of-level screen (seconds). */
  countSeconds: 0.8,
} as const;
