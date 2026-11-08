jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));

import AsyncStorage from '@react-native-async-storage/async-storage';

import { MONETIZATION } from '../src/core/config/monetization';
import { defaultProfile, earnCoins, owns } from '../src/core/economy';
import { ads, registerMockAdHost, setAdsImplementation, type AdsService, type MockAdRequest } from '../src/core/services/ads';
import { setAnalyticsImplementation, track } from '../src/core/services/analytics';
import {
  listProducts,
  purchaseProduct,
  restorePurchases,
  setPurchasesImplementation,
  type PurchasesService,
} from '../src/core/services/purchases';
import { flushProfile, getProfile, loadProfile, resetProfileForTests, subscribeProfile, updateProfile } from '../src/core/storage/profile';

describe('analytics', () => {
  afterEach(() => setAnalyticsImplementation(null));

  it('logs to the console by default', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    track('level_start', { level: 3 });
    expect(spy).toHaveBeenCalledWith('[analytics] level_start', { level: 3 });
    spy.mockRestore();
  });

  it('can be replaced by a real provider, and a failing provider never breaks the game', () => {
    const seen: unknown[] = [];
    setAnalyticsImplementation((e, p) => seen.push([e, p]));
    track('hint_used', { level: 9, method: 'coins' });
    expect(seen).toEqual([['hint_used', { level: 9, method: 'coins' }]]);
    setAnalyticsImplementation(() => {
      throw new Error('provider down');
    });
    expect(() => track('purchase', { product: 'x' })).not.toThrow();
  });
});

describe('ads (mock)', () => {
  const events: string[] = [];
  beforeEach(() => {
    events.length = 0;
    setAnalyticsImplementation((e, p) => events.push(`${e}:${JSON.stringify(p)}`));
  });
  afterEach(() => setAnalyticsImplementation(null));

  it('without a screen to draw on, an ad simply succeeds', async () => {
    await expect(ads.showRewarded('hint')).resolves.toBe(true);
    await expect(ads.showInterstitial()).resolves.toBe(true);
    expect(events).toEqual([
      'rewarded_shown:{"placement":"hint"}',
      'rewarded_completed:{"placement":"hint"}',
      'ad_shown:{"type":"rewarded","placement":"hint"}',
      'ad_shown:{"type":"interstitial"}',
    ]);
  });

  it('is shown by the host for 3 seconds with its placement, and its result is what the game gets', async () => {
    let request: MockAdRequest | null = null;
    const unregister = registerMockAdHost((r) => (request = r));
    const watched = ads.showRewarded('daily_double');
    expect(request).toMatchObject({ kind: 'rewarded', placement: 'daily_double', seconds: MONETIZATION.mockAdSeconds });
    expect(MONETIZATION.mockAdSeconds).toBe(3);
    request!.resolve(true);
    await expect(watched).resolves.toBe(true);

    const skipped = ads.showRewarded('hint');
    request!.resolve(false);
    await expect(skipped).resolves.toBe(false);
    expect(events.filter((e) => e.startsWith('ad_shown'))).toHaveLength(1); // the skipped one was not shown
    unregister();
  });

  it('can be swapped for a real SDK without touching the callers', async () => {
    const real: AdsService = { init: async () => {}, showRewarded: async () => false, showInterstitial: async () => false };
    setAdsImplementation(real);
    await expect(ads.showRewarded('hint')).resolves.toBe(false);
    await expect(ads.showInterstitial()).resolves.toBe(false);
    expect(events).toEqual(['rewarded_shown:{"placement":"hint"}']); // asked, never shown or completed
  });
});

