jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import { MONETIZATION } from '../src/core/config/monetization';
import { applyProduct, defaultProfile, earnCoins, normalizeProfile } from '../src/core/economy';
import { breakPiggy, canBreakPiggy, coinsUntilBreakable, fillPiggy, fillRatio, fullPopupDue, isPiggyFull, markFullPopupShown, piggyShare } from '../src/core/piggy';
import {
  HEAVY_IMPACT_FROM,
  MAX_PER_SECOND,
  MAX_VOICES,
  PLIP_NOTES,
  RateLimiter,
  STAR_NOTES,
  VoiceBudget,
  impactVolume,
  plipIndex,
  slideThrill,
  slideWord,
} from '../src/game/soundRules';
import { multiplierOf, protectionOffered, resetStreak, saveWithAd, saveWithCoins, scaleCoins, scaleWithStreak, tierOf, winLevel } from '../src/core/streak';
import { freshProfileKeepingPurchases } from '../src/core/storage/reset';

describe('win streak multiplier', () => {
  it('x1 for 0-1, x1.25 for 2-3, x1.5 for 4-6, x2 from 7 (and never more)', () => {
    const table: [number, number][] = [[0, 1], [1, 1], [2, 1.25], [3, 1.25], [4, 1.5], [5, 1.5], [6, 1.5], [7, 2], [12, 2], [50, 2]];
    for (const [streak, mult] of table) expect({ streak, mult: multiplierOf(streak) }).toEqual({ streak, mult });
    expect([0, 1, 2, 3, 4, 6, 7].map(tierOf)).toEqual([0, 0, 1, 1, 2, 2, 3]);
  });

  it('scales the coins of a level, rounded to a whole coin', () => {
    expect(scaleCoins(20, 5)).toBe(30);
    expect(scaleCoins(20, 1)).toBe(20);
    expect(scaleCoins(15, 2)).toBe(19); // 18.75
    expect(scaleCoins(20, 9)).toBe(40); // x2, the top
    expect(scaleCoins(0, 9)).toBe(0);
  });

  it('loses nothing to the rounding: the fraction is carried by the profile', () => {
    let p = defaultProfile();
    let total = 0;
    for (let n = 0; n < 8; n++) {
      const r = scaleWithStreak(p, 5, 2); // 5 x 1.25 = 6.25
      p = r.profile;
      total += r.total;
    }
    expect(total).toBe(50); // 8 x 6.25
    expect(scaleWithStreak(defaultProfile(), 0, 9).total).toBe(0);
    expect(scaleWithStreak(defaultProfile(), 1, 1).total).toBe(1);
  });

  it('every win adds one, remembers the best, and says when a tier is reached', () => {
    let p = defaultProfile();
    const tiers: boolean[] = [];
    for (let i = 0; i < 8; i++) {
      const step = winLevel(p);
      p = step.profile;
      tiers.push(step.tierUp);
    }
    expect(p.winStreak.current).toBe(8);
    expect(p.winStreak.best).toBe(8);
    // wins 2, 4 and 7 reach a new tier
    expect(tiers).toEqual([false, true, false, true, false, false, true, false]);
  });

  it('goes back to 0 when a life is lost (whatever the reason), keeping the best', () => {
    let p = defaultProfile();
    for (let i = 0; i < 5; i++) p = winLevel(p).profile;
    // out of moves + give up, restart after a move, leaving a started level: all end in resetStreak
    for (const reason of ['out of moves', 'restart', 'leave']) {
      const r = resetStreak(p);
      expect({ reason, lost: r.lost, now: r.profile.winStreak.current, best: r.profile.winStreak.best }).toEqual({ reason, lost: 5, now: 0, best: 5 });
    }
    expect(resetStreak(defaultProfile()).lost).toBe(0);
  });

  it('asks before losing a streak of 3 or more, not before', () => {
    let p = defaultProfile();
    for (let i = 0; i < 2; i++) p = winLevel(p).profile;
    expect(protectionOffered(p)).toBe(false);
    p = winLevel(p).profile;
    expect(protectionOffered(p)).toBe(true);
  });

  it('can be kept for one rewarded ad a day, or for 200 coins', () => {
    const p = defaultProfile();
    const once = saveWithAd(p, '2026-05-10')!;
    expect(once).not.toBeNull();
    expect(saveWithAd(once, '2026-05-10')).toBeNull();
    expect(saveWithAd(once, '2026-05-11')).not.toBeNull();
    expect(saveWithCoins(p)).toBeNull();
    const rich = earnCoins(p, 250);
    const paid = saveWithCoins(rich)!;
    expect(paid.coins).toBe(250 - MONETIZATION.streak.saveCoinCost);
  });

  it('survives a restart of the app, and "Remettre à zéro" empties it', () => {
    let p = defaultProfile();
    for (let i = 0; i < 4; i++) p = winLevel(p).profile;
    const reloaded = normalizeProfile(JSON.parse(JSON.stringify(p)));
    expect(reloaded.winStreak.current).toBe(4);
    expect(freshProfileKeepingPurchases(p).winStreak).toEqual({ current: 0, best: 0, adDay: null });
  });
});

