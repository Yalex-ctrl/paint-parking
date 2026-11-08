import * as THREE from 'three';

/**
 * Small pictures drawn in code, pixel by pixel (the GL context of the phone has no 2D canvas): the digit on a barrier and the angry
 * face above a driver who has just hit something. Made once and shared.
 */
const FONT: Record<string, string[]> = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
};

const SIZE = 48;
const digits = new Map<number, THREE.DataTexture>();

function make(data: Uint8Array, size: number): THREE.DataTexture {
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/** A round dark badge with a white digit (the counter of a barrier). */
export function digitTexture(n: number): THREE.DataTexture {
  const value = Math.max(0, Math.min(99, Math.round(n)));
  const hit = digits.get(value);
  if (hit) return hit;
  const data = new Uint8Array(SIZE * SIZE * 4);
  const cx = SIZE / 2 - 0.5;
  const text = String(value);
  const scale = text.length === 1 ? 5 : 3;
  const w = text.length * 6 * scale - scale;
  const x0 = Math.round((SIZE - w) / 2);
  const y0 = Math.round((SIZE - 7 * scale) / 2);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4;
      const d = Math.hypot(x - cx, y - cx);
      if (d > SIZE / 2 - 1) continue;
      // The picture is stored bottom row first: flip y when reading the font.
      const yy = SIZE - 1 - y;
      let on = false;
      for (let k = 0; k < text.length && !on; k++) {
        const gx = Math.floor((x - x0 - k * 6 * scale) / scale);
        const gy = Math.floor((yy - y0) / scale);
        if (gx >= 0 && gx < 5 && gy >= 0 && gy < 7) on = FONT[text[k]][gy][gx] === '1';
      }
      const rim = d > SIZE / 2 - 4;
      const [r, g, b] = on ? [255, 255, 255] : rim ? [247, 197, 49] : [42, 36, 56];
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  const tex = make(data, SIZE);
  digits.set(value, tex);
  return tex;
}

let emoji: THREE.DataTexture | null = null;

/** The angry face: a yellow disc, slanted red brows, a flat red mouth. */
export function emojiTexture(): THREE.DataTexture {
  if (emoji) return emoji;
  const n = 32;
  const data = new Uint8Array(n * n * 4);
  const c = n / 2 - 0.5;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = (y * n + x) * 4;
      const yy = n - 1 - y; // top row first
      const d = Math.hypot(x - c, yy - c);
      if (d > n / 2 - 1) continue;
      let color: [number, number, number] = d > n / 2 - 3 ? [214, 150, 20] : [255, 205, 50];
      const eye = (cx: number) => Math.hypot(x - cx, yy - 13) < 2.4;
      if (eye(10) || eye(21)) color = [40, 30, 30];
      // Brows slant toward the middle: lower on the inside.
      const browL = Math.abs(yy - (8 + (x - 5) * 0.45)) < 1.3 && x > 5 && x < 14;
      const browR = Math.abs(yy - (8 + (26 - x) * 0.45)) < 1.3 && x > 17 && x < 26;
      if (browL || browR) color = [200, 30, 30];
      if (yy > 21 && yy < 24 && x > 10 && x < 22) color = [150, 30, 30];
      data[i] = color[0];
      data[i + 1] = color[1];
      data[i + 2] = color[2];
      data[i + 3] = 255;
    }
  }
  emoji = make(data, n);
  return emoji;
}
