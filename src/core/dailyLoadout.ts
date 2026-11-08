import type { DayKey } from './dates';
import { dayNumber } from './dates';
import { SHOP_ITEMS, itemById, type ShopItem } from './shopItems';
import { itemName } from './i18n/names';
import { t } from './i18n';
import { createRng } from './rng';

/**
 * The ball and the paint of the day's challenge: drawn from the whole catalogue (the ones the player does not own too) from the date
 * alone, so they are the same for everyone that day. They only apply to the challenge; the rest of the game keeps the player's own.
 */
export type DailyLoadout = { ball: ShopItem; paint: ShopItem };

const BALLS = SHOP_ITEMS.filter((i) => i.kind === 'ball');
const PAINTS = SHOP_ITEMS.filter((i) => i.kind === 'paint');

export function dailyLoadout(day: DayKey): DailyLoadout {
  const rng = createRng(dayNumber(day) * 2654435761 + 97);
  return { ball: BALLS[rng.int(0, BALLS.length - 1)], paint: PAINTS[rng.int(0, PAINTS.length - 1)] };
}

/** "Aujourd'hui : balle Lave + peinture Galaxie". */
export const loadoutText = (l: DailyLoadout): string => t('daily.loadoutText', { ball: itemName(l.ball.id), paint: itemName(l.paint.id) });

/** The items of the loadout the player does not own (the card after the challenge offers them). */
export const unownedOf = (l: DailyLoadout, owned: readonly string[]): ShopItem[] => [l.ball, l.paint].filter((i) => !owned.includes(i.id) && !!itemById(i.id));
