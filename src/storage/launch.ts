import { recordLaunch } from '../game/economy';
import { syncNotifications } from '../services/notifications';
import { getProfile, loadProfile, updateProfile } from './profile';

let started: Promise<{ firstLaunch: boolean }> | null = null;
let firstLaunchHandled = false;

/**
 * Called once when the app starts: loads the profile, counts this launch, and tells whether it is the very
 * first one ever (the home screen is skipped then: the player lands straight in level 1).
 */
export function startApp(): Promise<{ firstLaunch: boolean }> {
  started ??= loadProfile().then((p) => {
    const firstLaunch = p.launches === 0;
    updateProfile(recordLaunch);
    syncNotifications(getProfile());
    return { firstLaunch };
  });
  return started;
}

/** True once, on the first launch ever: the caller should go straight to level 1. */
export async function takeFirstLaunch(): Promise<boolean> {
  const { firstLaunch } = await startApp();
  if (!firstLaunch || firstLaunchHandled) return false;
  firstLaunchHandled = true;
  return true;
}