describe('purchases (mock)', () => {
  const answer = (outcome: 'purchased' | 'cancelled' | 'failed', restored: string[] = []): PurchasesService => ({
    init: async () => {},
    purchase: async () => outcome,
    restore: async () => restored,
  });

  beforeEach(async () => {
    await AsyncStorage.clear();
    resetProfileForTests(defaultProfile());
    setAnalyticsImplementation(() => {});
  });
  afterEach(() => setAnalyticsImplementation(null));

  it('sells no-ads, the starter pack and three coin packs, priced from the config', () => {
    const products = listProducts();
    expect(products.map((p) => p.id)).toEqual(['paintparking_no_ads', 'paintparking_starter_pack', 'paintparking_infinite_lives_1h', 'paintparking_infinite_lives_24h', 'paintparking_piggy_bank', 'paintparking_coins_1000', 'paintparking_coins_3000', 'paintparking_coins_10000']);
    expect(products[0].price).toMatch(/^5,99[\s ]€$/);
    expect(products.filter((p) => p.permanent).map((p) => p.id)).toEqual(['paintparking_no_ads', 'paintparking_starter_pack']);
  });

  it('sells unlimited lives for 24 hours', async () => {
    setPurchasesImplementation(answer('purchased'));
    expect(await purchaseProduct('paintparking_infinite_lives_24h')).toBe(true);
    expect(getProfile().lives.infiniteUntil).toBeGreaterThan(Date.now() + 23 * 3_600_000);
  });

  it('grants what was bought', async () => {
    setPurchasesImplementation(answer('purchased'));
    expect(await purchaseProduct('paintparking_no_ads')).toBe(true);
    expect(getProfile().adsRemoved).toBe(true);
    expect(await purchaseProduct('paintparking_coins_3000')).toBe(true);
    expect(getProfile().coins).toBe(3000);
    expect(await purchaseProduct('paintparking_starter_pack')).toBe(true);
    expect(getProfile().coins).toBe(4500);
    expect(owns(getProfile(), 'planet')).toBe(true);
  });

  it('changes nothing when the player cancels or the purchase fails', async () => {
    setPurchasesImplementation(answer('cancelled'));
    expect(await purchaseProduct('paintparking_coins_1000')).toBe(false);
    setPurchasesImplementation(answer('failed'));
    expect(await purchaseProduct('paintparking_no_ads')).toBe(false);
    expect(getProfile()).toEqual(defaultProfile());
  });

  it('restores the permanent purchases, not the coins', async () => {
    setPurchasesImplementation(answer('purchased', ['paintparking_no_ads', 'paintparking_starter_pack', 'paintparking_coins_1000']));
    expect(await restorePurchases()).toEqual(['paintparking_no_ads', 'paintparking_starter_pack', 'paintparking_coins_1000']);
    expect(getProfile().adsRemoved).toBe(true);
    expect(getProfile().coins).toBe(0);
    expect(owns(getProfile(), 'eye')).toBe(true);
  });
});

describe('profile store', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    resetProfileForTests(defaultProfile());
  });

  it("notifies subscribers when the profile changes, and not when it does not", () => {
    let calls = 0;
    const off = subscribeProfile(() => calls++);
    updateProfile((p) => earnCoins(p, 5));
    expect(calls).toBe(1);
    updateProfile((p) => p);
    expect(calls).toBe(1);
    off();
    updateProfile((p) => earnCoins(p, 5));
    expect(calls).toBe(1);
    expect(getProfile().coins).toBe(10);
  });

  it("is saved to AsyncStorage", async () => {
    updateProfile((p) => earnCoins(p, 42));
    await flushProfile();
    expect(JSON.parse((await AsyncStorage.getItem("paint-parking/profile/v1"))!).coins).toBe(42);
  });

  it("brings over the coins of the old wallet", async () => {
    jest.resetModules();
    const mod = require("@react-native-async-storage/async-storage");
    const storage = mod.default ?? mod;
    await storage.clear();
    await storage.setItem("paint-parking/wallet/v1", JSON.stringify({ coins: 37, collected: { 12: 3 } }));
    const fresh = require("../src/core/storage/profile") as typeof import("../src/core/storage/profile");
    const p = await fresh.loadProfile();
    expect(p.coins).toBe(37);
    expect(p.collectedCoins[12]).toBe(3);
  });
});
