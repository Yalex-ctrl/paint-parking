jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import { MONETIZATION } from '../src/config/monetization';
import { defaultProfile, normalizeProfile, owns } from '../src/game/economy';
import { shouldShowInterstitial } from '../src/game/adRules';
import { viewOf } from '../src/game/lives';
import { wheelStatus } from '../src/game/rewards';
import { SHOP_ITEMS } from '../src/game/shopItems';
import {
  DAY_MS,
  MONTH_MS,
  autoOffer,
  canClaimVipDaily,
  claimVipDaily,
  enterGrace,
  expireVip,
  isVip,
  monthlyEquivalent,
  monthsEarned,
  normalizeVip,
  noteAutoOffer,
  noteRefusal,
  renewVip,
  showExpired,
  startVip,
  syncVipBalls,
  vipStatus,
  yearlySaving,
  type OfferContext,
} from '../src/game/vip';
import { formatEur, formatPercent, t } from '../src/i18n';
import { setAnalyticsImplementation } from '../src/services/analytics';
import { checkSubscription, claimVipBonus, refreshVip, restoreSubscription, setSubscriptionStore, subscribe, type SubscriptionStore } from '../src/services/subscription';
import { clearToastForTests } from '../src/services/toast';
import { freshProfileKeepingPurchases } from '../src/storage/reset';
import { getProfile, resetProfileForTests } from '../src/storage/profile';

const V = MONETIZATION.vip;
const T0 = Date.UTC(2026, 5, 1, 12);

