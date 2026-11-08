import { createRng } from './rng';
import { CAMPAIGN_MECHANICS, UNLOCK_LEVEL, type CampaignMechanic, type Tutorial } from './types';

/** Coins appear from this level on (the first five levels pay nothing at all). */
export const COINS_FROM_LEVEL = 6;

/** The mechanic whose tutorial level this is, if any. */
export const tutorialFor = (id: number): Tutorial | undefined => CAMPAIGN_MECHANICS.find((m) => UNLOCK_LEVEL[m] === id);

/**
 * Which mechanics level `id` is built around:
 *  - levels 1 and 2: plain sliding; from level 3 on, at least one level out of two has bends;
 *  - a mechanic's first level is its tutorial: that mechanic alone;
 *  - every other level uses 1 to 3 of the mechanics already unlocked, never more, and a
 *    newly unlocked mechanic keeps coming back for a while so it gets practised;
 *  - from level 101 on, everything is unlocked and no mechanic is favoured: each level draws 2 or 3 of the six at random, so
 *    portals, stops, bends, double paint, fragile floors and bombs can all turn up at any level.
 */
export const FREE_MIX_FROM = 101;

export function mechanicsForLevel(id: number): { mechanics: CampaignMechanic[]; tutorial?: Tutorial } {
  const tutorial = tutorialFor(id) as CampaignMechanic | undefined;
  if (tutorial) return { mechanics: [tutorial], tutorial };

  const unlocked = CAMPAIGN_MECHANICS.filter((m) => UNLOCK_LEVEL[m] < id);
  if (unlocked.length === 0) return { mechanics: [] };

  if (id >= FREE_MIX_FROM) {
    const mixRng = createRng(id * 7919 + 13);
    const count = 2 + (mixRng.next() < 0.5 ? 1 : 0);
    const picked = new Set(mixRng.shuffle(unlocked).slice(0, count));
    return { mechanics: CAMPAIGN_MECHANICS.filter((m) => picked.has(m)) };
  }

  const rng = createRng(id * 7919 + 13);
  let count = 1 + (rng.next() < 0.55 ? 1 : 0) + (rng.next() < 0.25 ? 1 : 0);
  count = Math.min(count, unlocked.length, 3);
  if (unlocked.length === 1) count = id % 2 === 1 || rng.next() < 0.4 ? 1 : 0;

  const chosen = new Set<CampaignMechanic>();
  // Bends (the first mechanic, level 3) come back at least every other level.
  if (id % 2 === 1 && unlocked.includes('corner')) chosen.add('corner');
  const newest = unlocked[unlocked.length - 1];
  if (id - UNLOCK_LEVEL[newest] < 12) chosen.add(newest);
  for (const m of rng.shuffle(unlocked)) {
    if (chosen.size >= count) break;
    chosen.add(m);
  }
  return { mechanics: CAMPAIGN_MECHANICS.filter((m) => chosen.has(m)) };
}

/** Number of coins on a level (they are optional and never needed to finish it). */
export function coinsForLevel(id: number): number {
  if (id < COINS_FROM_LEVEL) return 0;
  // One to three coins a level (two on average), each worth one coin.
  return 1 + (((id * 2654435761) >>> 0) % 3);
}
