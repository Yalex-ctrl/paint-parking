import { MONETIZATION } from '../config/monetization';
import type { DayKey } from './dates';
import { freshPiggy, normalizePiggy, type PiggyState } from './piggy';
import { freshRewards, normalizeRewards, type RewardsState } from './rewards';
import { freshStreak, normalizeStreak, type StreakState } from './streak';
import { freshVip, normalizeVip, type VipState } from './vip';
import { freshLives, grantInfinite, normalizeLives, type LivesState } from './lives';
import { breakPiggy } from './piggy';
import { DEFAULT_BALL, DEFAULT_PAINT, itemById, type ShopItem } from './shopItems';

/**
 * The player's saved profile and every rule that changes it. All of it is pure: each function takes
 * a profile and returns a new one (or null when the action is not allowed), so the economy can be
 * tested without a phone, and the screens only call these and save the result.
 */
/** 2 = the levels were redesigned: what belongs to the old levels (coins picked up in them, chests) starts again. */
export const PROFILE_VERSION = 3;

export type Profile = {
  version: number;
  coins: number;
  /** Per campaign level: bitmask of the coins already picked up, so replaying never farms coins. */
  collectedCoins: Record<number, number>;
  /** Ids of the owned balls and paints. */
  owned: string[];
  equipped: { ball: string; paint: string };
  adsRemoved: boolean;
  ads: { victoriesSinceInterstitial: number; interstitialsShown: number; lastInterstitialAt: number };
  /** The Cadeaux panel: chests of play time, free coins, the wheel, the exclusive items won with ads, the trial (game/rewards.ts). */
  rewards: RewardsState;
  /** Hints won on the wheel: used before any coin is spent on one. */
  freeHints: number;
  /** The best score (points) of each level, and of each daily challenge by day (see game/points.ts). */
  bestScores: Record<number, number>;
  dailyScores: Record<string, number>;
  daily: {
    /** Current streak as last saved (see `streakStatus` for whether it is still alive). */
    streak: number;
    best: number;
    lastCompleted: DayKey | null;
    /** The one free streak save was used during this streak. */
    saveUsed: boolean;
    /** Days on which the challenge was completed (the calendar ticks). */
    completed: DayKey[];
  };
  dailyReward: { lastClaim: DayKey | null; /** day of the 7-day cycle claimed last, 0 = none yet */ day: number };
  starter: { offeredAt: number | null; purchased: boolean };
  launches: number;
  victories: number;
  notifications: { enabled: boolean; asked: boolean };
  /** The animated hand of the first level has been shown. */
  handSeen: boolean;
  /** Chests of the map already opened (their number: 1 is the one after level 10). */
  chestsOpened: number[];
  /** Coins caught on the map today (they fly by now and then; a daily cap keeps the economy honest). */
  mapCoins: { day: DayKey | null; count: number };
  /** Shop items the player has looked at (the others carry a "Nouveau" badge). */
  seenItems: string[];
  /** The fraction of a coin left over by the scaling of the coins earned (see scaledEarning): it is added to the next gain. */
  coinFrac: number;
  /** Lives (see game/lives.ts). */
  lives: LivesState;
  /** The guided tour (see game/tour.ts): done to the end, and how many times the player put it off. */
  tourCompleted: boolean;
  tourPostponedCount: number;
  /** The win streak (see game/streak.ts) and the piggy bank (see game/piggy.ts). */
  winStreak: StreakState;
  piggy: PiggyState;
  /** The VIP pass (see game/vip.ts): kept by "Remettre à zéro", like the other purchases. */
  vip: VipState;
};

