import { MONETIZATION } from '../src/core/config/monetization';
import {
  addDays,
  dayKeyAt,
  dayKeyOf,
  dayNumber,
  dayOfYear,
  daysBetween,
  daysInMonth,
  fromDayNumber,
  weekdayMonday0,
} from '../src/core/dates';
import {
  claimDailyReward,
  completeDaily,
  dailyCoins,
  dailyRewardStatus,
  monthCalendar,
  rewardForDay,
  saveStreak,
  streakStatus,
} from '../src/core/daily';
import { defaultProfile, grantItem, owns, type Profile } from '../src/core/economy';

const day = (n: number) => addDays('2026-05-01', n);

/** Completes the challenge on each given day (in order). */
function playDays(days: string[], start: Profile = defaultProfile()): Profile {
  return days.reduce((p, d) => completeDaily(p, d).profile, start);
}

describe('calendar days', () => {
  it('turns a moment into its local calendar day, around midnight', () => {
    expect(dayKeyOf(new Date(2026, 2, 29, 0, 30))).toBe('2026-03-29');
    expect(dayKeyOf(new Date(2026, 2, 29, 23, 59))).toBe('2026-03-29');
    expect(dayKeyOf(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
    expect(dayKeyOf(new Date(2027, 0, 1, 0, 0))).toBe('2027-01-01');
  });

  it('does day arithmetic by calendar, so daylight-saving changes never add or remove a day', () => {
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2); // across the spring clock change in Europe
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2); // ...and in the US
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2); // autumn change
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29'); // leap year
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
    expect(fromDayNumber(dayNumber('2026-07-04'))).toBe('2026-07-04');
  });

  it('numbers the days of the year 1..366 and knows the month lengths', () => {
    expect(dayOfYear('2026-01-01')).toBe(1);
    expect(dayOfYear('2026-12-31')).toBe(365);
    expect(dayOfYear('2028-12-31')).toBe(366);
    expect(dayOfYear('2028-03-01')).toBe(61);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(weekdayMonday0('2026-05-04')).toBe(0); // a Monday
    expect(weekdayMonday0('2026-05-10')).toBe(6); // a Sunday
  });

  it('shows how the same instant is a different day in different time zones', () => {
    const instant = Date.UTC(2026, 4, 10, 23, 30); // 23:30 UTC
    expect(dayKeyAt(instant, 0)).toBe('2026-05-10'); // London (winter) / UTC
    expect(dayKeyAt(instant, 9 * 60)).toBe('2026-05-11'); // Tokyo: already the next day
    expect(dayKeyAt(instant, -8 * 60)).toBe('2026-05-10'); // Los Angeles
    expect(dayKeyAt(instant, -8 * 60 - 1000 * 60 * 24)).not.toBe(dayKeyAt(instant, 0));
  });
});

