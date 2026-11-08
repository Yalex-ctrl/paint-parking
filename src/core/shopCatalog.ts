import { MONETIZATION } from './config/monetization';
import { grantItem, owns, type Profile } from './economy';
import { RARITIES, itemById, type ItemKind, type Rarity, type ShopItem } from './shopItems';

/** What the shop shows: everything, what the player owns, or one rarity. */
export type ShopFilter = 'all' | 'owned' | Rarity;
export const SHOP_FILTERS: readonly ShopFilter[] = ['all', 'owned', ...RARITIES];

export function filterItems(items: readonly ShopItem[], profile: Profile, filter: ShopFilter): ShopItem[] {
  if (filter === 'all') return [...items];
  if (filter === 'owned') return items.filter((i) => owns(profile, i.id));
  return items.filter((i) => i.rarity === filter);
}

const rarityRank = (r: Rarity) => RARITIES.indexOf(r);

/**
 * The equipped item first, then the ones the player owns, then the rest by increasing price; what cannot be bought
 * (earned items) comes last, by rarity.
 */
export function sortItems(items: readonly ShopItem[], profile: Profile): ShopItem[] {
  const group = (i: ShopItem) => (profile.equipped[i.kind] === i.id ? 0 : owns(profile, i.id) ? 1 : i.price !== undefined ? 2 : 3);
  return [...items].sort((a, b) => {
    const g = group(a) - group(b);
    if (g !== 0) return g;
    if (group(a) === 2) return (a.price ?? 0) - (b.price ?? 0);
    return rarityRank(a.rarity) - rarityRank(b.rarity) || a.name.localeCompare(b.name);
  });
}

/** An item the player has never looked at. */
export const isNewItem = (item: ShopItem, profile: Profile) => !!item.fresh && !profile.seenItems.includes(item.id) && !owns(profile, item.id);

export function markSeen(p: Profile, ids: string[]): Profile {
  const fresh = ids.filter((id) => !p.seenItems.includes(id));
  return fresh.length === 0 ? p : { ...p, seenItems: [...p.seenItems, ...fresh] };
}

/** The item given for finishing level `levelId` (the last level of a world), if the player does not have it yet. */
export function worldEndReward(p: Profile, levelId: number): { profile: Profile; item: ShopItem } | null {
  const id = MONETIZATION.shop.worldEndRewards[levelId];
  const item = id ? itemById(id) : undefined;
  if (!item || owns(p, item.id)) return null;
  return { profile: grantItem(p, item.id), item };
}

export const kindName = (kind: ItemKind) => (kind === 'ball' ? 'balle' : 'peinture');
