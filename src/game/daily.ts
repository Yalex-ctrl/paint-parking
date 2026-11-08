import { MONETIZATION } from '../config/monetization';
import { addDays, daysBetween, daysInMonth, weekdayMonday0, type DayKey } from './dates';
import { earnCoins, earnPlayed, grantItem, owns, peekEarning, type Profile } from './economy';

/* ---------------------------------------------------------------------------------------------
 * Daily challenge: one level a day, a streak of consecutive days, and coins / skins as rewards.
 * ------------------------------------------------------------------------------------------- */

/** Coins for completing the challenge with a streak of `streak` days. */
export function dailyCoins(streak: number): number {
  const { baseCoins, perStreakDay, maxCoins } = MONETIZATION.daily;
  return Math.min(maxCoins, baseCoins + perStreakDay * Math.max(0, streak - 1));
}

export type StreakStatus = {
  /** The streak that is still alive today (0 when it is broken). */
  streak: number;
  /** The challenge was already completed today. */
  doneToday: boolean;
  /** Alive, but it will break tonight unless today's challenge is done. */
  atRisk: boolean;
  /** Exactly one day was missed and the free save is still available. */
  canSave: boolean;
  /** The streak that was lost, to show in "save your streak". */
  lostStreak: number;
};

/** Where the streak stands on day `today`. */
export function streakStatus(p: Profile, today: DayKey): StreakStatus {
  const { lastCompleted, streak, saveUsed } = p.daily;
  if (lastCompleted === null) return { streak: 0, doneToday: false, atRisk: false, canSave: false, lostStreak: 0 };
  const gap = daysBetween(lastCompleted, today);
  // gap < 0 happens when the device's time zone moves west after a day was completed: that day counts
  // as done, and the streak must not be lost because of a clock.
  if (gap <= 0) return { streak, doneToday: true, atRisk: false, canSave: false, lostStreak: 0 };
  if (gap === 1) return { streak, doneToday: false, atRisk: streak > 0, canSave: false, lostStreak: 0 };
  // One day missed: the streak is broken, but it can be saved once.
  const canSave = gap === 2 && !saveUsed && streak > 0;
  return { streak: 0, doneToday: false, atRisk: false, canSave, lostStreak: canSave ? streak : 0 };
}

/**
 * "Save your streak" (rewarded ad): the missed day is counted as done, so completing today's
 * challenge continues the streak. Null when it is not allowed.
 */
export function saveStreak(p: Profile, today: DayKey): Profile | null {
  if (!streakStatus(p, today).canSave) return null;
  return { ...p, daily: { ...p.daily, lastCompleted: addDays(today, -1), saveUsed: true } };
}

export type DailyResult = {
  profile: Profile;
  /** Coins paid (0 when today was already done). */
  coins: number;
  /** The streak after today. */
  streak: number;
  /** An exclusive skin unlocked by this streak length, if any (and if it was not owned yet). */
  skin: string | null;
  alreadyDone: boolean;
};

/** Today's challenge was completed. */
export function completeDaily(p: Profile, today: DayKey): DailyResult {
  const status = streakStatus(p, today);
  if (status.doneToday) return { profile: p, coins: 0, streak: status.streak, skin: null, alreadyDone: true };

  const continues = p.daily.lastCompleted !== null && daysBetween(p.daily.lastCompleted, today) === 1;
  const streak = continues ? p.daily.streak + 1 : 1;
  const paid = earnPlayed(p, dailyCoins(streak));
  const coins = paid.gained;
  const skinId = MONETIZATION.daily.skinMilestones[streak];
  const skin = skinId && !owns(p, skinId) ? skinId : null;

  let next = paid.profile;
  if (skin) next = grantItem(next, skin);
  next = {
    ...next,
    daily: {
      streak,
      best: Math.max(p.daily.best, streak),
      lastCompleted: today,
      // A new streak gets its own free save.
      saveUsed: continues ? p.daily.saveUsed : false,
      completed: p.daily.completed.includes(today) ? p.daily.completed : [...p.daily.completed, today],
    },
  };
  return { profile: next, coins, streak, skin, alreadyDone: false };
}

