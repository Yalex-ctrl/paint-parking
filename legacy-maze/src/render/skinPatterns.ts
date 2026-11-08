/**
 * The look of the ball skins, as pure functions: given a direction on the sphere (a unit vector) they
 * return the colour there. They are baked into a small texture once (see skins.ts), which is the only
 * way to get "football patches", "an eye" or "continents" on a sphere in Expo Go without image files.
 */
import { fbm, hash3, hex, mix, noise3, smooth, type Dir3, type RGB } from './skinHelpers';
import { MORE_PATTERNS } from './skinPatternsMore';
import { EXTRA_PATTERNS } from './skinPatternsExtra';

export { hash3, noise3 };
export type { Dir3, RGB };

const PHI = (1 + Math.sqrt(5)) / 2;
/** Centres of the 12 faces of a dodecahedron: where a football has its black pentagons. */
export const PENTAGONS: [number, number, number][] = (() => {
  const raw: [number, number, number][] = [];
  for (const a of [-1, 1]) {
    for (const b of [-1, 1]) {
      raw.push([0, a, b * PHI], [a, b * PHI, 0], [b * PHI, 0, a]);
    }
  }
  return raw.map(([x, y, z]) => {
    const n = Math.hypot(x, y, z);
    return [x / n, y / n, z / n];
  });
})();

const BLACK = hex(0x14141a);

const football: Dir3 = (x, y, z) => {
  let best = -1;
  for (const [px, py, pz] of PENTAGONS) best = Math.max(best, x * px + y * py + z * pz);
  // Black patch (angular radius ~17 degrees) with a soft edge, on white leather.
  const patch = smooth(0.952, 0.962, best);
  const leather = 0.93 + (noise3(x * 30, y * 30, z * 30) - 0.5) * 0.06;
  return mix([leather, leather, leather * 0.98], BLACK, patch);
};

const basketball: Dir3 = (x, y, z) => {
  const grain = (noise3(x * 55, y * 55, z * 55) - 0.5) * 0.08;
  const orange: RGB = [0.9 + grain, 0.45 + grain, 0.12 + grain];
  const w = 0.03;
  const line = Math.min(Math.abs(x), Math.abs(y), Math.abs(Math.abs(z) - 0.72) * 0.9);
  return mix(orange, hex(0x1a120c), 1 - smooth(w, w + 0.012, line));
};

const watermelon: Dir3 = (x, y, z) => {
  const lon = Math.atan2(z, x);
  const wob = Math.sin(y * 5 + lon * 2) * 0.35;
  const s = 0.5 + 0.5 * Math.sin(lon * 7 + wob);
  const light = hex(0x59c04e);
  const dark = hex(0x1f6a2c);
  const grain = (noise3(x * 25, y * 25, z * 25) - 0.5) * 0.08;
  const c = mix(light, dark, smooth(0.35, 0.65, s));
  return [c[0] + grain, c[1] + grain, c[2] + grain];
};

const donut: Dir3 = (x, y, z) => {
  const lon = Math.atan2(z, x);
  const edge = 0.05 + 0.18 * Math.sin(lon * 5) * 0.5 + 0.07 * Math.sin(lon * 11 + 1);
  const dough = mix(hex(0xe2a95e), hex(0xc8873f), noise3(x * 8, y * 8, z * 8));
  const icing = hex(0xf26fb0);
  const onIcing = smooth(edge - 0.04, edge + 0.04, y);
  let c = mix(dough, icing, onIcing);
  if (onIcing > 0.5) {
    // Sprinkles: a short bar in some cells of a coarse grid.
    const gx = Math.floor(x * 9);
    const gy = Math.floor(y * 9);
    const gz = Math.floor(z * 9);
    const h = hash3(gx, gy, gz);
    if (h < 0.3) {
      const cx = (gx + 0.5) / 9;
      const cy = (gy + 0.5) / 9;
      const cz = (gz + 0.5) / 9;
      if (Math.hypot(x - cx, y - cy, z - cz) < 0.035) {
        const palette = [0xffffff, 0xfff176, 0x6ee7ff, 0x7bd96b, 0xb48cff];
        c = hex(palette[Math.floor(hash3(gz, gx, gy) * palette.length)]);
      }
    }
  }
  return c;
};