export function defaultProfile(): Profile {
  return {
    version: PROFILE_VERSION,
    coins: 0,
    collectedCoins: {},
    owned: [DEFAULT_BALL, DEFAULT_PAINT],
    equipped: { ball: DEFAULT_BALL, paint: DEFAULT_PAINT },
    adsRemoved: false,
    ads: { victoriesSinceInterstitial: 0, interstitialsShown: 0, lastInterstitialAt: 0 },
    rewards: freshRewards(),
    freeHints: 0,
    bestScores: {},
    dailyScores: {},
    daily: { streak: 0, best: 0, lastCompleted: null, saveUsed: false, completed: [] },
    dailyReward: { lastClaim: null, day: 0 },
    starter: { offeredAt: null, purchased: false },
    launches: 0,
    victories: 0,
    notifications: { enabled: true, asked: false },
    handSeen: false,
    chestsOpened: [],
    mapCoins: { day: null, count: 0 },
    seenItems: [],
    coinFrac: 0,
    lives: freshLives(),
    tourCompleted: false,
    tourPostponedCount: 0,
    winStreak: freshStreak(),
    piggy: freshPiggy(),
    vip: freshVip(),
  };
}

/** Fills in anything missing from an older or partial save. */
export function normalizeProfile(raw: Partial<Profile> | null | undefined): Profile {
  const d = defaultProfile();
  if (!raw) return d;
  const p: Profile = {
    ...d,
    ...raw,
    equipped: { ...d.equipped, ...raw.equipped },
    ads: { ...d.ads, ...raw.ads },
    rewards: normalizeRewards(raw.rewards),
    freeHints: Math.max(0, Math.floor(Number(raw.freeHints) || 0)),
    bestScores: { ...(raw.bestScores ?? {}) },
    dailyScores: { ...(raw.dailyScores ?? {}) },
    daily: { ...d.daily, ...raw.daily },
    dailyReward: { ...d.dailyReward, ...raw.dailyReward },
    starter: { ...d.starter, ...raw.starter },
    notifications: { ...d.notifications, ...raw.notifications },
    chestsOpened: [...(raw.chestsOpened ?? [])],
    seenItems: [...(raw.seenItems ?? [])],
    coinFrac: typeof raw.coinFrac === 'number' ? Math.min(0.999, Math.max(0, raw.coinFrac)) : 0,
    lives: normalizeLives(raw.lives),
    // Whoever has seen the old welcome screen does not need the tour.
    tourCompleted: raw.tourCompleted ?? (raw as { welcomeSeen?: boolean }).welcomeSeen ?? false,
    tourPostponedCount: Math.max(0, Math.min(2, Math.floor(Number(raw.tourPostponedCount) || 0))),
    winStreak: normalizeStreak(raw.winStreak),
    piggy: normalizePiggy(raw.piggy),
    vip: normalizeVip(raw.vip),
    mapCoins: { ...d.mapCoins, ...raw.mapCoins },
    collectedCoins: { ...raw.collectedCoins },
    owned: Array.from(new Set([...d.owned, ...(raw.owned ?? [])])),
    version: PROFILE_VERSION,
  };
  // A save made for the first campaign: its levels no longer exist, so what is tied to them starts again (coins, shop, daily
  // challenge and everything bought stay).
  if ((raw.version ?? 1) < PROFILE_VERSION) {
    p.collectedCoins = {};
    p.chestsOpened = [];
    p.mapCoins = { day: null, count: 0 };
  }
  // Version 3: the campaign was generated again (slides, floors, collapsing floor): the scores of its levels start again. Coins, owned
  // items, purchases and the daily challenges stay.
  if ((raw.version ?? 1) < 3) p.bestScores = {};
  // An equipped item must be owned.
  if (!p.owned.includes(p.equipped.ball)) p.equipped.ball = DEFAULT_BALL;
  if (!p.owned.includes(p.equipped.paint)) p.equipped.paint = DEFAULT_PAINT;
  return p;
}

/* ---------------------------------------------------------------------------------------------
 * Coins
 * ------------------------------------------------------------------------------------------- */

export const earnCoins = (p: Profile, amount: number): Profile => ({ ...p, coins: p.coins + Math.max(0, Math.floor(amount)) });

/**
 * What `amount` coins from a table become for the player: `MONETIZATION.coinEarnMultiplier` of it, in whole coins. The fraction left
 * over (`frac`) is carried to the next gain so nothing is lost over time, and an amount that would round down to nothing still gives
 * one coin.
 */
