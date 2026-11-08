/** The material of every ball skin (colour, shine, glow). Pure data: used by the 3D ball and by the shop thumbnails. */
export type SkinSpec = {
  /** Smooth sphere, or a faceted gem. */
  shape: 'sphere' | 'disco' | 'crystal';
  color: string;
  metalness: number;
  roughness: number;
  envMapIntensity: number;
  emissive?: string;
  emissiveIntensity?: number;
  opacity?: number;
  /** The dark band that makes the rolling readable on a plain ball. */
  band?: boolean;
  /** The pattern also lights up (lava cracks, the sun): its texture is used as an emissive map. */
  glowMap?: boolean;
  /** The glow breathes slowly. */
  animated?: boolean;
  /** A soft halo around the ball. */
  halo?: string;
};

/** Materials of every ball skin of the shop, by id. Textured skins also get their pattern (see skinTexture). */
export const SKIN_SPECS: Record<string, SkinSpec> = {
  gold: { shape: 'sphere', color: '#ffcc33', metalness: 0.45, roughness: 0.2, envMapIntensity: 0.9, emissive: '#ff9a00', emissiveIntensity: 0.3, band: true },
  silver: { shape: 'sphere', color: '#dfe4ee', metalness: 0.9, roughness: 0.16, envMapIntensity: 1.2, emissive: '#8f9bb0', emissiveIntensity: 0.12, band: true },
  glass: { shape: 'sphere', color: '#ffffff', metalness: 0.05, roughness: 0.05, envMapIntensity: 1.5, emissive: '#5a8cff', emissiveIntensity: 0.12, opacity: 0.88 },
  basketball: { shape: 'sphere', color: '#ffffff', metalness: 0, roughness: 0.7, envMapIntensity: 0.25 },
  football: { shape: 'sphere', color: '#ffffff', metalness: 0, roughness: 0.55, envMapIntensity: 0.3 },
  watermelon: { shape: 'sphere', color: '#ffffff', metalness: 0, roughness: 0.45, envMapIntensity: 0.4 },
  donut: { shape: 'sphere', color: '#ffffff', metalness: 0, roughness: 0.5, envMapIntensity: 0.35 },
  planet: { shape: 'sphere', color: '#ffffff', metalness: 0, roughness: 0.6, envMapIntensity: 0.3, emissive: '#1a3a7a', emissiveIntensity: 0.12 },
  eye: { shape: 'sphere', color: '#ffffff', metalness: 0, roughness: 0.12, envMapIntensity: 0.9 },
  bowling: { shape: 'sphere', color: '#ffffff', metalness: 0.1, roughness: 0.1, envMapIntensity: 1.1 },
  moon: { shape: 'sphere', color: '#ffffff', metalness: 0, roughness: 0.95, envMapIntensity: 0.15, emissive: '#6a6a80', emissiveIntensity: 0.12 },
  disco: { shape: 'disco', color: '#ffffff', metalness: 1, roughness: 0.1, envMapIntensity: 1.6, emissive: '#6a5cff', emissiveIntensity: 0.12 },
  // ---- Added with the big catalogue.
  ruby: { shape: 'crystal', color: '#e0115f', metalness: 0.3, roughness: 0.05, envMapIntensity: 1.5, emissive: '#a0083c', emissiveIntensity: 0.5, opacity: 0.92 },
  emerald: { shape: 'crystal', color: '#19b866', metalness: 0.3, roughness: 0.05, envMapIntensity: 1.5, emissive: '#0a7a42', emissiveIntensity: 0.5, opacity: 0.92 },
  sapphire: { shape: 'crystal', color: '#2a5bd7', metalness: 0.3, roughness: 0.05, envMapIntensity: 1.5, emissive: '#143a9a', emissiveIntensity: 0.55, opacity: 0.92 },
  amethyst: { shape: 'crystal', color: '#9b4fdb', metalness: 0.3, roughness: 0.05, envMapIntensity: 1.5, emissive: '#6a2aa8', emissiveIntensity: 0.5, opacity: 0.92 },
  diamond: { shape: 'crystal', color: '#e8f6ff', metalness: 0.5, roughness: 0.02, envMapIntensity: 2, emissive: '#bfe6ff', emissiveIntensity: 0.55, opacity: 0.94 },
  bronze: { shape: 'sphere', color: '#a8863a', metalness: 0.85, roughness: 0.3, envMapIntensity: 1, emissive: '#6a3a14', emissiveIntensity: 0.2, band: true },
  copper: { shape: 'sphere', color: '#ee7a5e', metalness: 0.85, roughness: 0.28, envMapIntensity: 1, emissive: '#6a2a14', emissiveIntensity: 0.2, band: true },
  pearl: { shape: 'sphere', color: '#ffffff', metalness: 0.15, roughness: 0.12, envMapIntensity: 1.3 },
  obsidian: { shape: 'sphere', color: '#2c2a38', metalness: 0.3, roughness: 0.04, envMapIntensity: 1.7, emissive: '#3a2f6a', emissiveIntensity: 0.25, band: true },
  marble: { shape: 'sphere', color: '#ffffff', metalness: 0, roughness: 0.1, envMapIntensity: 0.9 },
  wood: { shape: 'sphere', color: '#ffffff', metalness: 0, roughness: 0.25, envMapIntensity: 0.6 },
  granite: { shape: 'sphere', color: '#ffffff', metalness: 0, roughness: 0.6, envMapIntensity: 0.3 },
  tennis: { shape: 'sphere', color: '#ffffff', metalness: 0, roughness: 0.95, envMapIntensity: 0.1 },
  golf: { shape: 'sphere', color: '#ffffff', metalness: 0, roughness: 0.4, envMapIntensity: 0.5 },
  volley: { shape: 'sphere', color: '#ffffff', metalness: 0, roughness: 0.5, envMapIntensity: 0.4 },
  eight: { shape: 'sphere', color: '#ffffff', metalness: 0.1, roughness: 0.08, envMapIntensity: 1.3 },
  baseball: { shape: 'sphere', color: '#ffffff', metalness: 0, roughness: 0.6, envMapIntensity: 0.3 },
  pingpong: { shape: 'sphere', color: '#ffffff', metalness: 0, roughness: 0.4, envMapIntensity: 0.4 },
  orange: { shape: 'sphere', color: '#ffffff', metalness: 0, roughness: 0.55, envMapIntensity: 0.4 },
  tomato: { shape: 'sphere', color: '#ffffff', metalness: 0, roughness: 0.2, envMapIntensity: 0.9 },
  cookie: { shape: 'sphere', color: '#ffffff', metalness: 0, roughness: 0.9, envMapIntensity: 0.1 },
  strawberry: { shape: 'sphere', color: '#ffffff', metalness: 0, roughness: 0.5, envMapIntensity: 0.4 },
  candy: { shape: 'sphere', color: '#ffffff', metalness: 0, roughness: 0.1, envMapIntensity: 1.2 },
  blueberry: { shape: 'sphere', color: '#ffffff', metalness: 0, roughness: 0.6, envMapIntensity: 0.3 },
  sun: { shape: 'sphere', color: '#ffffff', metalness: 0, roughness: 0.8, envMapIntensity: 0.1, emissive: '#ffffff', emissiveIntensity: 0.85, glowMap: true, animated: true, halo: '#ffb347' },
  mars: { shape: 'sphere', color: '#ffffff', metalness: 0, roughness: 0.9, envMapIntensity: 0.1, emissive: '#5a1a08', emissiveIntensity: 0.15 },
  jupiter: { shape: 'sphere', color: '#ffffff', metalness: 0, roughness: 0.8, envMapIntensity: 0.15 },
  lava: { shape: 'sphere', color: '#ffffff', metalness: 0, roughness: 0.8, envMapIntensity: 0.1, emissive: '#ffffff', emissiveIntensity: 0.9, glowMap: true, animated: true },
  snow: { shape: 'sphere', color: '#ffffff', metalness: 0, roughness: 0.9, envMapIntensity: 0.3, emissive: '#b8d4f2', emissiveIntensity: 0.12 },
  ladybug: { shape: 'sphere', color: '#ffffff', metalness: 0, roughness: 0.2, envMapIntensity: 1 },
  checker: { shape: 'sphere', color: '#ffffff', metalness: 0, roughness: 0.3, envMapIntensity: 0.8 },
  bauble: { shape: 'sphere', color: '#ffffff', metalness: 0.5, roughness: 0.12, envMapIntensity: 1.4 },
  // ---- Won with rewarded ads (Cadeaux).
  prism: { shape: 'sphere', color: '#ffffff', metalness: 0.35, roughness: 0.08, envMapIntensity: 1.6, emissive: '#ffffff', emissiveIntensity: 0.12 },
  nebula: { shape: 'sphere', color: '#ffffff', metalness: 0, roughness: 0.45, envMapIntensity: 0.5, emissive: '#5b2bd6', emissiveIntensity: 0.3, halo: '#8a4dff' },
  // ---- The twelve balls of the VIP pass.
  vipAurora: { shape: 'sphere', color: '#ffffff', metalness: 0.2, roughness: 0.25, envMapIntensity: 1, emissive: '#14c8a8', emissiveIntensity: 0.15 },
  vipCoral: { shape: 'sphere', color: '#ffffff', metalness: 0, roughness: 0.35, envMapIntensity: 0.5 },
  vipDeepSea: { shape: 'sphere', color: '#ffffff', metalness: 0.1, roughness: 0.08, envMapIntensity: 1.4, emissive: '#0a3a8a', emissiveIntensity: 0.15 },
  vipRuby: { shape: 'crystal', color: '#c2185b', metalness: 0.35, roughness: 0.04, envMapIntensity: 1.7, emissive: '#7a0a3a', emissiveIntensity: 0.6, opacity: 0.93 },
  vipBonfire: { shape: 'sphere', color: '#ffffff', metalness: 0, roughness: 0.7, envMapIntensity: 0.2, emissive: '#ff6a00', emissiveIntensity: 0.55, halo: '#ff9a3c' },
  vipMint: { shape: 'sphere', color: '#ffffff', metalness: 0, roughness: 0.1, envMapIntensity: 1 },
  vipAmethyst: { shape: 'crystal', color: '#7b3fe4', metalness: 0.35, roughness: 0.04, envMapIntensity: 1.7, emissive: '#4a1fa8', emissiveIntensity: 0.6, opacity: 0.93 },
  vipRose: { shape: 'sphere', color: '#ffffff', metalness: 0.7, roughness: 0.18, envMapIntensity: 1.3, emissive: '#c9786a', emissiveIntensity: 0.15, band: true },
  vipNight: { shape: 'sphere', color: '#ffffff', metalness: 0.05, roughness: 0.4, envMapIntensity: 0.6, emissive: '#1a1456', emissiveIntensity: 0.25 },
  vipOpal: { shape: 'sphere', color: '#ffffff', metalness: 0.2, roughness: 0.08, envMapIntensity: 1.5 },
  vipEmerald: { shape: 'sphere', color: '#0b7a4a', metalness: 0.6, roughness: 0.1, envMapIntensity: 1.7, emissive: '#d8b04a', emissiveIntensity: 0.25, band: true },
  vipPlatinum: { shape: 'sphere', color: '#8fb8e8', metalness: 1, roughness: 0.05, envMapIntensity: 1.8, emissive: '#3a6fb8', emissiveIntensity: 0.35, band: true },
  crystal: { shape: 'crystal', color: '#8feaff', metalness: 0.25, roughness: 0.06, envMapIntensity: 1.4, emissive: '#2f9cff', emissiveIntensity: 0.55, opacity: 0.86 },
};

