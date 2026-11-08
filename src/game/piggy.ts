import { MONETIZATION } from '../config/monetization';
import type { DayKey } from './dates';
import { earnCoins, type Profile } from './economy';

/**
 * The piggy bank: it fills by itself while the player wins levels (a share of the coins earned, ON TOP of them: nothing is
 * taken from the player) and can be broken, for a (simulated) purchase, once it holds enough. All pure.
 */
export type PiggyState = { coins: number; /** Day the "your piggy bank is full" pop-up was shown. */ popupDay: DayKey | null };

export const freshPiggy = (): PiggyState => ({ coins: 0, popupDay: null });

export function normalizePiggy(raw: Partial<PiggyState> | null | undefined): PiggyState {
  if (!raw) return freshPiggy();
  return { coins: Math.max(0, Math.min(MONETIZATION.piggy.capacity, Math.floor(raw.coins ?? 0))), popupDay: raw.popupDay ?? null };
}

/** What goes into the piggy bank for a level that earned `earned` coins (the multiplier already applied). */
export const piggyShare = (earned: number): number => Math.floor(Math.max(0, earned) * MONETIZATION.piggy.share);

/** Puts the share of `earned` in the piggy bank, up to its capacity. `added` is what really went in. */
export function fillPiggy(p: Profile, earned: number): { profile: Profile; added: number } {
  const room = MONETIZATION.piggy.capacity - p.piggy.coins;
  const added = Math.max(0, Math.min(room, piggyShare(earned)));
  if (added === 0) return { profile: p, added: 0 };
  return { profile: { ...p, piggy: { ...p.piggy, coins: p.piggy.coins + added } }, added };
}

export const canBreakPiggy = (p: Profile): boolean => p.piggy.coins >= MONETIZATION.piggy.breakFrom;
export const isPiggyFull = (p: Profile): boolean => p.piggy.coins >= MONETIZATION.piggy.capacity;
/** How many more coins until it can be broken (0 when it can). */
export const coinsUntilBreakable = (p: Profile): number => Math.max(0, MONETIZATION.piggy.breakFrom - p.piggy.coins);
export const fillRatio = (p: Profile): number => Math.min(1, p.piggy.coins / MONETIZATION.piggy.capacity);

/** The piggy bank is broken (the purchase went through): the player gets everything in it, and it starts again from 0. */
export function breakPiggy(p: Profile): Profile | null {
  if (!canBreakPiggy(p)) return null;
  return { ...earnCoins(p, p.piggy.coins), piggy: { ...p.piggy, coins: 0 } };
}

/** The "your piggy bank is full" pop-up: at most once a day, and only when it is full. */
export const fullPopupDue = (p: Profile, day: DayKey): boolean => isPiggyFull(p) && p.piggy.popupDay !== day;
export const markFullPopupShown = (p: Profile, day: DayKey): Profile => ({ ...p, piggy: { ...p.piggy, popupDay: day } });
