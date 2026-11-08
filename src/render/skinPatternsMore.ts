import { fbm, hash3, hex, mix, noise3, smooth, type Dir3, type RGB } from './skinHelpers';

/**
 * The patterns of the balls added with the big catalogue: materials, sports, treats, planets and fun ones. Same idea as
 * skinPatterns.ts: a colour for each direction on the sphere, baked into a texture once.
 */

const BLACK = hex(0x14141a);
const WHITE = hex(0xf6f4ef);
const lon = (x: number, z: number) => Math.atan2(z, x);

/* ------------------------------------------------------------------ materials */

const pearl: Dir3 = (x, y, z) => {
  const n = fbm(x * 2 + 4, y * 2, z * 2);
  // A milky white that shows pink, blue and green depending on the spot (nacre).
  const base = hex(0xf6efe6);
  const shift: RGB = n < 0.42 ? hex(0xf2b8d4) : n < 0.58 ? hex(0xb6d8f2) : hex(0xc2ecc8);
  return mix(base, shift, 0.8);
};

const marble: Dir3 = (x, y, z) => {
  // Grey-blue veins wandering through white stone (two sets crossing, so there is always one in view).
  const w = fbm(x * 3, y * 3, z * 3) * 2.2;
  const v1 = Math.abs(Math.sin((x + w) * 6 + y * 3));
  const v2 = Math.abs(Math.sin((z - w) * 5 + y * 4 + 1));
  const d = smooth(0.0, 0.34, Math.min(v1, v2 + 0.1));
  return mix(hex(0x5f6578), hex(0xf4f2f6), 0.15 + 0.85 * d);
};

const wood: Dir3 = (x, y, z) => {
  // Polished wood: rings around the vertical axis, wobbling a little.
  const r = Math.hypot(x, z) + fbm(x * 3, y * 2, z * 3) * 0.25;
  const ring = 0.5 + 0.5 * Math.sin(r * 26 + y * 2);
  return mix(hex(0x8a5a2b), hex(0xc58a4e), ring);
};

const granite: Dir3 = (x, y, z) => {
  const speck = noise3(x * 40, y * 40, z * 40);
  let c = mix(hex(0x8d8d92), hex(0xb2b0b4), fbm(x * 6, y * 6, z * 6));
  if (speck > 0.82) c = hex(0x2c2c32);
  else if (speck < 0.1) c = hex(0xe8d8d0);
  return c;
};

/* --------------------------------------------------------------------- sports */

const tennis: Dir3 = (x, y, z) => {
  const felt = 0.92 + (noise3(x * 70, y * 70, z * 70) - 0.5) * 0.14;
  const base: RGB = [0.78 * felt, 0.92 * felt, 0.16 * felt];
  const curve = 0.55 * Math.sin(2 * lon(x, z));
  const seam = Math.min(Math.abs(y - curve), Math.abs(y + curve));
  return mix(base, WHITE, 1 - smooth(0.05, 0.09, seam));
};

const golf: Dir3 = (x, y, z) => {
  const a = (lon(x, z) + Math.PI) / (Math.PI * 2);
  const b = (Math.asin(y) + Math.PI / 2) / Math.PI;
  const gx = a * 26;
  const gy = b * 13;
  // Dimples in staggered rows.
  const row = Math.floor(gy);
  const cx = Math.floor(gx + (row % 2) * 0.5) + 0.5 - (row % 2) * 0.5;
  const d = Math.hypot(gx - (cx + (row % 2) * 0.5), gy - (row + 0.5));
  const dimple = 1 - smooth(0.28, 0.4, d);
  return mix(hex(0xf7f7f2), hex(0xc4c6c8), dimple * 0.85);
};

const volley: Dir3 = (x, y, z) => {
  const a = (lon(x, z) + Math.PI) / (Math.PI / 3);
  const panel = Math.floor(a) % 3;
  const colors = [hex(0xf6f4ef), hex(0x2f6fdd), hex(0xffd23f)];
  const edge = Math.abs(a - Math.round(a));
  // Curved panels: the boundaries lean with the latitude.
  const warped = Math.abs((a + y * 1.1) % 1) < 0.04 ? 1 : 0;
  let c = colors[(panel + (y > 0.2 ? 1 : 0)) % 3];
  if (edge < 0.03 || warped) c = hex(0x394150);
  return c;
};

