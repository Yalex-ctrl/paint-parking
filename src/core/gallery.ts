import { MONETIZATION } from './config/monetization';
import { pngDataUri } from './png';
import { createRng } from './rng';

/**
 * The gallery: 16x16 pixel-art pictures drawn in code. Every 10 levels a new picture starts and each
 * finished level reveals a tenth of its pixels (in a fixed, shuffled order); after 10 levels it is
 * complete and joins the gallery.
 */

export const SIZE = 16;
const PIXELS = SIZE * SIZE;
/** Colours as 0xRRGGBB; `null` = nothing drawn (the picture's background shows). */
type Color = number | null;

class Canvas {
  readonly px: Color[] = new Array(PIXELS).fill(null);

  set(x: number, y: number, c: Color) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x >= 0 && y >= 0 && x < SIZE && y < SIZE) this.px[y * SIZE + x] = c;
  }
  rect(x: number, y: number, w: number, h: number, c: Color) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }
  /** Fills the pixels whose centre satisfies `inside`. */
  private fill(inside: (cx: number, cy: number) => boolean, c: Color) {
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (inside(x + 0.5, y + 0.5)) this.px[y * SIZE + x] = c;
  }
  circle(cx: number, cy: number, r: number, c: Color) {
    this.fill((x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r, c);
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, c: Color, ymax = Infinity) {
    this.fill((x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1 && y <= ymax, c);
  }
  poly(points: [number, number][], c: Color) {
    this.fill((x, y) => {
      let inside = false;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [xi, yi] = points[i];
        const [xj, yj] = points[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
      return inside;
    }, c);
  }
  line(x0: number, y0: number, x1: number, y1: number, c: Color) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2 || 1;
    for (let i = 0; i <= n; i++) this.set(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, c);
  }
}

type Draw = (c: Canvas, v: 0 | 1) => void;
const pick = <T,>(v: 0 | 1, a: T, b: T) => (v === 0 ? a : b);

const BROWN = 0x6b4a2a;
const LEAF = 0x3d9a3a;

const DRAWINGS: { name: string; draw: Draw }[] = [
  {
    name: 'Pomme',
    draw: (c, v) => {
      c.circle(8, 9.2, 5.2, pick(v, 0xd62828, 0x6cc24a));
      c.rect(7, 2, 1, 3, BROWN);
      c.ellipse(10.8, 3.6, 2.3, 1.2, LEAF);
      c.rect(5, 7, 1, 2, pick(v, 0xf08080, 0xb8e08a));
      c.set(8, 4, pick(v, 0x9b1c1c, 0x4a8a30));
    },
  },
  {
    name: 'Cerises',
    draw: (c, v) => {
      c.line(5, 9, 9, 2, 0x3d7a2a);
      c.line(11, 9, 9, 2, 0x3d7a2a);
      c.ellipse(12, 3.4, 2.5, 1.1, 0x4aa63a);
      c.circle(5, 11.5, 3, pick(v, 0xd62828, 0x7a1f5c));
      c.circle(11, 11.5, 3, pick(v, 0xd62828, 0x7a1f5c));
      c.set(4, 10, 0xffffff);
      c.set(10, 10, 0xffffff);
    },
  },
  {
    name: 'Banane',
    draw: (c, v) => {
      // A crescent leaning to the right: a curve from the stem (top right) bulging to the left and back down to the tip.
      const body = pick(v, 0xf7d23e, 0xa6d44a);
      const shade = pick(v, 0xd9a91f, 0x7fae33);
      for (let i = 0; i <= 40; i++) {
        const t = i / 40;
        const x = (1 - t) ** 2 * 13.5 + 2 * (1 - t) * t * 0.5 + t * t * 10.5;
        const y = (1 - t) ** 2 * 2.5 + 2 * (1 - t) * t * 6.5 + t * t * 14;
        const r = 0.9 + 1.7 * Math.sin(Math.PI * t);
        c.circle(x, y, r, body);
      }
      // A darker line along the inside of the curve gives it volume.
      for (let i = 4; i <= 36; i++) {
        const t = i / 40;
        const x = (1 - t) ** 2 * 13.5 + 2 * (1 - t) * t * 0.5 + t * t * 10.5 + 1.3;
        const y = (1 - t) ** 2 * 2.5 + 2 * (1 - t) * t * 6.5 + t * t * 14 - 0.2;
        c.set(x, y, shade);
      }
      c.rect(13, 1, 2, 2, 0x5a4a2a); // the stem
      c.set(10, 14, 0x5a4a2a); // the tip
    },
  },
  {
    name: 'Fraise',
    draw: (c, v) => {
      c.poly([[3, 5], [13, 5], [11, 12], [8, 14.8], [5, 12]], pick(v, 0xe63946, 0xf06fb0));
      c.ellipse(8, 8, 5, 5.5, pick(v, 0xe63946, 0xf06fb0));
      c.poly([[4, 5], [8, 2], [12, 5], [10, 6.2], [8, 4.6], [6, 6.2]], 0x3d9a3a);
      for (const [x, y] of [[6, 8], [9, 7], [8, 10], [10, 10], [6, 11], [11, 8]]) c.set(x, y, 0xf7e08a);
    },
  },
  {
    name: 'Pastèque',
    draw: (c, v) => {
      const inCircle = (r: number) => (x: number, y: number) => (x - 8) ** 2 + (y - 3.5) ** 2 <= r * r && y >= 4;
      for (let y = 4; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
          const px = x + 0.5;
          const py = y + 0.5;
          if (inCircle(10)(px, py)) c.set(x, y, 0x3d9a3a);
          if (inCircle(9.2)(px, py)) c.set(x, y, 0xbfe6a0);
          if (inCircle(8.2)(px, py)) c.set(x, y, pick(v, 0xe8394a, 0xf2c230));
        }
      }
      for (const [x, y] of [[5, 8], [8, 10], [11, 8], [7, 6], [10, 11]]) c.set(x, y, 0x222222);
    },
  },
  {
    name: 'Poire',
    draw: (c, v) => {
      const body = pick(v, 0xb6d43a, 0xe3b23a);
      c.circle(8, 11, 4.6, body);
      c.circle(8, 6.8, 3.2, body);
      c.rect(8, 2, 1, 3, BROWN);
      c.ellipse(10.8, 3.2, 2, 1, LEAF);
      c.rect(6, 10, 1, 2, 0xffffff);
    },
  },
  {
    name: 'Raisin',
    draw: (c, v) => {
      c.rect(8, 1, 1, 3, BROWN);
      c.ellipse(11.2, 3.4, 2.6, 1.2, LEAF);
      for (const [x, y] of [[5, 6.5], [8, 6.5], [11, 6.5], [6.5, 9.5], [9.5, 9.5], [8, 12.5]]) {
        c.circle(x, y, 2.1, pick(v, 0x7bc043, 0x7a3fa0));
        c.set(x - 1, y - 1, 0xffffff);
      }
    },
  },
  {
    name: 'Chat',
    draw: (c, v) => {
      const fur = pick(v, 0xf2994a, 0x9aa0a6);
      c.poly([[3, 7], [4, 2], [7.5, 5]], fur);
      c.poly([[13, 7], [12, 2], [8.5, 5]], fur);
      c.ellipse(8, 9.5, 6, 5.2, fur);
      c.set(4, 4, 0xf2a6b8);
      c.set(11, 4, 0xf2a6b8);
      c.rect(5, 8, 2, 2, 0x222222);
      c.rect(10, 8, 2, 2, 0x222222);
      c.set(8, 10, 0xf06fb0);
      c.set(7, 11, 0x333333);
      c.set(9, 11, 0x333333);
      c.line(0.5, 10, 4, 10.5, 0xffffff);
      c.line(12, 10.5, 15.5, 10, 0xffffff);
    },
  },
  {
    name: 'Chien',
    draw: (c, v) => {
      c.ellipse(3.3, 8, 2, 4.2, pick(v, 0x7a4a2a, 0x2a1c14));
      c.ellipse(12.7, 8, 2, 4.2, pick(v, 0x7a4a2a, 0x2a1c14));
      c.ellipse(8, 9, 5, 5.5, pick(v, 0xd9a066, 0x6b4a34));
      c.ellipse(8, 11.5, 3, 2.3, 0xf2d9b0);
      c.rect(5, 7, 1, 2, 0x222222);
      c.rect(10, 7, 1, 2, 0x222222);
      c.rect(7, 10, 2, 1, 0x222222);
      c.set(8, 13, 0xf06fb0);
    },
  },
  {
    name: 'Poisson',
    draw: (c, v) => {
      c.poly([[10, 8], [15, 3.5], [15, 12.5]], pick(v, 0xe8761a, 0x2a6ad8));
      c.ellipse(7, 8, 6, 3.8, pick(v, 0xf28c28, 0x3a86ff));
      c.rect(3, 7, 2, 2, 0xffffff);
      c.set(3, 8, 0x222222);
      c.rect(7, 5, 1, 6, pick(v, 0xffd9a0, 0xa0c8ff));
      c.rect(10, 6, 1, 4, pick(v, 0xffd9a0, 0xa0c8ff));
    },
  },
  {
    name: 'Oiseau',
    draw: (c, v) => {
      c.poly([[4, 8], [0.5, 5.5], [1, 10.5]], pick(v, 0x2a6ad8, 0xb02a37));
      c.ellipse(8, 9, 5.2, 4.5, pick(v, 0x3a86ff, 0xe63946));
      c.circle(11.2, 6, 2.9, pick(v, 0x3a86ff, 0xe63946));
      c.poly([[13.6, 5.3], [15.8, 6.4], [13.6, 7.5]], 0xf2994a);
      c.set(11, 5, 0x222222);
      c.ellipse(6.5, 9.5, 3, 2, pick(v, 0x2a6ad8, 0xb02a37));
      c.line(7, 13, 7, 15, 0xf2994a);
      c.line(9.5, 13, 9.5, 15, 0xf2994a);
    },
  },
  {
    name: 'Lapin',
    draw: (c, v) => {
      const fur = pick(v, 0xf4f4f4, 0xb08968);
      c.ellipse(5.5, 4.4, 1.7, 4.4, fur);
      c.ellipse(10.5, 4.4, 1.7, 4.4, fur);
      c.ellipse(5.5, 4.8, 0.8, 3, 0xf2a6b8);
      c.ellipse(10.5, 4.8, 0.8, 3, 0xf2a6b8);
      c.ellipse(8, 10.5, 5, 4.3, fur);
      c.set(6, 10, 0x222222);
      c.set(10, 10, 0x222222);
      c.set(8, 11, 0xf06fb0);
      c.set(7, 12, 0x555555);
      c.set(9, 12, 0x555555);
    },
  },
  {
    name: 'Grenouille',
    draw: (c, v) => {
      const skin = pick(v, 0x4caf50, 0x8bc34a);
      c.ellipse(8, 10.5, 6.8, 4.5, skin);
      c.circle(4.6, 6, 2.6, skin);
      c.circle(11.4, 6, 2.6, skin);
      c.circle(4.6, 5.8, 1.7, 0xffffff);
      c.circle(11.4, 5.8, 1.7, 0xffffff);
      c.rect(4, 5, 1, 2, 0x222222);
      c.rect(11, 5, 1, 2, 0x222222);
      c.line(4, 11.5, 12, 11.5, 0x2a6a30);
      c.set(7, 9, 0x2a6a30);
      c.set(9, 9, 0x2a6a30);
    },
  },
  {
    name: 'Pingouin',
    draw: (c, v) => {
      c.ellipse(3, 10, 1.4, 3.2, pick(v, 0x222a3a, 0x3a5a8a));
      c.ellipse(13, 10, 1.4, 3.2, pick(v, 0x222a3a, 0x3a5a8a));
      c.ellipse(8, 8.8, 5, 6.2, pick(v, 0x222a3a, 0x3a5a8a));
      c.ellipse(8, 10.2, 3.4, 4.6, 0xffffff);
      c.poly([[6.6, 6.2], [9.4, 6.2], [8, 8]], 0xf2994a);
      c.rect(5, 4, 1, 2, 0xffffff);
      c.rect(10, 4, 1, 2, 0xffffff);
      c.set(5, 5, 0x222222);
      c.set(10, 5, 0x222222);
      c.rect(4.5, 14, 3, 1, 0xf2994a);
      c.rect(8.5, 14, 3, 1, 0xf2994a);
    },
  },
  {
    name: 'Hibou',
    draw: (c, v) => {
      const fur = pick(v, 0x8b5a2b, 0x6b6f7a);
      c.poly([[3, 5], [4.5, 1.5], [7, 4.5]], fur);
      c.poly([[13, 5], [11.5, 1.5], [9, 4.5]], fur);
      c.ellipse(8, 9, 5.6, 6.2, fur);
      c.ellipse(8, 11.5, 3.5, 3.8, 0xe0c9a0);
      c.circle(5.4, 6.8, 2.6, 0xffffff);
      c.circle(10.6, 6.8, 2.6, 0xffffff);
      c.rect(5, 6, 2, 2, 0x222222);
      c.rect(10, 6, 2, 2, 0x222222);
      c.poly([[7.3, 8.4], [8.7, 8.4], [8, 10]], 0xf2c230);
    },
  },
  {
    name: 'Maison',
    draw: (c, v) => {
      c.rect(11, 2, 2, 4, 0x888888);
      c.rect(3, 8, 10, 7, pick(v, 0xf2d9a0, 0xc9d6e3));
      c.poly([[1, 8.5], [8, 2], [15, 8.5]], pick(v, 0xc0392b, 0x4a5a7a));
      c.rect(7, 11, 3, 4, BROWN);
      c.rect(4, 10, 2, 2, 0x9bd0f5);
      c.rect(11, 10, 2, 2, 0x9bd0f5);
    },
  },
  {
    name: 'Fusée',
    draw: (c, v) => {
      c.poly([[4.8, 10], [1.5, 14.5], [4.8, 13.5]], pick(v, 0xe63946, 0x3a86ff));
      c.poly([[11.2, 10], [14.5, 14.5], [11.2, 13.5]], pick(v, 0xe63946, 0x3a86ff));
      c.ellipse(8, 8.2, 3.3, 6.2, 0xf4f4f4);
      c.poly([[4.7, 6], [8, 0.8], [11.3, 6]], pick(v, 0xe63946, 0x3a86ff));
      c.circle(8, 7.4, 1.6, 0x7ec8f2);
      c.poly([[6.4, 14.4], [8, 15.9], [9.6, 14.4]], 0xf2994a);
    },
  },
  {
    name: 'Clé',
    draw: (c, v) => {
      const metal = pick(v, 0xf2c230, 0xb8c2cc);
      c.circle(4.5, 4.5, 3.4, metal);
      c.circle(4.5, 4.5, 1.4, null);
      for (let i = 0; i <= 14; i++) c.circle(7 + i * 0.5, 7 + i * 0.5, 1.1, metal);
      c.rect(11, 12, 2, 2, metal);
      c.rect(13, 10, 2, 2, metal);
    },
  },
  {
    name: 'Cœur',
    draw: (c, v) => {
      const red = pick(v, 0xe63946, 0xf06fb0);
      c.circle(5, 6, 3.3, red);
      c.circle(11, 6, 3.3, red);
      c.poly([[1.8, 7.4], [14.2, 7.4], [8, 14.8]], red);
      c.rect(4, 4, 1, 2, 0xffffff);
    },
  },
  {
    name: 'Étoile',
    draw: (c, v) => {
      const pts: [number, number][] = [];
      for (let i = 0; i < 10; i++) {
        const a = (-90 + i * 36) * (Math.PI / 180);
        const r = i % 2 === 0 ? 7.3 : 3.1;
        pts.push([8 + Math.cos(a) * r, 8.6 + Math.sin(a) * r]);
      }
      c.poly(pts, pick(v, 0xf7d23e, 0x8fd3ff));
      c.set(7, 6, 0xffffff);
    },
  },
  {
    name: 'Ballon',
    draw: (c, v) => {
      c.line(8, 12.8, 7, 15.5, 0x888888);
      c.poly([[7, 11.6], [9, 11.6], [8, 13]], pick(v, 0xb02a37, 0x2a6ad8));
      c.ellipse(8, 6.5, 4.7, 5.5, pick(v, 0xe63946, 0x3a86ff));
      c.rect(5, 4, 1, 3, 0xffffff);
    },
  },
  {
    name: 'Glace',
    draw: (c, v) => {
      c.poly([[4.5, 8], [11.5, 8], [8, 15.2]], 0xd9a066);
      c.line(6, 9, 9, 13, 0xb27a3a);
      c.line(10, 9, 7, 13, 0xb27a3a);
      c.circle(8, 6.4, 3.9, pick(v, 0xf5a3c0, 0x7a4a2a));
      c.circle(8, 3.6, 2.4, pick(v, 0xfad0e0, 0xa06a4a));
      c.set(8, 1, 0xd62828);
      c.set(8, 0, 0x3d7a2a);
    },
  },
  {
    name: 'Tasse',
    draw: (c, v) => {
      c.line(5, 3.5, 5.5, 1.5, 0xbbbbbb);
      c.line(8, 3.5, 7.5, 1, 0xbbbbbb);
      c.rect(3, 5, 8, 9, pick(v, 0xf4f4f4, 0x3a86ff));
      c.rect(4, 6, 6, 2, 0x6b4a2a);
      c.circle(12, 9.5, 2.9, pick(v, 0xf4f4f4, 0x3a86ff));
      c.circle(12, 9.5, 1.5, null);
      c.rect(3, 12, 8, 2, pick(v, 0xe0e0e0, 0x2a6ad8));
    },
  },
  {
    name: 'Bateau',
    draw: (c, v) => {
      c.rect(8, 2, 1, 8, BROWN);
      c.poly([[9.4, 2.5], [9.4, 9.5], [14.5, 9.5]], 0xf4f4f4);
      c.poly([[7.6, 4], [7.6, 9.5], [3, 9.5]], pick(v, 0xf2a6a0, 0xa0c8ff));
      c.poly([[2, 10.2], [14, 10.2], [11.6, 14], [4.4, 14]], pick(v, 0x8b5a2b, 0xc0392b));
      for (let x = 0; x < SIZE; x += 2) c.set(x, 15, 0x3a86ff);
    },
  },
  {
    name: 'Champignon',
    draw: (c, v) => {
      c.rect(6, 8, 4, 6.5, 0xf2e2c4);
      c.ellipse(8, 8, 6.7, 5.6, pick(v, 0xd62828, 0xf2994a), 8.4);
      c.circle(5, 5.6, 1, 0xffffff);
      c.circle(10.4, 4.8, 1.2, 0xffffff);
      c.circle(8, 7.2, 0.8, 0xffffff);
    },
  },
];

