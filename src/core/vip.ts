import { MONETIZATION } from './config/monetization';
import type { DayKey } from './dates';
import { earnCoins, grantItem, type Profile } from './economy';

/**
 * The VIP pass: the state kept on the device and every rule on it, pure like the rest of the economy. The truth is the store's
 * (the "vip" entitlement of RevenueCat); what is written here is a cache, so the pass keeps working offline and a check at launch
 * and when the app comes back to the front only brings it up to date (services/subscription.ts).
 */
export type VipPlan = 'monthly' | 'yearly';
export type VipStatus = 'none' | 'active' | 'grace' | 'expired';

export type VipState = {
  plan: VipPlan | null;
  /** End of the paid period (ms); 0 when there never was a pass. */
  expiresAt: number;
  /** While the store retries a payment that failed: the pass still works until then. 0 = not in grace. */
  graceUntil: number;
  /** Start of the current run of the pass (ms); the balls of the months are counted from it. */
  startedAt: number;
  /** Months of earlier runs (the balls they gave are kept and the series goes on). */
  monthsBefore: number;
  /** How many of the twelve balls were given. */
  ballsGiven: number;
  /** The day the 100 coins were last taken. */
  dailyClaim: DayKey | null;
  /** The "Ton Pass VIP a expiré" card was seen. */
  expiredSeen: boolean;
  /** Paywalls: when the last automatic one was shown (ms), and when the last offer was turned down (ms). */
  lastAutoOfferAt: number;
  lastRefusalAt: number;
  autoOffers: number;
  /** The last status that was seen was a working pass (to notice the moment it lapses, once). */
  live: boolean;
  /** The test tools made the pass expire: the simulated store does not renew it by itself (see `autoRenewSimulated`). */
  expiredByTools: boolean;
};

export const freshVip = (): VipState => ({
  plan: null,
  expiresAt: 0,
  graceUntil: 0,
  startedAt: 0,
  monthsBefore: 0,
  ballsGiven: 0,
  dailyClaim: null,
  expiredSeen: false,
  lastAutoOfferAt: 0,
  lastRefusalAt: 0,
  autoOffers: 0,
  live: false,
  expiredByTools: false,
});

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);

export function normalizeVip(raw: Partial<VipState> | null | undefined): VipState {
  const d = freshVip();
  if (!raw || typeof raw !== 'object') return d;
  return {
    plan: raw.plan === 'monthly' || raw.plan === 'yearly' ? raw.plan : null,
    expiresAt: num(raw.expiresAt),
    graceUntil: num(raw.graceUntil),
    startedAt: num(raw.startedAt),
    monthsBefore: Math.floor(num(raw.monthsBefore)),
    ballsGiven: Math.min(MONETIZATION.vip.balls.length, Math.floor(num(raw.ballsGiven))),
    dailyClaim: typeof raw.dailyClaim === 'string' ? raw.dailyClaim : null,
    expiredSeen: raw.expiredSeen === true,
    lastAutoOfferAt: num(raw.lastAutoOfferAt),
    lastRefusalAt: num(raw.lastRefusalAt),
    autoOffers: Math.floor(num(raw.autoOffers)),
    live: raw.live === true,
    expiredByTools: raw.expiredByTools === true,
  };
}

export const DAY_MS = 86_400_000;
export const MONTH_MS = 30 * DAY_MS;

export function vipStatus(v: VipState, now: number): VipStatus {
  if (v.plan === null && v.expiresAt === 0) return 'none';
  if (now < v.expiresAt) return 'active';
  if (v.graceUntil > now) return 'grace';
  return 'expired';
}

/** The pass works (paid period, or grace while the store retries). */
export const isVip = (v: VipState, now: number): boolean => {
  const s = vipStatus(v, now);
  return s === 'active' || s === 'grace';
};

const period = (plan: VipPlan): number => MONETIZATION.vip.products[plan].days * DAY_MS;

/** The months of the current run that have started (the first month starts with the pass). */
function monthsOfRun(v: VipState, now: number): number {
  if (!v.startedAt) return 0;
  // The period is over the instant it ends: a month that would only start then does not count.
  const end = Math.min(now, v.expiresAt - 1);
  if (end < v.startedAt) return 0;
  return Math.floor((end - v.startedAt) / MONTH_MS) + 1;
}

/** The months paid so far (a yearly pass gives one a month, and a monthly one a month at a time). */
export const monthsEarned = (v: VipState, now: number): number => v.monthsBefore + monthsOfRun(v, now);

export const vipBallOfMonth = (index: number): string | null => MONETIZATION.vip.balls[index] ?? null;

/** The next ball (the one of the month in progress, or the next one to come). */
export const nextVipBall = (v: VipState): string | null => vipBallOfMonth(v.ballsGiven);

/**
 * Gives the balls of the months that have started and were not given yet. They go into the collection for good: cancelling or
 * letting the pass lapse takes none back.
 */
export function syncVipBalls(p: Profile, now: number): { profile: Profile; given: string[] } {
  const target = Math.min(MONETIZATION.vip.balls.length, monthsEarned(p.vip, now));
  if (target <= p.vip.ballsGiven) return { profile: p, given: [] };
  let next = p;
  const given: string[] = [];
  for (let i = p.vip.ballsGiven; i < target; i++) {
    const id = vipBallOfMonth(i);
    if (id) {
      next = grantItem(next, id);
      given.push(id);
    }
  }
  return { profile: { ...next, vip: { ...next.vip, ballsGiven: target } }, given };
}

