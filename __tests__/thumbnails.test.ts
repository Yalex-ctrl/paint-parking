import { SHOP_ITEMS } from '../src/game/shopItems';
import { THUMB_SIZE, itemThumbnail, thumbnailPixels } from '../src/render/thumbnails';

const mean = (px: Uint8Array) => {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 200) continue;
    r += px[i];
    g += px[i + 1];
    b += px[i + 2];
    n++;
  }
  return [r / n, g / n, b / n, n];
};

describe('shop thumbnails', () => {
  it('every item has a real picture (a PNG), drawn once and cached', () => {
    for (const item of SHOP_ITEMS) {
      const uri = itemThumbnail(item.kind, item.id);
      expect(uri.startsWith('data:image/png;base64,')).toBe(true);
      expect(itemThumbnail(item.kind, item.id)).toBe(uri);
    }
  });

  it('every ball is a round picture: transparent corners, a filled middle', () => {
    for (const item of SHOP_ITEMS.filter((i) => i.kind === 'ball')) {
      const px = thumbnailPixels('ball', item.id);
      expect(px[3]).toBe(0);
      const mid = ((THUMB_SIZE / 2) * THUMB_SIZE + THUMB_SIZE / 2) * 4 + 3;
      expect(px[mid]).toBeGreaterThan(150);
    }
  });

  it('no two balls look alike (the football, the eye and the moon are not the same white-grey circle)', () => {
    const balls = SHOP_ITEMS.filter((i) => i.kind === 'ball');
    const pics = balls.map((b) => thumbnailPixels('ball', b.id));
    for (let a = 0; a < pics.length; a++) {
      for (let b = a + 1; b < pics.length; b++) {
        let diff = 0;
        for (let i = 0; i < pics[a].length; i += 4) {
          diff += Math.abs(pics[a][i] - pics[b][i]) + Math.abs(pics[a][i + 1] - pics[b][i + 1]) + Math.abs(pics[a][i + 2] - pics[b][i + 2]);
        }
        expect({ pair: `${balls[a].id}/${balls[b].id}`, diff: diff > 80_000 }).toEqual({ pair: `${balls[a].id}/${balls[b].id}`, diff: true });
      }
    }
  });

  it('each ball has the colours of its name', () => {
    const [er, eg, eb] = mean(thumbnailPixels('ball', 'eye'));
    expect(Math.min(er, eg, eb)).toBeGreaterThan(100); // mostly the white of the eye
    const [wr, wg] = mean(thumbnailPixels('ball', 'watermelon'));
    expect(wg).toBeGreaterThan(wr); // green
    const [br, , bb] = mean(thumbnailPixels('ball', 'basketball'));
    expect(br).toBeGreaterThan(bb); // orange
    const [gr, gg, gb] = mean(thumbnailPixels('ball', 'gold'));
    expect(gr).toBeGreaterThan(gb * 1.8);
    expect(gg).toBeGreaterThan(gb);
    const [pr, , pb] = mean(thumbnailPixels('ball', 'bowling'));
    expect(pb).toBeGreaterThan(pr); // blue-violet
  });

  it('the paints are different pictures, and the rainbow really has many colours', () => {
    const ids = SHOP_ITEMS.filter((i) => i.kind === 'paint').map((i) => i.id);
    const uris = new Set(ids.map((id) => itemThumbnail('paint', id)));
    expect(uris.size).toBe(ids.length);
    const colors = new Set<number>();
    const px = thumbnailPixels('paint', 'rainbow');
    for (let i = 0; i < px.length; i += 4) if (px[i + 3] === 255) colors.add(((px[i] >> 4) << 8) | ((px[i + 1] >> 4) << 4) | (px[i + 2] >> 4));
    expect(colors.size).toBeGreaterThan(8);
  });
});