export type Picture = { index: number; name: string; variant: 0 | 1; background: number };

/** 50 pictures: 25 designs, each in two colourings. */
export const PICTURES: Picture[] = Array.from({ length: DRAWINGS.length * 2 }, (_, index) => ({
  index,
  name: DRAWINGS[index % DRAWINGS.length].name + (index >= DRAWINGS.length ? ' (variante)' : ''),
  variant: (index >= DRAWINGS.length ? 1 : 0) as 0 | 1,
  background: [0xfdf1d6, 0xd8ecf7, 0xe8f5d8, 0xf6dce8, 0xe6defa][index % 5],
}));

export const PICTURE_COUNT = PICTURES.length;
export const PIECES = MONETIZATION.gallery.levelsPerPicture;

/** The picture's own pixels (colour or null), without background. */
export function drawPicture(index: number): Color[] {
  const canvas = new Canvas();
  DRAWINGS[index % DRAWINGS.length].draw(canvas, PICTURES[index].variant);
  return canvas.px;
}

/**
 * The order in which the 256 pixels of a picture appear: a fixed shuffle (the same every time, so the
 * picture a player is revealing never changes under them).
 */
export function revealOrder(index: number): number[] {
  return createRng(index * 977 + 13).shuffle(Array.from({ length: PIXELS }, (_, i) => i));
}

