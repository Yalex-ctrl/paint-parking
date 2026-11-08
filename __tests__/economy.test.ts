import { MONETIZATION } from '../src/config/monetization';
import {
  applyCoinPack,
  applyRestore,
  isPermanentProduct,
  applyProduct,
  applyRemoveAds,
  applyStarterPack,
  buyItem,
  canAffordHint,
  defaultProfile,
  doubleBonus,
  earnCoins,
  equipItem,
  finishLevel,
  grantItem,
  levelBonus,
  normalizeProfile,
  offerStarter,
  owns,
  payHint,
  pickUpCoin,
  shouldOfferStarter,
  spendCoins,
  starterRemainingMs,
} from '../src/game/economy';
import { DEFAULT_BALL, DEFAULT_PAINT, RARITY_PRICE, SHOP_ITEMS, itemById, itemsOfKind } from '../src/game/shopItems';

describe('profile', () => {
  it('starts empty with the default ball and paint owned and equipped', () => {
    const p = defaultProfile();
    expect(p.coins).toBe(0);
    expect(p.owned).toEqual([DEFAULT_BALL, DEFAULT_PAINT]);
    expect(p.equipped).toEqual({ ball: DEFAULT_BALL, paint: DEFAULT_PAINT });
  });

  it('normalizes partial or old saves, and never leaves an unowned item equipped', () => {
    expect(normalizeProfile(null)).toEqual(defaultProfile());
    const p = normalizeProfile({ coins: 12, owned: ['silver'], equipped: { ball: 'donut', paint: 'neon' } });
    expect(p.coins).toBe(12);
    expect(p.owned).toEqual(expect.arrayContaining([DEFAULT_BALL, DEFAULT_PAINT, 'silver']));
    expect(p.equipped).toEqual({ ball: DEFAULT_BALL, paint: DEFAULT_PAINT }); // donut / neon not owned
    expect(p.daily.streak).toBe(0); // missing sections come back with defaults
  });
});

describe('coins', () => {
  it('pays 1 / 2 / 3 coins for 1 / 2 / 3 stars, on top of the coins picked up', () => {
    expect([1, 2, 3].map((s) => levelBonus(s as 1 | 2 | 3))).toEqual([1, 2, 3]);
    const base = earnCoins(defaultProfile(), 7); // 7 coins picked up in the level
    const { profile, bonus } = finishLevel(base, 3);
    expect(bonus).toBe(3);
    expect(profile.coins).toBe(10);
    expect(profile.victories).toBe(1);
  });

  it('replaying only pays the improvement, so levels cannot be farmed', () => {
    const p = defaultProfile();
    expect(finishLevel(p, 3, 3).bonus).toBe(0);
    expect(finishLevel(p, 2, 3).bonus).toBe(0);
    expect(finishLevel(p, 3, 1).bonus).toBe(2); // 3 - 1
    expect(finishLevel(p, 1, 0).bonus).toBe(1);
    // the first five levels pay nothing at all
    expect(finishLevel(p, 3, 0, 5).bonus).toBe(0);
    expect(finishLevel(p, 3, 0, 6).bonus).toBe(3);
    expect(finishLevel(p, 3, 3).profile.victories).toBe(1); // still a victory
  });

  it('the x2 button doubles the bonus (it adds the bonus once more)', () => {
    const { profile, bonus } = finishLevel(defaultProfile(), 2);
    expect(bonus).toBe(2);
    expect(doubleBonus(profile, bonus).coins).toBe(4);
    expect(MONETIZATION.doubleMultiplier).toBe(2);
  });

  it('a coin in a level only counts the first time, and each coin on its own', () => {
    let p = defaultProfile();
    const a = pickUpCoin(p, 12, 0);
    expect(a.awarded).toBe(true);
    p = a.profile;
    expect(pickUpCoin(p, 12, 0).awarded).toBe(false); // replaying the level
    expect(pickUpCoin(p, 12, 0).profile.coins).toBe(1);
    expect(pickUpCoin(p, 12, 1).awarded).toBe(true); // another coin of the same level
    expect(pickUpCoin(p, 13, 0).awarded).toBe(true); // same index, another level
  });

  it('spending needs enough coins and never goes negative', () => {
    const p = earnCoins(defaultProfile(), 100);
    expect(spendCoins(p, 101)).toBeNull();
    expect(spendCoins(p, 100)!.coins).toBe(0);
    expect(earnCoins(p, -50).coins).toBe(100); // no negative gains
  });
});

