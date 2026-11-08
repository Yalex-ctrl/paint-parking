import { Platform, TurboModuleRegistry } from 'react-native';

import { testerTools } from '../config/tester';
import { setAdPlaying } from './audio';
import { setAdsImplementation, type AdsService } from './ads';
import type { Placement } from '../config/monetization';

/**
 * The real ads (Google AdMob, react-native-google-mobile-ads), plugged behind the `AdsService` interface of ads.ts. Every rule of the
 * game (frequency, level 10, session time, daily cap, no ads for VIP / "Sans pub") stays in ads.ts, game/adRules.ts and game/rewards.ts.
 *
 * Start-up order, before any ad is asked for:
 *   1. the consent form of Google (UMP, GDPR) when it is required,
 *   2. the iOS App Tracking Transparency question (once),
 *   3. the SDK; with non-personalised ads when tracking is refused.
 * A rewarded ad gives its reward only when the player earned it (watched to the end) AND the ad was then closed.
 *
 * Only started when the native module is there (a development or production build). In Expo Go the simulated ad stays.
 * The ad unit ids come from the environment (EXPO_PUBLIC_ADMOB_IOS_*), set for the production build only; everywhere else, and
 * while they are not set, Google's TEST units are used, so a real ad is never shown or clicked by mistake.
 */

type Ads = typeof import('react-native-google-mobile-ads');

const ENV = {
  interstitial: process.env.EXPO_PUBLIC_ADMOB_IOS_INTERSTITIAL,
  rewarded: process.env.EXPO_PUBLIC_ADMOB_IOS_REWARDED,
  banner: process.env.EXPO_PUBLIC_ADMOB_IOS_BANNER,
};

let mod: Ads | null = null;
let nonPersonalized = true;
let started = false;

const warn = (what: string, err?: unknown) => {
  if (testerTools()) console.log(`[admob] ${what}`, err ?? '');
};

/** The unit id for a kind of ad: the real one only when it is given, otherwise Google's test unit. */
export function adUnitId(kind: 'interstitial' | 'rewarded' | 'banner'): string {
  const ids = mod?.TestIds;
  const test = kind === 'interstitial' ? ids?.INTERSTITIAL : kind === 'rewarded' ? ids?.REWARDED : ids?.BANNER;
  return ENV[kind] || test || '';
}

/** Whether ads may be requested (consent given or not required). */
let canRequest = false;

async function gatherConsent(ads: Ads): Promise<void> {
  try {
    await ads.AdsConsent.requestInfoUpdate();
    const info = await ads.AdsConsent.loadAndShowConsentFormIfRequired();
    canRequest = info.canRequestAds;
  } catch (err) {
    warn('consent', err);
    // Without a consent answer, ads are asked for in the non-personalised way only.
    canRequest = true;
  }
}

async function askTracking(): Promise<void> {
  if (Platform.OS !== 'ios') return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const att = require('expo-tracking-transparency') as typeof import('expo-tracking-transparency');
    const current = await att.getTrackingPermissionsAsync();
    const status = current.status === 'undetermined' ? (await att.requestTrackingPermissionsAsync()).status : current.status;
    nonPersonalized = status !== 'granted';
  } catch (err) {
    warn('tracking', err);
    nonPersonalized = true;
  }
}

/** "Confidentialité publicitaire" in the settings: shows the consent choices again when the rules say they must be offered. */
export async function showPrivacyOptions(): Promise<boolean> {
  if (!mod) return false;
  try {
    const info = await mod.AdsConsent.getConsentInfo();
    if (info.privacyOptionsRequirementStatus !== mod.AdsConsentPrivacyOptionsRequirementStatus.REQUIRED) return false;
    await mod.AdsConsent.showPrivacyOptionsForm();
    return true;
  } catch (err) {
    warn('privacy options', err);
    return false;
  }
}

export const adsNonPersonalized = () => nonPersonalized;
/** True when the real ads are in place (not in Expo Go). */
export const adsStarted = () => mod !== null;
export const adsReady = () => started && canRequest;

type AnyAd = {
  load(): void;
  show(): Promise<void>;
  addAdEventListener(type: string, listener: (arg?: unknown) => void): () => void;
};

