import { SCORING } from './config/scoring';
import type { DayKey } from './dates';
import { completeDaily, type DailyResult } from './daily';
import { finishLevel, type Profile } from './economy';
import { fillPiggy } from './piggy';
import { isNewBestScore, levelScore, type ScoreDetail } from './points';
import type { ShopItem } from './shopItems';
import { worldEndReward } from './shopCatalog';
import { trialLevelDone } from './rewards';
import { multiplierOf, scaleWithStreak, winLevel } from './streak';

/**
 * Everything that a won level changes in the profile, worked out in ONE pure step so that the screen writes the profile once (and
 * not five times, each write waking up every part of the screen that reads it) at the moment the ball leaves the board.
 */
export type VictoryInput = {
  levelId: number;
  stars: 1 | 2 | 3;
  /** The stars this level already had (0 for a first time). */
  previousStars: 0 | 1 | 2 | 3;
  /** Coins picked up on the board during this level (they were already paid, one by one, as they were picked up). */
  picked: number;
  moves: number;
  optimum: number;
  seconds: number;
  hintUsed: boolean;
};

export type VictoryResult = {
  profile: Profile;
  /** The bonus of the stars, and everything the level gave in coins (with the streak's multiplier). */
  bonus: number;
  total: number;
  streak: { before: number; after: number; tierUp: boolean; mult: number };
  piggyAdded: number;
  score: ScoreDetail;
  /** The player beat his own score on a level he had already finished (never at the first pass). */
  newBestScore: boolean;
  /** An item given for finishing the last level of a world. */
  reward: ShopItem | null;
  /** The trial of a ball or a paint that has just ended with this level (the card "Tu as aimé ?" follows). */
  trialEnded: string | null;
};

export function settleVictory(p: Profile, i: VictoryInput): VictoryResult {
  const score = levelScore({ level: i.levelId, optimum: i.optimum, moves: i.moves, seconds: i.seconds, hintUsed: i.hintUsed });
  const paid = finishLevel(p, i.stars, i.previousStars, i.levelId);
  // The streak goes up with the win, and multiplies every coin of the level (the stars' bonus and the coins picked up).
  const step = winLevel(paid.profile);
  const base = paid.bonus + i.picked;
  const scaled = scaleWithStreak(step.profile, base, step.after);
  const piggy = fillPiggy(scaled.profile, scaled.total);
  const previousBest = p.bestScores[i.levelId];
  const best = Math.max(previousBest ?? 0, score.total);
  let next: Profile = { ...piggy.profile, bestScores: { ...piggy.profile.bestScores, [i.levelId]: best } };
  const won = worldEndReward(next, i.levelId);
  if (won) next = won.profile;
  const trial = trialLevelDone(next);
  next = trial.profile;
  return {
    profile: next,
    bonus: paid.bonus,
    total: scaled.total,
    streak: { before: step.before, after: step.after, tierUp: step.tierUp, mult: multiplierOf(step.after) },
    piggyAdded: piggy.added,
    score,
    newBestScore: isNewBestScore(score.total, previousBest),
    reward: won?.item ?? null,
    trialEnded: trial.ended?.itemId ?? null,
  };
}

export type DailyVictoryInput = { day: DayKey; moves: number; optimum: number; seconds: number; hintUsed: boolean };
export type DailyVictory = { result: DailyResult; profile: Profile; score: ScoreDetail; newBestScore: boolean; trialEnded: string | null };

/** Today's challenge is won: the streak, the coins, the exclusive ball, and the score (the best of the day is kept). */
export function settleDaily(p: Profile, i: DailyVictoryInput): DailyVictory {
  const score = levelScore({ level: SCORING.dailyLevelEquivalent, optimum: i.optimum, moves: i.moves, seconds: i.seconds, hintUsed: i.hintUsed });
  const result = completeDaily(p, i.day);
  const previous = p.dailyScores[i.day];
  const dailyScores = { ...result.profile.dailyScores, [i.day]: Math.max(previous ?? 0, score.total) };
  // Keep the last two months of scores only.
  const keys = Object.keys(dailyScores).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - 62))) delete dailyScores[k];
  const trial = trialLevelDone({ ...result.profile, dailyScores });
  return { result, profile: trial.profile, score, newBestScore: isNewBestScore(score.total, previous), trialEnded: trial.ended?.itemId ?? null };
}