describe('hints', () => {
  it('cost 60 coins, or are refused when the player cannot pay', () => {
    expect(MONETIZATION.hint.coinCost).toBe(60);
    const poor = earnCoins(defaultProfile(), 59);
    expect(canAffordHint(poor)).toBe(false);
    expect(payHint(poor)).toBeNull();
    const rich = earnCoins(defaultProfile(), 120);
    expect(canAffordHint(rich)).toBe(true);
    expect(payHint(rich)!.coins).toBe(60);
  });
});

describe('shop catalogue', () => {
  it('has about a dozen balls and 6 paints, with unique ids', () => {
    expect(itemsOfKind('ball').length).toBeGreaterThanOrEqual(12);
    expect(itemsOfKind('paint').length).toBeGreaterThanOrEqual(6);
    expect(new Set(SHOP_ITEMS.map((i) => i.id)).size).toBe(SHOP_ITEMS.length);
  });

  it('prices follow the rarity; defaults are free; exclusives cannot be bought', () => {
    for (const item of SHOP_ITEMS) {
      if (item.exclusive) {
        expect(item.price).toBeUndefined();
        expect(item.how).toBeTruthy();
      } else if (item.id === DEFAULT_BALL || item.id === DEFAULT_PAINT) {
        expect(item.price).toBeUndefined();
      } else {
        // The price sits in the range of the item's rarity.
        expect(item.price).toBeGreaterThanOrEqual(RARITY_PRICE[item.rarity][0]);
        expect(item.price).toBeLessThanOrEqual(RARITY_PRICE[item.rarity][1]);
      }
    }
  });

  it('the exclusive skins are the ones earned by streaks, the 7th daily reward and the starter pack', () => {
    const by = (rule: string) => SHOP_ITEMS.filter((i) => i.exclusive === rule).map((i) => i.id);
    expect(by('starter').sort()).toEqual([...MONETIZATION.products.starterPack.skins].sort());
    expect(by('day7')).toEqual([MONETIZATION.dailyReward.day7Skin]);
    expect(by('streak7')).toEqual([MONETIZATION.daily.skinMilestones[7]]);
    expect(by('streak30')).toEqual([MONETIZATION.daily.skinMilestones[30]]);
  });
});

describe('buying and equipping', () => {
  it('buys with coins, then owns, then can equip', () => {
    const p = earnCoins(defaultProfile(), 2000);
    const r = buyItem(p, 'silver');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.profile.coins).toBe(2000 - itemById('silver')!.price!);
    expect(owns(r.profile, 'silver')).toBe(true);
    const equipped = equipItem(r.profile, 'silver')!;
    expect(equipped.equipped.ball).toBe('silver');
    expect(equipped.equipped.paint).toBe(DEFAULT_PAINT); // paint untouched
  });

  it('refuses when poor, when already owned, for exclusives, for free items and unknown ids', () => {
    const p = earnCoins(defaultProfile(), 100);
    expect(buyItem(p, 'metallic')).toEqual({ ok: false, reason: 'coins' });
    expect(buyItem(p, 'gold')).toEqual({ ok: false, reason: 'owned' });
    expect(buyItem(p, 'disco')).toEqual({ ok: false, reason: 'exclusive' });
    expect(buyItem(p, 'nope')).toEqual({ ok: false, reason: 'unknown' });
    const bought = buyItem(earnCoins(p, 1000), 'pastel');
    expect(bought.ok).toBe(true);
    if (bought.ok) expect(buyItem(bought.profile, 'pastel')).toEqual({ ok: false, reason: 'owned' });
  });

  it('cannot equip what is not owned; granting is idempotent and ignores unknown ids', () => {
    const p = defaultProfile();
    expect(equipItem(p, 'donut')).toBeNull();
    const g = grantItem(p, 'moon');
    expect(grantItem(g, 'moon')).toBe(g);
    expect(grantItem(p, 'does-not-exist')).toBe(p);
    expect(equipItem(g, 'moon')!.equipped.ball).toBe('moon');
  });
});

