import { dayNumber, fromDayNumber, weekdayMonday0 } from '../src/core/dates';
import { DAILY_LEVELS, dailyLevelForDay } from '../src/game/dailyLevels';
import { verifyLevel } from '../src/game/generator';
import { LEVELS } from '../src/game/levels';
import { DAILY_LEVEL_BASE, isDailyLevelId } from '../src/core/worlds';

describe('daily challenge levels', () => {
  it('has one for each of the 366 days of a leap year, with ids above the campaign', () => {
    expect(DAILY_LEVELS).toHaveLength(366);
    DAILY_LEVELS.forEach((l, i) => {
      expect(l.id).toBe(DAILY_LEVEL_BASE + i + 1);
      expect(isDailyLevelId(l.id)).toBe(true);
    });
  });

  it('every one is solvable with its stored solution', () => {
    for (const l of DAILY_LEVELS) expect(verifyLevel(l)).toBe(true);
  });

  it('is harder than the average early campaign', () => {
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const daily = avg(DAILY_LEVELS.map((l) => l.solution.length));
    const early = avg(LEVELS.slice(0, 100).map((l) => l.solution.length));
    expect(daily).toBeGreaterThan(early);
  });

  it('picks the same level for everyone on a given day, the theme of the weekday, and almost never repeats in a year', () => {
    expect(dailyLevelForDay('2026-03-05')).toBe(dailyLevelForDay('2026-03-05'));
    const start = dayNumber('2026-01-01');
    const ids = new Set<number>();
    for (let i = 0; i < 365; i++) {
      const day = fromDayNumber(start + i);
      const level = dailyLevelForDay(day);
      ids.add(level.id);
      // Monday spiral ... Sunday portals and bombs: the challenge number is the weekday modulo 7
      expect((level.id - DAILY_LEVEL_BASE - 1) % 7).toBe(weekdayMonday0(day));
    }
    expect(ids.size).toBeGreaterThanOrEqual(358);
    for (const d of ['2028-12-31', '2026-12-31', '2026-01-01']) expect(isDailyLevelId(dailyLevelForDay(d).id)).toBe(true);
  });
});
