import { msUntilMidnight } from './duration';
import { MONETIZATION } from './config/monetization';
import type { DayKey } from './dates';
import { earnCoins, grantItem, owns, type Profile } from './economy';
import { addLives, grantInfinite, settle } from './lives';
import { itemById, type ItemKind } from './shopItems';
import type { Rng } from './rng';

/**
 * The rewards of the "Cadeaux" panel: chests of play time, free coins, the wheel of fortune, the exclusive items won with
 * rewarded ads, the bonus for the ads of the day, and the trial of a ball or a paint. All pure: the screens and services only give
 * them the time and what happened. Everything that is "of the day" starts again at midnight (local day), and what was not collected
 * the day before is lost.
 */
const R = MONETIZATION.rewards;

export type RewardsState = {
  /** The day the counters below belong to. */
  day: DayKey | null;
  /** Seconds of active play today (see game/playTimer.ts). */
  playSeconds: number;
  /** Chests of play time opened today (indexes of the tiers). */
  chestsOpened: number[];
  /** Free coins taken today, and when the last ones were (ms). */
  freeCoins: { count: number; lastAt: number };
  /** Spins of the wheel today (the free one first). */
  spins: number;
  /** Rewarded ads watched to the end today, all sources together, and the steps of the bonus taken. */
  adsToday: number;
  adBonusTaken: number[];
  /** Trials started today. */
  trialsToday: number;
  /** The ball or paint on trial, and what to put back at the end. */
  trial: { itemId: string; kind: ItemKind; levelsLeft: number; restore: string } | null;
  /** The exclusive items won with ads: which one is in progress, its ads, when the last one was watched, and what was won. */
  unlock: { index: number; ads: number; lastAt: number; won: string[] };
};

export const freshRewards = (): RewardsState => ({
  day: null,
  playSeconds: 0,
  chestsOpened: [],
  freeCoins: { count: 0, lastAt: 0 },
  spins: 0,
  adsToday: 0,
  adBonusTaken: [],
  trialsToday: 0,
  trial: null,
  unlock: { index: 0, ads: 0, lastAt: 0, won: [] },
});

export function normalizeRewards(raw: Partial<RewardsState> | null | undefined): RewardsState {
  const d = freshRewards();
  if (!raw) return d;
  const n = (x: unknown, min = 0) => Math.max(min, Math.floor(Number(x) || 0));
  return {
    day: typeof raw.day === 'string' ? raw.day : null,
    playSeconds: Math.max(0, Number(raw.playSeconds) || 0),
    chestsOpened: Array.isArray(raw.chestsOpened) ? raw.chestsOpened.filter((i) => Number.isInteger(i)) : [],
    freeCoins: { count: n(raw.freeCoins?.count), lastAt: Math.max(0, Number(raw.freeCoins?.lastAt) || 0) },
    spins: n(raw.spins),
    adsToday: n(raw.adsToday),
    adBonusTaken: Array.isArray(raw.adBonusTaken) ? raw.adBonusTaken.filter((i) => Number.isInteger(i)) : [],
    trialsToday: n(raw.trialsToday),
    trial: raw.trial && typeof raw.trial.itemId === 'string' ? { itemId: raw.trial.itemId, kind: raw.trial.kind === 'paint' ? 'paint' : 'ball', levelsLeft: n(raw.trial.levelsLeft), restore: String(raw.trial.restore ?? '') } : null,
    unlock: {
      index: n(raw.unlock?.index),
      ads: n(raw.unlock?.ads),
      lastAt: Math.max(0, Number(raw.unlock?.lastAt) || 0),
      won: Array.isArray(raw.unlock?.won) ? raw.unlock!.won.filter((s) => typeof s === 'string') : [],
    },
  };
}

/** Midnight: everything "of the day" starts again (nothing carries over), the unlock progress and a running trial stay. */
export function rolloverRewards(p: Profile, today: DayKey): Profile {
  if (p.rewards.day === today) return p;
  const r = p.rewards;
  return {
    ...p,
    rewards: { ...freshRewards(), day: today, trial: r.trial, unlock: r.unlock },
  };
}

/* ---------------------------------------------------------------------------------------------- chests of play time */

export type Chest = { index: number; minutes: number; coins: number; ready: boolean; opened: boolean };

