import { MONETIZATION } from './config/monetization';

export type ItemKind = 'ball' | 'paint';

/** How rare an item is: it sets its price range and the colour of its card. */
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export const RARITIES: readonly Rarity[] = ['common', 'rare', 'epic', 'legendary'];
export const RARITY_NAME: Record<Rarity, string> = { common: 'Commun', rare: 'Rare', epic: 'Épique', legendary: 'Légendaire' };
/** Allowed prices (coins) of an item that is bought, by rarity. */
const F = MONETIZATION.shop.priceFactor;
export const RARITY_PRICE: Record<Rarity, readonly [number, number]> = {
  common: [300 * F, 500 * F],
  rare: [1000 * F, 1500 * F],
  epic: [2500 * F, 4000 * F],
  legendary: [8000 * F, 12000 * F],
};

/** How an item that cannot be bought with coins is earned. */
export type Exclusive = 'starter' | 'day7' | 'streak7' | 'streak30' | 'chest' | 'world' | 'ads' | 'vip';

export type ShopItem = {
  id: string;
  kind: ItemKind;
  name: string;
  rarity: Rarity;
  /** Coins. Absent on free defaults and on exclusive items. */
  price?: number;
  exclusive?: Exclusive;
  /** What the exclusive item is earned with, in French words (the screens say it with `howText` of i18n/names). */
  how?: string;
  /** The number in that sentence (the chest, the level). */
  howArg?: string;
  /** Added by the big catalogue update: shown with a "Nouveau" badge until the player has seen it. */
  fresh?: boolean;
};

export const DEFAULT_BALL = 'carRed';
export const DEFAULT_PAINT = 'classic';

const chestOf = (id: string) => Object.entries(MONETIZATION.shop.chestRewards).find(([, v]) => v === id)?.[0];
const worldOf = (id: string) => Object.entries(MONETIZATION.shop.worldEndRewards).find(([, v]) => v === id)?.[0];

type Row = [id: string, name: string, rarity: Rarity, price: number | Exclusive, fresh?: boolean];

function build(kind: ItemKind, rows: Row[]): ShopItem[] {
  return rows.map(([id, name, rarity, price, fresh]) => {
    const item: ShopItem = { id, kind, name, rarity, ...(fresh ? { fresh: true } : {}) };
    if (typeof price === 'number') return price === 0 ? item : { ...item, price: price * F };
    const how: Record<Exclusive, string> = {
      starter: 'Pack de démarrage',
      day7: 'Récompense du jour 7',
      streak7: 'Série de 7 jours au défi du jour',
      streak30: 'Série de 30 jours au défi du jour',
      chest: `Coffre n°${chestOf(id)} de la carte`,
      world: `Fin du niveau ${worldOf(id)}`,
      ads: 'Cadeaux : pubs récompensées',
      vip: 'Pass VIP : un véhicule par mois',
    };
    const howArg = price === 'chest' ? chestOf(id) : price === 'world' ? worldOf(id) : undefined;
    return { ...item, exclusive: price, how: how[price], ...(howArg ? { howArg } : {}) };
  });
}

/**
 * The vehicles (the items of kind 'ball': the kind keeps its old name inside the saves and the code, the player sees vehicles).
 * Each id has its look in render/skinSpecs.ts.
 */
