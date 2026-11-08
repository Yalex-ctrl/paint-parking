jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import { MONETIZATION } from '../src/config/monetization';
import { defaultProfile, owns, type Profile } from '../src/game/economy';
import { PlayTimer } from '../src/game/playTimer';
import { createRng } from '../src/game/rng';
import {
  adBonuses,
  applyWheelPrize,
  canTry,
  claimAdBonus,
  claimFreeCoins,
  drawWheel,
  freeCoinsStatus,
  giftsWaiting,
  newlyReached,
  nextChestFraction,
  normalizeRewards,
  openChest,
  playChests,
  registerRewardedAd,
  registerUnlockAd,
  rewardedAdsLeft,
  rolloverRewards,
  startTrial,
  trialLevelDone,
  unlockStatus,
  wheelSlots,
  wheelStatus,
} from '../src/game/rewards';
import { SHOP_ITEMS } from '../src/game/shopItems';
import { ads, setAdsImplementation, type AdsService } from '../src/services/ads';
import { _setPlayClockForTests, playContext, resetPlayClockForTests } from '../src/services/playClock';
import { setAnalyticsImplementation } from '../src/services/analytics';
import { clearToastForTests, currentToast } from '../src/services/toast';
import { getProfile, resetProfileForTests, updateProfile } from '../src/storage/profile';
import { dayKeyOf } from '../src/game/dates';

const R = MONETIZATION.rewards;
const MIN = 60_000;
const today = (): string => dayKeyOf(new Date());
const withPlay = (p: Profile, seconds: number): Profile => ({ ...p, rewards: { ...p.rewards, playSeconds: seconds } });

describe('the clock of active play', () => {
  const timer = () => new PlayTimer(30_000);
  const ctx = { appActive: true, levelActive: true, blocked: false };

  it('counts the seconds after a swipe, up to 30 s of silence, and no more', () => {
    const t = timer();
    t.tick(0, ctx);
    t.swipe(0);
    let total = 0;
    for (let s = 1; s <= 45; s++) total += t.tick(s * 1000, ctx);
    expect(total).toBe(30); // thirty seconds after the swipe, then the player is idle
    t.swipe(46_000);
    expect(t.tick(47_000, ctx)).toBe(1.5); // (the gap since the last tick is capped)
  });

  it('does not count when the app is in the background, no level is on, or a menu, a pop-up, an ad or the tour hides the game', () => {
    const t = timer();
    t.tick(0, ctx);
    t.swipe(1000);
    expect(t.tick(2000, { ...ctx, appActive: false })).toBe(0);
    expect(t.tick(3000, { ...ctx, levelActive: false })).toBe(0);
    expect(t.tick(4000, { ...ctx, blocked: true })).toBe(0);
    expect(t.tick(5000, ctx)).toBe(1);
  });

  it('a long gap (the phone was asleep) counts for at most a second and a half', () => {
    const t = timer();
    t.tick(0, ctx);
    t.swipe(0);
    expect(t.tick(20_000, ctx)).toBe(1.5);
    t.skip(100_000);
    t.swipe(100_000);
    expect(t.tick(100_500, ctx)).toBeCloseTo(0.5, 5);
  });
});

