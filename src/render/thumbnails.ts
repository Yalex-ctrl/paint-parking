import * as THREE from 'three';

import { encodePng, pngDataUri } from '../core/png';
import { isPaintEffect, paintStyle, paintTint, type PaintEffect } from '../core/render/paintEffects';
import { PAINT_TEXELS } from '../core/render/paintTexels';
import { setThumbnailRenderer, type ThumbnailKind } from '../core/render/useThumbnail';
import type { RGB } from '../core/render/skinHelpers';
import { specOf, type SkinSpec } from './skinSpecs';

/**
 * Small pictures of the shop items for the cards: the vehicle seen from above, with its colours and its marks, and a painted mini-grid
 * for each paint. They are drawn once, pixel by pixel in plain code (no GL context, no image file), turned into a PNG data URI, and
 * cached for the rest of the session.
 */
export const THUMB_SIZE = 72;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const rgbOf = (css: string): RGB => {
  const c = new THREE.Color(css);
  const out = { r: 0, g: 0, b: 0 };
  c.getRGB(out, THREE.SRGBColorSpace);
  return [out.r, out.g, out.b];
};

/** Is the point inside a rounded rectangle centred on (cx, cy)? Returns the distance inside it (positive) or a negative number. */
const roundRect = (x: number, y: number, cx: number, cy: number, hw: number, hh: number, r: number): number => {
  const dx = Math.abs(x - cx) - (hw - r);
  const dy = Math.abs(y - cy) - (hh - r);
  return r - Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) - Math.min(Math.max(dx, dy), 0) * 0;
};