const eight: Dir3 = (x, y, z) => {
  let c = hex(0x101015);
  const angle = Math.acos(Math.max(-1, Math.min(1, z)));
  if (angle < 0.62) {
    c = mix(c, WHITE, smooth(0.62, 0.58, angle));
    // The "8": two rings one over the other.
    const ring = (cy: number) => {
      const d = Math.hypot(x, y - cy);
      return Math.abs(d - 0.12) < 0.04 ? 1 : 0;
    };
    if (ring(0.13) || ring(-0.13)) c = BLACK;
  }
  return c;
};

const baseball: Dir3 = (x, y, z) => {
  const leather = 0.95 + (noise3(x * 50, y * 50, z * 50) - 0.5) * 0.06;
  const base: RGB = [leather, leather, leather * 0.96];
  const curve = 0.5 * Math.sin(2 * lon(x, z) + 0.6);
  const seam = Math.min(Math.abs(y - curve), Math.abs(y + curve));
  // Red stitches: small bars across the seam.
  if (seam < 0.1) {
    const along = Math.sin(lon(x, z) * 36);
    if (along > 0.2 && seam < 0.085) return hex(0xc4262e);
    if (seam < 0.03) return hex(0xc4262e);
  }
  return base;
};

const pingpong: Dir3 = (x, y, z) => {
  const n = (noise3(x * 30, y * 30, z * 30) - 0.5) * 0.05;
  return [0.98 + n, 0.97 + n, 0.92 + n];
};

/* ---------------------------------------------------------------------- treats */

const orange: Dir3 = (x, y, z) => {
  const pores = noise3(x * 55, y * 55, z * 55);
  let c = mix(hex(0xff9d1c), hex(0xf47c0b), pores);
  if (pores > 0.8) c = mix(c, hex(0xffb74a), 0.8);
  if (y > 0.93) c = mix(c, hex(0x4a8a2a), smooth(0.93, 0.96, y));
  return c;
};

const tomato: Dir3 = (x, y, z) => {
  let c = mix(hex(0xe5281f), hex(0xc41a14), fbm(x * 3, y * 3, z * 3));
  if (y > 0.82) {
    const star = 0.5 + 0.5 * Math.cos(5 * lon(x, z));
    if (Math.hypot(x, z) < 0.12 + 0.28 * star * (y - 0.82) * 4) c = hex(0x3f8a2d);
  }
  return c;
};

const cookie: Dir3 = (x, y, z) => {
  let c = mix(hex(0xe0a95c), hex(0xb97c3a), fbm(x * 6, y * 6, z * 6));
  // Chocolate chips: dark blobs on a coarse grid.
  const g = 5;
  const gx = Math.floor(x * g);
  const gy = Math.floor(y * g);
  const gz = Math.floor(z * g);
  if (hash3(gx, gy, gz) < 0.4) {
    const d = Math.hypot(x * g - (gx + 0.5), y * g - (gy + 0.5), z * g - (gz + 0.5));
    if (d < 0.32) c = mix(c, hex(0x3b2216), 0.95);
  }
  // Golden, slightly burnt edge toward the sides.
  return mix(c, hex(0x8a5a26), smooth(0.7, 1, Math.abs(y)) * 0.4);
};

const strawberry: Dir3 = (x, y, z) => {
  let c = mix(hex(0xff9fbd), hex(0xff7aa6), fbm(x * 4, y * 4, z * 4));
  if (hash3(Math.floor(x * 18), Math.floor(y * 18), Math.floor(z * 18)) < 0.1) c = hex(0xd6406b);
  // A creamy drip along the lower half.
  const drip = y < -0.2 + 0.18 * Math.sin(lon(x, z) * 6);
  if (drip) c = mix(c, hex(0xfff0e6), 0.65);
  return c;
};

const candy: Dir3 = (x, y, z) => {
  const s = Math.sin(lon(x, z) * 3 + y * 9);
  return s > 0 ? hex(0xe8243c) : hex(0xfaf6f0);
};

const blueberry: Dir3 = (x, y, z) => {
  let c = mix(hex(0x2f3f86), hex(0x1f2a64), fbm(x * 4, y * 4, z * 4));
  // A dusty bloom on the skin.
  c = mix(c, hex(0x8a98d0), 0.25 * noise3(x * 18, y * 18, z * 18));
  // The star-shaped crown on top.
  if (y > 0.78) {
    const star = 0.5 + 0.5 * Math.cos(5 * lon(x, z));
    if (Math.hypot(x, z) < 0.1 + 0.14 * star) c = hex(0x141b3f);
  }
  return c;
};

/* ---------------------------------------------------------------------- cosmos */

const sun: Dir3 = (x, y, z) => {
  const g = fbm(x * 5, y * 5, z * 5);
  return mix(hex(0xff9f1a), hex(0xfff0a0), smooth(0.35, 0.7, g));
};

