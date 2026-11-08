import * as Notifications from 'expo-notifications';

import { planNotifications } from '../notificationPlan';
import type { Profile } from '../economy';

/**
 * Local notifications (nothing is sent from a server, so it all works in Expo Go): at most one a day,
 * around 18:00, either a reminder of the daily challenge or a warning that the streak is in danger.
 * What to say and when is decided by game/notificationPlan.ts (pure, tested); this file only talks to the OS.
 * Every call is wrapped: a notification problem must never disturb the game.
 */
let handlerSet = false;

function ensureHandler() {
  if (handlerSet) return;
  handlerSet = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

export async function hasNotificationPermission(): Promise<boolean> {
  try {
    return (await Notifications.getPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

/** Shows the system permission dialog. Only call it after the player has played a little. */
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    ensureHandler();
    return (await Notifications.requestPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

/** Replaces every scheduled notification by the one the profile calls for (or none). */
export async function syncNotifications(profile: Profile, now = new Date()): Promise<void> {
  try {
    ensureHandler();
    await Notifications.cancelAllScheduledNotificationsAsync();
    const plans = planNotifications(profile, now);
    if (plans.length === 0 || !(await hasNotificationPermission())) return;
    for (const plan of plans) {
      await Notifications.scheduleNotificationAsync({
        content: { title: plan.title, body: plan.body },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: plan.date },
      });
    }
  } catch {
    // Not available (e.g. a platform without local notifications): the game goes on.
  }
}
