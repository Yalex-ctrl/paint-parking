import { MONETIZATION } from './config/monetization';
import type { Profile } from './economy';
import { isVip } from './vip';

/**
 * When an interstitial (a full-screen ad the player did not ask for) may be shown. Rewarded ads are always the player's choice and
 * never go through these rules, but watching one starts the count again. All the times are seconds of ACTIVE play (the app on
 * screen), never the clock: coming back after a long absence shows nothing. Pure: the numbers come from the play clock
 * (services/playClock.ts).
 */
export type InterstitialContext = {
  /** The level that was just completed. */
  completedLevel: number;
  /** A level is being played right now: never. */
  inLevel?: boolean;
  /** The guided tour or a tutorial is on screen: never. */
  inTour?: boolean;
  /** Seconds of active play since the app was opened. */
  sessionSeconds: number;
  /** Seconds of active play, all sessions together: the time the other numbers are measured on. */
  playSeconds: number;
  /** `playSeconds` when the last ad of any kind ended (rewarded or not), null if none ever. */
  lastAdAt: number | null;
  /** `playSeconds` of the last failure or purchase, null if none. */
  lastEventAt: number | null;
};

export function shouldShowInterstitial(p: Profile, ctx: InterstitialContext, now = Date.now()): boolean {
  const cfg = MONETIZATION.interstitial;
  if (p.adsRemoved || isVip(p.vip, now)) return false;
  if (ctx.inLevel || ctx.inTour) return false;
  if (ctx.completedLevel < cfg.minLevel) return false;
  // Never during the first minutes of a session (nor right after the app was opened).
  if (ctx.sessionSeconds < cfg.minSessionSec) return false;
  // At least five minutes since the last ad, whatever its kind.
  if (ctx.lastAdAt !== null && ctx.playSeconds - ctx.lastAdAt < cfg.interstitialMinIntervalSec) return false;
  // Never right after a failure or a purchase.
  if (ctx.lastEventAt !== null && ctx.playSeconds - ctx.lastEventAt < cfg.quietAfterEventSec) return false;
  return true;
}

/** An interstitial was shown: counted (for the statistics). */
export const registerInterstitial = (p: Profile, now: number): Profile => ({
  ...p,
  ads: { ...p.ads, interstitialsShown: p.ads.interstitialsShown + 1, lastInterstitialAt: now },
});
