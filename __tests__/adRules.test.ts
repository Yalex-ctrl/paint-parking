jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import { MONETIZATION } from '../src/config/monetization';
import { registerInterstitial, shouldShowInterstitial, type InterstitialContext } from '../src/game/adRules';
import { applyRemoveAds, defaultProfile } from '../src/game/economy';
import { ads, setAdsImplementation, type AdsService } from '../src/services/ads';
import { _setPlayClockForTests, noteAdEnded, noteEvent, playContext, resetPlayClockForTests } from '../src/services/playClock';
import { setAnalyticsImplementation } from '../src/services/analytics';

/** A moment of play that satisfies every rule; each test breaks one. */
const ok = (over: Partial<InterstitialContext> = {}): InterstitialContext => ({
  completedLevel: 12,
  sessionSeconds: 600,
  playSeconds: 3000,
  lastAdAt: null,
  lastEventAt: null,
  ...over,
});

describe('interstitial rules', () => {
  const p = defaultProfile();

  it('are in the config: 5 minutes, level 10, 3 minutes of session', () => {
    expect(MONETIZATION.interstitial.interstitialMinIntervalSec).toBe(300);
    expect(MONETIZATION.interstitial.minLevel).toBe(10);
    expect(MONETIZATION.interstitial.minSessionSec).toBe(180);
  });

  it('show when everything is right', () => {
    expect(shouldShowInterstitial(p, ok())).toBe(true);
  });

  it('never before level 10', () => {
    for (let level = 1; level < 10; level++) expect(shouldShowInterstitial(p, ok({ completedLevel: level }))).toBe(false);
    expect(shouldShowInterstitial(p, ok({ completedLevel: 10 }))).toBe(true);
  });

  it('never while a level is being played, nor during the tour or a tutorial', () => {
    expect(shouldShowInterstitial(p, ok({ inLevel: true }))).toBe(false);
    expect(shouldShowInterstitial(p, ok({ inTour: true }))).toBe(false);
  });

  it('never in the first three minutes of a session (nor just after the app was opened)', () => {
    expect(shouldShowInterstitial(p, ok({ sessionSeconds: 0 }))).toBe(false);
    expect(shouldShowInterstitial(p, ok({ sessionSeconds: 179 }))).toBe(false);
    expect(shouldShowInterstitial(p, ok({ sessionSeconds: 180 }))).toBe(true);
  });

  it('at least five minutes of play after the last ad, whatever its kind', () => {
    expect(shouldShowInterstitial(p, ok({ lastAdAt: 2800, playSeconds: 3000 }))).toBe(false);
    expect(shouldShowInterstitial(p, ok({ lastAdAt: 2701, playSeconds: 3000 }))).toBe(false);
    expect(shouldShowInterstitial(p, ok({ lastAdAt: 2700, playSeconds: 3000 }))).toBe(true);
  });

  it('never right after a failure or a purchase', () => {
    expect(shouldShowInterstitial(p, ok({ lastEventAt: 2990, playSeconds: 3000 }))).toBe(false);
    expect(shouldShowInterstitial(p, ok({ lastEventAt: 2900, playSeconds: 3000 }))).toBe(true);
  });

  it('never once "no ads" is bought', () => {
    expect(shouldShowInterstitial(applyRemoveAds(p), ok())).toBe(false);
  });

  it('the time is play time, not the clock: a long absence changes nothing', () => {
    // the player left for a week: the play clock did not move, so the five minutes are still not over
    expect(shouldShowInterstitial(p, ok({ lastAdAt: 2900, playSeconds: 3000 }))).toBe(false);
  });

  it('showing one is counted', () => {
    const q = registerInterstitial(p, 123);
    expect(q.ads.interstitialsShown).toBe(1);
    expect(q.ads.lastInterstitialAt).toBe(123);
  });
});

describe('the play clock', () => {
  beforeEach(() => {
    resetPlayClockForTests();
    setAnalyticsImplementation(() => {});
  });
  afterEach(() => setAnalyticsImplementation(null));

  it('remembers when the last ad ended and the last failure or purchase, in play seconds', () => {
    _setPlayClockForTests({ total: 1000, session: 400 });
    expect(playContext()).toEqual({ sessionSeconds: 400, playSeconds: 1000, lastAdAt: null, lastEventAt: null });
    noteAdEnded();
    noteEvent();
    expect(playContext()).toMatchObject({ lastAdAt: 1000, lastEventAt: 1000 });
  });

  it('a rewarded ad watched on purpose starts the interstitial count again; an interrupted one does not', async () => {
    _setPlayClockForTests({ total: 2000, session: 900 });
    const real: AdsService = { init: async () => {}, showRewarded: async () => true, showInterstitial: async () => true };
    setAdsImplementation(real);
    expect(shouldShowInterstitial(defaultProfile(), { completedLevel: 20, ...playContext() })).toBe(true);
    await ads.showRewarded('hint');
    expect(playContext().lastAdAt).toBe(2000);
    expect(shouldShowInterstitial(defaultProfile(), { completedLevel: 20, ...playContext() })).toBe(false);
    // after five minutes of play it is possible again
    _setPlayClockForTests({ total: 2300, session: 1200 });
    expect(shouldShowInterstitial(defaultProfile(), { completedLevel: 20, ...playContext() })).toBe(true);
    // an interrupted rewarded ad does not count
    resetPlayClockForTests();
    _setPlayClockForTests({ total: 5000, session: 900 });
    setAdsImplementation({ ...real, showRewarded: async () => false });
    await ads.showRewarded('hint');
    expect(playContext().lastAdAt).toBeNull();
  });

  it('an interstitial that was shown also starts the count again', async () => {
    _setPlayClockForTests({ total: 4000, session: 900 });
    setAdsImplementation({ init: async () => {}, showRewarded: async () => true, showInterstitial: async () => true });
    await ads.showInterstitial();
    expect(playContext().lastAdAt).toBe(4000);
  });
});
