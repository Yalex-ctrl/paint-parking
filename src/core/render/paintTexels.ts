import { hash3, hex, mix, noise3, smooth, type RGB } from './skinHelpers';

/**
 * What the paints look like, tile by tile: for a point (u, v) of one painted tile, a colour. The same functions
 * are baked into the textures of the 3D tiles and drawn into the shop thumbnails, so both always agree.
 * A paint made of one flat colour has no function here (see paintStyles.ts).
 */
export type Texel = (u: number, v: number) => RGB;

const h2 = (x: number, y: number, s = 0) => hash3(x, y, s);
const fbm2 = (u: number, v: number, f: number, s = 0) => noise3(u * f + s, v * f, s * 0.5) * 0.65 + noise3(u * f * 2.3 + s, v * f * 2.3, 1) * 0.35;
const hsv = (h: number, s: number, v: number): RGB => {
  const i = Math.floor(h * 6) % 6;
  const f = h * 6 - Math.floor(h * 6);
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  return [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i] as RGB;
};

/** Greys that are multiplied with the colour the level gives (or the order the tiles were painted in). */
const grey = (v: number): RGB => [v, v, v];

/* ---- sparkle ---- */
const glitter: Texel = (u, v) => {
  const px = Math.floor(u * 32);
  const py = Math.floor(v * 32);
  const r = h2(px, py, 3);
  if (r > 0.955) return [1, 1, 1];
  if (r < 0.1) return grey(0.78);
  return grey(0.9 + 0.05 * h2(px, py, 9));
};

/* ---- gradients that move ---- */
const aurora: Texel = (u, v) => {
  const w = Math.sin(v * 9 + Math.sin(u * 5) * 1.6) * 0.5 + 0.5;
  const a = hex(0x45f5b0);
  const b = hex(0x38b6ff);
  const c = hex(0xc46bff);
  return w < 0.5 ? mix(a, b, w * 2) : mix(b, c, (w - 0.5) * 2);
};

const holo: Texel = (u, v) => hsv((u * 0.6 + v * 0.9) % 1, 0.45, 1);

/** Prismatic: rainbow diamonds, a facet lighter than the next. */
const prismatic: Texel = (u, v) => {
  const d = Math.abs(((u * 2) % 1) - 0.5) + Math.abs(((v * 2) % 1) - 0.5);
  const facet = (Math.floor(u * 2) + Math.floor(v * 2)) % 2 === 0 ? 1 : 0.82;
  return hsv(((u + v) * 0.5 + d * 0.35) % 1, 0.5, facet);
};

/* ---- textures ---- */
const marblePaint: Texel = (u, v) => {
  const vein = Math.abs(Math.sin((u + fbm2(u, v, 3) * 1.4) * 5 + v * 3));
  const d = smooth(0, 0.4, vein);
  return mix(hex(0x77738a), hex(0xf6f4f8), 0.2 + 0.8 * d);
};

const watercolor: Texel = (u, v) => {
  const n = fbm2(u, v, 3, 5);
  const edge = Math.abs(n - 0.5);
  const hue = fbm2(u, v, 2, 11);
  const wash = hsv(0.5 + hue * 0.5, 0.3 + 0.2 * (1 - edge * 2), 0.98);
  // Soft darker rim where two washes meet, and paper showing through at the border of the tile.
  const rim = 1 - smooth(0.0, 0.05, edge);
  const paper = smooth(0.0, 0.12, Math.min(u, v, 1 - u, 1 - v));
  return mix(hex(0xfdf8ee), mix(wash, hex(0x8fa7d8), rim * 0.35), 0.35 + 0.65 * paper);
};

const chalk: Texel = (u, v) => {
  const strokes = noise3(u * 4, v * 40, 2) * 0.5 + noise3(u * 60, v * 60, 3) * 0.5;
  return mix(hex(0xe8e2d6), hex(0xfffdf6), smooth(0.25, 0.8, strokes));
};

const pointillism: Texel = (u, v) => {
  const n = 7;
  const cx = Math.floor(u * n);
  const cy = Math.floor(v * n);
  let best = 1;
  let color: RGB = hex(0xf8f1de);
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const gx = cx + dx;
      const gy = cy + dy;
      const px = (gx + 0.5 + (h2(gx, gy, 1) - 0.5) * 0.5) / n;
      const py = (gy + 0.5 + (h2(gx, gy, 2) - 0.5) * 0.5) / n;
      const d = Math.hypot(u - px, v - py) * n;
      if (d < best) {
        best = d;
        if (d < 0.38) color = hsv(h2(gx, gy, 3), 0.62, 0.95);
      }
    }
  }
  return color;
};

