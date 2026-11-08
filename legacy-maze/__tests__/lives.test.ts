import { MONETIZATION } from '../src/core/config/monetization';
import {
  MAX_LIVES,
  REGEN_MS,
  addLifeFromAd,
  adLivesLeft,
  addLives,
  formatCountdown,
  freshLives,
  fullAt,
  grantInfinite,
  hasLife,
  lifeAtStake,
  loseLife,
  normalizeLives,
  refillLives,
  settle,
  skipMinutes,
  viewOf,
} from '../src/core/lives';
import { defaultProfile, normalizeProfile } from '../src/core/economy';
import { levelScoring, moveLimit, recomputeStars, starsFor, twoStarMoves } from '../src/game/scoring';
import { planNotification } from '../src/core/notificationPlan';

const T0 = 1_700_000_000_000;
const MIN = 60_000;

describe('lives: regeneration from timestamps', () => {
  it('starts full, loses one, and counts 30 minutes from the loss', () => {
    let s = freshLives();
    expect(viewOf(s, T0).count).toBe(5);
    expect(viewOf(s, T0).full).toBe(true);
    s = loseLife(s, T0)!;
    expect(viewOf(s, T0).count).toBe(4);
    expect(viewOf(s, T0 + 10 * MIN).nextInMs).toBe(20 * MIN);
    expect(viewOf(s, T0 + 29 * MIN).count).toBe(4);
    expect(viewOf(s, T0 + 30 * MIN).count).toBe(5);
    expect(viewOf(s, T0 + 30 * MIN).nextInMs).toBeNull();
  });

  it('comes back while the app is closed: several intervals at once, capped at 5', () => {
    let s = freshLives();
    for (let i = 0; i < 5; i++) s = loseLife(s, T0)!;
    expect(viewOf(s, T0).count).toBe(0);
    expect(loseLife(s, T0)).toBeNull();
    expect(viewOf(s, T0 + 95 * MIN).count).toBe(3); // 3 full intervals
    expect(viewOf(s, T0 + 95 * MIN).nextInMs).toBe(25 * MIN);
    expect(viewOf(s, T0 + 24 * 60 * MIN).count).toBe(MAX_LIVES);
    // the countdown keeps its rhythm after being settled
    const mid = settle(s, T0 + 45 * MIN);
    expect(mid.count).toBe(1);
    expect(viewOf(mid, T0 + 59 * MIN).count).toBe(1);
    expect(viewOf(mid, T0 + 60 * MIN).count).toBe(2);
  });

  it('losing a life while some are coming back does not restart the countdown', () => {
    let s = loseLife(freshLives(), T0)!;
    s = loseLife(s, T0 + 20 * MIN)!;
    expect(viewOf(s, T0 + 20 * MIN).count).toBe(3);
    expect(viewOf(s, T0 + 30 * MIN).count).toBe(4); // the first one is back on schedule
  });

  it('does not give lives when the clock of the device goes back', () => {
    let s = freshLives();
    for (let i = 0; i < 3; i++) s = loseLife(s, T0)!;
    s = settle(s, T0 + 31 * MIN); // one came back
    expect(s.count).toBe(3);
    // the clock is set back a day, then forward again to what was real time: nothing extra
    expect(viewOf(s, T0 - 24 * 60 * MIN).count).toBe(3);
    expect(viewOf(s, T0 + 31 * MIN).count).toBe(3);
    expect(viewOf(s, T0 + 60 * MIN).count).toBe(4);
    // a saved "since" that lies in the future (saved with a wrong clock) does not freeze things for ever
    const odd = settle({ ...freshLives(), count: 2, since: T0 + 10 * 24 * 60 * MIN, lastNow: T0 }, T0 + MIN);
    expect(odd.since).toBeLessThanOrEqual(T0 + MIN);
  });

  it('adds and refills, never above 5', () => {
    let s = freshLives();
    for (let i = 0; i < 4; i++) s = loseLife(s, T0)!;
    expect(viewOf(addLives(s, 2, T0), T0).count).toBe(3);
    expect(viewOf(addLives(s, 10, T0), T0).count).toBe(5);
    expect(viewOf(refillLives(s, T0), T0).full).toBe(true);
    expect(refillLives(s, T0).since).toBeNull();
  });
});

describe('lives: unlimited', () => {
  it('nothing is lost while unlimited, and the time left counts down', () => {
    let s = grantInfinite(freshLives(), 1, T0);
    expect(viewOf(s, T0).infinite).toBe(true);
    expect(viewOf(s, T0 + 20 * MIN).infiniteLeftMs).toBe(40 * MIN);
    s = loseLife(s, T0 + MIN)!;
    expect(viewOf(s, T0 + MIN).count).toBe(5);
    expect(viewOf(s, T0 + 61 * MIN).infinite).toBe(false);
    // more time is added to what is left
    const more = grantInfinite(grantInfinite(freshLives(), 1, T0), 24, T0 + 30 * MIN);
    expect(viewOf(more, T0 + 30 * MIN).infiniteLeftMs).toBe(30 * MIN + 24 * 60 * MIN);
  });

  it('lives can be played with at 0 when unlimited', () => {
    let s = freshLives();
    for (let i = 0; i < 5; i++) s = loseLife(s, T0)!;
    expect(hasLife(s, T0)).toBe(false);
    expect(hasLife(grantInfinite(s, 1, T0), T0)).toBe(true);
  });
});

