/**
 * Every AsyncStorage key of the app, in one place. A "reset progress" removes the PROGRESS keys, so a key that is not
 * listed here would survive it: a test checks that no other file writes its own key.
 */
export const KEYS = {
  /** Coins, shop, daily challenge and streak, daily reward, chests, starter timer, launch counter, tutorial hand... */
  profile: 'paint-parking/profile/v1',
  /** Where the coins used to be saved by earlier versions (read once, to migrate). */
  oldWallet: 'paint-parking/wallet/v1',
  /** Level reached, stars and best moves per level (version 2: the levels were redesigned, the first campaign's progress is dropped). */
  progress: 'paint-parking/progress/v3',
  /** The progress of the second campaign (before the slides, floors and collapsing floor): only ever removed. */
  progressV2: 'paint-parking/progress/v2',
  /** The progress of the first campaign: only ever removed. */
  progressV1: 'paint-parking/progress/v1',
  /** Which mechanic explanations were already shown. */
  tutorials: 'paint-parking/tutorials-seen/v1',
  /** The last level the map showed as current (to animate the jump to the next one). */
  mapSeen: 'paint-parking/map-seen/v1',
  /** Sound, vibrations, scenery: preferences, not progress. */
  settings: 'paint-parking/settings/v1',
  /** Real-money purchases made in the simulated store: kept by a reset, like the real ones would be. */
  mockReceipts: 'paint-parking/mock-receipts/v1',
  /** The store transactions of consumables that have already been credited (kept by a reset, or they would be credited again). */
  creditedTransactions: 'paint-parking/credited-transactions/v1',
  /** The simulated store's record of the VIP pass (a reinstall finds it again, like the real store's): kept by a reset. */
  mockVip: 'paint-parking/mock-vip/v1',
  /** Seconds of active play and when the last ad / failure happened (the interstitial rules): a clock, not progress. */
  playClock: 'paint-parking/play-clock/v1',
} as const;

/** Wiped by "Remettre à zéro". */
export const PROGRESS_KEYS = [KEYS.profile, KEYS.oldWallet, KEYS.progress, KEYS.progressV2, KEYS.progressV1, KEYS.tutorials, KEYS.mapSeen] as const;

/** Survive a reset. */
export const KEPT_KEYS = [KEYS.settings, KEYS.mockReceipts, KEYS.mockVip, KEYS.creditedTransactions, KEYS.playClock] as const;
