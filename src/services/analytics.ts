/**
 * Analytics: `track(event, params)`. For now it only logs to the console (no SDK, so it works in Expo Go).
 * Plug a real provider in with `setAnalyticsImplementation` (Firebase, Amplitude, PostHog...).
 */
import { benchTimed } from '../render/bench';

export type AnalyticsEvent =
  | 'level_start' // { level, mode }
  | 'level_complete' // { level, moves, stars, duration_s, mode }
  | 'hint_used' // { level, method: 'coins' | 'ad' }
  | 'ad_shown' // { type: 'rewarded' | 'interstitial', placement? }
  | 'ad_interstitial_shown' // { level, since_last_ad_s }
  | 'rewarded_shown' // { placement }
  | 'rewarded_completed' // { placement }
  | 'ad_milestone_claimed' // { ads }
  | 'purchase' // { product, price }
  | 'purchase_recovered' // { product } (a purchase cut short, credited at the next launch)
  | 'daily_challenge_complete' // { day, streak, coins }
  | 'shop_item_bought' // { item, kind, price }
  | 'streak_up' // { streak, multiplier }
  | 'streak_lost' // { value }
  | 'streak_saved' // { value, method: 'ad' | 'coins' }
  | 'piggy_broken' // { coins }
  | 'paywall_shown' // { source: 'offres' | 'cadeaux' | 'vies' | 'reglages' | 'auto_level20' | 'auto_weekly' }
  | 'paywall_closed' // { source, purchased }
  | 'subscription_started' // { plan }
  | 'subscription_renewed' // { plan }
  | 'subscription_expired' // { plan }
  | 'vip_daily_claimed' // { coins }
  | 'vip_ball_unlocked' // { ball, month }
  | 'scene_error'; // { where: 'render' | 'frame', message }

export type AnalyticsParams = Record<string, string | number | boolean | null | undefined>;

export type AnalyticsImplementation = (event: AnalyticsEvent, params?: AnalyticsParams) => void;

const consoleLogger: AnalyticsImplementation = (event, params) => {
  console.log(`[analytics] ${event}`, params ?? {});
};

let impl: AnalyticsImplementation = consoleLogger;

export function track(event: AnalyticsEvent, params?: AnalyticsParams): void {
  try {
    benchTimed(`analytics ${event}`, () => impl(event, params));
  } catch {
    // Analytics must never break the game.
  }
}

export function setAnalyticsImplementation(next: AnalyticsImplementation | null) {
  impl = next ?? consoleLogger;
}