/** How many pixels are visible once `pieces` of the 10 are revealed. */
export const revealedPixels = (pieces: number) => Math.round((PIXELS * Math.min(PIECES, Math.max(0, pieces))) / PIECES);

/** Which picture, and which piece of it, a campaign level reveals. */
export function pictureForLevel(levelId: number): { picture: number; piece: number } {
  return { picture: Math.floor((levelId - 1) / PIECES) % PICTURE_COUNT, piece: ((levelId - 1) % PIECES) + 1 };
}

/** Pieces of picture `picture` already earned, from the saved best stars per level. */
export function piecesEarned(stars: Record<number, number>, picture: number): number {
  let n = 0;
  for (let i = 1; i <= PIECES; i++) if (stars[picture * PIECES + i]) n++;
  return n;
}

export type PictureStatus = { picture: Picture; pieces: number; complete: boolean };

export function gallery(stars: Record<number, number>, upTo = PICTURE_COUNT): PictureStatus[] {
  return PICTURES.slice(0, upTo).map((picture) => {
    const pieces = piecesEarned(stars, picture.index);
    return { picture, pieces, complete: pieces >= PIECES };
  });
}

/**
 * RGBA pixels of a picture with `pieces` of 10 revealed. The pixels not yet revealed show a dark
 * chequerboard, so the player sees a picture is hiding there. `flash` pixels (the ones that have
 * just been revealed) can be drawn in white.
 */