describe('products (simulated purchases)', () => {
  it('"no ads" removes the interstitials', () => {
    expect(applyRemoveAds(defaultProfile()).adsRemoved).toBe(true);
    expect(applyProduct(defaultProfile(), MONETIZATION.products.removeAds.id)!.adsRemoved).toBe(true);
  });

  it('coin packs give 1000 / 3000 / 10000 coins', () => {
    const gains = MONETIZATION.products.coinPacks.map((pack) => applyCoinPack(defaultProfile(), pack.id)!.coins);
    expect(gains).toEqual([1000, 3000, 10000]);
    expect(applyCoinPack(defaultProfile(), 'paintparking_coins_999')).toBeNull();
    expect(applyProduct(defaultProfile(), 'whatever')).toBeNull();
  });

  it('the starter pack gives 1500 coins and 2 exclusive balls, and no longer "Sans pub"', () => {
    const p = applyStarterPack(defaultProfile());
    expect(p.adsRemoved).toBe(false);
    expect(p.coins).toBe(1500);
    for (const id of MONETIZATION.products.starterPack.skins) expect(owns(p, id)).toBe(true);
    expect(p.starter.purchased).toBe(true);
  });
});

describe('starter pack offer', () => {
  const HOUR = 3_600_000;

  it('is proposed once, right after the guided tour', () => {
    const p = defaultProfile();
    expect(shouldOfferStarter(p)).toBe(false); // the tour has not been done
    const toured = { ...p, tourCompleted: true };
    expect(shouldOfferStarter(toured)).toBe(true);
    const offered = offerStarter(toured, 1_000);
    expect(shouldOfferStarter(offered)).toBe(false); // never twice
    expect(shouldOfferStarter(applyStarterPack(toured))).toBe(false); // nor once bought
  });

  it('has a 48 h countdown that stops when bought or expired', () => {
    const p = offerStarter(defaultProfile(), 0);
    expect(starterRemainingMs(p, 0)).toBe(48 * HOUR);
    expect(starterRemainingMs(p, 47 * HOUR)).toBe(1 * HOUR);
    expect(starterRemainingMs(p, 48 * HOUR)).toBe(0);
    expect(starterRemainingMs(p, 100 * HOUR)).toBe(0);
    expect(starterRemainingMs(applyStarterPack(p), 10)).toBe(0);
    expect(starterRemainingMs(defaultProfile(), 0)).toBe(0); // never offered
  });
});

describe('restoring purchases', () => {
  it('brings back no-ads and the starter pack skins, but never the coins again', () => {
    const fresh = defaultProfile();
    const restored = applyRestore(fresh, [MONETIZATION.products.starterPack.id]);
    expect(restored.adsRemoved).toBe(false); // the starter pack no longer includes "Sans pub"
    expect(restored.coins).toBe(0);
    for (const id of MONETIZATION.products.starterPack.skins) expect(owns(restored, id)).toBe(true);
    expect(applyRestore(fresh, [MONETIZATION.products.removeAds.id]).adsRemoved).toBe(true);
    expect(applyRestore(fresh, ['paintparking_coins_1000']).coins).toBe(0); // consumable: nothing to restore
    expect(applyRestore(fresh, [])).toBe(fresh);
  });

  it('knows which products are permanent', () => {
    expect(isPermanentProduct('paintparking_no_ads')).toBe(true);
    expect(isPermanentProduct('paintparking_starter_pack')).toBe(true);
    expect(isPermanentProduct('paintparking_coins_500')).toBe(false);
  });
});