/* ---------------------------------------------------------------------------------------------
 * Calendar of the current month
 * ------------------------------------------------------------------------------------------- */

export type CalendarCell = { day: number; key: DayKey; done: boolean; today: boolean; future: boolean };

/**
 * A month as weeks (Monday first); `null` pads the days before the 1st and after the last.
 */
export function monthCalendar(completed: DayKey[], today: DayKey, year: number, month: number): (CalendarCell | null)[][] {
  const pad = (n: number) => String(n).padStart(2, '0');
  const first = `${String(year).padStart(4, '0')}-${pad(month)}-01`;
  const cells: (CalendarCell | null)[] = Array.from({ length: weekdayMonday0(first) }, () => null);
  const done = new Set(completed);
  for (let day = 1; day <= daysInMonth(year, month); day++) {
    const key = `${String(year).padStart(4, '0')}-${pad(month)}-${pad(day)}`;
    cells.push({ day, key, done: done.has(key), today: key === today, future: daysBetween(today, key) > 0 });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (CalendarCell | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/* ---------------------------------------------------------------------------------------------
 * Daily reward: a 7-day cycle, on the first opening of each day
 * ------------------------------------------------------------------------------------------- */

export type DailyRewardStatus = {
  /** Can be claimed now (not yet today). */
  available: boolean;
  /** The day of the cycle (1..7) that is, or would be, claimed. */
  day: number;
};

/** A missed day sends the cycle back to day 1. */
export function dailyRewardStatus(p: Profile, today: DayKey): DailyRewardStatus {
  const { lastClaim, day } = p.dailyReward;
  // Already claimed today (or a later day, if the time zone moved west).
  if (lastClaim !== null && daysBetween(lastClaim, today) <= 0) return { available: false, day };
  const consecutive = lastClaim !== null && daysBetween(lastClaim, today) === 1;
  return { available: true, day: consecutive ? (day % 7) + 1 : 1 };
}

export type RewardPayout = { coins: number; skin: string | null };

/** What day `day` of the cycle pays for this player (day 7: the skin if not owned yet, else coins). */
export function rewardForDay(p: Profile, day: number): RewardPayout {
  const { coins, day7Skin, day7Coins } = MONETIZATION.dailyReward;
  // The amounts announced are what the player would get now (the tables, scaled).
  if (day >= 7) return owns(p, day7Skin) ? { coins: peekEarning(p, day7Coins), skin: null } : { coins: 0, skin: day7Skin };
  return { coins: peekEarning(p, coins[day - 1]), skin: null };
}

/** Claims today's reward; `doubled` (rewarded ad) pays the coins twice (`reward.coins` is what was paid in all). Null when already claimed today. */
export function claimDailyReward(
  p: Profile,
  today: DayKey,
  doubled = false,
): { profile: Profile; day: number; reward: RewardPayout } | null {
  const status = dailyRewardStatus(p, today);
  if (!status.available) return null;
  const shown = rewardForDay(p, status.day);
  const { day7Coins, coins: table } = MONETIZATION.dailyReward;
  const raw = status.day >= 7 ? day7Coins : table[status.day - 1];
  let next = p;
  let paidCoins = 0;
  if (!shown.skin) {
    const paid = earnPlayed(p, raw);
    next = paid.profile;
    paidCoins = paid.gained;
    // The doubling comes after the scaling.
    if (doubled) {
      next = earnCoins(next, paid.gained * (MONETIZATION.doubleMultiplier - 1));
      paidCoins = paid.gained * MONETIZATION.doubleMultiplier;
    }
  }
  if (shown.skin) next = grantItem(next, shown.skin);
  next = { ...next, dailyReward: { lastClaim: today, day: status.day } };
  return { profile: next, day: status.day, reward: { coins: paidCoins, skin: shown.skin } };
}
