import { t } from '../i18n';
import { MONETIZATION } from '../config/monetization';
import { addDays, dayKeyOf, daysBetween, type DayKey } from './dates';
import type { Profile } from './economy';
import { fullAt, viewOf } from './lives';
import { isVip } from './vip';

/**
 * Decides the ONE local notification to schedule: at most one per day, around 18:00, and which
 * message it carries. It is re-planned whenever the state changes (a challenge completed, the app
 * opened), so a notification for a day the player has already played is never sent.
 */
export type NotificationPlan = {
  /** Day the notification is for. */
  day: DayKey;
  hour: number;
  minute: number;
  kind: 'challenge' | 'streak';
  title: string;
  body: string;
};

export function planNotification(p: Profile, now: Date): NotificationPlan | null {
  if (!p.notifications.enabled) return null;
  const { hour, minute } = MONETIZATION.notifications;
  const today = dayKeyOf(now);
  const passed = now.getHours() > hour || (now.getHours() === hour && now.getMinutes() >= minute);
  const last = p.daily.lastCompleted;

  // Today at 18:00 if it is still ahead and the challenge is not done yet; otherwise tomorrow.
  let day = passed || last === today ? addDays(today, 1) : today;

  // The streak that will be at risk at that time (none if it would already be broken by then).
  const alive = last !== null && daysBetween(last, day) === 1 && p.daily.streak > 0;
  const base = { day, hour, minute };
  if (alive) {
    return {
      ...base,
      kind: 'streak',
      title: t('app.name'),
      body: t('notifications.streak', { count: p.daily.streak }),
    };
  }
  return { ...base, kind: 'challenge', title: t('app.name'), body: t('notifications.challenge') };
}

/** The moment to hand to the system scheduler. */
export function planDate(plan: NotificationPlan): Date {
  const [y, m, d] = plan.day.split('-').map(Number);
  return new Date(y, m - 1, d, plan.hour, plan.minute, 0, 0);
}

/** The permission is only requested once the player has played a little, never at the first launch. */
export function shouldAskNotificationPermission(p: Profile, completedLevel: number): boolean {
  return !p.notifications.asked && completedLevel >= MONETIZATION.notifications.askAfterLevel;
}

/** The permission question was shown: never ask again. */
export const notificationPermissionAsked = (p: Profile): Profile => ({ ...p, notifications: { ...p.notifications, asked: true } });

/** The notification for "your lives are all back": at the moment the last one returns (null when full, unlimited or off). */
export type LivesPlan = { date: Date; title: string; body: string };

export function planLivesNotification(p: Profile, now: Date): LivesPlan | null {
  if (!p.notifications.enabled) return null;
  if (viewOf(p.lives, now.getTime(), isVip(p.vip, now.getTime())).infinite) return null;
  const at = fullAt(p.lives, now.getTime());
  if (at === null || at <= now.getTime()) return null;
  return { date: new Date(at), title: t('app.name'), body: t('notifications.lives') };
}

/**
 * The notifications to schedule, at most one per calendar day: when the lives come back on the day of the daily reminder, only
 * the lives one is kept (it is the more useful of the two).
 */
export function planNotifications(p: Profile, now: Date): { date: Date; title: string; body: string }[] {
  const daily = planNotification(p, now);
  const lives = planLivesNotification(p, now);
  const out: { date: Date; title: string; body: string }[] = [];
  const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (daily && !(lives && sameDay(planDate(daily), lives.date))) out.push({ date: planDate(daily), title: daily.title, body: daily.body });
  if (lives) out.push(lives);
  return out;
}
