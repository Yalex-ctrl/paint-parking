import { MONETIZATION } from './config/monetization';
import { createRng } from './rng';
import { coinsForLevel } from './progression';
import { RARITIES, SHOP_ITEMS, type Rarity } from './shopItems';
import { endsStep, stepOf } from './steps';
import { multiplierOf } from './streak';

/**
 * A model of what a typical player earns and buys, to check the economy (scripts/simulate-economy.ts prints it, a test keeps it
 * inside the targets). Every number comes from the real config and the real catalogue; only the player is invented.
 */
export type SimPlayer = {
  days: number;
  levelsPerDay: number;
  /** Share of levels finished with 3, 2 and 1 star. */
  starShare: { 3: number; 2: number; 1: number };
  /** Chance of failing a level (a life lost: the streak goes back to 0). */
  failChance: number;
  /** Share of the coins on the board that are picked up. */
  pickShare: number;
  /** Days out of seven on which the daily challenge is done. */
  challengeDaysPerWeek: number;
  /** Minutes of real play a day (the chests of the Cadeaux panel) and rewarded ads watched on purpose a day. */
  playMinutes: number;
  rewardedAds: number;
  /** Takes the free spin of the wheel every day. */
  freeSpin: boolean;
  /** A subscriber of the VIP pass: 100 coins a day, and the second free spin of the wheel. */
  vip?: boolean;
  seed: number;
};

export const TYPICAL_PLAYER: SimPlayer = {
  days: 30,
  levelsPerDay: 30,
  starShare: { 3: 0.7, 2: 0.2, 1: 0.1 },
  failChance: 0.06,
  pickShare: 1,
  challengeDaysPerWeek: 5,
  playMinutes: 35,
  rewardedAds: 5,
  freeSpin: true,
  seed: 20260101,
};

/** The typical player with the VIP pass. */
export const VIP_PLAYER: SimPlayer = { ...TYPICAL_PLAYER, vip: true, seed: 20260103 };

/** Two hours a day, all thirty rewarded ads, both spins. */
export const ACTIVE_PLAYER: SimPlayer = { ...TYPICAL_PLAYER, levelsPerDay: 80, playMinutes: 120, rewardedAds: 30, seed: 20260102 };

/** What the Cadeaux panel pays in a day to a player who opens everything he can (mean of the wheel for the spins). */
export function giftCoins(player: Pick<SimPlayer, 'playMinutes' | 'rewardedAds' | 'freeSpin' | 'vip'>): number {
  const R = MONETIZATION.rewards;
  let coins = 0;
  for (const t of R.playChests.tiers) if (player.playMinutes >= t.minutes) coins += t.coins;
  const slots = R.wheel.slots.filter((x) => x.kind === 'coins');
  const wheelMean = slots.reduce((n, x) => n + (x.amount * x.weight) / R.wheel.slots.reduce((w, y) => w + y.weight, 0), 0);
  let ads = player.rewardedAds;
  if (player.freeSpin) coins += wheelMean;
  // The pass: the 100 coins, and the second spin without an ad (when no ad goes to it below).
  if (player.vip) coins += MONETIZATION.vip.dailyCoins + (ads > 0 ? 0 : wheelMean);
  if (ads > 0) {
    // The ads go first to the free coins (every 30 minutes, within the play time), then to the second spin.
    const free = Math.min(ads, R.freeCoins.perDay, Math.floor((player.playMinutes + 60) / R.freeCoins.intervalMin));
    coins += free * R.freeCoins.coins;
    ads -= free;
    if (ads > 0) {
      coins += wheelMean;
      ads -= 1;
    }
  }
  for (const b of R.adBonus) if (player.rewardedAds >= b.ads) coins += b.coins;
  return coins;
}

export type SimResult = {
  /** Coins earned each day (before any spending). */
  perDay: number[];
  /** Coins earned per level from level 6 on, on average (the chests, the stars and the board together). */
  perLevel: number;
  /** The day (from 1) of the first purchase of each rarity, or null if never. */
  firstBuy: Record<Rarity, number | null>;
  spent: number;
  coinsLeft: number;
};

export function simulate(player: SimPlayer = TYPICAL_PLAYER): SimResult {
  const rng = createRng(player.seed);
  const bonus = MONETIZATION.levelBonus;
  const perDay: number[] = [];
  const firstBuy: Record<Rarity, number | null> = { common: null, rare: null, epic: null, legendary: null };
  const owned = new Set<string>();
  // The items that are bought with coins, cheapest first inside each rarity: the player buys one of each rarity, from the commons up.
  const buyable = SHOP_ITEMS.filter((i) => i.price !== undefined && !i.exclusive).sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
  let coins = 0;
  let spent = 0;
  let frac = 0;
  let streak = 0;
  let level = 0;
  let levelCoins = 0;
  let levelsPaid = 0;

  for (let day = 1; day <= player.days; day++) {
    let earned = 0;
    for (let n = 0; n < player.levelsPerDay; n++) {
      level++;
      const before = earned;
      const paying = level > MONETIZATION.noGainUntilLevel;
      if (rng.next() < player.failChance) streak = 0;
      streak++;
      if (paying) {
        const r = rng.next();
        const stars = r < player.starShare[3] ? 3 : r < player.starShare[3] + player.starShare[2] ? 2 : 1;
        let picked = 0;
        for (let k = 0; k < coinsForLevel(level); k++) if (rng.next() < player.pickShare) picked++;
        const base = bonus[stars as 1 | 2 | 3] + picked;
        const exact = base * multiplierOf(streak) + frac;
        const total = Math.max(base, Math.floor(exact + 1e-9));
        frac = exact - total;
        earned += total;
        if (endsStep(level) && stepOf(level) >= 1) earned += MONETIZATION.steps.chestCoins;
        levelCoins += earned - before;
        levelsPaid++;
      }
    }
    // The daily challenge and the daily reward.
    if ((day - 1) % 7 < player.challengeDaysPerWeek) earned += MONETIZATION.daily.baseCoins;
    const cycle = (day - 1) % 7;
    earned += cycle < 6 ? MONETIZATION.dailyReward.coins[cycle] : MONETIZATION.dailyReward.day7Coins;
    earned += giftCoins(player);
    // The gift at the end of the tour (after level 5, day 1).
    if (day === 1) earned += 50;
    coins += earned;
    perDay.push(earned);

    // The player buys the cheapest item of the next rarity as soon as it can be paid.
    for (let guard = 0; guard < 6; guard++) {
      const target = RARITIES[firstUnreached(firstBuy)];
      const next = buyable.find((i) => !owned.has(i.id) && i.rarity === target);
      if (!next || (next.price ?? Infinity) > coins) break;
      coins -= next.price!;
      spent += next.price!;
      owned.add(next.id);
      if (firstBuy[next.rarity] === null) firstBuy[next.rarity] = day;
    }
  }
  return { perDay, perLevel: levelsPaid ? levelCoins / levelsPaid : 0, firstBuy, spent, coinsLeft: coins };
}

/** The index of the rarity the player is working towards: the first one not bought yet. */
function firstUnreached(firstBuy: Record<Rarity, number | null>): number {
  const i = RARITIES.findIndex((r) => firstBuy[r] === null);
  return i < 0 ? RARITIES.length - 1 : i;
}
