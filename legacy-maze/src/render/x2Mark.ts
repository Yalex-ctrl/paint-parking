import * as THREE from 'three';

/**
 * The big "x2" drawn on a tile that must be crossed twice. There is no canvas to draw text on in React Native, so the glyphs are
 * built from strokes: the distance of each texel to a few line segments says whether it is the white of the letter, its dark outline
 * or nothing, with a soft edge. One texture is baked once and shared by every x2 tile of every level (see Features3D: one instanced
 * mesh, no text object per tile).
 */
const SIZE = 128;

type Pt = [number, number];
type Stroke = Pt[];

/** Points on an arc (angles in degrees, y up in the unit box of the whole mark). */
function arc(cx: number, cy: number, r: number, from: number, to: number, steps = 14): Stroke {
  const out: Stroke = [];
  for (let i = 0; i <= steps; i++) {
    const a = ((from + ((to - from) * i) / steps) * Math.PI) / 180;
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}

/** The "x" (small, low) and the "2" (big), side by side, in a 0..1 box (v up). */
export const X2_STROKES: Stroke[] = [
  // x
  [[0.06, 0.34], [0.34, 0.66]],
  [[0.06, 0.66], [0.34, 0.34]],
  // 2: a round top, the diagonal, the base
  [...arc(0.68, 0.66, 0.2, 165, -25), [0.45, 0.14], [0.93, 0.14]],
];

/** Half the thickness of the white stroke, and the extra of the dark outline (unit box). */
const STROKE = 0.052;
const OUTLINE = 0.034;

function segDist(px: number, py: number, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / len2));
  return Math.hypot(px - (a[0] + dx * t), py - (a[1] + dy * t));
}

/** Distance from a point of the unit box to the strokes of the mark. */
export function distanceToMark(u: number, v: number): number {
  let best = Infinity;
  for (const s of X2_STROKES) for (let i = 0; i + 1 < s.length; i++) best = Math.min(best, segDist(u, v, s[i], s[i + 1]));
  return best;
}

const smooth = (edge: number, x: number, width = 0.012) => Math.max(0, Math.min(1, (edge - x) / width + 0.5));

/** The colour of one texel: white inside the stroke, dark in the outline, transparent outside (all edges soft). */
export function markTexel(u: number, v: number): [number, number, number, number] {
  const d = distanceToMark(u, v);
  const fill = smooth(STROKE, d);
  const all = smooth(STROKE + OUTLINE, d);
  // White over the dark outline.
  const shade = 255 * fill + 26 * (1 - fill);
  return [shade, shade * (fill + (1 - fill) * 0.85), shade * (fill + (1 - fill) * 0.9), 255 * all];
}

let shared: THREE.DataTexture | null = null;

/** The one texture of the mark (baked on first use, then kept). */
export function x2Texture(): THREE.DataTexture {
  if (shared) return shared;
  const data = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      // Row 0 of the texture is the bottom: v goes up.
      const [r, g, b, a] = markTexel((x + 0.5) / SIZE, (y + 0.5) / SIZE);
      const k = (y * SIZE + x) * 4;
      data[k] = r;
      data[k + 1] = g;
      data[k + 2] = b;
      data[k + 3] = a;
    }
  }
  const t = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.needsUpdate = true;
  shared = t;
  return t;
}

/** The size of the mark on its tile (a share of the cell: about 60 % of it), and how its life goes. */
export const MARK_SIZE = 0.66;
const PULSE_SECONDS = 2.6;
const POP_SECONDS = 0.26;

/** Scale of a mark at time `t` seconds, as a share of its size: a slow pulse. */
export const pulseScale = (t: number): number => 1 + 0.07 * Math.sin((t / PULSE_SECONDS) * Math.PI * 2);

/** Scale of a mark `k` (0..1) of the way through its disappearance: a small swell, then gone. */
export const popScale = (k: number): number => (k >= 1 ? 0 : k < 0.3 ? 1 + (k / 0.3) * 0.25 : 1.25 * (1 - (k - 0.3) / 0.7));
export const POP_DURATION = POP_SECONDS;