describe('streak of the daily challenge', () => {
  it('pays a flat 20 coins, whatever the streak', () => {
    expect(dailyCoins(1)).toBe(20);
    expect(dailyCoins(2)).toBe(20);
    expect(dailyCoins(10)).toBe(20); // a flat 20
    expect(dailyCoins(100)).toBe(MONETIZATION.daily.maxCoins);
    for (let s = 1; s < 40; s++) expect(dailyCoins(s + 1)).toBeGreaterThanOrEqual(dailyCoins(s));
  });

  it('counts consecutive days, pays the coins, and ticks the calendar', () => {
    const r1 = completeDaily(defaultProfile(), day(0));
    expect(r1).toMatchObject({ streak: 1, coins: 20, alreadyDone: false });
    const r2 = completeDaily(r1.profile, day(1));
    expect(r2).toMatchObject({ streak: 2, coins: 20 });
    expect(r2.profile.coins).toBe(40);
    expect(r2.profile.daily.completed).toEqual([day(0), day(1)]);
    expect(r2.profile.daily.best).toBe(2);
  });

  it('cannot be completed twice on the same day', () => {
    const once = completeDaily(defaultProfile(), day(0));
    const twice = completeDaily(once.profile, day(0));
    expect(twice.alreadyDone).toBe(true);
    expect(twice.coins).toBe(0);
    expect(twice.profile).toBe(once.profile);
  });

  it('goes back to 1 after a missed day, keeping the best streak', () => {
    const p = playDays([day(0), day(1), day(2)]);
    expect(p.daily.streak).toBe(3);
    const after = completeDaily(p, day(4)).profile; // day 3 was missed
    expect(after.daily.streak).toBe(1);
    expect(after.daily.best).toBe(3);
  });

  it('continues across a daylight-saving change, a new year and a leap day', () => {
    expect(playDays(['2026-03-28', '2026-03-29', '2026-03-30']).daily.streak).toBe(3);
    expect(playDays(['2026-12-30', '2026-12-31', '2027-01-01']).daily.streak).toBe(3);
    expect(playDays(['2028-02-28', '2028-02-29', '2028-03-01']).daily.streak).toBe(3);
  });

  it('reports where the streak stands today', () => {
    const none = defaultProfile();
    expect(streakStatus(none, day(0))).toMatchObject({ streak: 0, doneToday: false, atRisk: false, canSave: false });
    const p = playDays([day(0), day(1)]);
    expect(streakStatus(p, day(1))).toMatchObject({ streak: 2, doneToday: true, atRisk: false });
    expect(streakStatus(p, day(2))).toMatchObject({ streak: 2, doneToday: false, atRisk: true });
    expect(streakStatus(p, day(3))).toMatchObject({ streak: 0, atRisk: false, canSave: true, lostStreak: 2 });
    expect(streakStatus(p, day(4)).canSave).toBe(false); // two days missed: too late
  });

  it('a time zone moving west never loses the streak or lets a day be played twice', () => {
    const p = playDays([day(0), day(1)]); // completed on day(1) in, say, Tokyo
    // The player flies to Los Angeles: the local day is now day(0), "yesterday" for the saved data.
    const status = streakStatus(p, day(0));
    expect(status.doneToday).toBe(true);
    expect(status.streak).toBe(2);
    const again = completeDaily(p, day(0));
    expect(again.alreadyDone).toBe(true);
    expect(again.profile.daily.streak).toBe(2);
  });
});

describe('saving a broken streak with a rewarded ad', () => {
  it('works for exactly one missed day, once per streak, and the streak then continues', () => {
    const p = playDays([day(0), day(1), day(2)]); // last played: day 2
    expect(saveStreak(p, day(3))).toBeNull(); // yesterday was played: nothing to save
    expect(saveStreak(p, day(5))).toBeNull(); // two days missed: too late
    const saved = saveStreak(p, day(4))!; // exactly one missed day (day 3)
    expect(saved).not.toBeNull();
    expect(saved.daily.saveUsed).toBe(true);
    expect(streakStatus(saved, day(4))).toMatchObject({ streak: 3, atRisk: true });
    const next = completeDaily(saved, day(4));
    expect(next.streak).toBe(4); // 3 + today: the missed day was saved
  });

  it('is not available a second time within the same streak, but a new streak gets its own', () => {
    let p = playDays([day(0), day(1)]);
    p = saveStreak(p, day(3))!; // day(2) missed, saved
    p = completeDaily(p, day(3)).profile; // streak 3
    expect(streakStatus(p, day(5)).canSave).toBe(false); // day(4) missed again: no second save
    const restart = completeDaily(p, day(5)).profile; // streak back to 1, fresh save
    expect(restart.daily.streak).toBe(1);
    expect(restart.daily.saveUsed).toBe(false);
    expect(streakStatus(restart, day(7)).canSave).toBe(true);
  });
});

describe('exclusive skins of the streak', () => {
  it('unlocks the disco ball at 7 days and the crystal ball at 30, once', () => {
    const days7 = Array.from({ length: 7 }, (_, i) => day(i));
    const p7 = playDays(days7);
    expect(owns(p7, 'disco')).toBe(true);
    expect(owns(p7, 'crystal')).toBe(false);
    expect(completeDaily(playDays(days7.slice(0, 6)), day(6)).skin).toBe('disco');

    const days30 = Array.from({ length: 30 }, (_, i) => day(i));
    const p30 = playDays(days30);
    expect(owns(p30, 'crystal')).toBe(true);
    expect(completeDaily(playDays(days30.slice(0, 29)), day(29)).skin).toBe('crystal');
  });

  it('does not unlock a skin the player already owns', () => {
    const owner = grantItem(defaultProfile(), 'disco');
    const days7 = Array.from({ length: 7 }, (_, i) => day(i));
    expect(completeDaily(playDays(days7.slice(0, 6), owner), day(6)).skin).toBeNull();
  });
});