const mars: Dir3 = (x, y, z) => {
  const g = fbm(x * 3 + 9, y * 3, z * 3);
  let c = mix(hex(0xc9552b), hex(0x8a3418), smooth(0.35, 0.65, g));
  c = mix(c, hex(0xe29a6a), 0.35 * noise3(x * 12, y * 12, z * 12));
  return mix(c, hex(0xf4efe8), smooth(0.9, 0.96, Math.abs(y)));
};

const jupiter: Dir3 = (x, y, z) => {
  const band = Math.sin(y * 13 + fbm(x * 2, y * 4, z * 2) * 2.5);
  let c = band > 0.3 ? hex(0xe6c9a0) : band > -0.3 ? hex(0xb88a5e) : hex(0xf1e4d0);
  c = mix(c, hex(0x8a5a38), 0.35 * noise3(x * 10, y * 22, z * 10));
  // The great red spot.
  const dx = x - 0.5;
  const dy = y + 0.3;
  const dz = z - 0.7;
  if (Math.hypot(dx * 1.2, dy * 2.2, dz) < 0.2) c = hex(0xc0452a);
  return c;
};

const lava: Dir3 = (x, y, z) => {
  const n = fbm(x * 4 + 2, y * 4, z * 4);
  const crack = Math.abs(n - 0.5);
  const glow = 1 - smooth(0.0, 0.07, crack);
  const crust = mix(hex(0x1e1210), hex(0x3a2018), noise3(x * 14, y * 14, z * 14));
  return mix(crust, hex(0xffa11c), glow);
};

/* ------------------------------------------------------------------------- fun */

const snow: Dir3 = (x, y, z) => {
  const n = fbm(x * 6, y * 6, z * 6);
  let c = mix(hex(0xe6eef8), hex(0xffffff), smooth(0.3, 0.7, n));
  if (noise3(x * 60, y * 60, z * 60) > 0.9) c = hex(0xffffff);
  return c;
};

const ladybug: Dir3 = (x, y, z) => {
  let c = hex(0xe0242a);
  // Black head in front (+z), with two small white eyes.
  if (z > 0.72) {
    c = hex(0x17171c);
    if (Math.hypot(x - 0.3, y - 0.12, z - 0.9) < 0.1 || Math.hypot(x + 0.3, y - 0.12, z - 0.9) < 0.1) c = hex(0xf4f4f4);
    return c;
  }
  if (Math.abs(x) < 0.025) c = hex(0x17171c); // the line down the back
  const spots: [number, number, number][] = [
    [0.5, 0.45, -0.3],
    [-0.5, 0.45, -0.3],
    [0.62, -0.1, -0.2],
    [-0.62, -0.1, -0.2],
    [0.35, 0.25, -0.75],
    [-0.35, 0.25, -0.75],
  ];
  for (const [sx, sy, sz] of spots) {
    const n = Math.hypot(sx, sy, sz);
    if (Math.hypot(x - sx / n, y - sy / n, z - sz / n) < 0.19) c = hex(0x17171c);
  }
  return c;
};

const checker: Dir3 = (x, y, z) => {
  const a = Math.floor(((lon(x, z) + Math.PI) / (Math.PI * 2)) * 12);
  const b = Math.floor(((Math.asin(y) + Math.PI / 2) / Math.PI) * 8);
  return (a + b) % 2 === 0 ? hex(0xf4f2ee) : hex(0x1d1d24);
};

const bauble: Dir3 = (x, y, z) => {
  let c = mix(hex(0xd1202e), hex(0xa11521), fbm(x * 3, y * 3, z * 3));
  // A gold band and a gold cap with its little loop.
  if (Math.abs(y + 0.05) < 0.07) c = hex(0xf2c14b);
  const diamond = ((Math.floor((lon(x, z) + Math.PI) * 4) + Math.floor((y + 1) * 6)) % 2 === 0 ? 1 : 0) * smooth(0.25, 0.4, Math.abs(y + 0.45));
  if (diamond && y < -0.3 && y > -0.75) c = mix(c, hex(0xf2c14b), 0.5);
  if (y > 0.86) c = hex(0xe5b53a);
  return c;
};

export const MORE_PATTERNS: Record<string, Dir3> = {
  pearl,
  marble,
  wood,
  granite,
  tennis,
  golf,
  volley,
  eight,
  baseball,
  pingpong,
  orange,
  tomato,
  cookie,
  strawberry,
  candy,
  blueberry,
  sun,
  mars,
  jupiter,
  lava,
  snow,
  ladybug,
  checker,
  bauble,
};