export function pictureRgba(index: number, pieces: number, opts: { flashFrom?: number } = {}): Uint8Array {
  const art = drawPicture(index);
  const order = revealOrder(index);
  const shown = revealedPixels(pieces);
  const flashFrom = opts.flashFrom ?? shown;
  const revealedAt = new Int16Array(PIXELS);
  order.forEach((pixel, rank) => (revealedAt[pixel] = rank));
  const bg = PICTURES[index].background;
  const out = new Uint8Array(PIXELS * 4);
  for (let i = 0; i < PIXELS; i++) {
    let color: number;
    const isArt = art[i] !== null && art[i] !== undefined;
    // The background is the same colour whatever is revealed (pixels of it that were "revealed" must not show up among the grey).
    // Not revealed yet: the picture's silhouette in plain light grey; it takes its colours piece by piece.
    if (!isArt) color = bg;
    else if (revealedAt[i] >= shown) color = SILHOUETTE;
    else if (revealedAt[i] >= flashFrom) color = 0xffffff;
    else color = art[i] ?? bg;
    out[i * 4] = (color >> 16) & 255;
    out[i * 4 + 1] = (color >> 8) & 255;
    out[i * 4 + 2] = color & 255;
    out[i * 4 + 3] = 255;
  }
  return out;
}

const SILHOUETTE = 0xc9c5da;

const uriCache = new Map<string, string>();

/** A PNG data URI of the picture, enlarged `scale` times with crisp pixels (cached). */
export function pictureUri(index: number, pieces: number, scale = 8, opts: { flashFrom?: number } = {}): string {
  const key = `${index}:${pieces}:${scale}:${opts.flashFrom ?? ''}`;
  const cached = uriCache.get(key);
  if (cached) return cached;
  const src = pictureRgba(index, pieces, opts);
  const w = SIZE * scale;
  const big = new Uint8Array(w * w * 4);
  for (let y = 0; y < w; y++) {
    for (let x = 0; x < w; x++) {
      const s = (Math.floor(y / scale) * SIZE + Math.floor(x / scale)) * 4;
      big.set(src.subarray(s, s + 4), (y * w + x) * 4);
    }
  }
  const uri = pngDataUri(w, w, big);
  if (uriCache.size > 300) uriCache.clear();
  uriCache.set(key, uri);
  return uri;
}
