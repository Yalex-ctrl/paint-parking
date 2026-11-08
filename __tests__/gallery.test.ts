import { inflateSync } from 'zlib';

import {
  PICTURES,
  PICTURE_COUNT,
  PIECES,
  SIZE,
  drawPicture,
  gallery,
  pictureForLevel,
  pictureRgba,
  pictureUri,
  piecesEarned,
  revealOrder,
  revealedPixels,
} from '../src/game/gallery';
import { encodePng, toBase64 } from '../src/game/png';

describe('pictures', () => {
  it('has 50 pictures of 16x16, enough for 500 levels at one per 10', () => {
    expect(PICTURE_COUNT).toBe(50);
    expect(SIZE).toBe(16);
    expect(PIECES).toBe(10);
  });

  it('each one really draws something, not a blank or a full square', () => {
    for (const p of PICTURES) {
      const px = drawPicture(p.index);
      const drawn = px.filter((c) => c !== null).length;
      expect(drawn).toBeGreaterThan(35);
      expect(drawn).toBeLessThan(235);
    }
  });

  it('every picture is different from all the others, and the two colourings of a design differ', () => {
    const seen = new Set<string>();
    for (const p of PICTURES) seen.add(drawPicture(p.index).join(','));
    expect(seen.size).toBe(PICTURE_COUNT);
    expect(PICTURES.filter((p) => p.variant === 1)).toHaveLength(25);
    expect(drawPicture(0).join()).not.toBe(drawPicture(25).join());
    // same silhouette, other colours
    const shape = (i: number) => drawPicture(i).map((c) => c !== null).join();
    expect(shape(3)).toBe(shape(28));
  });
});

describe('revealing', () => {
  it('shows a tenth of the pixels per level, in an order that never changes', () => {
    expect(revealedPixels(0)).toBe(0);
    expect(revealedPixels(1)).toBe(26); // 25.6, rounded
    expect(revealedPixels(5)).toBe(128);
    expect(revealedPixels(10)).toBe(256);
    expect(revealedPixels(99)).toBe(256);
    expect(revealedPixels(-3)).toBe(0);
    const order = revealOrder(7);
    expect([...order].sort((a, b) => a - b)).toEqual(Array.from({ length: 256 }, (_, i) => i)); // a permutation
    expect(revealOrder(7)).toEqual(order);
    expect(revealOrder(8)).not.toEqual(order);
  });

  it('shows what is not revealed yet as a plain light grey silhouette of the drawing, on a background that never changes', () => {
    const art = drawPicture(3);
    const isArt = (i: number) => art[i] !== null && art[i] !== undefined;
    const none = pictureRgba(3, 0);
    const half = pictureRgba(3, 5);
    const all = pictureRgba(3, 10);
    const grey = (px: Uint8Array, i: number) => px[i * 4] === 0xc9 && px[i * 4 + 1] === 0xc5 && px[i * 4 + 2] === 0xda;
    let drawn = 0;
    let greyNone = 0;
    let greyHalf = 0;
    let greyAll = 0;
    for (let i = 0; i < 256; i++) {
      if (!isArt(i)) {
        // The background is the same at every stage: no dark pixel appears and disappears among the grey.
        for (const k of [0, 1, 2]) {
          expect(half[i * 4 + k]).toBe(none[i * 4 + k]);
          expect(all[i * 4 + k]).toBe(none[i * 4 + k]);
        }
        continue;
      }
      drawn++;
      if (grey(none, i)) greyNone++;
      if (grey(half, i)) greyHalf++;
      if (grey(all, i)) greyAll++;
    }
    expect(greyNone).toBe(drawn);
    expect(greyHalf).toBeGreaterThan(drawn * 0.3);
    expect(greyHalf).toBeLessThan(drawn * 0.7);
    expect(greyAll).toBe(0);
  });

  it('what is revealed stays revealed as more pieces come', () => {
    const order = revealOrder(12);
    const px5 = pictureRgba(12, 5);
    const px6 = pictureRgba(12, 6);
    for (const pixel of order.slice(0, revealedPixels(5))) {
      expect(px6[pixel * 4]).toBe(px5[pixel * 4]);
      expect(px6[pixel * 4 + 1]).toBe(px5[pixel * 4 + 1]);
    }
  });

  it('flashes the pixels that have just been revealed in white', () => {
    const flash = pictureRgba(5, 4, { flashFrom: revealedPixels(3) });
    const order = revealOrder(5);
    const art = drawPicture(5);
    for (const pixel of order.slice(revealedPixels(3), revealedPixels(4))) {
      if (art[pixel] === null || art[pixel] === undefined) continue; // the background is never flashed
      expect([flash[pixel * 4], flash[pixel * 4 + 1], flash[pixel * 4 + 2]]).toEqual([255, 255, 255]);
    }
  });
});