describe('midnight', () => {
  it('starts every counter of the day again, and keeps the progress of the unlock and a running trial', () => {
    let p = defaultProfile();
    p = rolloverRewards(p, '2026-05-10');
    p = { ...withPlay(p, 1900), rewards: { ...withPlay(p, 1900).rewards, chestsOpened: [0], spins: 2, adsToday: 12, adBonusTaken: [0], trialsToday: 3, freeCoins: { count: 4, lastAt: 5 }, unlock: { index: 1, ads: 6, lastAt: 9, won: ['prism'] }, trial: { itemId: 'silver', kind: 'ball', levelsLeft: 2, restore: 'gold' } } };
    expect(rolloverRewards(p, '2026-05-10')).toBe(p); // the same day: nothing changes
    const next = rolloverRewards(p, '2026-05-11');
    expect(next.rewards.day).toBe('2026-05-11');
    expect(next.rewards.playSeconds).toBe(0);
    expect(next.rewards.chestsOpened).toEqual([]);
    expect(next.rewards.spins).toBe(0);
    expect(next.rewards.adsToday).toBe(0);
    expect(next.rewards.adBonusTaken).toEqual([]);
    expect(next.rewards.trialsToday).toBe(0);
    expect(next.rewards.freeCoins).toEqual({ count: 0, lastAt: 0 });
    expect(next.rewards.unlock).toEqual({ index: 1, ads: 6, lastAt: 9, won: ['prism'] });
    expect(next.rewards.trial?.itemId).toBe('silver');
  });

  it('a chest that was not opened is lost with the day', () => {
    let p = rolloverRewards(defaultProfile(), '2026-05-10');
    p = withPlay(p, 12 * 60);
    expect(playChests(p.rewards)[0].ready).toBe(true);
    p = rolloverRewards(p, '2026-05-11');
    expect(playChests(p.rewards).some((c) => c.ready)).toBe(false);
  });

  it('is saved and read back with care (a bad save never breaks it)', () => {
    expect(normalizeRewards(null).spins).toBe(0);
    expect(normalizeRewards({ spins: -4, adsToday: 'x' as never, chestsOpened: 'no' as never }).chestsOpened).toEqual([]);
    expect(normalizeRewards(JSON.parse(JSON.stringify(defaultProfile().rewards)))).toEqual(defaultProfile().rewards);
  });
});

describe('the chests of play time', () => {
  it('are three, at 10, 20 and 30 minutes of play', () => {
    expect(R.playChests.tiers.map((t) => t.minutes)).toEqual([10, 20, 30]);
    const coins = R.playChests.tiers.map((t) => t.coins);
    expect([...coins].sort((a, b) => a - b)).toEqual(coins); // the longer, the better
    expect(R.playChests.activeWindowSec).toBe(30);
  });

  it('are ready at their time, open once, and pay their coins', () => {
    let p = defaultProfile();
    expect(playChests(p.rewards).some((c) => c.ready)).toBe(false);
    p = withPlay(p, 10 * 60 - 1);
    expect(openChest(p, 0)).toBeNull();
    p = withPlay(p, 10 * 60);
    const opened = openChest(p, 0)!;
    const [c1, c2, c3] = R.playChests.tiers.map((t) => t.coins);
    expect(opened.coins).toBe(c1);
    expect(opened.profile.coins).toBe(c1);
    expect(openChest(opened.profile, 0)).toBeNull(); // once
    expect(openChest(opened.profile, 1)).toBeNull(); // the 20 minutes are not there yet
    const all = withPlay(opened.profile, 31 * 60);
    expect(openChest(all, 1)!.coins).toBe(c2);
    expect(openChest(openChest(all, 1)!.profile, 2)!.coins).toBe(c3);
  });

  it('the "x2" of a chest pays it twice', () => {
    const p = withPlay(defaultProfile(), 700);
    expect(openChest(p, 0, true)!.coins).toBe(2 * R.playChests.tiers[0].coins);
  });

  it('the ring of the button fills towards the next one', () => {
    const f = (s: number) => nextChestFraction(withPlay(defaultProfile(), s).rewards);
    expect(f(0)).toBe(0);
    expect(f(300)).toBeCloseTo(0.5, 5);
    expect(f(600)).toBeCloseTo(0, 5); // the first is reached: now towards the second
    expect(f(900)).toBeCloseTo(0.5, 5);
    expect(f(5000)).toBe(1);
  });
});

