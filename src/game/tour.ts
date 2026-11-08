/**
 * The guided tour after level 5: when it is offered, what "later" and "skip" do, and the gift at the end. Pure rules: the
 * screens (components/GuidedTour, GameScreen) only apply them.
 */
export const TOUR_AFTER_LEVEL = 5;
/** Coins given once at the end of the tour. A gift: it is not divided by `coinEarnMultiplier`. */
export const TOUR_GIFT_COINS = 50;
/** "Plus tard" puts the offer off once (it comes back after level 6), then never again. */
export const MAX_POSTPONES = 1;

export type TourSave = { tourCompleted: boolean; tourPostponedCount: number };

/**
 * Should the offer card appear now that `finishedLevel` has been finished (the game is on the next level)? Right after level 5. If
 * it was put off once, after level 6. If it was never offered (the offer was missed), at the next level won.
 */
export function shouldOfferTour(p: TourSave, finishedLevel: number, daily: boolean): boolean {
  if (daily || p.tourCompleted || finishedLevel < TOUR_AFTER_LEVEL) return false;
  if (p.tourPostponedCount === 0) return true;
  return p.tourPostponedCount === 1 && finishedLevel === TOUR_AFTER_LEVEL + 1;
}

/** "Plus tard": the offer comes back once, after level 6. */
export const postponeTour = <P extends TourSave>(p: P): P => ({ ...p, tourPostponedCount: Math.min(MAX_POSTPONES + 1, p.tourPostponedCount + 1) });

/**
 * The end of the tour. The gift is given the first time only, and the coins are not scaled.
 */
export function finishTour<P extends TourSave & { coins: number }>(p: P): { profile: P; gift: number } {
  if (p.tourCompleted) return { profile: p, gift: 0 };
  return { profile: { ...p, tourCompleted: true, coins: p.coins + TOUR_GIFT_COINS }, gift: TOUR_GIFT_COINS };
}
