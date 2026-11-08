import { readFileSync } from 'fs';
import { join } from 'path';

import { MONETIZATION } from '../src/config/monetization';
import { completeDaily, dailyCoins, claimDailyReward, rewardForDay } from '../src/game/daily';
import { applyCoinPack, applyProduct, applyStarterPack, defaultProfile, earnCoins, earnPlayed, finishLevel, normalizeProfile, peekEarning, scaledEarning } from '../src/game/economy';
import { fillPiggy, breakPiggy } from '../src/game/piggy';
import { chestCoins } from '../src/game/steps';
import { LEVELS } from '../src/game/levels';
import { DAILY_LEVELS } from '../src/game/dailyLevels';
import { ACTIVE_PLAYER, simulate, TYPICAL_PLAYER, VIP_PLAYER } from '../src/game/economySim';
import { SHOP_ITEMS } from '../src/game/shopItems';

const day = (n: number) => new Date(Date.UTC(2026, 4, 1 + n)).toISOString().slice(0, 10);

describe('what playing earns: every source, in coins', () => {
  it('the global multiplier is 1: every source is set directly', () => {
    expect(MONETIZATION.coinEarnMultiplier).toBe(1);
    expect(scaledEarning(30)).toEqual({ gained: 30, frac: 0 });
    expect(peekEarning(defaultProfile(), 100)).toBe(100);
    expect(earnPlayed(defaultProfile(), 7).gained).toBe(7);
  });

  it('the first five levels pay nothing: no stars bonus, no coins on the board, no chest', () => {
    expect(MONETIZATION.noGainUntilLevel).toBe(5);
    for (let id = 1; id <= 5; id++) expect(finishLevel(defaultProfile(), 3, 0, id).bonus).toBe(0);
    for (const l of LEVELS.filter((x) => x.id <= 5)) expect(l.features.coins).toHaveLength(0);
    expect(chestCoins(0)).toBe(15); // the amount of a chest; the first step has none (see GameScreen: steps from the second)
  });

  it('the stars bonus is 1, 2, 3; the chest 15; the daily challenge 20; the daily reward 10 to 40, then 100', () => {
    expect(MONETIZATION.levelBonus).toEqual({ 1: 1, 2: 2, 3: 3 });
    for (const step of [0, 1, 5, 40]) expect(chestCoins(step)).toBe(15);
    expect(dailyCoins(1)).toBe(20);
    expect(completeDaily(defaultProfile(), day(0)).coins).toBe(20);
    expect(MONETIZATION.dailyReward.coins).toEqual([10, 15, 20, 25, 30, 40]);
    expect(MONETIZATION.dailyReward.day7Coins).toBe(100);
    expect(rewardForDay(defaultProfile(), 1).coins).toBe(10);
    expect(claimDailyReward(defaultProfile(), day(0))!.reward.coins).toBe(10);
    expect(claimDailyReward(defaultProfile(), day(0), true)!.reward.coins).toBe(20); // the doubling comes after
  });

  it('coins caught outside the levels: 1 each, 5 a day at most', () => {
    expect(MONETIZATION.map.flyingCoinsPerDay).toBe(5);
    expect(MONETIZATION.map.giantCoinValue).toBe(1);
  });

  it('the leftover fraction of a gain is kept and normalised in the save', () => {
    const p = { ...defaultProfile(), coinFrac: 0.4 };
    expect(normalizeProfile(JSON.parse(JSON.stringify(p))).coinFrac).toBeCloseTo(0.4, 5);
    expect(normalizeProfile({ version: 2 }).coinFrac).toBe(0);
    expect(normalizeProfile({ version: 2, coinFrac: 7 }).coinFrac).toBeLessThan(1);
    expect(normalizeProfile({ version: 2, coinFrac: -1 }).coinFrac).toBe(0);
  });
});

describe('what is bought is not divided', () => {
  it('coin packs, the starter pack and the content of the piggy bank', () => {
    for (const pack of MONETIZATION.products.coinPacks) expect(applyCoinPack(defaultProfile(), pack.id)!.coins).toBe(pack.coins);
    expect(MONETIZATION.products.coinPacks.map((p) => [p.id, p.coins, p.priceEur])).toEqual([
      ['paintparking_coins_1000', 1000, 1.99],
      ['paintparking_coins_3000', 3000, 4.99],
      ['paintparking_coins_10000', 10000, 9.99],
    ]);
    const starter = applyStarterPack(defaultProfile());
    expect(starter.coins).toBe(defaultProfile().coins + 1500);
    expect(starter.adsRemoved).toBe(false);
    expect(MONETIZATION.products.starterPack.priceEur).toBe(2.99);
    expect(MONETIZATION.products.starterPack.skins).toHaveLength(2);
    let p = defaultProfile();
    p = { ...p, piggy: { ...p.piggy, coins: 1200 } };
    expect(breakPiggy(p)!.coins).toBe(p.coins + 1200);
    expect(applyProduct(p, MONETIZATION.piggy.product.id)!.coins).toBe(p.coins + 1200);
    expect(earnCoins(defaultProfile(), 1000).coins).toBe(defaultProfile().coins + 1000);
  });
});

