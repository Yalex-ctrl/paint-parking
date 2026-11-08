import * as THREE from 'three';


import { encodePng, pngDataUri } from '../game/png';
import { isPaintEffect, paintStyle, paintTint, type PaintEffect } from './paintEffects';
import { PAINT_TEXELS } from './paintTexels';
import { SKIN_PATTERNS, hash3, type RGB } from './skinPatterns';
import { SKIN_SPECS } from './skinSpecs';

/**
 * Small pictures of the shop items for the cards: a still render of the ball with its real pattern, and a
 * painted mini-grid for each paint effect. They are drawn once, pixel by pixel in plain code (no GL context,
 * no image file), turned into a PNG data URI, and cached for the rest of the session.
 */
export const THUMB_SIZE = 72;

const LIGHT = (() => {
  const l = [-0.5, 0.7, 0.55];
  const n = Math.hypot(l[0], l[1], l[2]);
  return [l[0] / n, l[1] / n, l[2] / n] as const;
})();

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const toRgb = (css: string): RGB => {
  const c = new THREE.Color(css);
  const out = { r: 0, g: 0, b: 0 };
  c.getRGB(out, THREE.SRGBColorSpace);
  return [out.r, out.g, out.b];
};

/** Turns the sphere a little so the pattern shows its interesting side (an eye looks at you, a pentagon is in view). */
function toPattern(x: number, y: number, z: number): [number, number, number] {
  const a = -0.28; // tilt around x
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const y2 = y * ca - z * sa;
  const z2 = y * sa + z * ca;
  const b = 0.35; // turn around y
  const cb = Math.cos(b);
  const sb = Math.sin(b);
  return [x * cb + z2 * sb, y2, -x * sb + z2 * cb];
}

type Shade = { base: RGB; alpha: number };

/** Colour of the ball at a point of its visible surface, before lighting. */
function surface(id: string, nx: number, ny: number, nz: number): Shade {
  const spec = SKIN_SPECS[id] ?? SKIN_SPECS.gold;
  const pattern = SKIN_PATTERNS[id];
  if (pattern) {
    const [x, y, z] = toPattern(nx, ny, nz);
    return { base: pattern(x, y, z), alpha: spec.opacity ?? 1 };
  }
  if (spec.shape === 'disco') {
    // A mirror ball: facets on a coarse grid of the sphere, each with its own pastel tint and reflection.
    const lon = Math.atan2(nz, nx);
    const lat = Math.asin(ny);
    const gx = Math.floor((lon + Math.PI) / (Math.PI / 5));
    const gy = Math.floor((lat + Math.PI / 2) / (Math.PI / 7));
    const h = hash3(gx, gy, 3);
    const tint = new THREE.Color().setHSL(h, 0.45, 0.78);
    const shine = 0.55 + 0.45 * hash3(gy, gx, 9);
    const fx = ((lon + Math.PI) / (Math.PI / 5)) % 1;
    const fy = ((lat + Math.PI / 2) / (Math.PI / 7)) % 1;
    const edge = Math.min(fx, 1 - fx, fy, 1 - fy) < 0.07 ? 0.55 : 1;
    return { base: [tint.r * shine * edge, tint.g * shine * edge, tint.b * shine * edge], alpha: 1 };
  }
  if (spec.shape === 'crystal') {
    const lon = Math.atan2(nz, nx);
    const lat = Math.asin(ny);
    const gx = Math.floor((lon + Math.PI) / (Math.PI / 3));
    const gy = Math.floor((lat + Math.PI / 2) / (Math.PI / 4));
    const shade = 0.6 + 0.4 * hash3(gx, gy, 5);
    const fx = ((lon + Math.PI) / (Math.PI / 3)) % 1;
    const fy = ((lat + Math.PI / 2) / (Math.PI / 4)) % 1;
    const edge = Math.min(fx, 1 - fx, fy, 1 - fy) < 0.06 ? 1.35 : 1;
    const [r, g, b] = toRgb(spec.color);
    return { base: [r * shade * edge, g * shade * edge, Math.min(1, b * (0.7 + shade * 0.4) * edge)], alpha: spec.opacity ?? 1 };
  }
  // Gold, silver: a metal, brighter toward the top and darker at the bottom, like it reflects a sky and a floor.
  const [r, g, b] = toRgb(spec.color);
  const sky = 0.78 + 0.32 * ny;
  return { base: [r * sky, g * sky, b * sky], alpha: 1 };
}