describe('free coins', () => {
  it('are paid for an ad, every 30 minutes, six times a day', () => {
    expect(R.freeCoins).toMatchObject({ intervalMin: 30, perDay: 6 });
    const each = R.freeCoins.coins;
    let p = defaultProfile();
    let now = 1_000_000;
    expect(freeCoinsStatus(p.rewards, now).available).toBe(true);
    for (let i = 0; i < 6; i++) {
      const next = claimFreeCoins(p, now);
      expect(next).not.toBeNull();
      p = next!;
      // too soon, and the countdown says how long
      expect(claimFreeCoins(p, now + 29 * MIN)).toBeNull();
      expect(freeCoinsStatus(p.rewards, now + 20 * MIN).waitMs).toBe(10 * MIN);
      now += 30 * MIN;
    }
    expect(p.coins).toBe(6 * each);
    expect(freeCoinsStatus(p.rewards, now).left).toBe(0);
    expect(claimFreeCoins(p, now + 600 * MIN)).toBeNull(); // six a day at most
  });
});

describe('the exclusive items won with ads', () => {
  it('need 10 ads each, at least 10 minutes apart, for 3 items in turn, then the section goes away', () => {
    expect(R.adUnlock.adsNeeded).toBe(10);
    expect(R.adUnlock.minIntervalMin).toBe(10);
    expect(R.adUnlock.items).toHaveLength(3);
    for (const id of R.adUnlock.items) {
      const item = SHOP_ITEMS.find((i) => i.id === id)!;
      expect(item.rarity).toBe('epic');
      expect(item.exclusive).toBe('ads'); // found nowhere else
    }
    let p = defaultProfile();
    let now = 5_000_000;
    const won: string[] = [];
    for (let item = 0; item < 3; item++) {
      for (let ad = 1; ad <= 10; ad++) {
        const s = unlockStatus(p.rewards, now);
        expect(s.active).toBe(true);
        expect(s.ads).toBe(ad - 1);
        const r = registerUnlockAd(p, now)!;
        // too soon after: refused, with the wait
        if (ad < 10) expect(registerUnlockAd(r.profile, now + 9 * MIN)).toBeNull();
        p = r.profile;
        if (r.unlocked) won.push(r.unlocked);
        now += 10 * MIN;
      }
    }
    expect(won).toEqual([...R.adUnlock.items]);
    for (const id of won) expect(owns(p, id)).toBe(true);
    expect(unlockStatus(p.rewards, now).active).toBe(false);
    expect(registerUnlockAd(p, now)).toBeNull();
  });
});

