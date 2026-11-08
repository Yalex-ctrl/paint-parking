import dailyJson from '../../assets/daily.json';
import { dayOfYear, weekdayMonday0, type DayKey } from '../core/dates';
import { cachedInfiniteLevel, fallbackLevel } from './infinite';
import { LEVEL_COUNT, levelById } from './levels';
import { DAILY_LEVEL_BASE, isDailyLevelId } from '../core/worlds';
import { normalizeLevel } from './levelSchema';
import type { Level } from './types';

/** The 366 pre-generated daily challenges (see scripts/generate-daily.ts), harder than the campaign. */
export const DAILY_LEVELS: Level[] = (dailyJson as unknown[]).map(normalizeLevel);

/**
 * The challenge of a given day: the same for every player. Its theme follows the day of the week (Monday spiral, Tuesday symmetry,
 * ... Sunday portals and bombs: challenge number i has the theme i % 7), and inside a theme the challenges come one after the other
 * through the year.
 */
export function dailyIndexForDay(day: DayKey): number {
  const weekday = weekdayMonday0(day);
  const week = Math.floor((dayOfYear(day) - 1) / 7);
  // How many challenges of this weekday's theme there are (366 = 52 weeks and 2 days: Monday and Tuesday have one more).
  const inTheme = Math.floor((DAILY_LEVELS.length - 1 - weekday) / 7) + 1;
  return weekday + 7 * (week % inTheme);
}

export const dailyLevelForDay = (day: DayKey): Level => DAILY_LEVELS[dailyIndexForDay(day)];

/** Any level by id: a campaign level, or a daily challenge (ids above DAILY_LEVEL_BASE). */
export function levelOfId(id: number): Level {
  if (isDailyLevelId(id)) return DAILY_LEVELS[(id - DAILY_LEVEL_BASE - 1) % DAILY_LEVELS.length];
  if (id <= LEVEL_COUNT) return levelById(id);
  // Past the stored campaign: built on the phone ahead of time (game/infinite.ts); a stored level stands in if it is not ready.
  return cachedInfiniteLevel(id) ?? fallbackLevel(id);
}