const mosaic: Texel = (u, v) => {
  const n = 4;
  const gx = Math.floor(u * n);
  const gy = Math.floor(v * n);
  const fx = (u * n) % 1;
  const fy = (v * n) % 1;
  if (Math.min(fx, fy, 1 - fx, 1 - fy) < 0.07) return hex(0xece6d8); // grout
  const c = hsv((0.52 + h2(gx, gy, 4) * 0.25) % 1, 0.55, 0.9 - 0.12 * h2(gx, gy, 5));
  return mix(c, [1, 1, 1], 0.2 * (1 - fy));
};

const stained: Texel = (u, v) => {
  const seeds: [number, number][] = [
    [0.18, 0.2], [0.62, 0.12], [0.88, 0.5], [0.4, 0.55], [0.12, 0.82], [0.7, 0.86], [0.5, 0.3],
  ];
  let d1 = 9;
  let d2 = 9;
  let k = 0;
  seeds.forEach(([sx, sy], i) => {
    const d = Math.hypot(u - sx, v - sy);
    if (d < d1) {
      d2 = d1;
      d1 = d;
      k = i;
    } else if (d < d2) d2 = d;
  });
  if (d2 - d1 < 0.04) return hex(0x2a2430); // the lead
  const glass = hsv((k * 0.17 + 0.02) % 1, 0.7, 0.95);
  return mix(glass, [1, 1, 1], 0.25 * (1 - d1 * 2));
};

const terrazzo: Texel = (u, v) => {
  let c = hex(0xf0e8d8);
  const n = 6;
  const cx = Math.floor(u * n);
  const cy = Math.floor(v * n);
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const gx = cx + dx;
      const gy = cy + dy;
      if (h2(gx, gy, 6) > 0.55) continue;
      const px = (gx + 0.3 + h2(gx, gy, 7) * 0.4) / n;
      const py = (gy + 0.3 + h2(gx, gy, 8) * 0.4) / n;
      const r = (0.1 + h2(gx, gy, 9) * 0.1) / n * 3;
      if (Math.hypot(u - px, v - py) < r * 0.8) c = [hex(0xd9684a), hex(0x4a8fb8), hex(0x8a8f94), hex(0xe0a93a), hex(0x6a9f6a)][Math.floor(h2(gx, gy, 10) * 5)];
    }
  }
  return c;
};

/* ---- patterns ---- */
const stripes: Texel = (u, v) => grey(Math.floor((u + v) * 5) % 2 === 0 ? 1 : 0.8);
const dots: Texel = (u, v) => {
  const x = (u * 3) % 1;
  const y = (v * 3) % 1;
  const row = Math.floor(v * 3);
  const xs = (x + (row % 2) * 0.5) % 1;
  return Math.hypot(xs - 0.5, y - 0.5) < 0.24 ? grey(0.78) : grey(1);
};
const checkerPaint: Texel = (u, v) => grey((Math.floor(u * 4) + Math.floor(v * 4)) % 2 === 0 ? 1 : 0.78);
const zebra: Texel = (u, v) => {
  const s = Math.sin((u * 0.8 + fbm2(u, v, 2.2, 3) * 0.35) * 11 + v * 5);
  return s > 0 ? hex(0x18181c) : hex(0xf6f6f2);
};
const leopard: Texel = (u, v) => {
  let c = mix(hex(0xe5b05a), hex(0xd49a3c), fbm2(u, v, 4));
  const n = 4;
  const cx = Math.floor(u * n);
  const cy = Math.floor(v * n);
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const gx = cx + dx;
      const gy = cy + dy;
      const px = (gx + 0.2 + h2(gx, gy, 12) * 0.6) / n;
      const py = (gy + 0.2 + h2(gx, gy, 13) * 0.6) / n;
      const d = Math.hypot(u - px, v - py) * n;
      if (d > 0.22 && d < 0.38 && h2(gx, gy, 14) > 0.18) c = hex(0x3b2412); // the rosette
      else if (d <= 0.22) c = mix(c, hex(0xb9772a), 0.6);
    }
  }
  return c;
};
const camo: Texel = (u, v) => {
  const n = fbm2(u, v, 3.2, 8);
  const m = fbm2(u, v, 3.2, 21);
  if (n > 0.62) return hex(0x4a5a2a);
  if (m > 0.6) return hex(0x7a5a34);
  if (n < 0.38) return hex(0xa8b37a);
  return hex(0x7c8a4a);
};
const pixel: Texel = (u, v) => {
  const gx = Math.floor(u * 8);
  const gy = Math.floor(v * 8);
  const h = h2(gx, gy, 15);
  const palette = [hex(0xff4d6d), hex(0xffc93c), hex(0x4cc9f0), hex(0x7fe27a), hex(0xc77dff), hex(0xffffff), hex(0xff8a3d)];
  return palette[Math.floor(h * palette.length)];
};

