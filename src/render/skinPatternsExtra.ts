import { fbm, hash3, hex, mix, noise3, smooth, type Dir3, type RGB } from './skinHelpers';

/**
 * The balls made for the rewards: three won with rewarded ads, and twelve for the VIP pass (one a month). Each one is a pattern of
 * its own on the sphere (a function from a point of the sphere to a colour), built from a few small recipes with their own palettes,
 * so they are all different and none can be found anywhere else.
 */
const lon = (x: number, z: number) => Math.atan2(z, x);

/** Stripes round the ball, wobbling a little, in the given colours. */
function bands(colors: number[], wobble = 0.18, freq = 3): Dir3 {
  const palette = colors.map(hex);
  return (x, y, z) => {
    const t = (y + 1) / 2 + (noise3(x * 2.4, y * 2.4, z * 2.4) - 0.5) * wobble;
    const k = Math.min(0.9999, Math.max(0, ((t * freq) % 1 + 1) % 1)) * palette.length;
    const i = Math.floor(k);
    return mix(palette[i % palette.length], palette[(i + 1) % palette.length], smooth(0.55, 1, k - i));
  };
}

/** Marble: veins of a second colour in a first. */
function marbleOf(a: number, b: number, scale = 2.2, vein = 0.12): Dir3 {
  const ca = hex(a);
  const cb = hex(b);
  return (x, y, z) => {
    const n = Math.abs(fbm(x * scale, y * scale, z * scale) - 0.5);
    return mix(cb, ca, smooth(0, vein, n));
  };
}

/** Dots on a ground. */
function dots(ground: number, dot: number, cells = 7, size = 0.32): Dir3 {
  const g = hex(ground);
  const d = hex(dot);
  return (x, y, z) => {
    const u = (lon(x, z) / Math.PI + 1) * cells;
    const v = (Math.asin(Math.max(-1, Math.min(1, y))) / Math.PI + 0.5) * cells;
    const fu = u - Math.floor(u) - 0.5;
    const fv = v - Math.floor(v) - 0.5;
    const off = hash3(Math.floor(u), Math.floor(v), 4) * 0.12;
    return mix(g, d, 1 - smooth(size - 0.07, size, Math.hypot(fu, fv) + off));
  };
}

/** A night sky: a gradient with scattered stars. */
function sky(top: number, bottom: number, star = 0xffffff, density = 0.965): Dir3 {
  const t = hex(top);
  const b = hex(bottom);
  const s = hex(star);
  return (x, y, z) => {
    const base = mix(b, t, (y + 1) / 2 + (fbm(x * 1.6, y * 1.6, z * 1.6) - 0.5) * 0.5);
    const px = Math.floor(x * 14);
    const py = Math.floor(y * 14);
    const pz = Math.floor(z * 14);
    return hash3(px, py, pz) > density ? s : base;
  };
}

/** Colours that flow into one another in a swirl. */
function swirl(colors: number[], turns = 1.6): Dir3 {
  const palette = colors.map(hex);
  return (x, y, z) => {
    const w = (Math.sin(lon(x, z) * turns + y * 5 + fbm(x * 2, y * 2, z * 2) * 3) + 1) / 2;
    const k = w * (palette.length - 1);
    const i = Math.min(palette.length - 2, Math.floor(k));
    return mix(palette[i], palette[i + 1], k - i);
  };
}

/** A rainbow sheen that changes with the point of view of the sphere: iridescence. */
const prism: Dir3 = (x, y, z) => {
  const h = ((lon(x, z) / (Math.PI * 2) + 0.5 + y * 0.35 + fbm(x * 2, y * 2, z * 2) * 0.4) % 1 + 1) % 1;
  const i = Math.floor(h * 6) % 6;
  const f = h * 6 - Math.floor(h * 6);
  const v = 1;
  const s = 0.5;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  return ([[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i]) as RGB;
};

/** A nebula: deep violet and blue clouds with pink glows and a few stars. */
const nebula: Dir3 = (x, y, z) => {
  const n = fbm(x * 2.2, y * 2.2, z * 2.2);
  const m = fbm(x * 4 + 3, y * 4, z * 4);
  let c = mix(hex(0x120a3a), hex(0x3b1d8f), smooth(0.25, 0.7, n));
  c = mix(c, hex(0xe0409b), smooth(0.55, 0.85, m) * 0.7);
  c = mix(c, hex(0x2fb8ff), smooth(0.6, 0.9, noise3(x * 3 + 9, y * 3, z * 3)) * 0.45);
  return hash3(Math.floor(x * 18), Math.floor(y * 18), Math.floor(z * 18)) > 0.975 ? [1, 1, 1] : c;
};

export const EXTRA_PATTERNS: Record<string, Dir3> = {
  // ---- won with rewarded ads
  prism,
  nebula,
  // ---- the VIP pass, one a month
  vipAurora: bands([0x14c8a8, 0x3ac26a, 0x7a4df0, 0x14c8a8], 0.3, 2),
  vipCoral: dots(0xff6f61, 0xfff0e6, 6, 0.3),
  vipDeepSea: marbleOf(0x0a2f6b, 0x7fd4ff, 2, 0.1),
  vipBonfire: swirl([0xff3d00, 0xffa000, 0xffe082, 0xff3d00], 1.4),
  vipMint: marbleOf(0xbff5e0, 0xffffff, 2.6, 0.16),
  vipRose: bands([0xf6b8a8, 0xe8957f, 0xf6b8a8], 0.1, 4),
  vipNight: sky(0x1a1456, 0x070a24),
  vipOpal: swirl([0xbfe9ff, 0xffd6f2, 0xd3f5d0, 0xbfe9ff], 1.1),
};

/** The twelve balls of the VIP pass, in the order they are given (a gem or a pattern each). */
export const VIP_BALLS = [
  { id: 'vipAurora', name: 'Aurore' },
  { id: 'vipCoral', name: 'Corail' },
  { id: 'vipDeepSea', name: 'Grand bleu' },
  { id: 'vipRuby', name: 'Rubis royal' },
  { id: 'vipBonfire', name: 'Feu de joie' },
  { id: 'vipMint', name: 'Menthe glacée' },
  { id: 'vipAmethyst', name: 'Améthyste impériale' },
  { id: 'vipRose', name: 'Or rose' },
  { id: 'vipNight', name: 'Nuit étoilée' },
  { id: 'vipOpal', name: 'Opale' },
  { id: 'vipEmerald', name: 'Émeraude impériale' },
  { id: 'vipPlatinum', name: 'Platine' },
] as const;