export function scaledEarning(amount: number, frac = 0): { gained: number; frac: number } {
  if (amount <= 0) return { gained: 0, frac };
  const exact = amount * MONETIZATION.coinEarnMultiplier + frac;
  let gained = Math.floor(exact + 1e-9);
  let rest = Math.max(0, exact - gained);
  if (gained === 0) {
    gained = 1;
    rest = 0;
  }
  return { gained, frac: rest };
}

/** Pays coins earned by playing (the amount is the one of the table: it is scaled here). */
export function earnPlayed(p: Profile, amount: number): { profile: Profile; gained: number } {
  const r = scaledEarning(amount, p.coinFrac);
  return { profile: { ...p, coins: p.coins + r.gained, coinFrac: r.frac }, gained: r.gained };
}

/** What `earnPlayed` would pay right now (for the screens that announce a reward). */
export const peekEarning = (p: Profile, amount: number): number => scaledEarning(amount, p.coinFrac).gained;

/** Null when the player cannot afford it. */
export function spendCoins(p: Profile, amount: number): Profile | null {
  return p.coins >= amount ? { ...p, coins: p.coins - amount } : null;
}

/**
 * A coin lying in a level was picked up. It only counts the first time that coin is ever picked up
 * (the saved bitmask), so replaying a level cannot farm them.
 */
export function pickUpCoin(p: Profile, levelId: number, index: number): { profile: Profile; awarded: boolean } {
  const mask = p.collectedCoins[levelId] ?? 0;
  const bit = 1 << index;
  if (mask & bit) return { profile: p, awarded: false };
  return {
    profile: { ...p, coins: p.coins + 1, collectedCoins: { ...p.collectedCoins, [levelId]: mask | bit } },
    awarded: true,
  };
}

/** End-of-level bonus by stars (1 star = 1, 2 = 2, 3 = 3). */
export const levelBonus = (stars: 1 | 2 | 3): number => MONETIZATION.levelBonus[stars];

/**
 * A level was finished: pay the bonus. Replaying a level only pays what the new star count adds over
 * the best one already reached (`previousBest`, 0 for a first time), so a short level cannot be farmed.
 */
export function finishLevel(p: Profile, stars: 1 | 2 | 3, previousBest: 0 | 1 | 2 | 3 = 0, levelId = Infinity): { profile: Profile; bonus: number } {
  // The first levels pay nothing (the tutorial): the victory still counts.
  const raw = levelId <= MONETIZATION.noGainUntilLevel ? 0 : Math.max(0, levelBonus(stars) - (previousBest ? levelBonus(previousBest) : 0));
  const paid = earnPlayed(p, raw);
  return { profile: { ...paid.profile, victories: p.victories + 1 }, bonus: paid.gained };
}

/** The "x2 coins" rewarded ad: pays the bonus once more (the multiplier counts the original). */
export function doubleBonus(p: Profile, bonus: number): Profile {
  return earnCoins(p, bonus * (MONETIZATION.doubleMultiplier - 1));
}

/** Pays a hint: a free one (won on the wheel) first, else with coins. Null when there is neither. */
export const payHint = (p: Profile): Profile | null => (p.freeHints > 0 ? { ...p, freeHints: p.freeHints - 1 } : spendCoins(p, MONETIZATION.hint.coinCost));

export const canAffordHint = (p: Profile) => p.freeHints > 0 || p.coins >= MONETIZATION.hint.coinCost;

/* ---------------------------------------------------------------------------------------------
 * Shop
 * ------------------------------------------------------------------------------------------- */

export const owns = (p: Profile, id: string) => p.owned.includes(id);

/** Gives an item (a reward or a purchased pack), without charging anything. Idempotent. */
export function grantItem(p: Profile, id: string): Profile {
  return owns(p, id) || !itemById(id) ? p : { ...p, owned: [...p.owned, id] };
}

export type BuyResult =
  | { ok: true; profile: Profile; item: ShopItem }
  | { ok: false; reason: 'unknown' | 'owned' | 'exclusive' | 'free' | 'coins' };

