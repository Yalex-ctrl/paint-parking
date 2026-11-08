import { SCORING } from '../src/config/scoring';
import { Chrono } from '../src/game/chrono';
import { isNewBestScore, levelScore, movePoints, roundScore, scoreLines, targetSeconds, timePoints, totalScore } from '../src/game/points';
import { defaultProfile } from '../src/game/economy';
import { settleDaily, settleVictory } from '../src/game/victory';

describe('the points of a level', () => {
  it('give 1000 for the moves at the optimum, and less the more moves are played', () => {
    expect(movePoints(7, 7)).toBe(1000);
    expect(movePoints(7, 14)).toBe(500);
    expect(movePoints(7, 28)).toBe(250);
    // an optimum found by a search is not always the true one: playing better than it never gives more than 1000
    expect(movePoints(7, 6)).toBe(1000);
  });

  it('give all the points of time up to the target time (3 s + 1.5 s per optimal move), then fall in a straight line to 0 at 3 times the target', () => {
    const optimum = 8;
    const target = targetSeconds(optimum);
    expect(target).toBe(15);
    expect(timePoints(optimum, 0)).toBe(1000);
    expect(timePoints(optimum, target)).toBe(1000);
    expect(timePoints(optimum, target * 2)).toBeCloseTo(500, 6);
    expect(timePoints(optimum, target * 3)).toBeCloseTo(0, 6);
    expect(timePoints(optimum, target * 10)).toBe(0);
  });

  it('multiply by the difficulty (1 + level / 100), round to ten, and take 30 % off when a hint was used', () => {
    const perfect = levelScore({ level: 50, optimum: 8, moves: 8, seconds: 10, hintUsed: false });
    expect(perfect.total).toBe(3000); // (1000 + 1000) x 1.5
    expect(perfect.perfect).toBe(true);
    const hinted = levelScore({ level: 50, optimum: 8, moves: 8, seconds: 10, hintUsed: true });
    expect(hinted.total).toBe(2100);
    expect(hinted.perfect).toBe(false);
    expect(roundScore(1234)).toBe(1230);
    expect(roundScore(1235)).toBe(1240);
    expect(SCORING.hintFactor).toBe(0.7);
  });

  it('three worked examples', () => {
    // level 20, 6 moves for an optimum of 5, 20 s (the target is 10.5 s)
    const a = levelScore({ level: 20, optimum: 5, moves: 6, seconds: 20, hintUsed: false });
    expect(a.movePoints).toBeCloseTo(833.33, 1);
    expect(a.timePoints).toBeCloseTo(1000 * (31.5 - 20) / 21, 1);
    expect(a.total).toBe(roundScore((a.movePoints + a.timePoints) * 1.2));
    // level 100, optimal and fast
    expect(levelScore({ level: 100, optimum: 12, moves: 12, seconds: 5, hintUsed: false }).total).toBe(4000);
    // level 200, twice the moves, twice the target time, with a hint
    const c = levelScore({ level: 200, optimum: 10, moves: 20, seconds: 36, hintUsed: true });
    expect(c.total).toBe(roundScore((500 + 500) * 3 * 0.7));
  });

  it('"Parfait" needs the optimum, the target time and no hint', () => {
    expect(levelScore({ level: 10, optimum: 4, moves: 4, seconds: targetSeconds(4), hintUsed: false }).perfect).toBe(true);
    expect(levelScore({ level: 10, optimum: 4, moves: 5, seconds: 1, hintUsed: false }).perfect).toBe(false);
    expect(levelScore({ level: 10, optimum: 4, moves: 4, seconds: targetSeconds(4) + 0.1, hintUsed: false }).perfect).toBe(false);
  });

  it('"Meilleur score" only when a score that already existed is beaten', () => {
    expect(isNewBestScore(2000, undefined)).toBe(false);
    expect(isNewBestScore(2000, 2000)).toBe(false);
    expect(isNewBestScore(2010, 2000)).toBe(true);
  });

  it('the detail lines tell the moves, the time, the multiplier and the hint', () => {
    const d = levelScore({ level: 50, optimum: 8, moves: 10, seconds: 20, hintUsed: true });
    const lines = scoreLines(d, 10, 8, 20);
    expect(lines.length).toBe(4);
    expect(lines[0]).toContain('minimum 8');
    expect(lines[2]).toContain('×1,50');
    expect(lines[3]).toContain('×0,7');
  });
});

