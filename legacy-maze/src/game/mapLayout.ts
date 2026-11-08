import { openLevelsOn } from '../core/config/features';
import { MONETIZATION } from '../core/config/monetization';
import type { DayKey } from '../core/dates';
import { earnCoins, earnPlayed, grantItem, type Profile } from '../core/economy';
import { LEVEL_COLORS } from './generator';
import { LEVELS } from './levels';
import { worldIndexOf } from '../core/worlds';

/**
 * The map of levels, in world units. Level 1 is at the origin and the levels climb toward -z, one STEP apart,
 * along a winding path. Everything here is pure (no three.js): the scene only draws what this decides.
 */
export const STEP = 2.6;
/** Radius of a level's pad. */
export const PAD_R = 0.72;

export type MapPoint = { x: number; z: number };

/** Where level `n` (1-based) stands: a gentle double sine, so the path winds without ever doubling back. */
export function levelPoint(n: number): MapPoint {
  const k = n - 1;
  return { x: 2.4 * Math.sin(k * 0.62) + 0.9 * Math.sin(k * 0.21 + 1), z: -k * STEP };
}

/** World (0-based) a level belongs to, and the first and last level of that world. */
export const worldOfLevel = worldIndexOf;
export const worldFirstLevel = (w: number) => w * MONETIZATION.worlds.levelsPerWorld + 1;
export const worldLastLevel = (w: number) => (w + 1) * MONETIZATION.worlds.levelsPerWorld;

/** Levels worth drawing when the camera looks at level `focus`: a window behind and ahead of it. */
export function visibleLevels(focus: number, behind = 6, ahead = 14): { from: number; to: number } {
  return { from: Math.max(1, Math.floor(focus) - behind), to: Math.floor(focus) + ahead };
}

/** Worlds (0-based) that must be loaded for a window of levels: at most two. */
export function worldsInWindow(from: number, to: number): number[] {
  const a = worldOfLevel(from);
  const b = worldOfLevel(to);
  return a === b ? [a] : [a, b];
}

/** Level at the given camera depth: the inverse of `levelPoint` on z. */
export const levelAtZ = (z: number) => 1 - z / STEP;

/** The colour a finished level is painted in on the map: its own paint colour. */
export function levelPaintColor(id: number, stored?: string): string {
  return stored ?? LEVELS[id - 1]?.color ?? LEVEL_COLORS[(id * 7) % LEVEL_COLORS.length];
}

export type PadState = 'done' | 'current' | 'locked';
export const padState = (id: number, current: number, stars: Record<number, number>): PadState =>
  id === current ? 'current' : id < current || stars[id] || openLevelsOn() ? 'done' : 'locked';

/* ---- chests: one every 10 levels ---- */

export const chestLevel = (k: number) => k * MONETIZATION.map.chestEvery;
export const chestNumberAfter = (level: number) => (level % MONETIZATION.map.chestEvery === 0 ? level / MONETIZATION.map.chestEvery : 0);

export type ChestState = 'locked' | 'ready' | 'opened';

/** A chest (number k >= 1) opens once the 10 levels before it are done. */
export function chestState(k: number, stars: Record<number, number>, opened: number[]): ChestState {
  if (opened.includes(k)) return 'opened';
  const every = MONETIZATION.map.chestEvery;
  for (let id = (k - 1) * every + 1; id <= k * every; id++) if (!stars[id]) return 'locked';
  return 'ready';
}

/** Opens a chest: its coins are paid once. Null when it is not ready (or already open). */
export function openChest(p: Profile, k: number, stars: Record<number, number>): { profile: Profile; coins: number; item: string | null } | null {
  if (chestState(k, stars, p.chestsOpened) !== 'ready') return null;
  const paid = earnPlayed(p, MONETIZATION.map.chestCoins);
  const coins = paid.gained;
  // Some chests also hold an exclusive item.
  const itemId = MONETIZATION.shop.chestRewards[k] ?? null;
  const item = itemId && !p.owned.includes(itemId) ? itemId : null;
  let next = { ...paid.profile, chestsOpened: [...p.chestsOpened, k] };
  if (item) next = grantItem(next, item);
  return { profile: next, coins, item };
}

/* ---- coins flying over the map: a daily cap ---- */

export const mapCoinsLeft = (p: Profile, today: DayKey): number =>
  Math.max(0, MONETIZATION.map.flyingCoinsPerDay - (p.mapCoins.day === today ? p.mapCoins.count : 0));

/** A flying coin worth `value` was caught. Nothing is paid once the day's cap is reached (a giant coin pays what is left). */
export function catchMapCoin(p: Profile, today: DayKey, value: number): { profile: Profile; paid: number } {
  const paid = Math.min(value, mapCoinsLeft(p, today));
  if (paid <= 0) return { profile: p, paid: 0 };
  const count = (p.mapCoins.day === today ? p.mapCoins.count : 0) + paid;
  return { profile: { ...earnCoins(p, paid), mapCoins: { day: today, count } }, paid };
}
