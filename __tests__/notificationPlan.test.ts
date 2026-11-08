import { completeDaily } from '../src/game/daily';
import { defaultProfile, type Profile } from '../src/game/economy';
import { planDate, planNotification, shouldAskNotificationPermission } from '../src/game/notificationPlan';

const at = (iso: string) => {
  const [d, t = '00:00'] = iso.split(' ');
  const [y, m, day] = d.split('-').map(Number);
  const [h, min] = t.split(':').map(Number);
  return new Date(y, m - 1, day, h, min);
};

const played = (...days: string[]): Profile => days.reduce((p, d) => completeDaily(p, d).profile, defaultProfile());

describe('notification plan', () => {
  it('is one notification at 18:00: today if it is still ahead', () => {
    const plan = planNotification(defaultProfile(), at('2026-05-10 09:00'))!;
    expect(plan.day).toBe('2026-05-10');
    expect([plan.hour, plan.minute]).toEqual([18, 0]);
    expect(planDate(plan).getTime()).toBe(at('2026-05-10 18:00').getTime());
  });

  it('moves to tomorrow once 18:00 has passed', () => {
    expect(planNotification(defaultProfile(), at('2026-05-10 18:00'))!.day).toBe('2026-05-11');
    expect(planNotification(defaultProfile(), at('2026-05-10 23:59'))!.day).toBe('2026-05-11');
    expect(planNotification(defaultProfile(), at('2026-05-10 17:59'))!.day).toBe('2026-05-10');
  });

  it('skips today when the challenge is already done', () => {
    const p = played('2026-05-10');
    expect(planNotification(p, at('2026-05-10 09:00'))!.day).toBe('2026-05-11');
  });

  it('reminds of the challenge when there is no streak', () => {
    const plan = planNotification(defaultProfile(), at('2026-05-10 09:00'))!;
    expect(plan.kind).toBe('challenge');
    expect(plan.body).toContain('défi du jour');
  });

  it('warns that the streak is in danger when it would break, with its length', () => {
    const p = played('2026-05-08', '2026-05-09'); // streak of 2, not played on the 10th yet
    const today = planNotification(p, at('2026-05-10 09:00'))!;
    expect(today.kind).toBe('streak');
    expect(today.body).toContain('2 jours');
    expect(today.body).toContain('danger');
    // After playing on the 10th, tomorrow's reminder is about the streak of 3.
    const next = planNotification(played('2026-05-08', '2026-05-09', '2026-05-10'), at('2026-05-10 21:00'))!;
    expect(next).toMatchObject({ day: '2026-05-11', kind: 'streak' });
    expect(next.body).toContain('3 jours');
  });

  it('does not talk about a streak that is already lost', () => {
    const p = played('2026-05-01', '2026-05-02');
    expect(planNotification(p, at('2026-05-10 09:00'))!.kind).toBe('challenge');
  });

  it('is nothing when notifications are off', () => {
    const off = { ...defaultProfile(), notifications: { enabled: false, asked: true } };
    expect(planNotification(off, at('2026-05-10 09:00'))).toBeNull();
  });

  it('asks the permission only after level 3, and only once', () => {
    const p = defaultProfile();
    expect(shouldAskNotificationPermission(p, 1)).toBe(false);
    expect(shouldAskNotificationPermission(p, 2)).toBe(false);
    expect(shouldAskNotificationPermission(p, 3)).toBe(true);
    expect(shouldAskNotificationPermission({ ...p, notifications: { enabled: true, asked: true } }, 9)).toBe(false);
  });
});
