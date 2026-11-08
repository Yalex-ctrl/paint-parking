/**
 * Every tunable number of the economy, the ads and the shop, in one place.
 * Nothing else in the code base hard-codes a price, a reward or an ad frequency.
 */
export const MONETIZATION = {
  /**
   * A global factor on what playing earns. It is 1: every source below is set directly in coins. (If it is ever changed, amounts are
   * rounded to whole coins, with the fraction kept for the next gain in profile.coinFrac, and a small amount never falls to zero.)
   */
  coinEarnMultiplier: 1,

  /** The first levels pay nothing at all (no stars bonus, no coins on the board, no chest): the only gift is the end of the tour. */
  noGainUntilLevel: 5,


  /** Game rules that can be switched off (the dev menu can flip them without rebuilding: see config/features.ts). */
  features: {
    /** Lives: five, one back every 30 minutes, lost when a level is failed or restarted. */
    lives: true,
    /** A maximum number of moves per level; without it a level cannot be failed. */
    moveLimit: true,
  },

  /** Coins earned when a level is finished, by stars. Coins picked up in the level come on top. */
  levelBonus: { 1: 1, 2: 2, 3: 3 } as Record<1 | 2 | 3, number>,
  /** The "x2" button after a level (rewarded ad) multiplies that bonus by this. */
  doubleMultiplier: 2,

  /** Moves allowed in a level, and the stars they earn (see game/scoring.ts). */
  moves: {
    /** Levels up to this one have no limit. */
    freeUntilLevel: 5,
    /** The limit is the optimum (one move per vehicle) plus this, by level: up to level 20, beyond. */
    limitExtra: [
      { upTo: 20, extra: 3 },
      { upTo: Infinity, extra: 2 },
    ] as { upTo: number; extra: number }[],
    /** 2 stars up to this many collisions (3 stars = none). */
    twoStarCollisions: 2,
    /** "Plus de coups !": extra moves for a rewarded ad (once per attempt) or for coins. */
    bonusMoves: 5,
    bonusMovesCoinCost: 100,
  },

  /** The steps: five levels, then a chest. */
  steps: {
    levelsPerStep: 5,
    /** Coins in the chest at the end of a step (the first step has none), flat; doubled by a rewarded ad. */
    chestCoins: 15,
    chestGrowth: 0,
    chestMax: 15,
  },

  /** The win streak: coins earned in a level are multiplied by the tier of the streak. */
  streak: {
    /** From this streak on, the multiplier is the one of the tier. */
    tiers: [
      { from: 0, mult: 1 },
      { from: 2, mult: 1.25 },
      { from: 4, mult: 1.5 },
      { from: 7, mult: 2 },
    ] as { from: number; mult: number }[],
    /** From this streak on, the player is asked before an action that would lose it. */
    protectFrom: 3,
    /** "Keep my streak": coins, or a rewarded ad once a day. */
    saveCoinCost: 150,
  },

  /**
   * The VIP pass (auto-renewing subscription). The ids are those of App Store Connect / Google Play and of the "vip" entitlement of
   * RevenueCat (see docs/SUBSCRIPTION_SETUP.md); prices are in euros and shown through Intl (the stores' own price strings replace
   * them once the real purchases are plugged in).
   */
  vip: {
    entitlement: 'vip',
    products: {
      monthly: { id: 'paintparking_vip_monthly', priceEur: 3.99, days: 30 },
      yearly: { id: 'paintparking_vip_yearly', priceEur: 29.99, days: 365 },
    },
    /** Free trial days: none for now (Apple needs the introductory offer to be configured in App Store Connect too). */
    trialDays: 0,
    /** Coins to take once a day in the Cadeaux panel (no accumulation). */
    dailyCoins: 100,
    /** Days of grace after the end of the period while the store retries the payment: the pass keeps working. */
    graceDays: 16,
    /** Spins of the wheel of fortune that are free every day (instead of one free and one for an ad). */
    freeSpinsPerDay: 2,
    /** The ball of each paid month, in order (twelve): they are kept after cancelling. */
    balls: ['vipAurora', 'vipCoral', 'vipDeepSea', 'vipRuby', 'vipBonfire', 'vipMint', 'vipAmethyst', 'vipRose', 'vipNight', 'vipOpal', 'vipEmerald', 'vipPlatinum'] as string[],
    links: {
      terms: 'https://yalex-ctrl.github.io/paint-parking-site/terms.html',
      privacy: 'https://yalex-ctrl.github.io/paint-parking-site/privacy.html',
      support: 'https://yalex-ctrl.github.io/paint-parking-site/support.html',
      supportEmail: 'mailto:alexandregoepfert@gmail.com',
      manage: 'https://apps.apple.com/account/subscriptions',
    },
    /** The pass is offered by itself: once after this level (at the end of a step), then at most every `everyDays` days. */
    autoOffer: { fromLevel: 20, everyDays: 7 },
  },

  /** The piggy bank. */
  piggy: {
    /** Share of the coins earned in a level that also goes into it (on top of them, nothing is taken from the player): all of it. */
    share: 1,
    capacity: 3000,
    /** It can be broken from this many coins. */
    breakFrom: 1000,
    product: { id: 'paintparking_piggy_bank', priceEur: 2.99 },
  },

  /** Lives: 5 at most, one back every 30 minutes. */
  lives: {
    max: 5,
    regenMinutes: 30,
    /** The first levels (the tutorial) never cost a life. */
    freeUntilLevel: 5,
    /** Rewarded ads that give one life, per day. */
    adLivesPerDay: 3,
    /** All the lives back, for coins. */
    refillCoinCost: 250,
    /** Unlimited lives for an hour: a (simulated) purchase, consumable. Durations add up when several are bought. */
    infiniteHour: { id: 'paintparking_infinite_lives_1h', priceEur: 0.99, hours: 1 },
    /** Unlimited lives for 24 hours: a (simulated) purchase, consumable. */
    infiniteDay: { id: 'paintparking_infinite_lives_24h', priceEur: 2.99, hours: 24 },
  },

  hint: {
    /** A hint costs this many coins... */
    coinCost: 60,
    /** ...or one rewarded ad, at the player's choice. */
    adPlacement: 'hint',
  },

  /**
   * Interstitial (full-screen) ads: only at the end of a won level, while the ball crosses to the next one. Rewarded ads are never
   * forced, so these rules do not apply to them (but watching one starts the count again). Time is the time the app is on screen
   * and playing, not the clock: coming back after a long absence never shows an ad.
   */
  interstitial: {
    /** Never after a level lower than this one. */
    minLevel: 10,
    /** At least this long since the last ad of any kind. */
    interstitialMinIntervalSec: 300,
    /** Never during the first minutes of a session. */
    minSessionSec: 180,
    /** Never right after a failure or a purchase: this long (seconds of play) must pass first. */
    quietAfterEventSec: 60,
  },

  /** The simulated rewarded / interstitial ad in Expo Go lasts this long. */
  mockAdSeconds: 3,

  daily: {
    /** Coins for finishing the daily challenge: baseCoins + perStreakDay * (streak - 1), at most maxCoins. */
    baseCoins: 20,
    perStreakDay: 0,
    maxCoins: 20,
    /** Streak lengths that unlock an exclusive ball skin. */
    skinMilestones: { 7: 'disco', 30: 'crystal' } as Record<number, string>,
    /** A missed day can be saved with one rewarded ad, once per streak. */
    saveStreakAdPlacement: 'save_streak',
  },

  /** Daily reward, a 7-day cycle. Day 7 is a skin if the player does not own it yet, else coins. */
  dailyReward: {
    coins: [10, 15, 20, 25, 30, 40] as number[],
    day7Skin: 'moon',
    day7Coins: 100,
  },

  worlds: {
    levelsPerWorld: 25,
  },

  gallery: {
    /** A picture is unlocked every this many levels (each finished level reveals a piece). */
    levelsPerPicture: 10,
  },

  /** The map of levels: chests every few levels, coins that fly by. */
  map: {
    chestEvery: 10,
    chestCoins: 100,
    /** Coins that can be caught outside the levels per day (a giant coin counts for its value): 1 coin each, 5 a day at most. */
    flyingCoinsPerDay: 5,
    giantCoinValue: 1,
  },

  notifications: {
    /** The permission is only asked after this level (never at the first launch). */
    askAfterLevel: 3,
    /** One notification a day at most, at this local hour. */
    hour: 18,
    minute: 0,
  },

  products: {
    removeAds: { id: 'paintparking_no_ads', priceEur: 5.99 },
    /** One-time offer made right after the guided tour, for this many hours: coins and two exclusive balls (no "Sans pub"). */
    starterPack: {
      id: 'paintparking_starter_pack',
      priceEur: 2.99,
      durationHours: 48,
      coins: 1500,
      skins: ['planet', 'eye'],
    },
    /**
     * Product ids are stable (they are the ids of the future RevenueCat configuration):
     * coins_1000, coins_3000, coins_10000, no_ads, starter_pack, piggy_bank, infinite_lives_1h, infinite_lives_24h.
     */
    coinPacks: [
      { id: 'paintparking_coins_1000', coins: 1000, priceEur: 1.99, badge: null, bonusPercent: null, blurb: 'common' },
      { id: 'paintparking_coins_3000', coins: 3000, priceEur: 4.99, badge: 'popular', bonusPercent: 20, blurb: 'rare' },
      { id: 'paintparking_coins_10000', coins: 10000, priceEur: 9.99, badge: 'best', bonusPercent: 65, blurb: 'epic' },
    ] as { id: string; coins: number; priceEur: number; badge: 'popular' | 'best' | null; bonusPercent: number | null; blurb: 'common' | 'rare' | 'epic' }[],
  },

  /**
   * Prices of the shop live in game/shopItems.ts, next to the items, inside the price range of their rarity:
   * common 300-500, rare 1000-1500, epic 2500-4000, legendary 8000-12000. What is earned instead of bought:
   */
  shop: {
    /** Every price of the balls and paints (the base prices written in game/shopItems.ts are multiplied by this). */
    priceFactor: 3,
    /** Opening the chest of the map with this number gives this item (once). */
    chestRewards: { 2: 'confetti', 4: 'sun', 6: 'galaxy', 8: 'lava' } as Record<number, string>,
    /** Finishing the last level of a world gives this item (once), by level number. */
    worldEndRewards: { 25: 'bauble', 50: 'watercolor', 75: 'snow', 100: 'ice', 125: 'toxic' } as Record<number, string>,
  },

  /**
   * The "Cadeaux" panel: what is given for playing and for rewarded ads that the player chooses to watch. Everything here is simulated
   * with the mock ads of services/ads.ts. Every reward is announced before the ad and only given if the ad was watched to the end.
   */
  rewards: {
    /** Chests of play time (active time only: the app on screen, a level in progress, a swipe in the last `activeWindowSec`). */
    playChests: {
      activeWindowSec: 30,
      tiers: [
        { minutes: 10, coins: 10 },
        { minutes: 20, coins: 15 },
        { minutes: 30, coins: 25 },
      ],
    },
    /** Free coins for a rewarded ad: every `intervalMin` minutes, `perDay` times a day at most. */
    freeCoins: { coins: 15, intervalMin: 30, perDay: 6 },
    /**
     * The exclusive items won with rewarded ads watched from the button of the panel: `adsNeeded` ads each, at least `minIntervalMin`
     * minutes apart, one item after the other, then the section goes away.
     */
    adUnlock: {
      adsNeeded: 10,
      minIntervalMin: 10,
      items: ['prism', 'nebula', 'prismatic'] as string[],
    },
    /** The wheel of fortune: one free spin a day and one for a rewarded ad (VIP: both free). */
    wheel: {
      freeSpinsPerDay: 1,
      adSpinsPerDay: 1,
      /** What the slots give and how likely they are (the weights add up to 100). The mean in coins is about 15. */
      slots: [
        { id: 'c5', kind: 'coins', amount: 5, weight: 24 },
        { id: 'c10', kind: 'coins', amount: 10, weight: 24 },
        { id: 'c15', kind: 'coins', amount: 15, weight: 18 },
        { id: 'c20', kind: 'coins', amount: 20, weight: 12 },
        { id: 'hint', kind: 'hint', amount: 1, weight: 8 },
        { id: 'lives', kind: 'lives', amount: 15, weight: 7 },
        { id: 'c50', kind: 'coins', amount: 50, weight: 5 },
        { id: 'jackpot', kind: 'coins', amount: 150, weight: 2 },
      ] as { id: string; kind: 'coins' | 'hint' | 'lives'; amount: number; weight: number }[],
      /** The "lives" slot becomes this many coins when lives are switched off. */
      livesOffCoins: 10,
      /** ...and this many lives when the player already has unlimited lives running. */
      livesBonus: 2,
    },
    /** Trying a ball or a paint for a few levels (a rewarded ad), a few times a day. */
    trial: { levels: 3, perDay: 3 },
    /** Rewarded ads, all sources together, at most this many a day (a safety cap). */
    rewardedAdsPerDay: 30,
    /** Bonus for the number of rewarded ads watched today: coins at each step (the last step is the daily cap). */
    adBonus: [
      { ads: 5, coins: 5 },
      { ads: 10, coins: 15 },
      { ads: 20, coins: 30 },
      { ads: 30, coins: 50 },
    ],
    /** From this hour (local) the panel reminds the player of the chests that are waiting. */
    reminderHour: 22,
  },

  /** First launch: straight into level 1 with a hand showing the swipe. */
  firstLaunch: { skipHomeUntilLaunch: 2 },
} as const;

export type Placement =
  | 'double_reward'
  | 'hint'
  | 'save_streak'
  | 'daily_reward_double'
  | 'daily_double'
  | 'extra_moves'
  | 'extra_life'
  | 'keep_streak'
  | 'playtime_chest_x2'
  | 'free_coins'
  | 'ad_unlock'
  | 'wheel_spin'
  | 'try_item';