const moon: Dir3 = (x, y, z) => {
  let c = mix(hex(0xc9c9d0), hex(0xa4a4ae), fbm(x * 4, y * 4, z * 4));
  // Craters: a dark bowl with a light rim, at hashed centres of a coarse grid.
  for (const scale of [3, 6]) {
    const gx = Math.floor(x * scale);
    const gy = Math.floor(y * scale);
    const gz = Math.floor(z * scale);
    for (let dx = 0; dx <= 1; dx++) {
      for (let dy = 0; dy <= 1; dy++) {
        for (let dz = 0; dz <= 1; dz++) {
          const cx = gx + dx;
          const cy = gy + dy;
          const cz = gz + dz;
          if (hash3(cx, cy, cz) > 0.45) continue;
          const px = (cx + hash3(cz, cx, cy)) / scale - 0.5 / scale;
          const py = (cy + hash3(cy, cz, cx)) / scale - 0.5 / scale;
          const pz = (cz + hash3(cx, cz, cy)) / scale - 0.5 / scale;
          const d = Math.hypot(x - px, y - py, z - pz) * scale;
          const r = 0.34 + hash3(cx, cy, cz) * 0.2;
          if (d < r) c = mix(c, hex(0x7d7d88), 0.7 * (1 - d / r));
          else if (d < r + 0.1) c = mix(c, hex(0xe6e6ec), 0.5 * (1 - (d - r) / 0.1));
        }
      }
    }
  }
  return c;
};

const planet: Dir3 = (x, y, z) => {
  const h = fbm(x * 2.2 + 3, y * 2.2, z * 2.2 + 7);
  let c: RGB;
  if (h < 0.5) c = mix(hex(0x1b4f9c), hex(0x2f86d6), smooth(0.25, 0.5, h));
  else if (h < 0.6) c = hex(0xd8c47a); // beach
  else c = mix(hex(0x3f9a45), hex(0x8a6a3a), smooth(0.62, 0.8, h));
  c = mix(c, hex(0xf2f6fa), smooth(0.8, 0.9, Math.abs(y))); // ice caps
  const cloud = smooth(0.58, 0.72, fbm(x * 3.1 + 11, y * 5.5, z * 3.1));
  return mix(c, hex(0xffffff), cloud * 0.8);
};

const eye: Dir3 = (x, y, z) => {
  // Looks along +z. White of the eye with a few red veins, then iris and pupil.
  const angle = Math.acos(Math.max(-1, Math.min(1, z)));
  let c = hex(0xf7f3ee);
  const vein = smooth(0.78, 0.9, noise3(x * 14, y * 14, z * 14)) * smooth(0.5, 1.2, angle);
  c = mix(c, hex(0xd9534f), vein * 0.5);
  if (angle < 0.7) {
    const t = angle / 0.7;
    const ring = 0.5 + 0.5 * Math.sin(Math.atan2(y, x) * 18);
    const iris = mix(hex(0x2b9bd6), hex(0x1f6f5a), t * 0.8 + ring * 0.12);
    c = mix(c, mix(iris, hex(0x0f3a52), smooth(0.8, 1, t)), smooth(0.7, 0.66, angle));
    c = mix(c, BLACK, smooth(0.33, 0.3, angle));
    // A bright reflection.
    const hl = Math.hypot(x - 0.16, y - 0.2, z - 0.96);
    c = mix(c, hex(0xffffff), smooth(0.11, 0.07, hl));
  }
  return c;
};

const bowling: Dir3 = (x, y, z) => {
  const swirl = fbm(x * 3 + y * 1.5, y * 3 + z * 1.5, z * 3 + x * 1.5);
  let c = mix(hex(0x1c2370), hex(0x5a3fb8), smooth(0.35, 0.7, swirl));
  c = mix(c, hex(0x8f6df0), smooth(0.7, 0.85, swirl) * 0.5);
  // Three finger holes around one spot.
  const holes: [number, number, number][] = [
    [0.0, 0.62, 0.78],
    [-0.2, 0.7, 0.68],
    [0.2, 0.7, 0.68],
  ];
  for (const [hx, hy, hz] of holes) {
    const n = Math.hypot(hx, hy, hz);
    const d = Math.hypot(x - hx / n, y - hy / n, z - hz / n);
    c = mix(c, hex(0x050508), smooth(0.115, 0.095, d));
  }
  return c;
};

const glass: Dir3 = (x, y, z) => {
  // Marble: twisting bands of blue, teal and violet inside clear glass.
  const t = Math.atan2(z, x) * 3 + y * 7 + noise3(x * 3, y * 3, z * 3) * 3;
  const band = 0.5 + 0.5 * Math.sin(t);
  const c = mix(hex(0xbfe9ff), hex(0x3d6df2), smooth(0.45, 0.6, band));
  return mix(c, hex(0xc27cf0), smooth(0.75, 0.9, 0.5 + 0.5 * Math.sin(t * 0.5 + 2)) * 0.6);
};

/** Patterns of the textured skins, by shop id. The others (gold, silver, disco, crystal) are plain materials. */
export const SKIN_PATTERNS: Record<string, Dir3> = { basketball, football, watermelon, donut, moon, planet, eye, bowling, glass, ...MORE_PATTERNS, ...EXTRA_PATTERNS };