describe('piggy bank', () => {
  it('gets 100 % of the coins earned in a level, on top of them', () => {
    expect(piggyShare(40)).toBe(40);
    expect(piggyShare(41)).toBe(41);
    const p = defaultProfile();
    const { profile, added } = fillPiggy(p, 40);
    expect(added).toBe(40);
    expect(profile.piggy.coins).toBe(40);
    expect(profile.coins).toBe(p.coins); // nothing was taken from the player
  });

  it('stops filling at 3000', () => {
    let p = defaultProfile();
    p = { ...p, piggy: { ...p.piggy, coins: 2990 } };
    const r = fillPiggy(p, 100);
    expect(r.added).toBe(10);
    expect(r.profile.piggy.coins).toBe(MONETIZATION.piggy.capacity);
    expect(isPiggyFull(r.profile)).toBe(true);
    expect(fillPiggy(r.profile, 100).added).toBe(0);
    expect(fillRatio(r.profile)).toBe(1);
  });

  it('can be broken from 1000 coins only, gives everything and starts again from 0', () => {
    let p = defaultProfile();
    p = { ...p, piggy: { ...p.piggy, coins: 999 } };
    expect(canBreakPiggy(p)).toBe(false);
    expect(coinsUntilBreakable(p)).toBe(1);
    expect(breakPiggy(p)).toBeNull();
    expect(applyProduct(p, MONETIZATION.piggy.product.id)).toBeNull();
    p = { ...p, piggy: { ...p.piggy, coins: 1240 }, coins: 10 };
    expect(canBreakPiggy(p)).toBe(true);
    const broken = applyProduct(p, MONETIZATION.piggy.product.id)!;
    expect(broken.coins).toBe(1250);
    expect(broken.piggy.coins).toBe(0);
  });

  it('the "full" pop-up comes once a day, and only when it is full', () => {
    let p = defaultProfile();
    expect(fullPopupDue(p, '2026-05-10')).toBe(false);
    p = { ...p, piggy: { ...p.piggy, coins: 3000 } };
    expect(fullPopupDue(p, '2026-05-10')).toBe(true);
    p = markFullPopupShown(p, '2026-05-10');
    expect(fullPopupDue(p, '2026-05-10')).toBe(false);
    expect(fullPopupDue(p, '2026-05-11')).toBe(true);
  });

  it('is kept across a restart, and emptied by "Remettre à zéro"', () => {
    let p = defaultProfile();
    p = fillPiggy(p, 600).profile;
    const reloaded = normalizeProfile(JSON.parse(JSON.stringify(p)));
    expect(reloaded.piggy.coins).toBe(600);
    expect(freshProfileKeepingPurchases(p).piggy.coins).toBe(0);
    // an old save with no piggy bank
    expect(normalizeProfile({ version: 2 }).piggy.coins).toBe(0);
  });
});

describe('sound rules', () => {
  it('the plip climbs a note per tile over 12 notes, and stays on the top one', () => {
    expect([0, 1, 2, 11].map(plipIndex)).toEqual([0, 1, 2, 11]);
    expect(plipIndex(12)).toBe(PLIP_NOTES - 1);
    expect(plipIndex(40)).toBe(11);
    expect(plipIndex(-3)).toBe(0);
    expect(STAR_NOTES.every((n, i) => i === 0 || n > STAR_NOTES[i - 1])).toBe(true); // the stars go up
  });

  it('a wall hit is louder after a long slide, heavy from 5 tiles', () => {
    expect(impactVolume(1)).toBeLessThan(impactVolume(4));
    expect(impactVolume(30)).toBe(1);
    expect(HEAVY_IMPACT_FROM).toBe(5);
  });

  it('words and thrill: "Super !" at 6, "Génial !" at 9, "Incroyable !" from 12', () => {
    expect([5, 6, 8, 9, 11, 12, 20].map(slideWord)).toEqual([null, 'Super !', 'Super !', 'Génial !', 'Génial !', 'Incroyable !', 'Incroyable !']);
    expect([5, 6, 9, 12].map(slideThrill)).toEqual([0, 1, 2, 3]);
  });

  it('lets the same sound through at most 20 times a second', () => {
    const l = new RateLimiter();
    let ok = 0;
    for (let i = 0; i < 40; i++) if (l.allow('plip', 1000 + i * 5)) ok++;
    expect(ok).toBe(MAX_PER_SECOND);
    expect(l.allow('plip', 2100)).toBe(true); // a second later
    expect(l.allow('coin', 1100)).toBe(true); // another sound is not affected
  });

  it('plays at most 8 sounds at once, the more important ones first', () => {
    const b = new VoiceBudget();
    for (let i = 0; i < MAX_VOICES; i++) expect(b.request(1000, 500, 1)).toBe(true);
    expect(b.request(1000, 500, 1)).toBe(false); // nothing more important than what plays
    expect(b.request(1000, 500, 9)).toBe(true); // a jingle takes the place of a plip
    expect(b.count).toBe(MAX_VOICES);
    expect(b.request(2000, 500, 1)).toBe(true); // they have all ended
  });
});
