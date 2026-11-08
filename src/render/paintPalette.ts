import * as THREE from 'three';

import { paintStyle } from './paintEffects';
import { PAINT_TEXELS } from './paintTexels';

const SAMPLES = 5; // the pattern of a paint is sampled on a 5 x 5 grid
const c = new THREE.Color();
const hsl = { h: 0, s: 0, l: 0 };

const hexOfColor = (col: THREE.Color) => col.getHex(THREE.SRGBColorSpace);

/** Droplets and stains of a paint come in its own colours; the metals keep a metallic tint. */
export function particlePalette(effect: string, baseHex: number): number[] {
  const st = paintStyle(effect);
  const base = new THREE.Color(baseHex);
  const out: number[] = [];
  switch (st.tint) {
    case 'rainbow':
      for (let i = 0; i < 12; i++) out.push(hexOfColor(c.setHSL(i / 12, 0.82, 0.58)));
      return out;
    case 'pastel':
      return [hexOfColor(c.copy(base).lerp(new THREE.Color('#ffffff'), 0.52))];
    case 'neon':
      base.getHSL(hsl);
      return [hexOfColor(c.setHSL(hsl.h, 1, 0.58))];
    case 'fixed': {
      const f = new THREE.Color(st.fixed ?? '#ffffff');
      return [hexOfColor(f), hexOfColor(c.copy(f).offsetHSL(0, 0, 0.08)), hexOfColor(c.copy(f).offsetHSL(0, 0, -0.08))];
    }
    case 'gradient': {
      const colors = st.gradient ?? ['#ffffff'];
      for (let i = 0; i < 8; i++) {
        const k = (i / 7) * (colors.length - 1);
        const j = Math.min(colors.length - 2, Math.floor(k));
        out.push(hexOfColor(colors.length === 1 ? c.set(colors[0]) : c.set(colors[j]).lerp(new THREE.Color(colors[j + 1]), k - j)));
      }
      return out;
    }
    default:
  }
  const texel = st.texture ? PAINT_TEXELS[st.texture] : undefined;
  if (texel) {
    for (let y = 0; y < SAMPLES; y++) {
      for (let x = 0; x < SAMPLES; x++) {
        const [r, g, b] = texel((x + 0.5) / SAMPLES, (y + 0.5) / SAMPLES);
        out.push(hexOfColor(c.setRGB(Math.min(1, r), Math.min(1, g), Math.min(1, b), THREE.SRGBColorSpace)));
      }
    }
    // A pattern in the colour of the level (stripes, dots, glitter) alternates the level colour with white.
    if (st.tint === 'level') return [baseHex, baseHex, hexOfColor(c.copy(base).lerp(new THREE.Color('#ffffff'), 0.6))];
    return out;
  }
  return [baseHex];
}
