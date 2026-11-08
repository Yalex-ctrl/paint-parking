import { formatDecimal, t } from '../i18n';
import { SCORING } from '../config/scoring';

/**
 * The points of a level (see config/scoring.ts). Pure.
 */
export type ScoreInput = {
  /** The level number (the daily challenge passes `SCORING.dailyLevelEquivalent`). */
  level: number;
  /** The fewest moves the level can be done in. */
  optimum: number;
  /** The moves played. */
  moves: number;
  /** Seconds of play, from the first swipe to the exit (paused in menus, pop-ups and ads). */
  seconds: number;
  /** A hint was used in this level. */
  hintUsed: boolean;
};

export type ScoreDetail = {
  /** Points of the moves and of the time (before the multiplier). */
  movePoints: number;
  timePoints: number;
  /** The target time (s). */
  targetSeconds: number;
  /** 1 + level / 100. */
  multiplier: number;
  hintUsed: boolean;
  /** The final score. */
  total: number;
  /** Moves = optimum, time within the target, no hint. */
  perfect: boolean;
};

/** The time (s) a level is meant to be done in: 3 s + 1.5 s per optimal move. */
export const targetSeconds = (optimum: number): number => SCORING.targetBaseSec + SCORING.targetPerOptimumSec * Math.max(1, optimum);

/** 1000 x optimum / moves (never more than 1000: an optimum found by a search is not always the true one). */
export const movePoints = (optimum: number, moves: number): number => Math.min(SCORING.movePoints, (SCORING.movePoints * Math.max(1, optimum)) / Math.max(1, moves));

/** All of it up to the target time, then a straight line down to 0 at 3 x the target. */
export function timePoints(optimum: number, seconds: number): number {
  const target = targetSeconds(optimum);
  if (seconds <= target) return SCORING.timePoints;
  const zeroAt = target * SCORING.zeroAtFactor;
  return Math.max(0, (SCORING.timePoints * (zeroAt - seconds)) / (zeroAt - target));
}

export const roundScore = (x: number): number => Math.round(x / SCORING.roundTo) * SCORING.roundTo;

export function levelScore(i: ScoreInput): ScoreDetail {
  const mp = movePoints(i.optimum, i.moves);
  const tp = timePoints(i.optimum, i.seconds);
  const multiplier = 1 + i.level / SCORING.difficultyDivisor;
  const raw = (mp + tp) * multiplier * (i.hintUsed ? SCORING.hintFactor : 1);
  const target = targetSeconds(i.optimum);
  return {
    movePoints: mp,
    timePoints: tp,
    targetSeconds: target,
    multiplier,
    hintUsed: i.hintUsed,
    total: roundScore(raw),
    perfect: i.moves <= i.optimum && i.seconds <= target && !i.hintUsed,
  };
}

/** A new best only counts on a level that already had a score (never at the first pass). */
export const isNewBestScore = (score: number, previous: number | undefined): boolean => previous !== undefined && score > previous;

/** The sum of the best scores. */
export const totalScore = (best: Record<number, number>): number => Object.values(best).reduce((n, s) => n + s, 0);


/** The text of the detail bubble: moves, time, multiplier, hint. */
export function scoreLines(d: ScoreDetail, moves: number, optimum: number, seconds: number): string[] {
  return [
    t('score.moves', { moves, optimum, points: Math.round(d.movePoints) }),
    t('score.time', { seconds: formatDecimal(seconds), target: formatDecimal(d.targetSeconds), points: Math.round(d.timePoints) }),
    t('score.difficulty', { mult: formatDecimal(d.multiplier, 2) }),
    ...(d.hintUsed ? [t('score.hint', { mult: formatDecimal(SCORING.hintFactor, 1) })] : []),
  ];
}
