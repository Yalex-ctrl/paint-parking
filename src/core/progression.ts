/** Coins appear from this level on (the first five levels pay nothing at all). */
export const COINS_FROM_LEVEL = 6;

/** Number of coins on a level (they are optional and never needed to finish it). */
export function coinsForLevel(id: number): number {
  if (id < COINS_FROM_LEVEL) return 0;
  // One to three coins a level (two on average), each worth one coin.
  return 1 + (((id * 2654435761) >>> 0) % 3);
}