import { t } from '../i18n';
import type { Placement } from '../config/monetization';
import { MONETIZATION } from '../config/monetization';
import { track } from './analytics';
import { noteAdEnded } from './playClock';
import { showToast } from './toast';
import { dayKeyOf } from '../game/dates';
import { canWatchRewarded, newlyReached, registerRewardedAd, rolloverRewards } from '../game/rewards';
import { getProfile, updateProfile } from '../storage/profile';

/**
 * Ads. The game only talks to the `ads` object below; what is behind it can change.
 *
 * Today (Expo Go): a MOCK. Every ad is a 3-second full-screen "PUB (simulation)" (drawn by <AdHost />)
 * and then succeeds. Rewarded ads are the player's choice (x2 coins, a hint, saving a streak);
 * interstitials are decided by game/adRules.ts, never in a level.
 *
 * Later (development build), replace it with `react-native-google-mobile-ads`:
 *   1. `npx expo install react-native-google-mobile-ads`, add its config plugin to app.json with your
 *      AdMob app ids, and make a dev build (`eas build --profile development`).
 *   2. iOS: ask App Tracking Transparency once at first launch (`expo-tracking-transparency`).
 *   3. Everywhere: ask GDPR consent with the UMP form (`AdsConsent.requestInfoUpdate` +
 *      `loadAndShowConsentFormIfRequired`) before initialising the SDK.
 *   4. `mobileAds().initialize()`, then implement `AdsService` with RewardedAd / InterstitialAd
 *      (preload the next one, resolve `showRewarded` with true only on the EARNED_REWARD event).
 *   5. Call `setAdsImplementation(realAds)` once at start-up (src/app/_layout.tsx). Nothing else changes.
 */
export interface AdsService {
  init(): Promise<void>;
  /** Resolves true when the player watched the ad to the end and earned the reward. */
  showRewarded(placement: Placement): Promise<boolean>;
  /** Resolves when the ad is closed (true if one was shown). */
  showInterstitial(): Promise<boolean>;
}

/** What <AdHost /> is asked to display. */
export type MockAdRequest = {
  kind: 'rewarded' | 'interstitial';
  placement?: Placement;
  seconds: number;
  resolve: (ok: boolean) => void;
};

type HostListener = (request: MockAdRequest) => void;
const hosts = new Set<HostListener>();

/** <AdHost /> registers itself here. */
export function registerMockAdHost(listener: HostListener): () => void {
  hosts.add(listener);
  return () => hosts.delete(listener);
}

class MockAds implements AdsService {
  async init() {}

  private show(kind: MockAdRequest['kind'], placement?: Placement): Promise<boolean> {
    return new Promise((resolve) => {
      const host = [...hosts][0];
      // No screen to draw on (tests, headless): behave as if the ad had been watched.
      if (!host) return resolve(true);
      host({ kind, placement, seconds: MONETIZATION.mockAdSeconds, resolve });
    });
  }

  showRewarded(placement: Placement) {
    return this.show('rewarded', placement);
  }
  showInterstitial() {
    return this.show('interstitial');
  }
}

let impl: AdsService = new MockAds();

export function setAdsImplementation(next: AdsService) {
  impl = next;
}

/** The names the analytics know the placements by. */
export const PLACEMENT_LABEL: Record<Placement, string> = {
  double_reward: 'chest_x2',
  hint: 'hint',
  save_streak: 'streak',
  keep_streak: 'streak',
  daily_reward_double: 'daily_reward_x2',
  daily_double: 'daily_reward_x2',
  extra_moves: 'extra_moves',
  extra_life: 'life',
  playtime_chest_x2: 'playtime_chest_x2',
  free_coins: 'free_coins',
  ad_unlock: 'ad_unlock',
  wheel_spin: 'wheel_spin',
  try_item: 'try_item',
};

/** What the player is told when a rewarded ad did not give its reward. */
export const AD_MESSAGES = {
  get interrupted() {
    return t('ads.interrupted');
  },
  get unavailable() {
    return t('ads.unavailable');
  },
  get capped() {
    return t('ads.capped');
  },
};

export const ads: AdsService = {
  init: () => impl.init(),
  /**
   * A rewarded ad: true only when it was watched to the end. A reward is never given otherwise: an ad closed early or one that fails
   * says so in a message. At most `rewardedAdsPerDay` a day, all sources together; each one watched counts for the bonus of the day and
   * starts the interstitial count again.
   */
  async showRewarded(placement) {
    const today = dayKeyOf(new Date());
    updateProfile((p) => rolloverRewards(p, today));
    if (!canWatchRewarded(getProfile().rewards)) {
      showToast(AD_MESSAGES.capped);
      return false;
    }
    const label = PLACEMENT_LABEL[placement];
    track('rewarded_shown', { placement: label });
    let ok = false;
    try {
      ok = await impl.showRewarded(placement);
    } catch {
      showToast(AD_MESSAGES.unavailable);
      return false;
    }
    if (!ok) {
      showToast(AD_MESSAGES.interrupted);
      return false;
    }
    const before = getProfile().rewards;
    updateProfile(registerRewardedAd);
    track('rewarded_completed', { placement: label });
    track('ad_shown', { type: 'rewarded', placement });
    // A rewarded ad watched on purpose starts the interstitial count again.
    noteAdEnded();
    if (newlyReached(before, getProfile().rewards).length > 0) showToast(t('ads.milestone'));
    return true;
  },
  async showInterstitial() {
    const shown = await impl.showInterstitial();
    if (shown) {
      track('ad_shown', { type: 'interstitial' });
      noteAdEnded();
    }
    return shown;
  },
};
