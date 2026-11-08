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
  ['carBlue', 'Citadine bleue', 'common', 350],
  ['carYellow', 'Citadine jaune', 'common', 350],
  ['carGreen', 'Citadine verte', 'common', 350],
  ['carWhite', 'Citadine blanche', 'common', 300],
  ['carBlack', 'Citadine noire', 'common', 400],
  ['carOrange', 'Citadine orange', 'common', 350],
  ['carPink', 'Citadine rose', 'common', 400],
  ['carPurple', 'Citadine violette', 'common', 400],
  ['carTeal', 'Citadine turquoise', 'common', 350],
  ['cloudCar', 'Citadine nuage', 'common', 400],
  ['pickup', 'Pick-up', 'common', 450],
  ['van', 'Van', 'common', 500],
  ['jeep', 'Jeep', 'common', 500],
  ['beetle', 'Coccinelle rétro', 'rare', 1100],
  ['taxi', 'Taxi', 'epic', 'starter'],
  ['police', 'Voiture de police', 'epic', 'starter'],
  ['ambulance', 'Ambulance', 'rare', 'day7'],
  ['firetruck', 'Camion de pompiers', 'epic', 'streak7'],
  ['iceCreamTruck', 'Camion de glace', 'epic', 'ads'],
  ['racer', 'Voiture de course', 'rare', 1250],
  ['goldCar', 'Voiture dorée', 'legendary', 'streak30'],
  ['chromeCar', 'Voiture chromée', 'legendary', 10000],
  ['neonCar', 'Voiture néon', 'legendary', 9000],
  ['sunCar', 'Voiture soleil', 'legendary', 'chest'],
  ['lavaCar', 'Voiture lave', 'legendary', 'chest'],
  ['camoCar', 'Camouflage', 'rare', 1350],
  ['zebraCar', 'Zèbre', 'rare', 1150],
  ['leopardCar', 'Léopard', 'rare', 1300],
  ['flameCar', 'Flammes', 'epic', 3000],
  ['candyCar', 'Bonbon', 'epic', 2900],
  ['galaxyCar', 'Galaxie', 'epic', 3400],
  ['rainbowCar', 'Arc-en-ciel', 'epic', 'ads'],
  ['ladybugCar', 'Coccinelle', 'rare', 1200],
  ['beeCar', 'Abeille', 'common', 450],
  ['watermelonCar', 'Pastèque', 'common', 450],
  ['pumpkinCar', 'Citrouille', 'rare', 1050],
  ['robotCar', 'Robot', 'epic', 2600],
  ['baubleCar', 'Boule de Noël', 'epic', 'world'],
  ['snowCar', 'Voiture des neiges', 'rare', 'world'],
  // The twelve vehicles of the VIP pass, one a month
  ['vipAurora', 'Aurore', 'epic', 'vip'],
  ['vipCoral', 'Corail', 'epic', 'vip'],
  ['vipDeepSea', 'Grand bleu', 'epic', 'vip'],
  ['vipRuby', 'Rubis royal', 'epic', 'vip'],
  ['vipBonfire', 'Feu de joie', 'epic', 'vip'],
  ['vipMint', 'Menthe glacée', 'epic', 'vip'],
  ['vipAmethyst', 'Améthyste impériale', 'epic', 'vip'],
  ['vipRose', 'Or rose', 'epic', 'vip'],
  ['vipNight', 'Nuit étoilée', 'epic', 'vip'],
  ['vipOpal', 'Opale', 'epic', 'vip'],
  ['vipEmerald', 'Émeraude impériale', 'epic', 'vip'],
  ['vipPlatinum', 'Platine', 'epic', 'vip'],
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
  ['sunset', 'Coucher de soleil', 'rare', 1050],
  ['ocean', 'Océan', 'rare', 1050],
  ['woodland', 'Forêt', 'common', 450],
  ['bonbon', 'Bonbon', 'common', 500],
  ['aurora', 'Aurore boréale', 'epic', 3600],
  // Metals
  ['gilded', 'Or', 'epic', 2900],
  ['silvery', 'Argent', 'rare', 1300],
  ['chrome', 'Chrome', 'epic', 3400],
  ['bronzed', 'Bronze', 'rare', 1150],
  ['holo', 'Holographique', 'legendary', 11000],
  // Textures
  ['marblePaint', 'Marbre', 'common', 500],
  ['watercolor', 'Aquarelle', 'rare', 'world'],
  ['chalk', 'Craie', 'common', 350],
  ['pointillism', 'Pointillisme', 'rare', 1200],
  ['mosaic', 'Mosaïque', 'rare', 1450],
  ['stained', 'Vitrail', 'epic', 3100],
  ['terrazzo', 'Terrazzo', 'common', 500],
  // Patterns
  ['stripes', 'Rayures', 'common', 350],
  ['dots', 'Pois', 'common', 350],
  ['checkerPaint', 'Damier', 'common', 400],
  ['zebra', 'Zèbre', 'rare', 1150],
  ['leopard', 'Léopard', 'rare', 1300],
  ['camo', 'Camouflage', 'rare', 1350],
  ['pixel', 'Pixel 8-bit', 'epic', 2500],
  // Specials
  ['lavaPaint', 'Lave', 'epic', 4000],
  ['ice', 'Glace', 'epic', 'world'],
  ['galaxy', 'Galaxie', 'legendary', 'chest'],
  ['fire', 'Feu', 'legendary', 9000],
  ['toxic', 'Toxique', 'epic', 'world'],
  ['confetti', 'Confettis', 'epic', 'chest'],
  ['prismatic', 'Prismatique', 'epic', 'ads'],
];

export const SHOP_ITEMS: readonly ShopItem[] = [...build('ball', BALLS), ...build('paint', PAINTS)];

export const itemById = (id: string): ShopItem | undefined => SHOP_ITEMS.find((i) => i.id === id);
export const itemsOfKind = (kind: ItemKind) => SHOP_ITEMS.filter((i) => i.kind === kind);
export const isFree = (item: ShopItem) => item.price === undefined && !item.exclusive;