const BALLS: Row[] = [
  ['carRed', 'Citadine rouge', 'common', 0],
  ['carBlue', 'Citadine bleue', 'common', 350, true],
  ['carYellow', 'Citadine jaune', 'common', 350, true],
  ['carGreen', 'Citadine verte', 'common', 350, true],
  ['carWhite', 'Citadine blanche', 'common', 300, true],
  ['carBlack', 'Citadine noire', 'common', 400, true],
  ['carOrange', 'Citadine orange', 'common', 350, true],
  ['carPink', 'Citadine rose', 'common', 400, true],
  ['carPurple', 'Citadine violette', 'common', 400, true],
  ['carTeal', 'Citadine turquoise', 'common', 350, true],
  ['cloudCar', 'Citadine nuage', 'common', 400, true],
  ['pickup', 'Pick-up', 'common', 450, true],
  ['van', 'Van', 'common', 500, true],
  ['jeep', 'Jeep', 'common', 500, true],
  ['beetle', 'Coccinelle rétro', 'rare', 1100, true],
  ['taxi', 'Taxi', 'epic', 'starter', true],
  ['police', 'Voiture de police', 'epic', 'starter', true],
  ['ambulance', 'Ambulance', 'rare', 'day7', true],
  ['firetruck', 'Camion de pompiers', 'epic', 'streak7', true],
  ['iceCreamTruck', 'Camion de glace', 'epic', 'ads', true],
  ['racer', 'Voiture de course', 'rare', 1250, true],
  ['goldCar', 'Voiture dorée', 'legendary', 'streak30', true],
  ['chromeCar', 'Voiture chromée', 'legendary', 10000, true],
  ['neonCar', 'Voiture néon', 'legendary', 9000, true],
  ['sunCar', 'Voiture soleil', 'legendary', 'chest', true],
  ['lavaCar', 'Voiture lave', 'legendary', 'chest', true],
  ['camoCar', 'Camouflage', 'rare', 1350, true],
  ['zebraCar', 'Zèbre', 'rare', 1150, true],
  ['leopardCar', 'Léopard', 'rare', 1300, true],
  ['flameCar', 'Flammes', 'epic', 3000, true],
  ['candyCar', 'Bonbon', 'epic', 2900, true],
  ['galaxyCar', 'Galaxie', 'epic', 3400, true],
  ['rainbowCar', 'Arc-en-ciel', 'epic', 'ads', true],
  ['ladybugCar', 'Coccinelle', 'rare', 1200, true],
  ['beeCar', 'Abeille', 'common', 450, true],
  ['watermelonCar', 'Pastèque', 'common', 450, true],
  ['pumpkinCar', 'Citrouille', 'rare', 1050, true],
  ['robotCar', 'Robot', 'epic', 2600, true],
  ['baubleCar', 'Boule de Noël', 'epic', 'world', true],
  ['snowCar', 'Voiture des neiges', 'rare', 'world', true],
  // The twelve vehicles of the VIP pass, one a month
  ['vipAurora', 'Aurore', 'epic', 'vip', true],
  ['vipCoral', 'Corail', 'epic', 'vip', true],
  ['vipDeepSea', 'Grand bleu', 'epic', 'vip', true],
  ['vipRuby', 'Rubis royal', 'epic', 'vip', true],
  ['vipBonfire', 'Feu de joie', 'epic', 'vip', true],
  ['vipMint', 'Menthe glacée', 'epic', 'vip', true],
  ['vipAmethyst', 'Améthyste impériale', 'epic', 'vip', true],
  ['vipRose', 'Or rose', 'epic', 'vip', true],
  ['vipNight', 'Nuit étoilée', 'epic', 'vip', true],
  ['vipOpal', 'Opale', 'epic', 'vip', true],
  ['vipEmerald', 'Émeraude impériale', 'epic', 'vip', true],
  ['vipPlatinum', 'Platine', 'epic', 'vip', true],
];

const PAINTS: Row[] = [
  // The first paints of the game
  ['classic', 'Classique', 'common', 0],
  ['pastel', 'Pastel', 'common', 350],
  ['glitter', 'Paillettes', 'rare', 1300],
  ['neon', 'Néon', 'epic', 2900],
  ['metallic', 'Métallisée', 'rare', 1500],
  ['rainbow', 'Arc-en-ciel', 'epic', 3200],
  // Gradients
  ['sunset', 'Coucher de soleil', 'rare', 1050, true],
  ['ocean', 'Océan', 'rare', 1050, true],
  ['woodland', 'Forêt', 'common', 450, true],
  ['bonbon', 'Bonbon', 'common', 500, true],
  ['aurora', 'Aurore boréale', 'epic', 3600, true],
  // Metals
  ['gilded', 'Or', 'epic', 2900, true],
  ['silvery', 'Argent', 'rare', 1300, true],
  ['chrome', 'Chrome', 'epic', 3400, true],
  ['bronzed', 'Bronze', 'rare', 1150, true],
  ['holo', 'Holographique', 'legendary', 11000, true],
  // Textures
  ['marblePaint', 'Marbre', 'common', 500, true],
  ['watercolor', 'Aquarelle', 'rare', 'world', true],
  ['chalk', 'Craie', 'common', 350, true],
  ['pointillism', 'Pointillisme', 'rare', 1200, true],
  ['mosaic', 'Mosaïque', 'rare', 1450, true],
  ['stained', 'Vitrail', 'epic', 3100, true],
  ['terrazzo', 'Terrazzo', 'common', 500, true],
  // Patterns
  ['stripes', 'Rayures', 'common', 350, true],
  ['dots', 'Pois', 'common', 350, true],
  ['checkerPaint', 'Damier', 'common', 400, true],
  ['zebra', 'Zèbre', 'rare', 1150, true],
  ['leopard', 'Léopard', 'rare', 1300, true],
  ['camo', 'Camouflage', 'rare', 1350, true],
  ['pixel', 'Pixel 8-bit', 'epic', 2500, true],
  // Specials
  ['lavaPaint', 'Lave', 'epic', 4000, true],
  ['ice', 'Glace', 'epic', 'world', true],
  ['galaxy', 'Galaxie', 'legendary', 'chest', true],
  ['fire', 'Feu', 'legendary', 9000, true],
  ['toxic', 'Toxique', 'epic', 'world', true],
  ['confetti', 'Confettis', 'epic', 'chest', true],
  ['prismatic', 'Prismatique', 'epic', 'ads', true],
];

export const SHOP_ITEMS: readonly ShopItem[] = [...build('ball', BALLS), ...build('paint', PAINTS)];

export const itemById = (id: string): ShopItem | undefined => SHOP_ITEMS.find((i) => i.id === id);
export const itemsOfKind = (kind: ItemKind) => SHOP_ITEMS.filter((i) => i.kind === kind);
export const isFree = (item: ShopItem) => item.price === undefined && !item.exclusive;
