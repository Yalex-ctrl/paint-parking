import { MONETIZATION } from './config/monetization';

/** First level id used by the daily challenges (so they never collide with the campaign). */
export const DAILY_LEVEL_BASE = 100_000;
export const isDailyLevelId = (id: number) => id >= DAILY_LEVEL_BASE;

export type DecorWeights = Partial<Record<'tree' | 'bush' | 'flower' | 'grass' | 'stone' | 'wood' | 'cactus' | 'dune', number>>;

/** Everything that makes one world look different from another. Plain data: colours as CSS hex. */
export type WorldTheme = {
  id: string;
  name: string;
  /** Name of an icon of the interface's icon family (MaterialCommunityIcons). */
  icon: string;
  /** The colour of the slides (the chutes over the walls): one vivid colour that stands out from the wood of the walls. */
  chute: string;
  /** Grass (or sand, snow...) near and far from the board, and the slice of earth or ice seen along the island's edge. */
  ground: { near: string; far: string; rimTop: string; rimBottom: string };
  sky: { top: string; bottom: string };
  light: {
    ambient: string;
    ambientIntensity: number;
    hemiSky: string;
    hemiGround: string;
    sun: string;
    sunIntensity: number;
  };
  /** The wood of the board: lightness multiplier and saturation, so the board stands out from the ground of each world. */
  wood: { tone: number; sat: number };
  foliage: {
    /** Colour of the kit's `leafsGreen` / `leafsDark` materials. */
    leaves: string;
    leavesDark: string;
    /** Tint multiplied onto the bushes and the tall grass (white = unchanged green). */
    bushTint: string;
    grassTint: string;
    /** Colour given to the kit's stones (red rock in the desert, snowy rock...); absent = natural grey. */
    rock?: string;
  };
  decor: {
    /** Relative weight of each kind of piece (0 or missing = never). */
    weights: DecorWeights;
    /** If set, only these tree models are used. */
    onlyTrees?: string[];
  };
};