export function playChests(r: RewardsState): Chest[] {
  return R.playChests.tiers.map((t, index) => ({
    index,
    minutes: t.minutes,
    coins: t.coins,
    opened: r.chestsOpened.includes(index),
    ready: r.playSeconds >= t.minutes * 60 && !r.chestsOpened.includes(index),
  }));
}

/** How far to the next chest, 0..1 (1 when all the chests have been reached). */
export function nextChestFraction(r: RewardsState): number {
  const tiers = R.playChests.tiers;
  const next = tiers.findIndex((t) => r.playSeconds < t.minutes * 60);
  if (next < 0) return 1;
  const from = next === 0 ? 0 : tiers[next - 1].minutes * 60;
  const to = tiers[next].minutes * 60;
  return Math.max(0, Math.min(1, (r.playSeconds - from) / (to - from)));
}

/** Opens a chest that is ready: the coins. `doubled` (a rewarded ad was watched) adds them once more. Null when it is not ready. */
export function openChest(p: Profile, index: number, doubled = false): { profile: Profile; coins: number } | null {
  const chest = playChests(p.rewards)[index];
  if (!chest || !chest.ready) return null;
  const coins = chest.coins * (doubled ? 2 : 1);
  return { profile: { ...earnCoins(p, coins), rewards: { ...p.rewards, chestsOpened: [...p.rewards.chestsOpened, index] } }, coins };
}

/** The second part of "x2" after the chest was opened: the same coins once more. */
export const doubleChestCoins = (p: Profile, coins: number): Profile => earnCoins(p, coins);

/* ---------------------------------------------------------------------------------------------- free coins */

export type FreeCoins = { available: boolean; waitMs: number; left: number; coins: number };

export function freeCoinsStatus(r: RewardsState, now: number): FreeCoins {
  const { coins, intervalMin, perDay } = R.freeCoins;
  const left = Math.max(0, perDay - r.freeCoins.count);
  const waitMs = r.freeCoins.count === 0 ? 0 : Math.max(0, r.freeCoins.lastAt + intervalMin * 60_000 - now);
  return { available: left > 0 && waitMs === 0, waitMs, left, coins };
}

/** The ad was watched to the end: 15 coins. Null when it is too soon or the six of the day are taken. */
export function claimFreeCoins(p: Profile, now: number): Profile | null {
  if (!freeCoinsStatus(p.rewards, now).available) return null;
  return { ...earnCoins(p, R.freeCoins.coins), rewards: { ...p.rewards, freeCoins: { count: p.rewards.freeCoins.count + 1, lastAt: now } } };
}

/* ---------------------------------------------------------------------------------------------- rewarded ads of the day */

/** Rewarded ads, all sources together, are capped for the day (a safety). */
export const rewardedAdsLeft = (r: RewardsState): number => Math.max(0, R.rewardedAdsPerDay - r.adsToday);
export const canWatchRewarded = (r: RewardsState): boolean => rewardedAdsLeft(r) > 0;

/** A rewarded ad was watched to the end (an interrupted one, an interstitial: never counted). */
export function registerRewardedAd(p: Profile): Profile {
  return { ...p, rewards: { ...p.rewards, adsToday: p.rewards.adsToday + 1 } };
}

export type AdBonus = { index: number; ads: number; coins: number; reached: boolean; taken: boolean };

export function adBonuses(r: RewardsState): AdBonus[] {
  return R.adBonus.map((t, index) => ({ index, ads: t.ads, coins: t.coins, reached: r.adsToday >= t.ads, taken: r.adBonusTaken.includes(index) }));
}

/** The steps of the bonus that were just reached by one more ad. */
export const newlyReached = (before: RewardsState, after: RewardsState): AdBonus[] => adBonuses(after).filter((b, i) => b.reached && !adBonuses(before)[i].reached);

/** Takes a step of the bonus, once. Null when it is not reached or already taken. */
export function claimAdBonus(p: Profile, index: number): { profile: Profile; coins: number } | null {
  const b = adBonuses(p.rewards)[index];
  if (!b || !b.reached || b.taken) return null;
  return { profile: { ...earnCoins(p, b.coins), rewards: { ...p.rewards, adBonusTaken: [...p.rewards.adBonusTaken, index] } }, coins: b.coins };
}

/* ---------------------------------------------------------------------------------------------- exclusive items won with ads */

