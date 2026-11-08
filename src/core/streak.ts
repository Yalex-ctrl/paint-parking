import { MONETIZATION } from './config/monetization';
import type { DayKey } from './dates';
import { spendCoins, type Profile } from './economy';

/**
 * The win streak: every level won without losing a life raises it, any lost life puts it back to 0. It multiplies the coins
 * earned in a level. (Not to be confused with the daily-challenge streak, which counts days.) All pure.
 */
export type StreakState = { current: number; best: number; /** Day the "keep my streak" ad was used. */ adDay: DayKey | null };

export const freshStreak = (): StreakState => ({ current: 0, best: 0, adDay: null });

export function normalizeStreak(raw: Partial<StreakState> | null | undefined): StreakState {
  const d = freshStreak();
  if (!raw) return d;
  const current = Math.max(0, Math.floor(raw.current ?? 0));
  return { current, best: Math.max(current, Math.floor(raw.best ?? 0)), adDay: raw.adDay ?? null };
}

const tiers = MONETIZATION.streak.tiers;

/** 0 = x1, 1 = x1.25, 2 = x1.5, 3 = x2 (the top). */
export function tierOf(streak: number): 0 | 1 | 2 | 3 {
  let t = 0;
  for (let i = 0; i < tiers.length; i++) if (streak >= tiers[i].from) t = i;
  return t as 0 | 1 | 2 | 3;
}

export const multiplierOf = (streak: number): number => tiers[tierOf(streak)].mult;

/** `base` coins with the multiplier of `streak`, rounded to the nearest coin (without the leftover fraction: see `scaleWithStreak`). */
export const scaleCoins = (base: number, streak: number): number => Math.round(base * multiplierOf(streak));

/**
 * `base` coins (already paid) multiplied by the streak: the extra coins are paid now, rounded down, and the fraction that is left
 * goes to the profile's accumulator (coinFrac) so that nothing is lost over time. `total` is what the level gave in all.
 */
export function scaleWithStreak(p: Profile, base: number, streak: number): { profile: Profile; total: number } {
  if (base <= 0) return { profile: p, total: 0 };
  const exact = base * multiplierOf(streak) + p.coinFrac;
  const total = Math.max(base, Math.floor(exact + 1e-9));
  return { profile: { ...p, coins: p.coins + (total - base), coinFrac: Math.min(0.999, Math.max(0, exact - total)) }, total };
}

export type StreakStep = { profile: Profile; before: number; after: number; tierUp: boolean };

/** A level won: the streak goes up by one (and the best streak with it). */
export function winLevel(p: Profile): StreakStep {
  const before = p.winStreak.current;
  const after = before + 1;
  return {
    profile: { ...p, winStreak: { ...p.winStreak, current: after, best: Math.max(p.winStreak.best, after) } },
    before,
    after,
    tierUp: tierOf(after) > tierOf(before),
  };
}

/** A life was lost: back to 0. `lost` is what was lost (0 when there was nothing). */
export function resetStreak(p: Profile): { profile: Profile; lost: number } {
  const lost = p.winStreak.current;
  return { profile: lost === 0 ? p : { ...p, winStreak: { ...p.winStreak, current: 0 } }, lost };
}

/** Before an action that costs a life: is the streak big enough that the player is asked first? */
export const protectionOffered = (p: Profile): boolean => p.winStreak.current >= MONETIZATION.streak.protectFrom;

/** "Keep my streak" for a rewarded ad: once a day. */
export const canSaveWithAd = (p: Profile, day: DayKey): boolean => p.winStreak.adDay !== day;
export const saveWithAd = (p: Profile, day: DayKey): Profile | null => (canSaveWithAd(p, day) ? { ...p, winStreak: { ...p.winStreak, adDay: day } } : null);

/** "Keep my streak" for coins. Null when the player cannot pay. */
export const saveWithCoins = (p: Profile): Profile | null => spendCoins(p, MONETIZATION.streak.saveCoinCost);
