import dailyJson from '../../assets/daily.json';
import { dayOfYear, type DayKey } from '../core/dates';
import { DAILY_LEVEL_BASE, isDailyLevelId } from '../core/worlds';
import { LEVEL_COUNT, levelById } from './levels';
import { decodeLevel } from './levelSchema';
import type { Level } from './types';

/** The pre-generated daily challenges (see scripts/generate-daily.ts), bigger and harder than the campaign; the app handles 366. */
export const DAILY_LEVELS: Level[] = (dailyJson as unknown[]).map((raw, i) => ({ ...decodeLevel(raw), id: DAILY_LEVEL_BASE + i + 1 }));

/** The challenge of a given day: the same for every player, going through the file one after the other all year. */
export const dailyIndexForDay = (day: DayKey): number => (dayOfYear(day) - 1) % DAILY_LEVELS.length;

export const dailyLevelForDay = (day: DayKey): Level => DAILY_LEVELS[dailyIndexForDay(day)];

/** Any level by id: a campaign level, or a daily challenge (ids above DAILY_LEVEL_BASE). */
export function levelOfId(id: number): Level {
  if (isDailyLevelId(id)) return DAILY_LEVELS[(id - DAILY_LEVEL_BASE - 1) % DAILY_LEVELS.length];
  return levelById(Math.min(id, Math.max(id, LEVEL_COUNT)));
}