/** One preloaded ad of a kind; asks for the next one as soon as the current one is used or has failed. */
class Slot {
  private ad: AnyAd | null = null;
  private loaded = false;
  private retry: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly kind: 'interstitial' | 'rewarded',
    private readonly ads: () => Ads,
  ) {}

  load() {
    if (!canRequest || this.ad) return;
    const a = this.ads();
    const options = { requestNonPersonalizedAdsOnly: nonPersonalized };
    const ad = (this.kind === 'rewarded' ? a.RewardedAd : a.InterstitialAd).createForAdRequest(adUnitId(this.kind), options) as unknown as AnyAd;
    this.ad = ad;
    this.loaded = false;
    const off: (() => void)[] = [];
    const drop = () => {
      off.forEach((f) => f());
      this.ad = null;
      this.loaded = false;
    };
    off.push(ad.addAdEventListener(this.kind === 'rewarded' ? a.RewardedAdEventType.LOADED : a.AdEventType.LOADED, () => (this.loaded = true)));
    off.push(
      ad.addAdEventListener(a.AdEventType.ERROR, (err) => {
        warn(`${this.kind} failed to load`, err);
        drop();
        // Try again later, not in a loop.
        if (this.retry) clearTimeout(this.retry);
        this.retry = setTimeout(() => this.load(), 30_000);
      }),
    );
    ad.load();
  }

  isReady() {
    return this.loaded && this.ad !== null;
  }

  /** The ad that is ready, taken out of the slot (the next one is asked for by the caller when this one closes). */
  take(): AnyAd | null {
    if (!this.isReady()) return null;
    const ad = this.ad;
    this.ad = null;
    this.loaded = false;
    return ad;
  }
}

class RealAds implements AdsService {
  private interstitial = new Slot('interstitial', () => mod as Ads);
  private rewarded = new Slot('rewarded', () => mod as Ads);

  async init() {
    if (started || !mod) return;
    started = true;
    await gatherConsent(mod);
    await askTracking();
    if (!canRequest) return;
    try {
      await mod.default().setRequestConfiguration({ maxAdContentRating: mod.MaxAdContentRating.PG, tagForChildDirectedTreatment: false });
      await mod.default().initialize();
    } catch (err) {
      warn('initialize', err);
    }
    this.interstitial.load();
    this.rewarded.load();
  }

  /** Shows an ad taken from `slot`; resolves with whether the reward was earned (always false for an interstitial). */
  private play(slot: Slot, kind: 'interstitial' | 'rewarded'): Promise<{ shown: boolean; earned: boolean }> {
    const ad = slot.take();
    if (!ad || !mod) {
      slot.load();
      return Promise.resolve({ shown: false, earned: false });
    }
    const a = mod;
    return new Promise((resolve) => {
      let earned = false;
      const off: (() => void)[] = [];
      const done = (shown: boolean) => {
        off.forEach((f) => f());
        setAdPlaying(false);
        slot.load();
        resolve({ shown, earned });
      };
      if (kind === 'rewarded') off.push(ad.addAdEventListener(a.RewardedAdEventType.EARNED_REWARD, () => (earned = true)));
      off.push(ad.addAdEventListener(a.AdEventType.CLOSED, () => done(true)));
      off.push(
        ad.addAdEventListener(a.AdEventType.ERROR, (err) => {
          warn(`${kind} failed to show`, err);
          done(false);
        }),
      );
      setAdPlaying(true);
      ad.show().catch((err) => {
        warn(`${kind} show`, err);
        done(false);
      });
    });
  }

  async showRewarded(_placement: Placement): Promise<boolean> {
    // No ad to show is not an interrupted ad: the caller tells the player "no ad available" (ads.ts catches this).
    if (!adsReady()) throw new Error('ads not ready');
    if (!this.rewarded.isReady()) {
      this.rewarded.load();
      // A short wait for an ad that is on its way, never a blocked screen.
      for (let i = 0; i < 12 && !this.rewarded.isReady(); i++) await new Promise((r) => setTimeout(r, 500));
    }
    if (!this.rewarded.isReady()) throw new Error('no rewarded ad available');
    const { shown, earned } = await this.play(this.rewarded, 'rewarded');
    if (!shown) throw new Error('rewarded ad failed to show');
    return earned;
  }

  async showInterstitial(): Promise<boolean> {
    if (!adsReady() || !this.interstitial.isReady()) return false;
    const { shown } = await this.play(this.interstitial, 'interstitial');
    return shown;
  }
}

/** Plugs the real ads in when the native module is there. Returns false (the simulated ads stay) in Expo Go. */
export function startAdMob(): boolean {
  if (mod) return true;
  // Look before loading: in Expo Go the native part is missing and the package throws when it is loaded, which Metro shows as an
  // error in development even though the try below catches it.
  if (!TurboModuleRegistry.get('RNGoogleMobileAdsModule')) {
    warn('module not available (Expo Go): the simulated ads stay');
    return false;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const candidate = require('react-native-google-mobile-ads') as Ads;
    // In Expo Go the native part is missing: this call throws and the simulated ads stay.
    candidate.default();
    mod = candidate;
    setAdsImplementation(new RealAds());
    return true;
  } catch (err) {
    warn('module not available', err);
    mod = null;
    return false;
  }
}