function renderBall(id: string): Uint8Array {
  const S = THUMB_SIZE;
  const spec = SKIN_SPECS[id] ?? SKIN_SPECS.gold;
  const out = new Uint8Array(S * S * 4);
  const shininess = 4 + (1 - spec.roughness) * 90;
  const gloss = 0.12 + spec.metalness * 0.35 + (1 - spec.roughness) * 0.35;
  for (let py = 0; py < S; py++) {
    for (let px = 0; px < S; px++) {
      const x = ((px + 0.5) / S) * 2 - 1;
      const y = 1 - ((py + 0.5) / S) * 2;
      const r2 = x * x + y * y;
      const o = (py * S + px) * 4;
      if (r2 >= 1.02) continue;
      const nz = Math.sqrt(Math.max(0, 1 - r2));
      const { base, alpha } = surface(id, x, y, nz);
      const diffuse = clamp01(x * LIGHT[0] + y * LIGHT[1] + nz * LIGHT[2]);
      const light = 0.45 + 0.65 * diffuse;
      // Blinn-Phong highlight (the view direction is +z).
      const hx = LIGHT[0];
      const hy = LIGHT[1];
      const hz = LIGHT[2] + 1;
      const hl = Math.hypot(hx, hy, hz);
      const spc = Math.pow(clamp01((x * hx + y * hy + nz * hz) / hl), shininess) * gloss;
      // A rim of lighter colour makes transparent balls read as glass.
      const rim = alpha < 1 ? Math.pow(1 - nz, 2) * 0.5 : 0;
      const edge = clamp01((1.0 - Math.sqrt(r2)) * S * 0.5);
      const c = base.map((v) => clamp01(v * light + spc + rim));
      out[o] = Math.round(c[0] * 255);
      out[o + 1] = Math.round(c[1] * 255);
      out[o + 2] = Math.round(c[2] * 255);
      out[o + 3] = Math.round(clamp01(alpha + rim) * edge * 255);
    }
  }
  return out;
}

const GRID = 4;
/** Paints that take the colour of the level are shown on a colour of their own, so the cards do not look alike. */
const PAINT_BASE: Record<string, string> = {
  classic: '#4f8cff',
  pastel: '#ff7fb8',
  glitter: '#8a5cff',
  neon: '#19ffb0',
  metallic: '#8aa0d8',
  rainbow: '#4f8cff',
  stripes: '#ff5468',
  dots: '#2ec4b6',
  checkerPaint: '#9b5de5',
};

