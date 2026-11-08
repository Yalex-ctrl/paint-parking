/** App-wide numbers that are not about money (see monetization.ts for those). */
export const LOADING = {
  /** The loading screen stays at least this long (ms) when the app starts... */
  launchMinMs: 2500,
  /** ...and this long between two screens. */
  transitionMinMs: 1500,
  /** Fade in and fade out of the loading screen. */
  fadeMs: 300,
  /** A tip stays this long before the next one. */
  tipMs: 2600,
} as const;

/** Parts of the app that can be switched on. */
export const features = {
  /** The map of the levels: put aside (its code is kept, nothing leads to it and nothing of it is loaded at start-up). */
  levelMap: false,
} as const;

/** Height (px) kept free at the very bottom of the level for an ad banner (empty for now; the layout already counts it). */
export const adsBannerHeight = 60;