/* ---- specials ---- */
const lavaPaint: Texel = (u, v) => {
  const n = fbm2(u, v, 3.5, 2);
  const glow = 1 - smooth(0.0, 0.09, Math.abs(n - 0.5));
  const crust = mix(hex(0x6a2a1c), hex(0x8a3a24), noise3(u * 18, v * 18, 1));
  return mix(crust, hex(0xffb02e), glow);
};
const ice: Texel = (u, v) => {
  let c = mix(hex(0xbfe6ff), hex(0xe9f7ff), fbm2(u, v, 3, 4));
  const line = Math.abs(Math.sin((u * 2 + v) * 11 + fbm2(u, v, 4, 6) * 3));
  if (line < 0.06) c = [1, 1, 1];
  if (h2(Math.floor(u * 22), Math.floor(v * 22), 16) > 0.97) c = [1, 1, 1];
  return c;
};
const galaxy: Texel = (u, v) => {
  const neb = fbm2(u, v, 2.4, 7);
  let c = mix(hex(0x3a2a9a), hex(0xb04ad8), smooth(0.3, 0.75, neb));
  c = mix(c, hex(0x2aa8e8), 0.35 * fbm2(u, v, 3, 19));
  const sx = Math.floor(u * 20);
  const sy = Math.floor(v * 20);
  if (h2(sx, sy, 17) > 0.93) c = [1, 1, 1];
  else if (h2(sx, sy, 18) > 0.9) c = hex(0xffe9a8);
  return c;
};
const fire: Texel = (u, v) => {
  const wob = Math.sin(u * 10 + v * 3) * 0.08;
  const t = Math.min(1, Math.max(0, v + wob));
  const flame = fbm2(u, v, 4, 3);
  const k = t * 0.75 + flame * 0.35;
  return k < 0.35 ? hex(0xfff0a0) : k < 0.6 ? hex(0xffb02e) : k < 0.85 ? hex(0xff5a1c) : hex(0xc4221a);
};
const toxic: Texel = (u, v) => {
  let c = mix(hex(0x7ee03a), hex(0x2fa82a), fbm2(u, v, 3, 5));
  const n = 5;
  const cx = Math.floor(u * n);
  const cy = Math.floor(v * n);
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const gx = cx + dx;
      const gy = cy + dy;
      if (h2(gx, gy, 20) > 0.6) continue;
      const px = (gx + 0.2 + h2(gx, gy, 21) * 0.6) / n;
      const py = (gy + 0.2 + h2(gx, gy, 22) * 0.6) / n;
      const r = (0.07 + h2(gx, gy, 23) * 0.09);
      const d = Math.hypot(u - px, v - py);
      if (d < r) c = mix(hex(0xd9ff9a), hex(0xb8f060), d / r);
      else if (d < r + 0.015) c = hex(0x1a6a1a);
    }
  }
  return c;
};
const confetti: Texel = (u, v) => {
  let c = hex(0xfbf4e4);
  const n = 7;
  const cx = Math.floor(u * n);
  const cy = Math.floor(v * n);
  const gx = cx;
  const gy = cy;
  if (h2(gx, gy, 24) < 0.55) {
    const px = (gx + 0.5) / n;
    const py = (gy + 0.5) / n;
    const a = h2(gx, gy, 25) * Math.PI;
    const dx = u - px;
    const dy = v - py;
    const along = dx * Math.cos(a) + dy * Math.sin(a);
    const across = -dx * Math.sin(a) + dy * Math.cos(a);
    if (Math.abs(along) < 0.05 && Math.abs(across) < 0.022) c = hsv(h2(gx, gy, 26), 0.75, 0.97);
  }
  return c;
};

export const PAINT_TEXELS: Record<string, Texel> = {
  glitter,
  aurora,
  holo,
  prismatic,
  marblePaint,
  watercolor,
  chalk,
  pointillism,
  mosaic,
  stained,
  terrazzo,
  stripes,
  dots,
  checkerPaint,
  zebra,
  leopard,
  camo,
  pixel,
  lavaPaint,
  ice,
  galaxy,
  fire,
  toxic,
  confetti,
};