/** The paint on a little 4x4 floor, painted in a snake (so the rainbow's change of colour shows). */
function renderPaint(effect: PaintEffect): Uint8Array {
  const S = THUMB_SIZE;
  const st = paintStyle(effect);
  const texel = st.texture ? PAINT_TEXELS[st.texture] : undefined;
  const base = new THREE.Color(PAINT_BASE[effect] ?? '#4f8cff');
  const out = new Uint8Array(S * S * 4);
  const pad = 4;
  const gap = 3;
  const tile = (S - pad * 2 - gap * (GRID - 1)) / GRID;
  const tint = new THREE.Color();
  const rgb = { r: 0, g: 0, b: 0 };
  // Dark floor with rounded corners.
  for (let py = 0; py < S; py++) {
    for (let px = 0; px < S; px++) {
      const o = (py * S + px) * 4;
      const dx = Math.max(Math.abs(px + 0.5 - S / 2) - (S / 2 - 8), 0);
      const dy = Math.max(Math.abs(py + 0.5 - S / 2) - (S / 2 - 8), 0);
      if (Math.hypot(dx, dy) > 8) continue;
      out[o] = 0x26;
      out[o + 1] = 0x1d;
      out[o + 2] = 0x30;
      out[o + 3] = 255;
    }
  }
  let order = 0;
  for (let r = 0; r < GRID; r++) {
    for (let k = 0; k < GRID; k++) {
      const col = r % 2 === 0 ? k : GRID - 1 - k;
      paintTint(tint, effect, base, { order: order++, noise: 0, coat: 1, double: false, pos: { u: col / (GRID - 1), v: r / (GRID - 1) } });
      tint.getRGB(rgb, THREE.SRGBColorSpace);
      const x0 = pad + col * (tile + gap);
      const y0 = pad + r * (tile + gap);
      for (let py = Math.floor(y0 - 3); py < Math.ceil(y0 + tile + 3); py++) {
        for (let px = Math.floor(x0 - 3); px < Math.ceil(x0 + tile + 3); px++) {
          if (px < 0 || py < 0 || px >= S || py >= S) continue;
          const o = (py * S + px) * 4;
          const inside = px >= x0 && px < x0 + tile && py >= y0 && py < y0 + tile;
          if (st.unlit && !inside) {
            // Neon: the light spills a few pixels around the tile.
            const d = Math.hypot(Math.max(x0 - px - 0.5, 0, px + 0.5 - (x0 + tile)), Math.max(y0 - py - 0.5, 0, py + 0.5 - (y0 + tile)));
            const g = clamp01(1 - d / 3) * 0.55;
            if (g > 0) {
              out[o] = Math.round(out[o] + (rgb.r * 255 - out[o]) * g);
              out[o + 1] = Math.round(out[o + 1] + (rgb.g * 255 - out[o + 1]) * g);
              out[o + 2] = Math.round(out[o + 2] + (rgb.b * 255 - out[o + 2]) * g);
            }
            continue;
          }
          if (!inside) continue;
          const u = (px - x0) / tile;
          const v = (py - y0) / tile;
          const t: RGB = texel ? texel(u, v) : [1, 1, 1];
          let shade = 0.94 + 0.06 * (1 - v); // a hint of light from above
          let glint = 0;
          if (st.metalness > 0.5 && !texel) {
            // A brushed-metal sweep from bright to dark with a sharp highlight.
            shade = 0.62 + 0.55 * (1 - (u + v) / 2);
            glint = Math.pow(clamp01(1 - Math.abs(u + v - 0.7) * 4), 2) * 0.55;
          } else if (st.unlit) shade = 1.08;
          out[o] = Math.round(clamp01(rgb.r * t[0] * shade + glint) * 255);
          out[o + 1] = Math.round(clamp01(rgb.g * t[1] * shade + glint) * 255);
          out[o + 2] = Math.round(clamp01(rgb.b * t[2] * shade + glint) * 255);
          out[o + 3] = 255;
        }
      }
    }
  }
  return out;
}

const cache = new Map<string, string>();

/** A data-URI picture of a shop item (ball or paint), drawn on first use. */
export function itemThumbnail(kind: 'ball' | 'paint', id: string): string {
  const key = `${kind}:${id}`;
  let uri = cache.get(key);
  if (!uri) {
    const pixels = kind === 'ball' ? renderBall(id) : renderPaint(isPaintEffect(id) ? id : 'classic');
    uri = pngDataUri(THUMB_SIZE, THUMB_SIZE, pixels);
    cache.set(key, uri);
  }
  return uri;
}

/** Raw pixels, for tests and for checking the look. */
export const thumbnailPixels = (kind: 'ball' | 'paint', id: string): Uint8Array =>
  kind === 'ball' ? renderBall(id) : renderPaint(isPaintEffect(id) ? id : 'classic');

/** Bump when a thumbnail changes its look: the pictures saved on the phone are drawn again. */
export const THUMB_VERSION = 'v4';

/** The PNG file of a thumbnail (what is saved on the phone). */
export const thumbnailPng = (kind: 'ball' | 'paint', id: string): Uint8Array => encodePng(THUMB_SIZE, THUMB_SIZE, thumbnailPixels(kind, id));