/** The vehicle seen from above, nose to the right, a little tilted by the light (brighter toward the top of the picture). */
function renderVehicle(id: string): Uint8Array {
  const S = THUMB_SIZE;
  const spec: SkinSpec = specOf(id);
  const out = new Uint8Array(S * S * 4);
  const body = rgbOf(spec.body);
  const roof = rgbOf(spec.roof);
  const accent = rgbOf(spec.accent);
  const glass: RGB = [0.16, 0.2, 0.3];
  const has = (e: SkinSpec['extras'][number]) => spec.extras.includes(e);
  const metal = spec.finish === 'metal';
  const neon = spec.finish === 'neon';
  const len = has('ladder') || has('tallroof') ? 60 : 56;
  const hw = len / 2;
  const hh = 15;
  const cx = S / 2;
  const cy = S / 2;
  for (let py = 0; py < S; py++) {
    for (let px = 0; px < S; px++) {
      const o = (py * S + px) * 4;
      const x = px + 0.5;
      const y = py + 0.5;
      // The shadow under the vehicle.
      const sh = roundRect(x, y + 3, cx, cy, hw + 1, hh + 1, 7);
      let r = 0;
      let g = 0;
      let b = 0;
      let a = sh > 0 ? clamp01(sh / 3) * 0.3 : 0;
      if (a > 0) {
        r = 0.08;
        g = 0.06;
        b = 0.15;
      }
      // Wheels poke out at the sides.
      for (const wx of [-0.62, 0.55]) {
        for (const side of [-1, 1]) {
          const d = roundRect(x, y, cx + wx * hw, cy + side * (hh + 0.5), 5, 2.5, 1.5);
          if (d > 0) {
            r = 0.08;
            g = 0.08;
            b = 0.1;
            a = 1;
          }
        }
      }
      const d = roundRect(x, y, cx, cy, hw, hh, 8);
      if (d > 0) {
        const t = (y - (cy - hh)) / (2 * hh);
        let shade = 1.08 - 0.28 * t;
        let c = body;
        // The cabin: glass with a roof on top, toward the rear.
        const cabinD = roundRect(x, y, cx - hw * 0.12, cy, hw * 0.4, hh * 0.78, 4);
        if (cabinD > 0) {
          const roofD = roundRect(x, y, cx - hw * 0.16, cy, hw * 0.28, hh * 0.64, 3);
          c = roofD > 0 ? roof : glass;
        }
        // Marks.
        const u = (x - (cx - hw)) / (2 * hw);
        const v = (y - (cy - hh)) / (2 * hh);
        if (has('stripes') && (Math.abs(v - 0.36) < 0.07 || Math.abs(v - 0.64) < 0.07) && cabinD <= 0) c = accent;
        if (has('bands') && (v > 0.84 || v < 0.16)) c = accent;
        if (has('zebra') && Math.floor(u * 11) % 2 === 0 && cabinD <= 0) c = accent;
        if (has('camo') && Math.sin(u * 17 + v * 5) * Math.cos(v * 13 - u * 3) > 0.35 && cabinD <= 0) c = accent;
        if (has('spots') && Math.hypot(((u * 7) % 1) - 0.5, ((v * 5 + u * 2) % 1) - 0.5) < 0.2 && cabinD <= 0) c = accent;
        if (has('dots') && Math.hypot(((u * 5) % 1) - 0.5, ((v * 3.3) % 1) - 0.5) < 0.2 && cabinD <= 0) c = accent;
        if (has('checker') && (v < 0.2 || v > 0.8) && (Math.floor(u * 14) + (v > 0.5 ? 1 : 0)) % 2 === 0) c = accent;
        if (has('flames') && u > 0.55 && ((v > 0.7 && v < 0.7 + (u - 0.55) * 0.8) || (v < 0.3 && v > 0.3 - (u - 0.55) * 0.8))) c = accent;
        if (has('stars') && Math.hypot(((u * 9) % 1) - 0.5, ((v * 6) % 1) - 0.5) < 0.1 && cabinD <= 0) c = accent;
        if (has('cross') && cabinD <= 0 && ((Math.abs(u - 0.25) < 0.05 && Math.abs(v - 0.5) < 0.2) || (Math.abs(u - 0.25) < 0.14 && Math.abs(v - 0.5) < 0.06))) c = accent;
        if (has('lightbar') && Math.abs(u - 0.4) < 0.04 && Math.abs(v - 0.5) < 0.2) c = v < 0.5 ? [0.9, 0.2, 0.2] : [0.2, 0.4, 0.9];
        if (has('sign') && Math.abs(u - 0.4) < 0.05 && Math.abs(v - 0.5) < 0.14) c = [1, 0.97, 0.76];
        if (has('cone') && Math.hypot(u - 0.4, (v - 0.5) * 0.8) < 0.07) c = [1, 0.56, 0.72];
        if (has('spoiler') && u < 0.07) c = accent;
        if (has('eyes') && u > 0.62 && u < 0.7 && (Math.abs(v - 0.34) < 0.06 || Math.abs(v - 0.66) < 0.06)) c = [1, 1, 1];
        // The lights at the front and at the back.
        if (u > 0.94 && (Math.abs(v - 0.2) < 0.1 || Math.abs(v - 0.8) < 0.1)) c = [1, 0.95, 0.65];
        if (u < 0.06 && (Math.abs(v - 0.2) < 0.1 || Math.abs(v - 0.8) < 0.1)) c = [0.7, 0.1, 0.12];
        if (metal) shade *= 1 + 0.35 * Math.pow(clamp01(1 - Math.abs(u + v * 0.6 - 0.6) * 4), 2);
        if (neon) shade = 1.12;
        const edge = clamp01(d / 1.5);
        r = clamp01(c[0] * shade);
        g = clamp01(c[1] * shade);
        b = clamp01(c[2] * shade);
        a = edge;
      }
      out[o] = Math.round(r * 255);
      out[o + 1] = Math.round(g * 255);
      out[o + 2] = Math.round(b * 255);
      out[o + 3] = Math.round(a * 255);
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

/** The paint on a little 4x4 piece of road, laid in a snake (so the rainbow's change of colour shows). */
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
  for (let py = 0; py < S; py++) {
    for (let px = 0; px < S; px++) {
      const o = (py * S + px) * 4;
      const dx = Math.max(Math.abs(px + 0.5 - S / 2) - (S / 2 - 8), 0);
      const dy = Math.max(Math.abs(py + 0.5 - S / 2) - (S / 2 - 8), 0);
      if (Math.hypot(dx, dy) > 8) continue;
      out[o] = 0x3d;
      out[o + 1] = 0x3a;
      out[o + 2] = 0x4a;
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
            const d = Math.hypot(Math.max(x0 - px - 0.5, 0, px + 0.5 - (x0 + tile)), Math.max(y0 - py - 0.5, 0, py + 0.5 - (y0 + tile)));
            const gl = clamp01(1 - d / 3) * 0.55;
            if (gl > 0) {
              out[o] = Math.round(out[o] + (rgb.r * 255 - out[o]) * gl);
              out[o + 1] = Math.round(out[o + 1] + (rgb.g * 255 - out[o + 1]) * gl);
              out[o + 2] = Math.round(out[o + 2] + (rgb.b * 255 - out[o + 2]) * gl);
            }
            continue;
          }
          if (!inside) continue;
          const u = (px - x0) / tile;
          const v = (py - y0) / tile;
          const t: RGB = texel ? texel(u, v) : [1, 1, 1];
          let shade = 0.94 + 0.06 * (1 - v);
          let glint = 0;
          if (st.metalness > 0.5 && !texel) {
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

/** Raw pixels, for tests and for checking the look. */
export const thumbnailPixels = (kind: ThumbnailKind, id: string): Uint8Array => (kind === 'ball' ? renderVehicle(id) : renderPaint(isPaintEffect(id) ? id : 'classic'));

/** A data-URI picture of a shop item (vehicle or paint), drawn on first use. */
export function itemThumbnail(kind: ThumbnailKind, id: string): string {
  const key = `${kind}:${id}`;
  let uri = cache.get(key);
  if (!uri) {
    uri = pngDataUri(THUMB_SIZE, THUMB_SIZE, thumbnailPixels(kind, id));
    cache.set(key, uri);
  }
  return uri;
}

/** Bump when a thumbnail changes its look: the pictures saved on the phone are drawn again. */
export const THUMB_VERSION = 'pp1';

export const thumbnailPng = (kind: ThumbnailKind, id: string): Uint8Array => encodePng(THUMB_SIZE, THUMB_SIZE, thumbnailPixels(kind, id));

setThumbnailRenderer({ version: THUMB_VERSION, png: thumbnailPng, uri: itemThumbnail });