/** A subscription starts (or starts again after it lapsed). */
export function startVip(p: Profile, plan: VipPlan, now: number): Profile {
  const v = p.vip;
  const wasLive = isVip(v, now);
  const base = wasLive ? Math.max(v.expiresAt, now) : now;
  const vip: VipState = {
    ...v,
    plan,
    expiresAt: base + period(plan),
    graceUntil: 0,
    // A new run when the pass had lapsed: the months before it count for the series of balls.
    startedAt: wasLive ? v.startedAt : now,
    monthsBefore: wasLive ? v.monthsBefore : v.monthsBefore + monthsOfRun(v, now),
    expiredSeen: false,
    expiredByTools: false,
  };
  return syncVipBalls({ ...p, vip }, now).profile;
}

/** The store renewed the period. */
export function renewVip(p: Profile, now: number): Profile {
  const v = p.vip;
  if (!v.plan) return p;
  const vip: VipState = { ...v, expiresAt: Math.max(v.expiresAt, now) + period(v.plan), graceUntil: 0, expiredSeen: false, expiredByTools: false };
  return syncVipBalls({ ...p, vip }, now).profile;
}

/** The store could not take the payment: grace days, the pass keeps working. */
export function enterGrace(p: Profile, now: number): Profile {
  if (!p.vip.plan) return p;
  return { ...p, vip: { ...p.vip, graceUntil: Math.max(now, p.vip.expiresAt) + MONETIZATION.vip.graceDays * DAY_MS } };
}

/** Developers: the period ends right now. */
export const expireVip = (p: Profile, now: number): Profile => ({ ...p, vip: { ...p.vip, expiresAt: now - 1, graceUntil: 0, expiredByTools: true } });

/**
 * The SIMULATED store renews the pass by itself every time its period is over (the real one does it for the player): the date of the
 * renewal is always in the future. Not when the test tools made it expire. Returns the same profile when there is nothing to do.
 */
export function autoRenewSimulated(p: Profile, now: number): Profile {
  const v = p.vip;
  if (!v.plan || v.expiredByTools || v.expiresAt <= 0 || now < v.expiresAt) return p;
  const step = period(v.plan);
  let end = v.expiresAt;
  while (end <= now) end += step;
  return { ...p, vip: { ...v, expiresAt: end, graceUntil: 0, expiredSeen: false } };
}

/** Whether the 100 coins of the day can be taken. */
export const canClaimVipDaily = (p: Profile, today: DayKey, now: number): boolean => isVip(p.vip, now) && p.vip.dailyClaim !== today;

/** "Bonus VIP du jour": once a day, nothing piles up when it is not taken. */
export function claimVipDaily(p: Profile, today: DayKey, now: number): { profile: Profile; coins: number } | null {
  if (!canClaimVipDaily(p, today, now)) return null;
  const coins = MONETIZATION.vip.dailyCoins;
  return { profile: { ...earnCoins(p, coins), vip: { ...p.vip, dailyClaim: today } }, coins };
}

/** A pass that lapsed: the card "Ton Pass VIP a expiré" is waiting to be seen. */
export const showExpired = (v: VipState, now: number): boolean => vipStatus(v, now) === 'expired' && !v.expiredSeen;

/** Price per month of a plan (euros), and what the yearly one saves against twelve monthly ones (0..1). */
export const monthlyEquivalent = (plan: VipPlan): number => MONETIZATION.vip.products[plan].priceEur / (plan === 'yearly' ? 12 : 1);
export const yearlySaving = (): number => 1 - MONETIZATION.vip.products.yearly.priceEur / (12 * MONETIZATION.vip.products.monthly.priceEur);

export type PaywallSource = 'offres' | 'cadeaux' | 'vies' | 'reglages' | 'auto_level20' | 'auto_weekly';

export type OfferContext = {
  /** The level just finished, and whether it ends a step of the campaign. */
  completedLevel: number;
  endsStep: boolean;
  inTour: boolean;
  inTutorial: boolean;
  /** Seconds of play since a rewarded or interstitial ad ended (null: none this session). */
  sinceAdSec: number | null;
};

/**
 * The automatic offer of the pass: once after level 20, then at most every 7 days, only at the end of a step (never in the
 * levels 1 to 5, the tour or a tutorial, never right after a refused purchase or an ad, never to a subscriber).
 */
export function autoOffer(p: Profile, ctx: OfferContext, now: number): PaywallSource | null {
  const cfg = MONETIZATION.vip.autoOffer;
  if (isVip(p.vip, now)) return null;
  if (ctx.inTour || ctx.inTutorial || !ctx.endsStep) return null;
  if (ctx.completedLevel <= MONETIZATION.lives.freeUntilLevel || ctx.completedLevel < cfg.fromLevel) return null;
  if (!p.tourCompleted) return null;
  if (ctx.sinceAdSec !== null && ctx.sinceAdSec < 120) return null;
  // Turned down (a purchase cancelled, the paywall closed): at least the same wait as between two offers.
  if (p.vip.lastRefusalAt && now - p.vip.lastRefusalAt < cfg.everyDays * DAY_MS) return null;
  if (p.vip.autoOffers === 0) return 'auto_level20';
  if (now - p.vip.lastAutoOfferAt < cfg.everyDays * DAY_MS) return null;
  return 'auto_weekly';
}

export const noteAutoOffer = (p: Profile, now: number): Profile => ({ ...p, vip: { ...p.vip, lastAutoOfferAt: now, autoOffers: p.vip.autoOffers + 1 } });
export const noteRefusal = (p: Profile, now: number): Profile => ({ ...p, vip: { ...p.vip, lastRefusalAt: now } });