describe('lives: ads, dev tools, countdown text', () => {
  it('an ad gives one life, three times a day', () => {
    let s = freshLives();
    for (let i = 0; i < 5; i++) s = loseLife(s, T0)!;
    for (let i = 0; i < MONETIZATION.lives.adLivesPerDay; i++) s = addLifeFromAd(s, '2026-05-10', T0)!;
    expect(viewOf(s, T0).count).toBe(3);
    expect(adLivesLeft(s, '2026-05-10')).toBe(0);
    expect(addLifeFromAd(s, '2026-05-10', T0)).toBeNull();
    expect(adLivesLeft(s, '2026-05-11')).toBe(3);
  });

  it('"skip 30 minutes" brings a life back', () => {
    let s = freshLives();
    s = loseLife(loseLife(s, T0)!, T0)!;
    expect(viewOf(skipMinutes(s, 30, T0), T0).count).toBe(4);
  });

  it('knows when all the lives will be back, and formats the countdown', () => {
    let s = freshLives();
    expect(fullAt(s, T0)).toBeNull();
    s = loseLife(loseLife(s, T0)!, T0)!;
    expect(fullAt(s, T0)).toBe(T0 + 2 * REGEN_MS);
    expect(formatCountdown(12 * MIN + 34_000)).toBe('12:34');
    expect(formatCountdown(3_723_000)).toBe('1:02:03');
    expect(formatCountdown(0)).toBe('00:00');
  });

  it('a profile always carries valid lives, older saves get 5', () => {
    expect(defaultProfile().lives.count).toBe(5);
    expect(normalizeProfile({ version: 2 }).lives.count).toBe(5);
    expect(normalizeLives({ count: 99 }).count).toBe(5);
    expect(normalizeLives({ count: -3 }).count).toBe(0);
    expect(normalizeProfile({ version: 2, lives: { ...freshLives(), count: 2, since: T0 } }).lives.count).toBe(2);
  });
});

describe('when a life is at stake', () => {
  it('not in levels 1-5, not in the daily challenge', () => {
    for (let id = 1; id <= 5; id++) expect(lifeAtStake(id, false)).toBe(false);
    expect(lifeAtStake(6, false)).toBe(true);
    expect(lifeAtStake(120, false)).toBe(true);
    expect(lifeAtStake(120, true)).toBe(false);
  });

  it('losing one for each of the three reasons costs exactly one (and stops at none)', () => {
    let s = freshLives();
    for (const reason of ['out of moves', 'restart', 'leave']) {
      const before = viewOf(s, T0).count;
      s = loseLife(s, T0)!;
      expect({ reason, lost: before - viewOf(s, T0).count }).toEqual({ reason, lost: 1 });
    }
  });
});

describe('move limit and stars', () => {
  it('no limit up to level 5; x2 to 50; x1.75 to 150; x1.5 after; rounded up, at least optimum + 3', () => {
    for (let id = 1; id <= 5; id++) expect(moveLimit(id, 10)).toBeNull();
    expect(moveLimit(6, 10)).toBe(20);
    expect(moveLimit(50, 10)).toBe(20);
    expect(moveLimit(51, 10)).toBe(18); // 17.5 up
    expect(moveLimit(150, 10)).toBe(18);
    expect(moveLimit(151, 10)).toBe(15);
    expect(moveLimit(500, 31)).toBe(47); // 46.5 up
    // the minimum margin of 3 on tiny optimums
    expect(moveLimit(6, 2)).toBe(5);
    expect(moveLimit(200, 2)).toBe(5);
    expect(moveLimit(200, 4)).toBe(7);
    expect(moveLimit(60, 4)).toBe(7);
    expect(moveLimit(10, 4)).toBe(8);
  });

  it('3 stars at the optimum, 2 up to x1.25 (rounded up, at least +1), 1 beyond', () => {
    expect(twoStarMoves(2)).toBe(3);
    expect(twoStarMoves(4)).toBe(5);
    expect(twoStarMoves(10)).toBe(13); // 12.5 up
    expect(twoStarMoves(30)).toBe(38); // 37.5 up
    for (const opt of [2, 4, 10, 30]) {
      expect(starsFor(opt - 1, opt)).toBe(3);
      expect(starsFor(opt, opt)).toBe(3);
      expect(starsFor(opt + 1, opt)).toBe(2);
      expect(starsFor(twoStarMoves(opt), opt)).toBe(2);
      expect(starsFor(twoStarMoves(opt) + 1, opt)).toBe(1);
    }
    expect(starsFor(14, 10)).toBe(1);
  });

  it('a limit always leaves room: the limit is above the optimum and above the 2-star line', () => {
    for (const opt of [2, 3, 4, 6, 10, 20, 30, 60]) {
      for (const id of [6, 50, 51, 150, 151, 400]) {
        const limit = moveLimit(id, opt)!;
        expect(limit).toBeGreaterThanOrEqual(opt + 3);
        expect(limit).toBeGreaterThan(twoStarMoves(opt));
      }
    }
    expect(levelScoring(20, 10)).toEqual({ minimum: 10, limit: 20, twoStars: 13 });
  });

  it('stars of an old save are worked out again from the best moves, or kept when unknown', () => {
    const stars = { 1: 3, 2: 2, 3: 1 } as Record<number, 1 | 2 | 3>;
    const moves = { 1: 12, 2: 9 };
    const optimal = (id: number) => (id === 1 ? 10 : id === 2 ? 10 : 8);
    // level 1: 12 moves for an optimum of 10 -> 2 stars (not the 3 it had); level 2: 9 -> 3; level 3: unknown, kept
    expect(recomputeStars(stars, moves, optimal)).toEqual({ 1: 2, 2: 3, 3: 1 });
  });
});

describe('notification when lives are full again', () => {
  it('the daily notification is untouched by the lives', () => {
    const p = defaultProfile();
    expect(planNotification(p, new Date(2026, 4, 10, 9, 0))?.kind).toBe('challenge');
  });
});