export type UnlockStatus = {
  /** False once the three items are won: the section goes away. */
  active: boolean;
  itemId: string | null;
  ads: number;
  needed: number;
  waitMs: number;
  /** An ad can be watched now (the gauge is not full and the ten minutes are over). */
  available: boolean;
  /** The item has just been won and is not equipped yet (the unlock animation and "Équiper"). */
  won: string[];
};

export function unlockStatus(r: RewardsState, now: number): UnlockStatus {
  const items = R.adUnlock.items;
  const u = r.unlock;
  const active = u.index < items.length;
  const waitMs = u.ads === 0 && u.lastAt === 0 ? 0 : Math.max(0, u.lastAt + R.adUnlock.minIntervalMin * 60_000 - now);
  return { active, itemId: active ? items[u.index] : null, ads: u.ads, needed: R.adUnlock.adsNeeded, waitMs, available: active && waitMs === 0, won: u.won };
}

/** One ad watched from the button: the gauge goes up; at the tenth the item is won and the next one starts. Null when it is too soon. */
export function registerUnlockAd(p: Profile, now: number): { profile: Profile; unlocked: string | null } | null {
  const s = unlockStatus(p.rewards, now);
  if (!s.available || !s.itemId) return null;
  const ads = p.rewards.unlock.ads + 1;
  if (ads >= R.adUnlock.adsNeeded && itemById(s.itemId)) {
    return {
      profile: { ...grantItem(p, s.itemId), rewards: { ...p.rewards, unlock: { index: p.rewards.unlock.index + 1, ads: 0, lastAt: now, won: [...p.rewards.unlock.won, s.itemId] } } },
      unlocked: s.itemId,
    };
  }
  return { profile: { ...p, rewards: { ...p.rewards, unlock: { ...p.rewards.unlock, ads, lastAt: now } } }, unlocked: null };
}

/* ---------------------------------------------------------------------------------------------- the wheel of fortune */

export type WheelSlot = (typeof R.wheel.slots)[number] & { coins: number };

/** What a slot really gives for this player: the lives slot is 10 coins when lives are off, and 2 lives when they are already unlimited. */
export function wheelSlots(livesOn: boolean): readonly (typeof R.wheel.slots)[number][] {
  return R.wheel.slots.map((s) => (s.kind === 'lives' && !livesOn ? { id: 'lives-off', kind: 'coins' as const, amount: R.wheel.livesOffCoins, weight: s.weight } : s));
}

/** The slot the wheel will stop on, drawn BEFORE it turns (the animation ends on it). */
export function drawWheel(rng: Rng, livesOn: boolean): number {
  const slots = wheelSlots(livesOn);
  const total = slots.reduce((n, s) => n + s.weight, 0);
  let x = rng.next() * total;
  for (let i = 0; i < slots.length; i++) {
    x -= slots[i].weight;
    if (x < 0) return i;
  }
  return slots.length - 1;
}

export type WheelStatus = { freeLeft: number; adLeft: number; next: 'free' | 'ad' | 'none' };

/** Spins left today: the free one(s) first, then the ones for a rewarded ad (or free for a VIP). */
export function wheelStatus(r: RewardsState, vip = false): WheelStatus {
  const total = R.wheel.freeSpinsPerDay + R.wheel.adSpinsPerDay;
  const free = vip ? Math.max(total, MONETIZATION.vip.freeSpinsPerDay) : R.wheel.freeSpinsPerDay;
  const freeLeft = Math.max(0, free - r.spins);
  const adLeft = vip ? 0 : Math.max(0, total - Math.max(r.spins, R.wheel.freeSpinsPerDay));
  return { freeLeft, adLeft, next: freeLeft > 0 ? 'free' : adLeft > 0 ? 'ad' : 'none' };
}

export type WheelPrize = { slot: number; kind: 'coins' | 'hint' | 'lives'; amount: number };

/**
 * The prize of a slot given to the player (and a spin counted). The lives slot gives unlimited lives for 15 minutes, or two lives when
 * the player already has unlimited lives running (and 10 coins when lives are switched off: see `wheelSlots`).
 */