describe('the piggy bank', () => {
  it('receives 100 % of what is earned, holds 3000, can be broken from 1000, for 2,99 €', () => {
    expect(MONETIZATION.piggy.share).toBe(1);
    expect(MONETIZATION.piggy.capacity).toBe(3000);
    expect(MONETIZATION.piggy.breakFrom).toBe(1000);
    expect(MONETIZATION.piggy.product.priceEur).toBe(2.99);
    expect(fillPiggy(defaultProfile(), 30).added).toBe(30);
  });
});

describe('the prices of the shop', () => {
  it('stay inside the range of their rarity, and the first purchase is possible on the first day', () => {
    const F = MONETIZATION.shop.priceFactor;
    const range = { common: [300 * F, 500 * F], rare: [1000 * F, 1500 * F], epic: [2500 * F, 4000 * F], legendary: [8000 * F, 12000 * F] } as const;
    for (const i of SHOP_ITEMS) if (i.price !== undefined) expect({ id: i.id, ok: i.price >= range[i.rarity][0] && i.price <= range[i.rarity][1] }).toEqual({ id: i.id, ok: true });
    const cheap = (kind: 'ball' | 'paint') => SHOP_ITEMS.filter((i) => i.kind === kind && i.rarity === 'common' && i.price !== undefined && i.price <= 350 * F);
    expect(cheap('ball').length).toBeGreaterThanOrEqual(4);
    expect(cheap('paint').length).toBeGreaterThanOrEqual(3);
    expect(SHOP_ITEMS.find((i) => i.id === 'gold')?.price).toBeUndefined();
    expect(SHOP_ITEMS.find((i) => i.id === 'classic')?.price).toBeUndefined();
  });
});

describe('the economy of a typical player', () => {
  it('earns about 11 coins a level and 510 a day; with the prices tripled: commons on day 2, rares around day 8, epics around day 23, legendaries around day 75', () => {
    const r = simulate({ ...TYPICAL_PLAYER, days: 150 });
    const avg = r.perDay.reduce((a, b) => a + b, 0) / r.perDay.length;
    expect(avg).toBeGreaterThan(450);
    expect(avg).toBeLessThan(570);
    expect(r.perLevel).toBeGreaterThan(9);
    expect(r.perLevel).toBeLessThan(13);
    expect(r.firstBuy.common!).toBeLessThanOrEqual(2);
    expect(r.firstBuy.rare!).toBeGreaterThanOrEqual(6);
    expect(r.firstBuy.rare!).toBeLessThanOrEqual(10);
    expect(r.firstBuy.epic!).toBeGreaterThanOrEqual(20);
    expect(r.firstBuy.epic!).toBeLessThanOrEqual(27);
    expect(r.firstBuy.legendary!).toBeGreaterThanOrEqual(68);
    expect(r.firstBuy.legendary!).toBeLessThanOrEqual(82);
  });

  it('a very active player (2 h a day, 30 ads, every gift) goes faster, but a legendary is never a matter of a few days', () => {
    const typical = simulate({ ...TYPICAL_PLAYER, days: 150 });
    const active = simulate({ ...ACTIVE_PLAYER, days: 150 });
    expect(active.firstBuy.legendary!).toBeLessThan(typical.firstBuy.legendary!);
    expect(active.firstBuy.legendary!).toBeGreaterThanOrEqual(30);
    expect(active.firstBuy.epic!).toBeGreaterThanOrEqual(10);
  });

  it('a subscriber of the VIP pass gets there sooner, but not before about day 45 for a legendary', () => {
    const typical = simulate({ ...TYPICAL_PLAYER, days: 150 });
    const vip = simulate({ ...VIP_PLAYER, days: 150 });
    expect(vip.firstBuy.legendary!).toBeLessThan(typical.firstBuy.legendary!);
    expect(vip.firstBuy.legendary!).toBeGreaterThanOrEqual(45);
  });
});

describe('boards carry one to three coins from level 6', () => {
  it('whole coins on the boards, none in the first five levels', () => {
    for (const l of LEVELS) expect(l.features.coins.length).toBeLessThanOrEqual(3);
    expect(DAILY_LEVELS.every((l) => l.features.coins.length >= 1 && l.features.coins.length <= 2)).toBe(true);
  });
});

describe('the game reads the config for these numbers', () => {
  const read = (f: string) => readFileSync(join(__dirname, '../src', f), 'utf8');
  it('the chest only comes from the second step, and the starter pack right after the tour', () => {
    const game = read('screens/GameScreen.tsx');
    expect(game).toMatch(/endsStep\(finishedId\) && stepOf\(finishedId\) >= 1/);
    expect(game).toMatch(/shouldOfferStarter\(getProfile\(\)\)/);
  });
});