const BASE_THEMES: WorldTheme[] = [
  {
    id: 'forest',
    name: 'Forêt',
    icon: 'pine-tree',
    chute: '#13c4cf',
    ground: { near: '#6f9a58', far: '#4c7a45', rimTop: '#8a6740', rimBottom: '#3c2b1d' },
    sky: { top: '#6fa8d8', bottom: '#cfe6f2' },
    wood: { tone: 1, sat: 0.5 },
    light: { ambient: '#ffffff', ambientIntensity: 0.85, hemiSky: '#e8eeff', hemiGround: '#8c8a78', sun: '#fff3df', sunIntensity: 2.4 },
    foliage: { leaves: '#4f9a3c', leavesDark: '#2d6e34', bushTint: '#ffffff', grassTint: '#ffffff' },
    decor: { weights: { tree: 3.2, bush: 3, flower: 1, grass: 2, stone: 0.5, wood: 0.35 } },
  },
  {
    id: 'meadow',
    name: 'Prairie fleurie',
    icon: 'flower',
    chute: '#13c4cf',
    ground: { near: '#8bb866', far: '#5f9a4a', rimTop: '#94704a', rimBottom: '#403020' },
    sky: { top: '#74b9ee', bottom: '#e1f0fa' },
    wood: { tone: 1, sat: 0.5 },
    light: { ambient: '#ffffff', ambientIntensity: 0.9, hemiSky: '#eef4ff', hemiGround: '#9a9a78', sun: '#fff6e2', sunIntensity: 2.5 },
    foliage: { leaves: '#6bb04a', leavesDark: '#3f8a3a', bushTint: '#ffffff', grassTint: '#ffffff' },
    decor: { weights: { tree: 0.8, bush: 2, flower: 4.2, grass: 3, stone: 0.3, wood: 0.2 } },
  },
  {
    id: 'autumn',
    name: 'Automne',
    icon: 'leaf-maple',
    chute: '#13c4cf',
    ground: { near: '#8f8a4c', far: '#6b6538', rimTop: '#7a5230', rimBottom: '#33231a' },
    sky: { top: '#d89a6a', bottom: '#f1dcc0' },
    wood: { tone: 0.95, sat: 0.5 },
    light: { ambient: '#ffe6cc', ambientIntensity: 0.8, hemiSky: '#ffe2c4', hemiGround: '#8a6a48', sun: '#ffd9a8', sunIntensity: 2.3 },
    foliage: { leaves: '#e0762f', leavesDark: '#a8431f', bushTint: '#d9822b', grassTint: '#c8a23a' },
    decor: { weights: { tree: 3, bush: 2, flower: 0.2, grass: 2, stone: 0.6, wood: 0.8 } },
  },
  {
    id: 'snow',
    name: 'Neige',
    icon: 'snowflake',
    chute: '#13c4cf',
    ground: { near: '#f1f5fb', far: '#d3deec', rimTop: '#cfe3f3', rimBottom: '#2a4262' },
    sky: { top: '#4d76ae', bottom: '#7f9fcb' },
    wood: { tone: 0.8, sat: 0.5 },
    light: { ambient: '#dfeaff', ambientIntensity: 0.95, hemiSky: '#f0f6ff', hemiGround: '#9fb0c4', sun: '#e8f2ff', sunIntensity: 2.2 },
    foliage: { leaves: '#cfe3e8', leavesDark: '#9bb8c4', bushTint: '#dfeaf0', grassTint: '#d8e4ea', rock: '#c9d6e3' },
    decor: { weights: { tree: 3, stone: 1.6, bush: 1, grass: 0.5 }, onlyTrees: ['tree_pineTallA', 'tree_small'] },
  },
  {
    id: 'desert',
    name: 'Désert',
    icon: 'cactus',
    chute: '#13c4cf',
    ground: { near: '#f0dc96', far: '#dcc27a', rimTop: '#bf8f4f', rimBottom: '#6a4a28' },
    sky: { top: '#6fb4e0', bottom: '#bfe3ee' },
    wood: { tone: 0.66, sat: 0.62 },
    light: { ambient: '#fff3da', ambientIntensity: 0.9, hemiSky: '#fff6e0', hemiGround: '#b89a68', sun: '#fff0cf', sunIntensity: 2.6 },
    foliage: { leaves: '#6f9a45', leavesDark: '#4f7a34', bushTint: '#b9a45a', grassTint: '#cdb870', rock: '#b8663f' },
    decor: { weights: { cactus: 4, stone: 2.2, bush: 1.6, grass: 1, dune: 2.4 } },
  },
];

/** Used by the daily challenge: a twilight look, so it feels different from the campaign. */
const DAILY_THEME: WorldTheme = {
  id: 'daily',
  name: 'Défi du jour',
  icon: 'target',
  chute: '#13c4cf',
  ground: { near: '#69c29a', far: '#3d7a64', rimTop: '#2d5a48', rimBottom: '#162b24' },
  sky: { top: '#241d4d', bottom: '#6a4f9c' },
  wood: { tone: 0.9, sat: 0.5 },
  light: { ambient: '#b9b6ff', ambientIntensity: 0.9, hemiSky: '#cfd6ff', hemiGround: '#5a5a88', sun: '#cfd6ff', sunIntensity: 1.9 },
  foliage: { leaves: '#4b8a6a', leavesDark: '#2c5c4c', bushTint: '#a8c8c0', grassTint: '#a8c0c8' },
  decor: { weights: { tree: 2.4, bush: 2.4, flower: 1.4, grass: 2, stone: 0.8 } },
};

/* ---- colour helpers (pure, no three.js) ---- */

