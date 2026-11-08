/**
 * The 36 paints of the shop, as plain data: how each tile is coloured, which tile pattern it carries (see paintTexels.ts),
 * how shiny it is, and whether it moves. paintEffects.ts turns this into colours and materials.
 */
export type PaintTint =
  | 'level' // the colour of the level
  | 'pastel' // the level colour, washed out
  | 'neon' // the level colour, at full brightness (drawn unlit)
  | 'rainbow' // the hue changes along the path
  | 'white' // the pattern brings all the colours
  | 'fixed' // one colour for the whole paint (metals)
  | 'gradient'; // a palette spread over the board

export type PaintAnimation =
  | 'scroll-y' // the pattern slides slowly
  | 'scroll-x'
  | 'hue'; // the tint drifts through the rainbow

export type PaintStyle = {
  tint: PaintTint;
  fixed?: string;
  gradient?: string[];
  /** Key of the tile pattern in PAINT_TEXELS. */
  texture?: string;
  roughness: number;
  metalness: number;
  /** Strength of the reflection map (0 = none). */
  env: number;
  /** Drawn without lighting (neon). */
  unlit?: boolean;
  emissive?: string;
  emissiveIntensity?: number;
  animated?: PaintAnimation;
  /** Speed of the animation, in tile widths per second (or turns per second for the hue). */
  speed?: number;
};

const plain = { roughness: 0.35, metalness: 0.05, env: 0 };
const metal = (fixed: string, roughness: number, env = 1.3): PaintStyle => ({ tint: 'fixed', fixed, roughness, metalness: 0.95, env });
const gradient = (colors: string[]): PaintStyle => ({ tint: 'gradient', gradient: colors, roughness: 0.4, metalness: 0.05, env: 0 });
const pattern = (texture: string, tint: PaintTint = 'white', roughness = 0.5): PaintStyle => ({ tint, texture, roughness, metalness: 0.05, env: 0 });

export const PAINT_STYLES: Record<string, PaintStyle> = {
  // The first paints of the game
  classic: { tint: 'level', ...plain },
  pastel: { tint: 'pastel', roughness: 0.6, metalness: 0, env: 0 },
  glitter: { tint: 'level', texture: 'glitter', roughness: 0.3, metalness: 0.45, env: 1, emissive: '#ffffff', emissiveIntensity: 0.25, animated: 'scroll-x', speed: 0.07 },
  neon: { tint: 'neon', roughness: 1, metalness: 0, env: 0, unlit: true },
  metallic: { tint: 'level', roughness: 0.2, metalness: 0.95, env: 1.3 },
  rainbow: { tint: 'rainbow', ...plain },

  // Gradients
  sunset: gradient(['#ff5e62', '#ff9966', '#ffd36e', '#c471ed']),
  ocean: gradient(['#12e0d6', '#2e8bff', '#2a4fd0']),
  woodland: gradient(['#b6f06a', '#46b85a', '#1f8a52']),
  bonbon: gradient(['#ff8fcf', '#b28dff', '#7fe1ff']),
  aurora: { tint: 'white', texture: 'aurora', roughness: 0.35, metalness: 0.1, env: 0.4, animated: 'scroll-y', speed: 0.05 },

  // Metals
  gilded: metal('#ffc83a', 0.22),
  silvery: metal('#d9dde6', 0.2),
  chrome: { ...metal('#eef1f6', 0.04, 1.9), metalness: 1 },
  bronzed: metal('#c9803f', 0.28),
  prismatic: { tint: 'white', texture: 'prismatic', roughness: 0.2, metalness: 0.6, env: 1.3, animated: 'scroll-x', speed: 0.06 },
  holo: { tint: 'white', texture: 'holo', roughness: 0.15, metalness: 0.7, env: 1.5, animated: 'hue', speed: 0.08 },

  // Textures
  marblePaint: pattern('marblePaint', 'white', 0.15),
  watercolor: pattern('watercolor', 'white', 0.9),
  chalk: pattern('chalk', 'white', 1),
  pointillism: pattern('pointillism', 'white', 0.8),
  mosaic: pattern('mosaic', 'white', 0.3),
  stained: { ...pattern('stained', 'white', 0.1), env: 0.6, emissive: '#ffffff', emissiveIntensity: 0.12 },
  terrazzo: pattern('terrazzo', 'white', 0.5),

  // Patterns
  stripes: pattern('stripes', 'level'),
  dots: pattern('dots', 'level'),
  checkerPaint: pattern('checkerPaint', 'level'),
  zebra: pattern('zebra'),
  leopard: pattern('leopard'),
  camo: pattern('camo', 'white', 0.9),
  pixel: pattern('pixel', 'white', 0.9),

  // Specials
  lavaPaint: { ...pattern('lavaPaint', 'white', 0.8), emissive: '#ff6a1c', emissiveIntensity: 0.35, animated: 'scroll-y', speed: 0.04 },
  ice: { ...pattern('ice', 'white', 0.1), env: 1.2, metalness: 0.2 },
  galaxy: { ...pattern('galaxy', 'white', 0.6), emissive: '#6a4ad8', emissiveIntensity: 0.3, animated: 'scroll-x', speed: 0.015 },
  fire: { ...pattern('fire', 'white', 0.7), emissive: '#ff7a1c', emissiveIntensity: 0.4, animated: 'scroll-y', speed: 0.35 },
  toxic: { ...pattern('toxic', 'white', 0.3), emissive: '#7aff3a', emissiveIntensity: 0.15 },
  confetti: pattern('confetti', 'white', 0.6),
};

export const PAINT_IDS = Object.keys(PAINT_STYLES);
