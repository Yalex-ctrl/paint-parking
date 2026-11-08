import { MONETIZATION } from './config/monetization';
import { formatNumber, formatPercent, t } from './i18n';

/** The green badge of a coin pack ("+20 %"), or null for the smallest one. */
export const coinBonusLabel = (packId: string): string | null => {
  const bonus = MONETIZATION.products.coinPacks.find((p) => p.id === packId)?.bonusPercent;
  return bonus ? `+${formatPercent(bonus / 100)}` : null;
};

/** The ribbon of a coin pack ("Populaire", "Meilleure valeur"), or null. */
export const coinBadge = (packId: string): string | null => {
  const badge = MONETIZATION.products.coinPacks.find((p) => p.id === packId)?.badge;
  return badge ? t(`shop.badge.${badge}`) : null;
};

/** How a coin pack is drawn: a pile of coins, two piles, then a chest with coins. It grows with the pack. */
export function coinPileFor(coins: number): { columns: number[]; chest: boolean } {
  if (coins >= 10000) return { columns: [4, 3], chest: true };
  if (coins >= 3000) return { columns: [3, 4], chest: false };
  return { columns: [3], chest: false };
}

/** "1 240" / "1,240": a whole number, written as the language on screen does. */
export const spaced = (n: number): string => formatNumber(Math.round(n));

/** "47 h 12" / "12 min": what is left of the starter pack's 48 hours. */
export function remainingText(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? t('time.hoursMinutes', { h, m: String(m).padStart(2, '0') }) : t('time.minutes', { m });
}