describe('the chronometer', () => {
  it('starts at the first swipe, not before', () => {
    const c = new Chrono();
    expect(c.seconds(5000)).toBe(0);
    c.start(10_000);
    expect(c.seconds(13_000)).toBe(3);
    c.start(12_000); // a second swipe does not restart it
    expect(c.seconds(13_000)).toBe(3);
  });

  it('is paused by a menu, a pop-up or an ad, and stops at the exit', () => {
    const c = new Chrono();
    c.start(0);
    c.pause(2000);
    expect(c.seconds(9000)).toBe(2);
    c.resume(9000);
    expect(c.seconds(11_000)).toBe(4);
    c.pause(12_000);
    c.stop(20_000); // stopped while paused: the pause is not counted
    expect(c.seconds(99_000)).toBe(5);
    c.reset();
    expect(c.started).toBe(false);
  });
});

describe('what a won level changes in the profile', () => {
  const base = { moves: 6, optimum: 6, seconds: 8, hintUsed: false };

  it('pays nothing in the first five levels (the victory still counts)', () => {
    const r = settleVictory(defaultProfile(), { ...base, levelId: 3, stars: 3, previousStars: 0, picked: 0 });
    expect(r.bonus).toBe(0);
    expect(r.total).toBe(0);
    expect(r.profile.coins).toBe(0);
    expect(r.profile.victories).toBe(1);
    expect(r.profile.bestScores[3]).toBe(r.score.total);
  });

  it('pays the stars (1, 2, 3) and multiplies with the streak from level 6, rounding with the accumulator', () => {
    let p = defaultProfile();
    const totals: number[] = [];
    for (let n = 0; n < 6; n++) {
      const r = settleVictory(p, { ...base, levelId: 6 + n, stars: 3, previousStars: 0, picked: 2 });
      totals.push(r.total);
      p = r.profile;
    }
    // base 5 every time: x1 (streak 1), x1.25 (2, 3), x1.5 (4, 5, 6): 5, 6.25, 6.25, 7.5, 7.5, 7.5 -> the fractions are carried
    expect(totals.reduce((a, b) => a + b, 0)).toBe(Math.floor(5 + 6.25 + 6.25 + 7.5 * 3));
    expect(p.coins).toBe(totals.reduce((a, b) => a + b, 0) - 2 * 6); // the 2 coins picked each time were paid on the board
  });

  it('keeps the best score and says "new best" only on a level that already had one', () => {
    const first = settleVictory(defaultProfile(), { ...base, levelId: 10, stars: 3, previousStars: 0, picked: 0 });
    expect(first.newBestScore).toBe(false);
    const slower = settleVictory(first.profile, { ...base, seconds: 60, levelId: 10, stars: 3, previousStars: 3, picked: 0 });
    expect(slower.newBestScore).toBe(false);
    expect(slower.profile.bestScores[10]).toBe(first.score.total);
    const better = settleVictory({ ...first.profile, bestScores: { 10: 100 } }, { ...base, levelId: 10, stars: 3, previousStars: 3, picked: 0 });
    expect(better.newBestScore).toBe(true);
    expect(totalScore(better.profile.bestScores)).toBe(better.score.total);
  });

  it('the daily challenge keeps the best score of the day', () => {
    const a = settleDaily(defaultProfile(), { day: '2026-05-04', moves: 20, optimum: 20, seconds: 50, hintUsed: false });
    expect(a.score.total).toBeGreaterThan(0);
    expect(a.newBestScore).toBe(false);
    expect(a.profile.dailyScores['2026-05-04']).toBe(a.score.total);
    expect(a.result.coins).toBe(20);
  });
});
