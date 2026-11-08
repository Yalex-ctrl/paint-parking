/**
 * The look of every vehicle of the shop (the ids are the ones of core/shopItems.ts; a test checks that none is missing). No real
 * make, no logo: shapes and colours only.
 */
export type Finish = 'matte' | 'gloss' | 'metal' | 'neon';

export type Extra =
  | 'lightbar'
  | 'sign'
  | 'cross'
  | 'ladder'
  | 'cone'
  | 'spoiler'
  | 'stripes'
  | 'camo'
  | 'zebra'
  | 'spots'
  | 'flames'
  | 'stars'
  | 'bed'
  | 'tallroof'
  | 'roundroof'
  | 'rollbar'
  | 'eyes'
  | 'checker'
  | 'dots'
  | 'bands';

export type SkinSpec = {
  body: string;
  roof: string;
  /** The colour of the stripes, spots and other marks. */
  accent: string;
  finish: Finish;
  extras: readonly Extra[];
};

const car = (body: string, roof = body, accent = '#ffffff', finish: Finish = 'gloss', extras: readonly Extra[] = []): SkinSpec => ({ body, roof, accent, finish, extras });

export const SKIN_SPECS: Record<string, SkinSpec> = {
  carRed: car('#e8453c'),
  carBlue: car('#3a6fe0'),
  carYellow: car('#f6cf3b'),
  carGreen: car('#2fa84f'),
  carWhite: car('#f2f2ee', '#f2f2ee', '#c9ccd6'),
  carBlack: car('#2a2a33', '#2a2a33', '#7d8296'),
  carOrange: car('#f28c28'),
  carPink: car('#ea63b0'),
  carPurple: car('#8a5be0'),
  carTeal: car('#2bb7a3'),
  cloudCar: car('#cfe6fb', '#ffffff', '#ffffff', 'matte'),
  pickup: car('#c9792b', '#c9792b', '#4a3a2a', 'matte', ['bed']),
  van: car('#d9d6cc', '#d9d6cc', '#4a7bd0', 'matte', ['tallroof', 'bands']),
  jeep: car('#6f8f3a', '#4d6628', '#2b2f1c', 'matte', ['rollbar']),
  beetle: car('#8fd1c9', '#8fd1c9', '#ffffff', 'gloss', ['roundroof']),
  taxi: car('#f6cf3b', '#f6cf3b', '#1a1a1a', 'gloss', ['sign', 'checker']),
  police: car('#f2f2ee', '#f2f2ee', '#2347b8', 'gloss', ['lightbar', 'bands']),
  ambulance: car('#f6f6f2', '#f6f6f2', '#d83a3a', 'gloss', ['lightbar', 'cross']),
  firetruck: car('#d8302c', '#d8302c', '#f1c93b', 'gloss', ['ladder', 'bands']),
  iceCreamTruck: car('#f9c6dc', '#ffffff', '#f2a0c0', 'gloss', ['cone']),
  racer: car('#e8453c', '#e8453c', '#ffffff', 'gloss', ['stripes', 'spoiler']),
  goldCar: car('#e9b73a', '#f4cf63', '#fff3b8', 'metal', []),
  chromeCar: car('#c9d0dc', '#e4e9f2', '#ffffff', 'metal', []),
  neonCar: car('#ff3df0', '#3dfcff', '#ffffff', 'neon', ['stripes']),
  sunCar: car('#ffb52e', '#ffd75e', '#fff3b8', 'neon', ['stars']),
  lavaCar: car('#3a1d1d', '#2a1414', '#ff6a1c', 'neon', ['flames']),
  camoCar: car('#5d7a3a', '#5d7a3a', '#2f3f1e', 'matte', ['camo']),
  zebraCar: car('#f2f2ee', '#f2f2ee', '#1c1c22', 'matte', ['zebra']),
  leopardCar: car('#e3b04a', '#e3b04a', '#5a3a1c', 'matte', ['spots']),
  flameCar: car('#1d1d24', '#1d1d24', '#ff8a1c', 'gloss', ['flames']),
  candyCar: car('#f7a8c8', '#ffffff', '#ffffff', 'gloss', ['stripes', 'bands']),
  galaxyCar: car('#2a1c5a', '#1c1240', '#ffffff', 'gloss', ['stars']),
  rainbowCar: car('#ff5a5a', '#5ad0ff', '#ffe14a', 'gloss', ['bands', 'stripes']),
  ladybugCar: car('#e23a32', '#e23a32', '#1a1a1a', 'gloss', ['dots']),
  beeCar: car('#f6cf3b', '#f6cf3b', '#1a1a1a', 'gloss', ['zebra']),
  watermelonCar: car('#3ea64a', '#e8453c', '#14451c', 'gloss', ['stripes']),
  pumpkinCar: car('#f28a1c', '#f28a1c', '#4a8a2a', 'gloss', ['bands']),
  robotCar: car('#aeb8c8', '#8b97ab', '#3fb6ea', 'metal', ['eyes']),
  baubleCar: car('#d8302c', '#f1c93b', '#f1c93b', 'metal', ['bands', 'stars']),
  snowCar: car('#eef6ff', '#ffffff', '#8ec9f0', 'gloss', ['bands']),
  vipAurora: car('#35d6a6', '#7a5be0', '#ffffff', 'metal', ['bands']),
  vipCoral: car('#ff7a6b', '#ffb199', '#ffffff', 'metal', []),
  vipDeepSea: car('#14407a', '#1f6aa8', '#7fd1ff', 'metal', []),
  vipRuby: car('#9e1230', '#c4204a', '#ffd0dc', 'metal', []),
  vipBonfire: car('#ff6a1c', '#ffb52e', '#fff0a0', 'neon', ['flames']),
  vipMint: car('#a8f0d8', '#d8fff2', '#ffffff', 'metal', []),
  vipAmethyst: car('#7a3fc4', '#a870e8', '#f0d8ff', 'metal', []),
  vipRose: car('#e8a89a', '#f4c9bd', '#fff0ea', 'metal', []),
  vipNight: car('#141a3c', '#232c63', '#ffffff', 'metal', ['stars']),
  vipOpal: car('#dfe9f5', '#f5e8f2', '#ffffff', 'metal', ['bands']),
  vipEmerald: car('#0f7a4a', '#27b06f', '#c8ffe4', 'metal', []),
  vipPlatinum: car('#d8dde6', '#f0f2f7', '#ffffff', 'metal', []),
};

export const DEFAULT_SKIN = 'carRed';

export const specOf = (id: string): SkinSpec => SKIN_SPECS[id] ?? SKIN_SPECS[DEFAULT_SKIN];
