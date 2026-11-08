import * as THREE from 'three';

import { isPresentCell } from '../game/silhouette';
import type { Level } from '../game/types';

/** Empty cells added around the board in the shadow picture, so the blur has room. */
export const SHADOW_MARGIN = 2;
const PX_PER_CELL = 6;

/**
 * A soft drop shadow of the board on the ground: the board's shape (built cells only), blurred, as the alpha of a
 * black picture. The plane that shows it is (cols + 2 margin) x (rows + 2 margin) cells and is slid a little
 * away from the light.
 */
export function boardShadowAlpha(level: Level): { w: number; h: number; alpha: Float32Array } {
  const w = (level.cols + SHADOW_MARGIN * 2) * PX_PER_CELL;
  const h = (level.rows + SHADOW_MARGIN * 2) * PX_PER_CELL;
  let a = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    // Picture row 0 is the south edge (the plane is laid flat, its top pointing to -z).
    const r = Math.floor((h - 1 - y) / PX_PER_CELL) - SHADOW_MARGIN;
    for (let x = 0; x < w; x++) {
      const c = Math.floor(x / PX_PER_CELL) - SHADOW_MARGIN;
      if (isPresentCell(level, r, c)) a[y * w + x] = 1;
    }
  }
  // Two box blurs (horizontal then vertical), radius ~ half a cell: a soft penumbra.
  const R = 3;
  for (let pass = 0; pass < 2; pass++) {
    const tmp = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let s = 0;
        for (let k = -R; k <= R; k++) s += a[y * w + Math.min(w - 1, Math.max(0, x + k))];
        tmp[y * w + x] = s / (2 * R + 1);
      }
    }
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let s = 0;
        for (let k = -R; k <= R; k++) s += tmp[Math.min(h - 1, Math.max(0, y + k)) * w + x];
        out[y * w + x] = s / (2 * R + 1);
      }
    }
    a = out;
  }
  return { w, h, alpha: a };
}

/** The shadow as a texture (black, alpha = shadow strength). */
export function buildBoardShadowTexture(level: Level, strength = 0.5): THREE.DataTexture {
  const { w, h, alpha } = boardShadowAlpha(level);
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) data[i * 4 + 3] = Math.round(alpha[i] * strength * 255);
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}
