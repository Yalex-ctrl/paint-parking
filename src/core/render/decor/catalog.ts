export type DecorKind = 'tree' | 'bush' | 'flower' | 'grass' | 'stone' | 'wood' | 'cactus' | 'dune';

export type DecorModel = {
  /** File name (without .glb) in assets/models, or the name of a procedural model (see procedural.ts). */
  name: string;
  kind: DecorKind;
  /** Built in code instead of loaded from a .glb. */
  procedural?: boolean;
  /** Tall pieces only go behind or beside the board, never in front of it. */
  tall: boolean;
  /** Footprint radius and height of the raw model (before scaling). */
  radius: number;
  height: number;
  /** Random scale range applied per instance. */
  scale: readonly [number, number];
};

/**
 * 18 pieces (the cacti and dunes only appear in the desert world), mostly green: bushes, flower patches and tall grass (built in code, solid volumes), a few
 * trees from the Kenney Nature Kit (CC0), and only a couple of stones and one stump. Anything flat was
 * dropped (the kit's grass blades, flowers and leafy bushes read as stars lying on the grass).
 * Everything is placed in groves of at least two pieces (see placement.ts).
 */
export const DECOR_MODELS: readonly DecorModel[] = [
  { name: 'tree_default', kind: 'tree', tall: true, radius: 0.38, height: 1.71, scale: [2.0, 2.7] },
  { name: 'tree_oak', kind: 'tree', tall: true, radius: 0.37, height: 1.23, scale: [2.2, 3.0] },
  { name: 'tree_fat', kind: 'tree', tall: true, radius: 0.38, height: 1.15, scale: [2.4, 3.2] },
  { name: 'tree_small', kind: 'tree', tall: true, radius: 0.2, height: 1.11, scale: [2.4, 3.4] },
  { name: 'tree_pineTallA', kind: 'tree', tall: true, radius: 0.21, height: 1.53, scale: [2.2, 3.0] },
  { name: 'bush_round', kind: 'bush', procedural: true, tall: false, radius: 0.55, height: 0.62, scale: [1.5, 2.2] },
  { name: 'bush_wide', kind: 'bush', procedural: true, tall: false, radius: 0.6, height: 0.55, scale: [1.5, 2.1] },
  { name: 'flowers_white', kind: 'flower', procedural: true, tall: false, radius: 0.33, height: 0.5, scale: [1.8, 2.6] },
  { name: 'flowers_pink', kind: 'flower', procedural: true, tall: false, radius: 0.33, height: 0.5, scale: [1.8, 2.6] },
  { name: 'flowers_violet', kind: 'flower', procedural: true, tall: false, radius: 0.33, height: 0.5, scale: [1.8, 2.6] },
  { name: 'grass_tall', kind: 'grass', procedural: true, tall: false, radius: 0.24, height: 0.85, scale: [1.6, 2.4] },
  { name: 'stone_largeA', kind: 'stone', tall: true, radius: 0.5, height: 0.26, scale: [2.4, 3.2] },
  { name: 'stone_smallA', kind: 'stone', tall: false, radius: 0.18, height: 0.19, scale: [3.5, 4.5] },
  { name: 'cactus_tall', kind: 'cactus', tall: true, radius: 0.2, height: 0.75, scale: [2.4, 3.2] },
  { name: 'cactus_short', kind: 'cactus', tall: false, radius: 0.18, height: 0.53, scale: [2.8, 3.8] },
  { name: 'dune_a', kind: 'dune', procedural: true, tall: false, radius: 1.0, height: 0.4, scale: [1.5, 2.4] },
  { name: 'dune_b', kind: 'dune', procedural: true, tall: false, radius: 0.8, height: 0.3, scale: [1.8, 2.8] },
  { name: 'stump_round', kind: 'wood', tall: false, radius: 0.19, height: 0.21, scale: [3.8, 5.0] },
];

export const MAX_DECOR = 12;