/** Buys an item with coins. Exclusive items cannot be bought: they are earned. */
export function buyItem(p: Profile, id: string): BuyResult {
  const item = itemById(id);
  if (!item) return { ok: false, reason: 'unknown' };
  if (owns(p, id)) return { ok: false, reason: 'owned' };
  if (item.exclusive) return { ok: false, reason: 'exclusive' };
  if (item.price === undefined) return { ok: false, reason: 'free' };
  const paid = spendCoins(p, item.price);
  if (!paid) return { ok: false, reason: 'coins' };
  return { ok: true, profile: grantItem(paid, id), item };
}

/** Puts an owned item on. Null when it is not owned. */
export function equipItem(p: Profile, id: string): Profile | null {
  const item = itemById(id);
  if (!item || !owns(p, id)) return null;
  return { ...p, equipped: { ...p.equipped, [item.kind]: id } };
}

/* ---------------------------------------------------------------------------------------------
 * Real-money products (simulated for now, see services/purchases.ts)
 * ------------------------------------------------------------------------------------------- */

export function applyRemoveAds(p: Profile): Profile {
  return { ...p, adsRemoved: true };
}

export function applyCoinPack(p: Profile, productId: string): Profile | null {
  const pack = MONETIZATION.products.coinPacks.find((c) => c.id === productId);
  return pack ? earnCoins(p, pack.coins) : null;
}

/** "Starter pack": coins and two exclusive balls (it no longer includes "Sans pub"). */
export function applyStarterPack(p: Profile): Profile {
  const { skins, coins } = MONETIZATION.products.starterPack;
  let next = earnCoins(p, coins);
  for (const id of skins) next = grantItem(next, id);
  return { ...next, starter: { ...next.starter, purchased: true } };
}

/** Which product a purchase id is, applied to the profile. Null for an unknown id. */
export function applyProduct(p: Profile, productId: string): Profile | null {
  if (productId === MONETIZATION.products.removeAds.id) return applyRemoveAds(p);
  if (productId === MONETIZATION.products.starterPack.id) return applyStarterPack(p);
  if (productId === MONETIZATION.piggy.product.id) return breakPiggy(p);
  if (productId === MONETIZATION.lives.infiniteHour.id) return { ...p, lives: grantInfinite(p.lives, MONETIZATION.lives.infiniteHour.hours, Date.now()) };
  if (productId === MONETIZATION.lives.infiniteDay.id) return { ...p, lives: grantInfinite(p.lives, MONETIZATION.lives.infiniteDay.hours, Date.now()) };
  return applyCoinPack(p, productId);
}

/**
 * "Restore purchases": brings back what is permanent (no ads, the starter pack's skins) for the given
 * product ids. Coins are consumed, so they are never given a second time.
 */
export function applyRestore(p: Profile, productIds: string[]): Profile {
  let next = p;
  if (productIds.includes(MONETIZATION.products.removeAds.id)) next = applyRemoveAds(next);
  if (productIds.includes(MONETIZATION.products.starterPack.id)) {
    for (const id of MONETIZATION.products.starterPack.skins) next = grantItem(next, id);
    next = { ...next, starter: { ...next.starter, purchased: true } };
  }
  return next;
}

/** Products that are bought once and kept: the ones a restore can bring back. */
export const isPermanentProduct = (productId: string) =>
  productId === MONETIZATION.products.removeAds.id || productId === MONETIZATION.products.starterPack.id;

/* Starter pack offer: once, right after the guided tour, for 48 hours. */

/** Time (ms) the offer stays open once shown. */
export const starterDurationMs = () => MONETIZATION.products.starterPack.durationHours * 3_600_000;

export function shouldOfferStarter(p: Profile): boolean {
  return !p.starter.purchased && p.starter.offeredAt === null && p.tourCompleted;
}

export const offerStarter = (p: Profile, now: number): Profile => ({ ...p, starter: { ...p.starter, offeredAt: now } });

/** Milliseconds left on the offer, or 0 when it is not available (never offered, bought, or expired). */
export function starterRemainingMs(p: Profile, now: number): number {
  if (p.starter.purchased || p.starter.offeredAt === null) return 0;
  return Math.max(0, p.starter.offeredAt + starterDurationMs() - now);
}

/* Launches */

export const recordLaunch = (p: Profile): Profile => ({ ...p, launches: p.launches + 1 });