describe('levels and pictures', () => {
  it('maps every 10 levels to a picture and a piece of it', () => {
    expect(pictureForLevel(1)).toEqual({ picture: 0, piece: 1 });
    expect(pictureForLevel(10)).toEqual({ picture: 0, piece: 10 });
    expect(pictureForLevel(11)).toEqual({ picture: 1, piece: 1 });
    expect(pictureForLevel(500)).toEqual({ picture: 49, piece: 10 });
    expect(pictureForLevel(501)).toEqual({ picture: 0, piece: 1 }); // wraps (there are only 500 levels anyway)
  });

  it('counts the pieces earned from the finished levels, and lists the gallery', () => {
    const stars = { 1: 3, 2: 1, 3: 2, 11: 3, 12: 3, 13: 3, 14: 3, 15: 3, 16: 3, 17: 3, 18: 3, 19: 3, 20: 3 };
    expect(piecesEarned(stars, 0)).toBe(3);
    expect(piecesEarned(stars, 1)).toBe(10);
    expect(piecesEarned(stars, 2)).toBe(0);
    const g = gallery(stars, 3);
    expect(g.map((x) => x.pieces)).toEqual([3, 10, 0]);
    expect(g.map((x) => x.complete)).toEqual([false, true, false]);
  });
});

describe('PNG pictures', () => {
  it('encodes a valid PNG that decodes back to the same pixels', () => {
    const rgba = pictureRgba(2, 10);
    const png = encodePng(16, 16, rgba);
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    // IHDR: 16 x 16, 8-bit RGBA.
    const view = new DataView(png.buffer, png.byteOffset);
    expect(view.getUint32(16)).toBe(16);
    expect(view.getUint32(20)).toBe(16);
    expect(png[24]).toBe(8);
    expect(png[25]).toBe(6);
    // Find IDAT and inflate it with a real zlib.
    let at = 8;
    let idat: Uint8Array | null = null;
    while (at < png.length) {
      const len = view.getUint32(at);
      const type = String.fromCharCode(...png.subarray(at + 4, at + 8));
      if (type === 'IDAT') idat = png.subarray(at + 8, at + 8 + len);
      at += 12 + len;
    }
    const raw = inflateSync(Buffer.from(idat!));
    expect(raw.length).toBe(16 * (1 + 16 * 4));
    for (let y = 0; y < 16; y++) {
      expect(raw[y * 65]).toBe(0); // filter: none
      for (let i = 0; i < 64; i++) expect(raw[y * 65 + 1 + i]).toBe(rgba[y * 64 + i]);
    }
  });

  it('handles images bigger than one deflate block', () => {
    const w = 200;
    const rgba = new Uint8Array(w * w * 4).map((_, i) => (i * 31) % 256);
    const raw = inflateSync(
      Buffer.from(
        (() => {
          const png = encodePng(w, w, rgba);
          const view = new DataView(png.buffer, png.byteOffset);
          const len = view.getUint32(33);
          return png.subarray(41, 41 + len);
        })(),
      ),
    );
    expect(raw.length).toBe(w * (1 + w * 4));
  });

  it('base64 matches the standard encoder', () => {
    for (const n of [0, 1, 2, 3, 4, 5, 100]) {
      const bytes = new Uint8Array(n).map((_, i) => (i * 37 + 5) % 256);
      expect(toBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
    }
  });

  it('makes a data URI of the enlarged picture, cached', () => {
    const uri = pictureUri(4, 7, 8);
    expect(uri.startsWith('data:image/png;base64,')).toBe(true);
    expect(pictureUri(4, 7, 8)).toBe(uri);
    expect(pictureUri(4, 8, 8)).not.toBe(uri);
  });
});
