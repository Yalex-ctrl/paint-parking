import * as THREE from 'three';

import { PAINT_TEXELS } from './paintTexels';
import { PAINT_STYLES, type PaintStyle } from './paintStyles';

/** Id of a paint of the shop (see game/shopItems.ts); the style of each one is in paintStyles.ts. */
export type PaintEffect = string;

export const isPaintEffect = (id: string): boolean => id in PAINT_STYLES;
export const paintStyle = (id: string): PaintStyle => PAINT_STYLES[id] ?? PAINT_STYLES.classic;

const WHITE = new THREE.Color('#ffffff');
/** Painted tiles are never darker than this (lightness), whatever the colour of the level. */
export const MIN_PAINT_LIGHTNESS = 0.5;
const hsl = { h: 0, s: 0, l: 0 };
const tmpB = new THREE.Color();

/** What is known about a tile when it is painted. */
export type TintInput = {
  /** How many tiles had been painted before this one (the rainbow changes colour along the path). */
  order: number;
  /** Tiny per-tile variation in [-0.5, 0.5], so a painted area is not flat. */
  noise: number;
  /** A double tile: 1 for its first coat, 2 for its second. */
  coat: number;
  double: boolean;
  /** Where the tile is on the board, 0..1 across and down (for the gradients). */
  pos?: { u: number; v: number };
};

/** A colour taken from a list of colours spread over 0..1. */
function samplePalette(out: THREE.Color, colors: string[], t: number): THREE.Color {
  const k = Math.min(Math.max(t, 0), 1) * (colors.length - 1);
  const i = Math.min(colors.length - 2, Math.floor(k));
  return out.set(colors[i]).lerp(tmpB.set(colors[i + 1]), k - i);
}

/**
 * The colour of one painted tile for a paint. `base` is the level colour. Pattern paints return white (the pattern brings the
 * colours) or the level colour (stripes, dots), and metals a fixed colour.
 */
export function paintTint(out: THREE.Color, effect: PaintEffect, base: THREE.Color, t: TintInput): THREE.Color {
  const st = paintStyle(effect);
  let varies = true;
  switch (st.tint) {
    case 'rainbow':
      out.setHSL((t.order * 0.04) % 1, 0.82, t.double ? (t.coat >= 2 ? 0.4 : 0.7) : 0.58 + t.noise * 0.06);
      return out;
    case 'pastel':
      out.copy(base).lerp(WHITE, 0.52);
      break;
    case 'neon':
      out.copy(base).getHSL(hsl);
      out.setHSL(hsl.h, 1, 0.58);
      break;
    case 'fixed':
      out.set(st.fixed ?? '#ffffff');
      break;
    case 'white':
      out.copy(WHITE);
      varies = false;
      break;
    case 'gradient': {
      const pos = t.pos ?? { u: 0.5, v: (t.order % 20) / 20 };
      samplePalette(out, st.gradient ?? ['#ffffff'], pos.v * 0.78 + pos.u * 0.22 + t.noise * 0.05);
      break;
    }
    default:
      out.copy(base);
      // A dark level colour must still stand out from the dark floor under it.
      out.getHSL(hsl);
      if (hsl.l < MIN_PAINT_LIGHTNESS) out.setHSL(hsl.h, hsl.s, MIN_PAINT_LIGHTNESS);
  }
  if (t.double) {
    if (t.coat >= 2) out.multiplyScalar(0.6);
    else out.lerp(WHITE, 0.55);
  } else if (varies) {
    out.offsetHSL(0, 0, t.noise * 0.06);
  }
  return out;
}

/* ---------------------------------------------------------------------------- textures */

const TILE_TEXELS = 64;
const textures = new Map<string, THREE.DataTexture>();

/** The pattern of a paint, baked into a small tileable texture (null for the paints that are one flat colour). */
export function paintTexture(effect: PaintEffect): THREE.DataTexture | null {
  const key = paintStyle(effect).texture;
  const fn = key ? PAINT_TEXELS[key] : undefined;
  if (!key || !fn) return null;
  const hit = textures.get(key);
  if (hit) return hit;
  const data = new Uint8Array(TILE_TEXELS * TILE_TEXELS * 4);
  for (let y = 0; y < TILE_TEXELS; y++) {
    for (let x = 0; x < TILE_TEXELS; x++) {
      const [r, g, b] = fn((x + 0.5) / TILE_TEXELS, (y + 0.5) / TILE_TEXELS);
      const i = (y * TILE_TEXELS + x) * 4;
      data[i] = Math.round(Math.min(1, Math.max(0, r)) * 255);
      data[i + 1] = Math.round(Math.min(1, Math.max(0, g)) * 255);
      data[i + 2] = Math.round(Math.min(1, Math.max(0, b)) * 255);
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, TILE_TEXELS, TILE_TEXELS, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  textures.set(key, tex);
  return tex;
}

/** The material shared by every painted tile of a board (and by the shop preview). */
export function createPaintMaterial(effect: PaintEffect, env: THREE.Texture | null): THREE.Material {
  const st = paintStyle(effect);
  const base = paintTexture(effect);
  // Own copy of the texture so a scrolling board never moves another one.
  const map = base ? base.clone() : null;
  if (map) map.needsUpdate = true;
  if (st.unlit) return new THREE.MeshBasicMaterial({ toneMapped: false });
  return new THREE.MeshStandardMaterial({
    roughness: st.roughness,
    metalness: st.metalness,
    envMap: st.env > 0 ? env : null,
    envMapIntensity: st.env,
    map,
    emissive: st.emissive ? new THREE.Color(st.emissive) : new THREE.Color('#000000'),
    emissiveIntensity: st.emissive ? (st.emissiveIntensity ?? 0.3) : 0,
    emissiveMap: st.emissive ? map : null,
  });
}

const shared = new Map<string, THREE.Material>();

/**
 * THE material of a paint: one per paint (and environment), shared by every board, the one being played and the next one alike. A new
 * level never creates a material (the colour of the level is an instance attribute of the tiles, not a property of the material), so
 * nothing is compiled or uploaded when a board is built or shown. It is never disposed while the app runs (a handful at most).
 */
export function sharedPaintMaterial(effect: PaintEffect, env: THREE.Texture | null): THREE.Material {
  const key = `${effect}|${env ? env.uuid : ''}`;
  let m = shared.get(key);
  if (!m) {
    m = createPaintMaterial(effect, env);
    shared.set(key, m);
  }
  return m;
}

/** One clock for every moving paint: slides the pattern or drifts the tint. Cheap, and does nothing for still paints. */
export function animatePaint(material: THREE.Material, effect: PaintEffect, seconds: number) {
  const st = paintStyle(effect);
  if (!st.animated) return;
  const m = material as THREE.MeshStandardMaterial;
  const phase = (seconds * (st.speed ?? 0.05)) % 1;
  if (st.animated === 'hue') {
    m.color.setHSL(phase, 0.45, 0.88);
    return;
  }
  if (!m.map) return;
  if (st.animated === 'scroll-y') m.map.offset.y = phase;
  else m.map.offset.x = phase;
}

export const PAINT_ANIMATED = Object.keys(PAINT_STYLES).filter((id) => PAINT_STYLES[id].animated);