const hexToRgb = (css: string): [number, number, number] => {
  const n = parseInt(css.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgbToHex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');

/** Rotates the hue of a CSS hex colour by `degrees`. */
export function shiftHue(css: string, degrees: number): string {
  if (degrees === 0) return css;
  const [r, g, b] = hexToRgb(css).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d > 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  h = (((h + degrees) % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [rp, gp, bp] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return rgbToHex((rp + m) * 255, (gp + m) * 255, (bp + m) * 255);
}

export const ROMAN = ['', ' II', ' III', ' IV', ' V', ' VI', ' VII', ' VIII', ' IX', ' X'];

/** Hue turns (degrees) of the cycles after the first: small, so a world stays recognisable. */
const FOLIAGE_TURN = [0, 14, -14, 26];
const SKY_TURN = [0, 8, -8, 14];

function variantOf(base: WorldTheme, variant: number): WorldTheme {
  if (variant === 0) return base;
  const k = variant % 4;
  // Sand and snow keep their colours; only green worlds drift a little. The sky and the leaves shift a bit.
  const sandOrSnow = base.id === 'snow' || base.id === 'desert';
  const sky = sandOrSnow ? 0 : SKY_TURN[k];
  const leaves = base.id === 'snow' ? 0 : FOLIAGE_TURN[k];
  const green = base.id === 'forest' || base.id === 'meadow' ? FOLIAGE_TURN[k] / 2 : 0;
  return {
    ...base,
    name: base.name + (ROMAN[variant] ?? ` ${variant + 1}`),
    ground: { ...base.ground, near: shiftHue(base.ground.near, green), far: shiftHue(base.ground.far, green) },
    sky: { top: shiftHue(base.sky.top, sky), bottom: shiftHue(base.sky.bottom, sky) },
    foliage: {
      leaves: shiftHue(base.foliage.leaves, leaves),
      leavesDark: shiftHue(base.foliage.leavesDark, leaves),
      bushTint: base.foliage.bushTint,
      grassTint: base.foliage.grassTint,
      rock: base.foliage.rock,
    },
  };
}

export const WORLD_COUNT_BASE = BASE_THEMES.length;

/** 0-based world number of a campaign level (25 levels per world). */
export const worldIndexOf = (levelId: number) => Math.floor((levelId - 1) / MONETIZATION.worlds.levelsPerWorld);

/** The look of the world a level belongs to. The 5 worlds repeat, with colour variants. */
export function themeForLevel(levelId: number): WorldTheme {
  if (isDailyLevelId(levelId)) return DAILY_THEME;
  const index = Math.max(0, worldIndexOf(levelId));
  return variantOf(BASE_THEMES[index % BASE_THEMES.length], Math.floor(index / BASE_THEMES.length));
}

export type WorldProgress = {
  /** 0-based world number. */
  world: number;
  /** Level number inside the world, 1..25. */
  levelInWorld: number;
  total: number;
  /** 0..1 */
  fraction: number;
};

/** How far through its world a level is (the bar shown between two levels). */
export function worldProgress(levelId: number): WorldProgress {
  const total = MONETIZATION.worlds.levelsPerWorld;
  const levelInWorld = ((levelId - 1) % total) + 1;
  return { world: worldIndexOf(levelId), levelInWorld, total, fraction: levelInWorld / total };
}

/** True for the first level of a world other than the very first. */
export const isNewWorldStart = (levelId: number) => levelId > 1 && (levelId - 1) % MONETIZATION.worlds.levelsPerWorld === 0;

/**
 * Mechanics that are introduced on the very first level of a world (shown on the "new world" card). The mechanics come early,
 * each with its own tutorial bubble, so this is usually empty.
 */
export function mechanicsNewInWorld(worldIndex: number): string[] {
  const first = worldIndex * MONETIZATION.worlds.levelsPerWorld + 1;
  return Object.keys(unlockLevels).filter((m) => unlockLevels[m] === first);
}

/** The level at which each mechanic of the game is introduced; the game registers its own (see game/mechanics.ts). */
let unlockLevels: Record<string, number> = {};
export const registerUnlockLevels = (levels: Record<string, number>) => {
  unlockLevels = levels;
};