describe('calendar of the month', () => {
  it('lays the month out in weeks starting on Monday, with the done days ticked', () => {
    const weeks = monthCalendar(['2026-05-04', '2026-05-05'], '2026-05-10', 2026, 5);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    const cells = weeks.flat();
    expect(cells.filter(Boolean)).toHaveLength(31);
    // 1 May 2026 is a Friday: four empty cells (Mon..Thu) first.
    expect(weeks[0].slice(0, 4)).toEqual([null, null, null, null]);
    expect(weeks[0][4]).toMatchObject({ day: 1 });
    const get = (n: number) => cells.find((c) => c?.day === n)!;
    expect(get(4)!.done).toBe(true);
    expect(get(5)!.done).toBe(true);
    expect(get(6)!.done).toBe(false);
    expect(get(10)!.today).toBe(true);
    expect(get(10)!.future).toBe(false);
    expect(get(11)!.future).toBe(true);
  });

  it('handles February in a leap year', () => {
    expect(monthCalendar([], '2028-02-10', 2028, 2).flat().filter(Boolean)).toHaveLength(29);
  });
});

describe('daily reward (7-day cycle)', () => {
  it('pays 10, 15, 20, 25, 30, 40 on days 1 to 6', () => {
    let p = defaultProfile();
    const paid: number[] = [];
    for (let i = 0; i < 6; i++) {
      const before = p.coins;
      const r = claimDailyReward(p, day(i))!;
      expect(r.day).toBe(i + 1);
      p = r.profile;
      paid.push(p.coins - before);
    }
    expect(paid).toEqual([10, 15, 20, 25, 30, 40]);
  });

  it('day 7 gives the exclusive skin, then 100 coins once it is owned', () => {
    let p = defaultProfile();
    for (let i = 0; i < 6; i++) p = claimDailyReward(p, day(i))!.profile;
    const seventh = claimDailyReward(p, day(6))!;
    expect(seventh.day).toBe(7);
    expect(seventh.reward).toEqual({ coins: 0, skin: 'moon' });
    expect(owns(seventh.profile, 'moon')).toBe(true);
    // Next cycle: day 7 is coins now.
    let q = seventh.profile;
    for (let i = 7; i < 13; i++) q = claimDailyReward(q, day(i))!.profile;
    const again = claimDailyReward(q, day(13))!;
    expect(again.day).toBe(7);
    expect(rewardForDay(q, 7).coins).toBe(100);
    expect(again.reward).toEqual({ coins: 100, skin: null });
    expect(again.profile.coins).toBe(q.coins + 100);
  });

  it('starts a new cycle after day 7', () => {
    let p = defaultProfile();
    for (let i = 0; i < 7; i++) p = claimDailyReward(p, day(i))!.profile;
    expect(dailyRewardStatus(p, day(7))).toEqual({ available: true, day: 1 });
  });

  it('a missed day sends the cycle back to day 1', () => {
    let p = defaultProfile();
    for (let i = 0; i < 3; i++) p = claimDailyReward(p, day(i))!.profile; // days 1..3
    expect(dailyRewardStatus(p, day(3))).toEqual({ available: true, day: 4 });
    expect(dailyRewardStatus(p, day(4))).toEqual({ available: true, day: 1 }); // day(3) was skipped
  });

  it('can be claimed once a day, and doubled with a rewarded ad', () => {
    const first = claimDailyReward(defaultProfile(), day(0))!;
    expect(claimDailyReward(first.profile, day(0))).toBeNull();
    expect(dailyRewardStatus(first.profile, day(0)).available).toBe(false);
    expect(claimDailyReward(defaultProfile(), day(0), true)!.profile.coins).toBe(20); // 10, doubled
    // x2 never doubles a skin
    let p = defaultProfile();
    for (let i = 0; i < 6; i++) p = claimDailyReward(p, day(i))!.profile;
    const doubled7 = claimDailyReward(p, day(6), true)!;
    expect(doubled7.profile.coins).toBe(p.coins);
    expect(owns(doubled7.profile, 'moon')).toBe(true);
  });

  it('is not available again if the time zone moves back a day', () => {
    const first = claimDailyReward(defaultProfile(), day(5))!;
    expect(dailyRewardStatus(first.profile, day(4)).available).toBe(false);
  });
});
