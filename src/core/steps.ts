import { MONETIZATION } from './config/monetization';

/**
 * The steps replace the map: the levels come in groups of five, with a chest at the end of each. The bar under the title always
 * shows where the player is in the step they are on.
 */
export const LEVELS_PER_STEP = MONETIZATION.steps.levelsPerStep;

/** The step (from 0) a level belongs to. */
export const stepOf = (levelId: number): number => Math.floor((Math.max(1, levelId) - 1) / LEVELS_PER_STEP);

/** The level numbers of a step. */
export const stepLevels = (step: number): number[] => Array.from({ length: LEVELS_PER_STEP }, (_, i) => step * LEVELS_PER_STEP + i + 1);

/** True when finishing this level finishes its step (and opens the chest). */
export const endsStep = (levelId: number): boolean => levelId % LEVELS_PER_STEP === 0;

export type DotState = 'done' | 'current' | 'todo';

/** One dot per level of the step: a tick when it has stars, the ball on the level being played, empty otherwise. */
export function stepDots(levelId: number, stars: Record<number, number>): { id: number; state: DotState }[] {
  return stepLevels(stepOf(levelId)).map((id) => ({ id, state: stars[id] ? 'done' : id === levelId ? 'current' : 'todo' }));
}

/** Coins in the chest at the end of a step (it grows a little with the steps, up to a cap). */
export function chestCoins(step: number): number {
  const { chestCoins: base, chestGrowth, chestMax } = MONETIZATION.steps;
  return Math.min(chestMax, base + chestGrowth * step);
}
