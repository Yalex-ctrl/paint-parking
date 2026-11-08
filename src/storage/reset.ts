import AsyncStorage from '@react-native-async-storage/async-storage';

import { MONETIZATION } from '../config/monetization';
import { defaultProfile, grantItem, type Profile } from '../game/economy';
import { flushIdleQueue } from '../services/idleQueue';
import { KEYS, PROGRESS_KEYS } from './keys';
import { forgetProgress } from './progress';
import { resetPlayTime } from '../services/playTime';
import { resetAudioSettings } from './settings';
import { flushProfile, getProfile, replaceProfile, updateProfile } from './profile';

/**
 * What a reset brings back: the profile of a brand-new player, except that the purchases made with real money are
 * not erased (no ads; the starter pack and the balls it contains).
 */
export function freshProfileKeepingPurchases(old: Profile): Profile {
  let p = defaultProfile();
  if (old.adsRemoved) p = { ...p, adsRemoved: true };
  // The subscription is the store's: it stays, with the balls of the months already paid.
  if (old.vip.plan || old.vip.expiresAt) {
    p = { ...p, vip: old.vip };
    for (const id of MONETIZATION.vip.balls.slice(0, old.vip.ballsGiven)) p = grantItem(p, id);
  }
  if (old.starter.purchased) {
    p = { ...p, starter: { ...p.starter, purchased: true } };
    for (const id of MONETIZATION.products.starterPack.skins) p = grantItem(p, id);
  }
  return p;
}

/**
 * "Remettre à zéro": erases the progress (levels, stars, coins, what was bought with coins, daily challenge and streak,
 * daily reward, gallery, chests, tutorial flags, the starter-pack timer) and leaves the app as at its very first launch.
 * Purchases made with real money, and the preferences, stay.
 */
export async function resetProgress(): Promise<void> {
  const fresh = freshProfileKeepingPurchases(getProfile());
  // What was waiting to be written must not come back after the wipe.
  flushIdleQueue();
  await AsyncStorage.multiRemove([...PROGRESS_KEYS]);
  forgetProgress();
  resetPlayTime();
  // The in-memory copy of the profile too, and what is saved for the next start.
  replaceProfile(fresh);
  await flushProfile();
  // The volumes and the sound switches go back to their defaults too (the other preferences stay).
  await resetAudioSettings();
}

/** "Revoir le tutoriel": the hand of the first level and the mechanic explanations come back; the progress is untouched. */
export async function replayTutorial(): Promise<void> {
  await AsyncStorage.removeItem(KEYS.tutorials);
  updateProfile((p) => ({ ...p, handSeen: false, tourCompleted: false, tourPostponedCount: 0 }));
  await flushProfile();
}