export function applyWheelPrize(p: Profile, slotIndex: number, livesOn: boolean, now: number): { profile: Profile; prize: WheelPrize } {
  const slots = wheelSlots(livesOn);
  const s = slots[slotIndex];
  const spun: Profile = { ...p, rewards: { ...p.rewards, spins: p.rewards.spins + 1 } };
  if (s.kind === 'coins') return { profile: earnCoins(spun, s.amount), prize: { slot: slotIndex, kind: 'coins', amount: s.amount } };
  if (s.kind === 'hint') return { profile: { ...spun, freeHints: spun.freeHints + s.amount }, prize: { slot: slotIndex, kind: 'hint', amount: s.amount } };
  const settled = settle(spun.lives, now);
  if (settled.infiniteUntil > now) {
    return { profile: { ...spun, lives: addLives(settled, R.wheel.livesBonus, now) }, prize: { slot: slotIndex, kind: 'lives', amount: R.wheel.livesBonus } };
  }
  return { profile: { ...spun, lives: grantInfinite(settled, s.amount / 60, now) }, prize: { slot: slotIndex, kind: 'lives', amount: s.amount } };
}

/* ---------------------------------------------------------------------------------------------- trying an item */

export const trialsLeft = (r: RewardsState): number => Math.max(0, R.trial.perDay - r.trialsToday);

/** Can this item be tried: not owned, not an exclusive, no trial running, and one of the three of the day left. */
export function canTry(p: Profile, itemId: string): boolean {
  const item = itemById(itemId);
  if (!item || item.exclusive || owns(p, itemId) || item.price === undefined) return false;
  return p.rewards.trial === null && trialsLeft(p.rewards) > 0;
}

/** The ad was watched: the item is worn for three levels. */
export function startTrial(p: Profile, itemId: string): Profile | null {
  if (!canTry(p, itemId)) return null;
  const item = itemById(itemId)!;
  return {
    ...p,
    equipped: { ...p.equipped, [item.kind]: itemId },
    rewards: { ...p.rewards, trialsToday: p.rewards.trialsToday + 1, trial: { itemId, kind: item.kind, levelsLeft: R.trial.levels, restore: p.equipped[item.kind] } },
  };
}

/** A level was finished: one less. At the end the old equipment comes back (unless the item was bought meanwhile). */
export function trialLevelDone(p: Profile): { profile: Profile; ended: { itemId: string } | null } {
  const t = p.rewards.trial;
  if (!t) return { profile: p, ended: null };
  const left = t.levelsLeft - 1;
  if (left > 0) return { profile: { ...p, rewards: { ...p.rewards, trial: { ...t, levelsLeft: left } } }, ended: null };
  const bought = owns(p, t.itemId);
  return {
    profile: { ...p, equipped: bought ? p.equipped : { ...p.equipped, [t.kind]: t.restore }, rewards: { ...p.rewards, trial: null } },
    ended: { itemId: t.itemId },
  };
}

/* ---------------------------------------------------------------------------------------------- the badge */

/** How many things are waiting in the panel right now (the red dot of the button). */
export function giftsWaiting(p: Profile, now: number, opts: { dailyRewardReady: boolean; vipDailyReady?: boolean; vip?: boolean }): number {
  const r = p.rewards;
  let n = 0;
  n += playChests(r).filter((c) => c.ready).length;
  if (wheelStatus(r, opts.vip).freeLeft > 0) n++;
  if (freeCoinsStatus(r, now).available && rewardedAdsLeft(r) > 0) n++;
  if (opts.dailyRewardReady) n++;
  n += adBonuses(r).filter((b) => b.reached && !b.taken).length;
  if (opts.vipDailyReady) n++;
  return n;
}

/**
 * Time (ms) until the nearest gift can be taken again, for the label of the "Cadeaux" button when nothing is available: the next
 * free coins, the next ad for the exclusive item, or midnight (the daily reward, the wheel, the ad bonus and the VIP bonus come back).
 */
export function nextGiftIn(p: Profile, now: number): number {
  const options = [msUntilMidnight(now)];
  const free = freeCoinsStatus(p.rewards, now);
  if (!free.available && free.left > 0) options.push(free.waitMs);
  const unlock = unlockStatus(p.rewards, now);
  if (unlock.active && unlock.waitMs > 0) options.push(unlock.waitMs);
  return Math.min(...options);
}

/** Seconds of play left before the next chest of play time (null when all three are reached). */
export function secondsToNextChest(r: RewardsState): number | null {
  const next = R.playChests.tiers.find((t) => r.playSeconds < t.minutes * 60);
  return next ? next.minutes * 60 - r.playSeconds : null;
}