describe('the plans', () => {
  it('are the two products of the brief: 3,99 € a month and 29,99 € a year, no trial', () => {
    expect(V.products.monthly).toMatchObject({ id: 'paintparking_vip_monthly', priceEur: 3.99 });
    expect(V.products.yearly).toMatchObject({ id: 'paintparking_vip_yearly', priceEur: 29.99 });
    expect(V.trialDays).toBe(0);
    expect(V.entitlement).toBe('vip');
    expect(V.dailyCoins).toBe(100);
    expect(V.balls).toHaveLength(12);
  });

  it('the yearly one is 2,50 € a month and 37 % cheaper', () => {
    expect(monthlyEquivalent('yearly')).toBeCloseTo(2.499, 3);
    expect(yearlySaving()).toBeCloseTo(0.37, 2);
    expect(formatEur(monthlyEquivalent('yearly'))).toMatch(/2[.,]50/);
    expect(formatPercent(yearlySaving())).toMatch(/37/);
  });

  it('the links are in the config, and "manage" goes to the Apple account', () => {
    expect(V.links.manage).toBe('https://apps.apple.com/account/subscriptions');
    expect(V.links.terms).toMatch(/^https:\/\//);
    expect(V.links.privacy).toMatch(/^https:\/\//);
  });
});

describe('the status of the pass', () => {
  it('is none, then active during the paid period, then expired', () => {
    let p = defaultProfile();
    expect(vipStatus(p.vip, T0)).toBe('none');
    p = startVip(p, 'monthly', T0);
    expect(vipStatus(p.vip, T0 + DAY_MS)).toBe('active');
    expect(isVip(p.vip, T0 + 29 * DAY_MS)).toBe(true);
    expect(vipStatus(p.vip, T0 + 31 * DAY_MS)).toBe('expired');
    expect(isVip(p.vip, T0 + 31 * DAY_MS)).toBe(false);
    expect(showExpired(p.vip, T0 + 31 * DAY_MS)).toBe(true);
    expect(showExpired(p.vip, T0 + DAY_MS)).toBe(false);
  });

  it('a yearly pass lasts a year; a renewal adds a period', () => {
    const y = startVip(defaultProfile(), 'yearly', T0);
    expect(y.vip.expiresAt).toBe(T0 + 365 * DAY_MS);
    const m = renewVip(startVip(defaultProfile(), 'monthly', T0), T0 + 29 * DAY_MS);
    expect(m.vip.expiresAt).toBe(T0 + 60 * DAY_MS);
  });

  it('keeps working during the grace period while the store retries, then stops', () => {
    let p = startVip(defaultProfile(), 'monthly', T0);
    const end = T0 + 31 * DAY_MS;
    p = enterGrace(expireVip(p, end), end);
    expect(vipStatus(p.vip, end + DAY_MS)).toBe('grace');
    expect(isVip(p.vip, end + DAY_MS)).toBe(true);
    expect(vipStatus(p.vip, end + (V.graceDays + 1) * DAY_MS)).toBe('expired');
  });

  it('is read back from a damaged save without breaking', () => {
    expect(normalizeVip(null)).toEqual(normalizeVip({}));
    expect(normalizeVip({ plan: 'weekly' as never, expiresAt: -5, ballsGiven: 99 }).ballsGiven).toBe(12);
    expect(normalizeProfile({ vip: 'x' as never }).vip.plan).toBeNull();
    expect(normalizeProfile(JSON.parse(JSON.stringify(startVip(defaultProfile(), 'yearly', T0)))).vip.plan).toBe('yearly');
  });
});

describe('what the pass gives', () => {
  const vip = startVip(defaultProfile(), 'monthly', T0);

  it('no forced ads (the rewarded ones stay possible)', () => {
    const ctx = { completedLevel: 40, sessionSeconds: 900, playSeconds: 5000, lastAdAt: null, lastEventAt: null };
    expect(shouldShowInterstitial(defaultProfile(), ctx, T0)).toBe(true);
    expect(shouldShowInterstitial(vip, ctx, T0 + DAY_MS)).toBe(false);
    expect(shouldShowInterstitial(vip, ctx, T0 + 40 * DAY_MS)).toBe(true); // lapsed: the ads are back
  });

  it('100 coins a day, once, with nothing piling up', () => {
    const today = '2026-06-01';
    expect(canClaimVipDaily(defaultProfile(), today, T0)).toBe(false); // not a subscriber
    const first = claimVipDaily(vip, today, T0)!;
    expect(first.coins).toBe(100);
    expect(first.profile.coins).toBe(100);
    expect(claimVipDaily(first.profile, today, T0)).toBeNull();
    // three days without taking it: still 100, not 300
    const later = claimVipDaily(first.profile, '2026-06-05', T0 + 4 * DAY_MS)!;
    expect(later.profile.coins).toBe(200);
  });

  it('infinite lives, with no countdown', () => {
    const empty = { ...defaultProfile().lives, count: 0, since: T0 };
    expect(viewOf(empty, T0).infinite).toBe(false);
    const v = viewOf(empty, T0, true);
    expect(v.infinite).toBe(true);
    expect(v.vip).toBe(true);
  });

  it('a second free spin of the wheel', () => {
    const r = defaultProfile().rewards;
    expect(wheelStatus(r, false)).toMatchObject({ freeLeft: 1, adLeft: 1 });
    expect(wheelStatus(r, true)).toMatchObject({ freeLeft: 2, adLeft: 0 });
  });
});

describe('the exclusive balls', () => {
  it('are twelve in the catalogue, found nowhere else', () => {
    const vipBalls = SHOP_ITEMS.filter((i) => i.exclusive === 'vip');
    expect(vipBalls.map((b) => b.id)).toEqual(V.balls);
    for (const b of vipBalls) expect(b.price).toBeUndefined();
  });

  it('one ball when the pass starts, then one for each month that is paid', () => {
    let p = startVip(defaultProfile(), 'yearly', T0);
    expect(p.vip.ballsGiven).toBe(1);
    expect(owns(p, V.balls[0])).toBe(true);
    expect(owns(p, V.balls[1])).toBe(false);
    // a month and a bit later (the app is opened): the second one
    let r = syncVipBalls(p, T0 + MONTH_MS + DAY_MS);
    expect(r.given).toEqual([V.balls[1]]);
    p = r.profile;
    // a year later: all twelve, not one more
    r = syncVipBalls(p, T0 + 400 * DAY_MS);
    expect(r.profile.vip.ballsGiven).toBe(12);
    expect(monthsEarned(r.profile.vip, T0 + 400 * DAY_MS)).toBeGreaterThanOrEqual(12);
    expect(syncVipBalls(r.profile, T0 + 800 * DAY_MS).given).toEqual([]);
  });

  it('a monthly pass gives the next one with each renewal', () => {
    let p = startVip(defaultProfile(), 'monthly', T0);
    p = renewVip(p, T0 + 29 * DAY_MS + 12 * 3_600_000);
    p = syncVipBalls(p, T0 + 31 * DAY_MS).profile;
    expect(p.vip.ballsGiven).toBe(2);
    expect(owns(p, V.balls[1])).toBe(true);
  });

  it('stay after cancelling, and the series goes on if the pass is taken again later', () => {
    let p = startVip(defaultProfile(), 'monthly', T0);
    const lapsed = T0 + 100 * DAY_MS;
    expect(isVip(p.vip, lapsed)).toBe(false);
    expect(owns(syncVipBalls(p, lapsed).profile, V.balls[0])).toBe(true);
    p = startVip(syncVipBalls(p, lapsed).profile, 'monthly', lapsed);
    expect(p.vip.ballsGiven).toBe(2); // the first month of the first run, the first month of the new one
    expect(owns(p, V.balls[0])).toBe(true);
    expect(owns(p, V.balls[1])).toBe(true);
  });
});

describe('"Remettre à zéro"', () => {
  it('does not erase the subscription, nor the balls it gave', () => {
    const p = startVip(defaultProfile(), 'yearly', T0);
    const fresh = freshProfileKeepingPurchases({ ...p, coins: 999 });
    expect(fresh.coins).toBe(0);
    expect(fresh.vip.plan).toBe('yearly');
    expect(fresh.vip.expiresAt).toBe(p.vip.expiresAt);
    expect(owns(fresh, V.balls[0])).toBe(true);
  });
});

describe('the offers of the pass', () => {
  const ctx = (patch: Partial<OfferContext> = {}): OfferContext => ({ completedLevel: 20, endsStep: true, inTour: false, inTutorial: false, sinceAdSec: null, ...patch });
  const player = { ...defaultProfile(), tourCompleted: true };

  it('comes once after level 20, at the end of a step', () => {
    expect(autoOffer(player, ctx(), T0)).toBe('auto_level20');
    expect(autoOffer(player, ctx({ endsStep: false }), T0)).toBeNull();
    expect(autoOffer(player, ctx({ completedLevel: 15 }), T0)).toBeNull();
  });

  it('never in the first levels, the tour, a tutorial, right after an ad, or to a subscriber', () => {
    expect(autoOffer(player, ctx({ completedLevel: 5 }), T0)).toBeNull();
    expect(autoOffer({ ...player, tourCompleted: false }, ctx(), T0)).toBeNull();
    expect(autoOffer(player, ctx({ inTour: true }), T0)).toBeNull();
    expect(autoOffer(player, ctx({ inTutorial: true }), T0)).toBeNull();
    expect(autoOffer(player, ctx({ sinceAdSec: 30 }), T0)).toBeNull();
    expect(autoOffer(startVip(player, 'monthly', T0), ctx(), T0 + DAY_MS)).toBeNull();
  });

  it('then at most every 7 days', () => {
    const shown = noteAutoOffer(player, T0);
    expect(autoOffer(shown, ctx({ completedLevel: 30 }), T0 + 6 * DAY_MS)).toBeNull();
    expect(autoOffer(shown, ctx({ completedLevel: 30 }), T0 + 7 * DAY_MS)).toBe('auto_weekly');
  });

  it('not right after a refused purchase or a closed paywall', () => {
    const refused = noteRefusal(player, T0);
    expect(autoOffer(refused, ctx(), T0 + 3 * DAY_MS)).toBeNull();
    expect(autoOffer(refused, ctx(), T0 + 8 * DAY_MS)).toBe('auto_level20');
  });
});

describe('the service (a fake store)', () => {
  const events: string[] = [];
  const fake = (outcome: 'purchased' | 'cancelled' | 'failed', ent: Awaited<ReturnType<SubscriptionStore['entitlement']>> = null): SubscriptionStore => ({
    purchase: async () => outcome,
    entitlement: async () => ent,
    restore: async () => ent,
  });
  beforeEach(() => {
    events.length = 0;
    resetProfileForTests(defaultProfile());
    clearToastForTests();
    setAnalyticsImplementation((e, params) => events.push(`${e}:${JSON.stringify(params ?? {})}`));
  });
  afterEach(() => setAnalyticsImplementation(null));

  it('buying starts the pass and tells the analytics', async () => {
    setSubscriptionStore(fake('purchased'));
    expect(await subscribe('yearly')).toBe(true);
    expect(isVip(getProfile().vip, Date.now())).toBe(true);
    expect(events).toContain('subscription_started:{"plan":"yearly"}');
    expect(events.some((e) => e.startsWith('vip_ball_unlocked'))).toBe(true);
  });

  it('a cancelled or failed purchase changes nothing', async () => {
    setSubscriptionStore(fake('cancelled'));
    expect(await subscribe('monthly')).toBe(false);
    setSubscriptionStore(fake('failed'));
    expect(await subscribe('monthly')).toBe(false);
    expect(isVip(getProfile().vip, Date.now())).toBe(false);
  });

  it('the daily bonus is taken once', async () => {
    setSubscriptionStore(fake('purchased'));
    await subscribe('monthly');
    expect(claimVipBonus()).toBe(100);
    expect(claimVipBonus()).toBeNull();
    expect(getProfile().coins).toBe(100);
    expect(events).toContain('vip_daily_claimed:{"coins":100}');
  });

  it('a check offline (the store knows nothing) keeps the cache; the store saying "no" ends it', async () => {
    setSubscriptionStore(fake('purchased'));
    await subscribe('monthly');
    setSubscriptionStore(fake('purchased', null));
    await checkSubscription();
    expect(isVip(getProfile().vip, Date.now())).toBe(true);
    setSubscriptionStore(fake('purchased', { active: false, plan: 'monthly', expiresAt: Date.now() - 1000, inGrace: false }));
    await checkSubscription();
    expect(isVip(getProfile().vip, Date.now())).toBe(false);
    expect(events.some((e) => e.startsWith('subscription_expired'))).toBe(true);
  });

  it('the pass that lapses by itself (time passes) is noticed once', async () => {
    setSubscriptionStore(fake('purchased'));
    await subscribe('monthly');
    refreshVip(Date.now() + 40 * DAY_MS);
    refreshVip(Date.now() + 41 * DAY_MS);
    expect(events.filter((e) => e.startsWith('subscription_expired'))).toHaveLength(1);
  });

  it('restoring finds a pass that is still running', async () => {
    setSubscriptionStore(fake('purchased', { active: true, plan: 'yearly', expiresAt: Date.now() + 100 * DAY_MS, inGrace: false }));
    expect(await restoreSubscription()).toBe(true);
    expect(getProfile().vip.plan).toBe('yearly');
    setSubscriptionStore(fake('purchased', null));
    resetProfileForTests(defaultProfile());
    expect(await restoreSubscription()).toBe(false);
  });
});

describe('the paywall and where it is offered (read in the code)', () => {
  const fs = require('fs');
  const path = require('path');
  const read = (f: string): string => fs.readFileSync(path.join(__dirname, '../src', f), 'utf8');

  it('shows what Apple asks for: the name, the benefits, the full prices, the renewal text, the two links, "Restaurer" and a cross at once', () => {
    const src = read('app/vip.tsx');
    expect(src).toContain("t('vip.title')");
    expect(src).toContain('VIP_BENEFITS');
    expect(src).toContain('planPrice');
    expect(src).toContain("t('vip.legal')");
    expect(src).toContain('MONETIZATION.vip.links.terms');
    expect(src).toContain('MONETIZATION.vip.links.privacy');
    expect(src).toContain("t('common.restore')");
    // the cross is there from the first frame: no timer, no delay before it
    expect(src).toContain("accessibilityLabel={t('common.close')}");
    expect(src).not.toMatch(/setTimeout[\s\S]{0,80}setClose|closeVisible|showClose/);
    // both plans can be chosen, the yearly one first and marked "Meilleure offre"
    expect(src).toMatch(/useState<VipPlan>\('yearly'\)/);
    expect(src).toContain("t('vip.best')");
    expect(src).toContain('vip.subscribeFor');
  });

  it('the legal text says it renews by itself, how to cancel, and the links of the config are real addresses', () => {
    expect(t('vip.legal')).toMatch(/automatiquement/);
    expect(t('vip.legal')).toMatch(/24 h/);
    expect(t('vip.legal')).toMatch(/Apple/);
    expect(t('vip.terms')).toBe('Conditions d’utilisation');
    expect(t('vip.privacy')).toBe('Politique de confidentialité');
  });

  it('is offered at the top of the offers, in the gifts (a locked row), and in the lives card', () => {
    const offers = read('components/ShopOffers.tsx');
    // the featured banners come in this order: starter pack, VIP pass, piggy bank
    expect(offers).toMatch(/starterOpen[\s\S]*'starter'[\s\S]*!vip[\s\S]*'vip'[\s\S]*breakable[\s\S]*'piggy'/);
    expect(offers).toContain("openVip('offres')");
    expect(read('app/gifts.tsx')).toContain("openVip('cadeaux')");
    expect(read('components/NoLivesCard.tsx')).toContain("source: 'vies'");
    expect(read('components/LivesModals.tsx')).toContain("source: 'vies'");
    expect(read('app/settings.tsx')).toContain("source: 'reglages'");
  });

  it('comes by itself only at the end of a step, never in the tour, the tutorials or the first levels', () => {
    const game = read('screens/GameScreen.tsx');
    expect(game).toContain('pendingPaywall');
    expect(game).toMatch(/autoOffer\([\s\S]*endsStep: true/);
    expect(game).toContain("pathname: '/vip'");
  });

  it('shows no VIP badge next to the titles or the coin counter, keeps the screen of the pass, and the tester tools', () => {
    expect(read('ui/ScreenHeader.tsx')).not.toContain('VipBadge');
    expect(read('components/LevelHud.tsx')).not.toContain('VipBadge');
    expect(read('components/VipCards.tsx')).not.toContain('VipBadge');
    // the heart says nothing under the infinity sign while the pass is on
    expect(read('ui/LivesPill.tsx')).toContain("v.vip ? ''");
    const tester = read('app/tester.tsx');
    for (const k of ['monthly', 'yearly', 'expire', 'renew', 'grace', 'reset']) expect(tester).toContain(`vip.dev.${k}`);
    expect(read('app/vip-account.tsx')).toContain('MONETIZATION.vip.links.manage');
  });
});
