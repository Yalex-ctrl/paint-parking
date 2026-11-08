import { itemById, type Rarity, type ShopItem } from '../shopItems';
import { t } from './';

/** The name of a ball or a paint in the language on screen (the catalogue holds the French one, the JSON files the others). */
export const itemName = (id: string): string => t(`items.${id}`, { defaultValue: itemById(id)?.name ?? id });

/** "Balle Lave" / "Lava ball": the name with its kind. */
export const itemLabel = (id: string): string => t(itemById(id)?.kind === 'paint' ? 'items.paintOf' : 'items.ballOf', { name: itemName(id) });

/** The title of a picture of the gallery ("Pomme" / "Apple", and its variant). */
export function pictureName(index: number, frenchName: string): string {
  const base = t(`gallery.pictures.${index % 25}`, { defaultValue: frenchName.replace(' (variante)', '') });
  return index >= 25 ? t('gallery.variant', { name: base }) : base;
}

export const rarityName = (rarity: Rarity): string => t(`shop.rarity.${rarity}`);

/** How an exclusive item is earned, in words ("Fin du niveau 25"). */
export const howText = (item: ShopItem): string => (item.exclusive ? t(`shop.how.${item.exclusive}`, { n: item.howArg }) : '');
