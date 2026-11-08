import { t } from '../i18n';
/** The loading screen only appears when the wait is longer than this (ms): a short wait must not flash it. */
export const LOADING_SHOW_AFTER_MS = 150;
/** Once it is shown it stays at least this long (ms), so it never flickers. */
export const LOADING_MIN_SHOWN_MS = 400;
/** The fade out when the scene is ready. */
export const LOADING_FADE_MS = 360;

/** The keys of the tips (loading.tips.<key> in the language files). */
export const TIPS = ['minimum', 'bends', 'streak', 'piggy', 'stop', 'portals', 'fragile', 'bomb', 'lives', 'hint', 'daily', 'exit'] as const;

/** The text of a tip in the language on screen. */
export const tipText = (key: (typeof TIPS)[number]): string => t(`loading.tips.${key}`);

/** A tip, at random (`random` can be given for tests). */
export const pickTip = (random: () => number = Math.random): string => tipText(TIPS[Math.floor(random() * TIPS.length) % TIPS.length]);

/**
 * When things happen on the loading screen if the scene is ready `readyAfterMs` after the wait began: the content appears at
 * `showAt` (null = never, the wait was short), and the fade out starts at `fadeAt`. Pure, so the anti-flicker rules are tested.
 */
export function loadingTimeline(readyAfterMs: number): { showAt: number | null; fadeAt: number } {
  if (readyAfterMs < LOADING_SHOW_AFTER_MS) return { showAt: null, fadeAt: readyAfterMs };
  return { showAt: LOADING_SHOW_AFTER_MS, fadeAt: Math.max(readyAfterMs, LOADING_SHOW_AFTER_MS + LOADING_MIN_SHOWN_MS) };
}
