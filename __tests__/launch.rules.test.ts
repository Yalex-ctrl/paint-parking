import { livesOn, moveLimitOn, resetFeatureOverrides, setFeatureOverride } from '../src/config/features';
import { adsBannerHeight, features } from '../src/config/app';
import { MONETIZATION } from '../src/config/monetization';
import { failureCostsStreak, lifeCosts } from '../src/game/lives';
import { activeLimit, starsFor } from '../src/game/scoring';
import { LEVELS_PER_STEP, chestCoins, endsStep, stepDots, stepLevels, stepOf } from '../src/game/steps';

afterEach(() => resetFeatureOverrides());

describe('steps (they replace the map)', () => {
  it('five levels a step, a chest at the end of each', () => {
    expect(LEVELS_PER_STEP).toBe(5);
    expect([1, 5, 6, 10, 11].map(stepOf)).toEqual([0, 0, 1, 1, 2]);
    expect(stepLevels(1)).toEqual([6, 7, 8, 9, 10]);
    expect([4, 5, 9, 10].map(endsStep)).toEqual([false, true, false, true]);
  });

  it('one dot per level: done with stars, the current one, the rest to do', () => {
    const dots = stepDots(8, { 6: 3, 7: 2 });
    expect(dots.map((d) => d.state)).toEqual(['done', 'done', 'current', 'todo', 'todo']);
    // a level just finished is done (the next one becomes the current one when it starts)
    expect(stepDots(8, { 6: 3, 7: 1, 8: 1 }).map((d) => d.state)).toEqual(['done', 'done', 'done', 'todo', 'todo']);
  });

  it('the chest grows a little with the steps, and is capped', () => {
    expect(chestCoins(0)).toBe(MONETIZATION.steps.chestCoins);
    expect(chestCoins(3)).toBe(MONETIZATION.steps.chestCoins + 3 * MONETIZATION.steps.chestGrowth);
    expect(chestCoins(500)).toBe(MONETIZATION.steps.chestMax);
  });
});

describe('config', () => {
  it('the map is put aside, the ad banner has its room, "Sans pub" costs 5,99 €', () => {
    expect(features.levelMap).toBe(false);
    expect(adsBannerHeight).toBe(60);
    expect(MONETIZATION.products.removeAds.priceEur).toBe(5.99);
  });
});

describe('the four combinations of lives and move limit', () => {
  const cases: [boolean, boolean][] = [[true, true], [true, false], [false, true], [false, false]];

  it.each(cases)('lives %s, move limit %s', (lives, limit) => {
    setFeatureOverride({ lives, moveLimit: limit });
    expect(livesOn()).toBe(lives);
    expect(moveLimitOn()).toBe(limit);
    const optimal = 10;
    // The move limit: there, or not at all (never in the first levels or the daily challenge).
    expect(activeLimit(20, optimal, false)).toBe(limit ? 20 : null);
    expect(activeLimit(3, optimal, false)).toBeNull();
    expect(activeLimit(20, optimal, true)).toBeNull();
    // A life: only with lives, and not in the first levels or the daily challenge.
    expect(lifeCosts(20, false)).toBe(lives);
    expect(lifeCosts(3, false)).toBe(false);
    expect(lifeCosts(20, true)).toBe(false);
    // The streak is lost by failing: with lives when a life is lost, without them whenever a level can be failed.
    expect(failureCostsStreak(20, false)).toBe(true);
    expect(failureCostsStreak(20, true)).toBe(false);
    expect(failureCostsStreak(3, false)).toBe(lives ? false : true);
    // The stars do not depend on any of it.
    expect(starsFor(10, 10)).toBe(3);
    expect(starsFor(13, 10)).toBe(2);
    expect(starsFor(14, 10)).toBe(1);
  });
});