describe('the wheel of fortune', () => {
  it('has 8 slots whose weights make 100, a jackpot at 2 %, and a mean that is a few coins', () => {
    const slots = wheelSlots(true);
    expect(slots).toHaveLength(8);
    expect(slots.reduce((n, s) => n + s.weight, 0)).toBe(100);
    expect(slots.find((s) => s.id === 'jackpot')).toMatchObject({ amount: 150, weight: 2 });
    const mean = slots.filter((s) => s.kind === 'coins').reduce((n, s) => n + (s.amount * s.weight) / 100, 0);
    expect(mean).toBeGreaterThan(13);
    expect(mean).toBeLessThan(17);
  });

  it('draws the slots with the right frequencies over 100 000 spins', () => {
    const rng = createRng(2026);
    const counts = new Array<number>(8).fill(0);
    const N = 100_000;
    for (let i = 0; i < N; i++) counts[drawWheel(rng, true)]++;
    wheelSlots(true).forEach((s, i) => {
      const expected = s.weight / 100;
      const got = counts[i] / N;
      // within 4 sigma of the binomial
      const sigma = Math.sqrt((expected * (1 - expected)) / N);
      expect(Math.abs(got - expected)).toBeLessThan(4 * sigma);
    });
  });

  it('turns the lives slot into coins when lives are switched off', () => {
    const off = wheelSlots(false);
    expect(off).toHaveLength(8);
    expect(off.some((s) => s.kind === 'lives')).toBe(false);
    expect(off.filter((s) => s.kind === 'coins' && s.amount === R.wheel.livesOffCoins)).toHaveLength(2);
    const rng = createRng(7);
    for (let i = 0; i < 2000; i++) expect(wheelSlots(false)[drawWheel(rng, false)].kind).not.toBe('lives');
  });

  it('gives one free spin a day, then one for a rewarded ad: two in all', () => {
    let p = defaultProfile();
    expect(wheelStatus(p.rewards)).toEqual({ freeLeft: 1, adLeft: 1, next: 'free' });
    p = applyWheelPrize(p, 0, true, 1000).profile;
    expect(wheelStatus(p.rewards)).toEqual({ freeLeft: 0, adLeft: 1, next: 'ad' });
    p = applyWheelPrize(p, 0, true, 1000).profile;
    expect(wheelStatus(p.rewards)).toEqual({ freeLeft: 0, adLeft: 0, next: 'none' });
    expect(p.coins).toBe(2 * wheelSlots(true)[0].amount);
  });

  it('pays what the slot says: coins, a free hint, unlimited lives for 15 minutes (or 2 lives when they are already unlimited)', () => {
    const slots = wheelSlots(true);
    const idx = (id: string) => slots.findIndex((s) => s.id === id);
    const jackpot = applyWheelPrize(defaultProfile(), idx('jackpot'), true, 1000);
    expect(jackpot.profile.coins).toBe(150);
    expect(jackpot.prize).toMatchObject({ kind: 'coins', amount: 150 });
    const hint = applyWheelPrize(defaultProfile(), idx('hint'), true, 1000);
    expect(hint.profile.freeHints).toBe(1);
    const lives = applyWheelPrize(defaultProfile(), idx('lives'), true, 1000);
    expect(lives.profile.lives.infiniteUntil).toBe(1000 + 15 * MIN);
    const again = applyWheelPrize(lives.profile, idx('lives'), true, 2000);
    expect(again.prize).toMatchObject({ kind: 'lives', amount: 2 });
  });

  it('the result is drawn before the animation, which only ends on it', () => {
    const fs = require('fs');
    const path = require('path');
    const read = (f: string) => fs.readFileSync(path.join(__dirname, '../src', f), 'utf8');
    const panel = read('app/gifts.tsx');
    expect(panel).toMatch(/const slot = drawWheel\([\s\S]*wheel\.current\?\.spin\(slot,/);
    const wheel = read('components/Wheel.tsx');
    expect(wheel).toContain('runOnJS(tick)()'); // a click and a vibration at every slice
    expect(wheel).toMatch(/Easing\.out\(Easing\.cubic\)/); // fast, then slower and slower
  });
});

describe('trying a ball or a paint', () => {
  const find = (kind: 'ball' | 'paint') => SHOP_ITEMS.filter((i) => i.kind === kind && i.price !== undefined && !i.exclusive)[3];

  it('wears it for three levels, then puts the old equipment back', () => {
    const item = find('ball');
    let p = defaultProfile();
    expect(canTry(p, item.id)).toBe(true);
    p = startTrial(p, item.id)!;
    expect(p.equipped.ball).toBe(item.id);
    expect(owns(p, item.id)).toBe(false);
    let ended: { itemId: string } | null = null;
    for (let level = 1; level <= 3; level++) {
      const r = trialLevelDone(p);
      p = r.profile;
      ended = r.ended;
      if (level < 3) {
        expect(ended).toBeNull();
        expect(p.equipped.ball).toBe(item.id);
        expect(p.rewards.trial?.levelsLeft).toBe(3 - level);
      }
    }
    expect(ended).toEqual({ itemId: item.id });
    expect(p.equipped.ball).toBe('gold'); // back as it was
    expect(p.rewards.trial).toBeNull();
  });

  it('works for paints too, and keeps the item if it was bought meanwhile', () => {
    const paint = find('paint');
    let p = startTrial(defaultProfile(), paint.id)!;
    expect(p.equipped.paint).toBe(paint.id);
    p = { ...p, owned: [...p.owned, paint.id] };
    for (let i = 0; i < 3; i++) p = trialLevelDone(p).profile;
    expect(p.equipped.paint).toBe(paint.id);
  });

  it('one at a time, three a day, never an item that is owned or exclusive', () => {
    let p = defaultProfile();
    const items = SHOP_ITEMS.filter((i) => i.kind === 'ball' && i.price !== undefined && !i.exclusive).slice(2, 7);
    p = startTrial(p, items[0].id)!;
    expect(canTry(p, items[1].id)).toBe(false); // a trial is running
    expect(startTrial(p, items[1].id)).toBeNull();
    for (let i = 0; i < 3; i++) p = trialLevelDone(p).profile;
    p = startTrial(p, items[1].id)!;
    for (let i = 0; i < 3; i++) p = trialLevelDone(p).profile;
    p = startTrial(p, items[2].id)!;
    for (let i = 0; i < 3; i++) p = trialLevelDone(p).profile;
    expect(p.rewards.trialsToday).toBe(3);
    expect(canTry(p, items[3].id)).toBe(false); // three a day
    expect(canTry(rolloverRewards(p, '2099-01-01'), items[3].id)).toBe(true);
    const exclusive = SHOP_ITEMS.find((i) => i.exclusive === 'streak7')!;
    expect(canTry(defaultProfile(), exclusive.id)).toBe(false);
    expect(canTry({ ...defaultProfile(), owned: [...defaultProfile().owned, items[4].id] }, items[4].id)).toBe(false);
  });
});

describe('rewarded ads', () => {
  const real = (ok: boolean | 'throws'): AdsService => ({
    init: async () => {},
    showRewarded: async () => {
      if (ok === 'throws') throw new Error('no fill');
      return ok;
    },
    showInterstitial: async () => true,
  });
  beforeEach(() => {
    resetProfileForTests(defaultProfile());
    resetPlayClockForTests();
    clearToastForTests();
    setAnalyticsImplementation(() => {});
  });
  afterEach(() => setAnalyticsImplementation(null));

  it('give nothing when they are interrupted, and say so', async () => {
    setAdsImplementation(real(false));
    expect(await ads.showRewarded('free_coins')).toBe(false);
    expect(getProfile().rewards.adsToday).toBe(0);
    expect(currentToast()?.message).toBe('Pub interrompue, pas de récompense');
  });

  it('say so when there is no ad to show', async () => {
    setAdsImplementation(real('throws'));
    expect(await ads.showRewarded('hint')).toBe(false);
    expect(currentToast()?.message).toBe('Aucune pub disponible, réessaie plus tard');
    expect(getProfile().rewards.adsToday).toBe(0);
  });

  it('count only when watched to the end, and start the interstitial count again', async () => {
    _setPlayClockForTests({ total: 900, session: 900 });
    setAdsImplementation(real(true));
    expect(await ads.showRewarded('hint')).toBe(true);
    expect(getProfile().rewards.adsToday).toBe(1);
    expect(playContext().lastAdAt).toBe(900);
    // an interrupted one counts for nothing
    setAdsImplementation(real(false));
    await ads.showRewarded('hint');
    expect(getProfile().rewards.adsToday).toBe(1);
  });

  it('are capped at 30 a day, all sources together; after that "Reviens demain"', async () => {
    expect(R.rewardedAdsPerDay).toBe(30);
    setAdsImplementation(real(true));
    for (let i = 0; i < 30; i++) expect(await ads.showRewarded(i % 2 ? 'hint' : 'free_coins')).toBe(true);
    expect(rewardedAdsLeft(getProfile().rewards)).toBe(0);
    expect(await ads.showRewarded('hint')).toBe(false);
    expect(currentToast()?.message).toBe('Reviens demain');
    expect(getProfile().rewards.adsToday).toBe(30);
    // the next day it starts again
    updateProfile((p) => ({ ...p, rewards: { ...p.rewards, day: '1999-01-01' } }));
    expect(await ads.showRewarded('hint')).toBe(true);
    expect(getProfile().rewards.adsToday).toBe(1);
  });

  it('tell the analytics which placement, in the names of the brief', async () => {
    const seen: string[] = [];
    setAnalyticsImplementation((e, params) => seen.push(`${e}:${(params as { placement?: string })?.placement ?? ''}`));
    setAdsImplementation(real(true));
    await ads.showRewarded('double_reward');
    await ads.showRewarded('extra_life');
    await ads.showRewarded('keep_streak');
    await ads.showRewarded('daily_reward_double');
    expect(seen).toEqual(
      expect.arrayContaining(['rewarded_shown:chest_x2', 'rewarded_completed:chest_x2', 'rewarded_completed:life', 'rewarded_completed:streak', 'rewarded_completed:daily_reward_x2']),
    );
    expect(seen.filter((s) => s.startsWith('rewarded_completed'))).toHaveLength(4);
  });

  it('still work when "Sans pub" is bought', async () => {
    updateProfile((p) => ({ ...p, adsRemoved: true }));
    setAdsImplementation(real(true));
    expect(await ads.showRewarded('hint')).toBe(true);
  });
});

describe('the bonus of the ads of the day', () => {
  const after = (n: number): Profile => {
    let p = defaultProfile();
    for (let i = 0; i < n; i++) p = registerRewardedAd(p);
    return p;
  };

  it('has four steps, at 5, 10, 20 and 30 ads', () => {
    expect(R.adBonus.map((b) => b.ads)).toEqual([5, 10, 20, 30]);
    expect(R.adBonus[3].ads).toBe(R.rewardedAdsPerDay); // the last step is the daily cap
  });

  it('opens a step when it is reached, once', () => {
    const p = after(10);
    expect(adBonuses(p.rewards).map((b) => b.reached)).toEqual([true, true, false, false]);
    expect(claimAdBonus(after(4), 0)).toBeNull();
    const first = claimAdBonus(p, 0)!;
    expect(first.coins).toBe(R.adBonus[0].coins);
    expect(claimAdBonus(first.profile, 0)).toBeNull(); // once
    const second = claimAdBonus(first.profile, 1)!;
    expect(second.profile.coins).toBe(R.adBonus[0].coins + R.adBonus[1].coins);
    expect(claimAdBonus(second.profile, 2)).toBeNull();
  });

  it('says which step an ad has just reached', () => {
    expect(newlyReached(after(4).rewards, after(5).rewards).map((b) => b.ads)).toEqual([5]);
    expect(newlyReached(after(5).rewards, after(6).rewards)).toEqual([]);
    expect(newlyReached(after(9).rewards, after(10).rewards).map((b) => b.coins)).toEqual([R.adBonus[1].coins]);
  });

  it('starts again at midnight: what was not taken is lost', () => {
    const p = rolloverRewards(after(12), '2026-05-11');
    expect(p.rewards.adsToday).toBe(0);
    expect(adBonuses(p.rewards).every((b) => !b.reached && !b.taken)).toBe(true);
  });

  it('a toast tells that a step is waiting in the panel', async () => {
    const a4 = after(4);
    resetProfileForTests({ ...a4, rewards: { ...a4.rewards, day: today() } });
    clearToastForTests();
    setAdsImplementation({ init: async () => {}, showRewarded: async () => true, showInterstitial: async () => true });
    await ads.showRewarded('hint');
    expect(currentToast()?.message).toBe('Palier atteint ! Récupère ton bonus dans Cadeaux 🎁');
  });
});

describe('the dot of the Cadeaux button', () => {
  it('counts what is waiting: chests, the free spin, free coins, the daily reward, the steps of the bonus', () => {
    const p = rolloverRewards(defaultProfile(), '2026-05-10');
    // nothing but the free spin and the free coins on a fresh day
    expect(giftsWaiting(p, 1000, { dailyRewardReady: false })).toBe(2);
    expect(giftsWaiting(p, 1000, { dailyRewardReady: true })).toBe(3);
    const chests = withPlay(p, 25 * 60);
    expect(giftsWaiting(chests, 1000, { dailyRewardReady: false })).toBe(4);
    const used = { ...chests, rewards: { ...chests.rewards, spins: 2, freeCoins: { count: 6, lastAt: 0 }, adsToday: 10 } };
    expect(giftsWaiting(used, 1000, { dailyRewardReady: false })).toBe(2 + 2); // two chests, two steps of the bonus
  });
});
