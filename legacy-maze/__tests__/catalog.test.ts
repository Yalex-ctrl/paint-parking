import * as THREE from 'three';

import { MONETIZATION } from '../src/core/config/monetization';
import { LEVEL_COLORS } from '../src/game/generator';
import { buyItem, defaultProfile, earnCoins, equipItem, grantItem, owns, type Profile } from '../src/core/economy';
import { openChest } from '../src/game/mapLayout';
import { coinBadge, coinBonusLabel, coinPileFor } from '../src/core/offers';
import { filterItems, isNewItem, markSeen, sortItems, worldEndReward } from '../src/core/shopCatalog';
import { RARITIES, RARITY_PRICE, SHOP_ITEMS, itemsOfKind, type ShopItem } from '../src/core/shopItems';
import { PAINT_ANIMATED, animatePaint, createPaintMaterial, paintStyle, paintTexture, paintTint } from '../src/render/paintEffects';
import { PAINT_IDS } from '../src/render/paintStyles';
import { PAINT_TEXELS } from '../src/render/paintTexels';
import { LOW_FOR_SECONDS, decorForQuality, keepParticle, perf } from '../src/core/render/perf';
import { SKIN_PATTERNS } from '../src/render/skinPatterns';
import { SKIN_SPECS } from '../src/render/skinSpecs';
import { THUMB_VERSION, thumbnailPixels, thumbnailPng } from '../src/render/thumbnails';

const balls = itemsOfKind('ball');
const paints = itemsOfKind('paint');

describe('the catalogue', () => {
  it('has the 59 balls (45 + 2 won with ads + 12 VIP) and 37 paints, every id unique', () => {
    expect(balls).toHaveLength(59);
    expect(paints).toHaveLength(37);
    expect(new Set(SHOP_ITEMS.map((i) => i.id)).size).toBe(SHOP_ITEMS.length);
    expect(balls.filter((b) => b.fresh)).toHaveLength(46);
    expect(paints.filter((p) => p.fresh)).toHaveLength(31);
  });

  it('every item has a rarity, and what is bought costs what its rarity allows', () => {
    for (const item of SHOP_ITEMS) {
      expect(RARITIES).toContain(item.rarity);
      if (item.price !== undefined) {
        const [lo, hi] = RARITY_PRICE[item.rarity];
        expect({ id: item.id, ok: item.price >= lo && item.price <= hi }).toEqual({ id: item.id, ok: true });
      }
    }
  });

  it('every rarity is represented, and legendary items are either very dear or earned', () => {
    for (const r of RARITIES) expect(SHOP_ITEMS.some((i) => i.rarity === r)).toBe(true);
    for (const item of SHOP_ITEMS.filter((i) => i.rarity === 'legendary')) {
      expect(item.exclusive !== undefined || (item.price ?? 0) >= 6000).toBe(true);
    }
  });

  it('every ball has a material, every paint a style, and what is earned says how', () => {
    for (const b of balls) expect(SKIN_SPECS).toHaveProperty(b.id);
    for (const p of paints) expect(PAINT_IDS).toContain(p.id);
    for (const item of SHOP_ITEMS.filter((i) => i.exclusive)) {
      expect(item.price).toBeUndefined();
      expect(item.how).toBeTruthy();
    }
    // Textured balls all exist in the catalogue.
    for (const id of Object.keys(SKIN_PATTERNS)) expect(balls.map((b) => b.id)).toContain(id);
  });

  it('the balls of the brief are all there', () => {
    const names = balls.map((b) => b.name);
    for (const n of ['Rubis', 'Émeraude', 'Saphir', 'Améthyste', 'Diamant', 'Bronze', 'Cuivre', 'Perle', 'Obsidienne', 'Marbre', 'Bois verni', 'Granit', 'Tennis', 'Golf', 'Volley', 'Billard n°8', 'Baseball', 'Ping-pong', 'Orange', 'Tomate', 'Cookie', 'Glace fraise', 'Sucre d’orge', 'Myrtille', 'Soleil', 'Mars', 'Jupiter', 'Lave', 'Boule de neige', 'Coccinelle', 'Damier', 'Boule de Noël']) {
      expect(names).toContain(n);
    }
  });
});

describe('shop filters and order', () => {
  const rich = (): Profile => earnCoins(defaultProfile(), 20000);

  it('filters by rarity or by what the player owns', () => {
    const p = rich();
    expect(filterItems(balls, p, 'all')).toHaveLength(balls.length);
    expect(filterItems(balls, p, 'rare').every((i) => i.rarity === 'rare')).toBe(true);
    expect(filterItems(balls, p, 'owned').map((i) => i.id)).toEqual(['gold']);
    const bought = buyItem(p, 'silver');
    expect(bought.ok).toBe(true);
    if (bought.ok) expect(filterItems(balls, bought.profile, 'owned').map((i) => i.id).sort()).toEqual(['gold', 'silver']);
  });

  it('puts the equipped item first, then the ones owned, then the rest by increasing price', () => {
    let p = rich();
    for (const id of ['copper', 'silver']) {
      const r = buyItem(p, id);
      if (r.ok) p = r.profile;
    }
    p = equipItem(p, 'copper')!;
    const order = sortItems(balls, p);
    expect(order[0].id).toBe('copper');
    expect(order.slice(1, 3).map((i) => i.id).sort()).toEqual(['gold', 'silver']);
    const priced = order.filter((i) => !owns(p, i.id) && i.price !== undefined).map((i) => i.price!);
    expect(priced).toEqual([...priced].sort((a, b) => a - b));
    // What cannot be bought comes after everything that can.
    const lastBuyable = order.map((i) => !owns(p, i.id) && i.price !== undefined).lastIndexOf(true);
    const firstEarned = order.findIndex((i) => !owns(p, i.id) && i.price === undefined);
    expect(firstEarned).toBeGreaterThan(lastBuyable);
  });

  it('new items carry a badge until they have been seen, or bought', () => {
    const p = defaultProfile();
    const ruby = balls.find((b) => b.id === 'ruby')!;
    const silver = balls.find((b) => b.id === 'silver')!;
    expect(isNewItem(ruby, p)).toBe(true);
    expect(isNewItem(silver, p)).toBe(false); // an old item
    expect(isNewItem(ruby, markSeen(p, ['ruby']))).toBe(false);
    expect(isNewItem(ruby, grantItem(p, 'ruby'))).toBe(false);
    expect(markSeen(p, [])).toBe(p);
  });
});

describe('items earned in the game', () => {
  const ten = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [i + 1, 3]));

  it('some chests of the map hold an exclusive item, given once', () => {
    expect(MONETIZATION.shop.chestRewards[2]).toBe('confetti');
    const p = defaultProfile();
    const open = openChest(p, 2, ten(20))!;
    expect(open.item).toBe('confetti');
    expect(owns(open.profile, 'confetti')).toBe(true);
    // A chest without an item just pays coins.
    expect(openChest(p, 1, ten(10))!.item).toBeNull();
    for (const id of Object.values(MONETIZATION.shop.chestRewards)) {
      const item = SHOP_ITEMS.find((i) => i.id === id)!;
      expect(item.exclusive).toBe('chest');
    }
  });

  it('finishing the last level of a world gives an exclusive item, once', () => {
    const p = defaultProfile();
    const first = worldEndReward(p, 25)!;
    expect(first.item.id).toBe('bauble');
    expect(owns(first.profile, 'bauble')).toBe(true);
    expect(worldEndReward(first.profile, 25)).toBeNull();
    expect(worldEndReward(p, 26)).toBeNull();
    for (const id of Object.values(MONETIZATION.shop.worldEndRewards)) expect(SHOP_ITEMS.find((i) => i.id === id)!.exclusive).toBe('world');
  });
});

describe('offers', () => {
  it('the two big coin packs show +20 % and +65 %, with their ribbons', () => {
    expect(coinBonusLabel('paintparking_coins_1000')).toBeNull();
    expect(coinBonusLabel('paintparking_coins_3000')).toMatch(/^\+20[\s  ]?%$/);
    expect(coinBonusLabel('paintparking_coins_10000')).toMatch(/^\+65[\s  ]?%$/);
    expect(coinBonusLabel('nope')).toBeNull();
    expect(coinBadge('paintparking_coins_3000')).toBe('Populaire');
    expect(coinBadge('paintparking_coins_10000')).toBe('Meilleure valeur');
  });

  it('coins pile up in height, not in a longer and longer row', () => {
    const small = coinPileFor(1000);
    const big = coinPileFor(10000);
    expect(small.columns.length).toBeLessThanOrEqual(2);
    expect(big.columns.length).toBeLessThanOrEqual(2);
    expect(big.chest).toBe(true);
    expect(small.chest).toBe(false);
    for (const c of [1000, 3000, 10000]) expect(Math.max(...coinPileFor(c).columns)).toBeLessThanOrEqual(4);
    // the art grows with the pack: a pile, two piles, a chest
    expect(coinPileFor(3000).columns.length).toBe(2);
    expect(coinPileFor(1000).columns.length).toBe(1);
  });
});

describe('paints', () => {
  const base = new THREE.Color('#4f8cff');
  /** The unpainted floor of a board, as the game draws it. */
  const floor = new THREE.Color().setHSL(0.72, 0.18, 0.2);

  function meanOf(effect: string, base: THREE.Color): [number, number, number] {
    const style = paintStyle(effect);
    const texel = style.texture ? PAINT_TEXELS[style.texture] : undefined;
    const tint = new THREE.Color();
    const sum = [0, 0, 0];
    let n = 0;
    for (let order = 0; order < 12; order++) {
      paintTint(tint, effect, base, { order, noise: 0, coat: 1, double: false, pos: { u: (order % 4) / 3, v: Math.floor(order / 4) / 2 } });
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          const t = texel ? texel((x + 0.5) / 16, (y + 0.5) / 16) : [1, 1, 1];
          sum[0] += tint.r * t[0];
          sum[1] += tint.g * t[1];
          sum[2] += tint.b * t[2];
          n++;
        }
      }
    }
    return [sum[0] / n, sum[1] / n, sum[2] / n];
  }

  it('there are 37 styles and each one has what it needs', () => {
    expect(PAINT_IDS).toHaveLength(37);
    for (const id of PAINT_IDS) {
      const st = paintStyle(id);
      if (st.texture) expect(PAINT_TEXELS).toHaveProperty(st.texture);
      if (st.tint === 'fixed') expect(st.fixed).toBeTruthy();
      if (st.tint === 'gradient') expect(st.gradient!.length).toBeGreaterThan(1);
    }
  });

  it.each(PAINT_IDS)('%s: a painted tile is clearly different from an unpainted one (dark grey), on every level colour', (id) => {
    for (const css of LEVEL_COLORS) {
    const [r, g, b] = meanOf(id, new THREE.Color(css));
    const dist = Math.hypot(r - floor.r, g - floor.g, b - floor.b);
    expect(dist).toBeGreaterThan(0.3);
    }
  });

  it('every pattern gives valid colours over a whole tile', () => {
    for (const [name, fn] of Object.entries(PAINT_TEXELS)) {
      for (let i = 0; i < 300; i++) {
        const [r, g, b] = fn((i % 20) / 20 + 0.01, Math.floor(i / 20) / 15 + 0.01);
        for (const v of [r, g, b]) {
          expect({ name, finite: Number.isFinite(v) }).toEqual({ name, finite: true });
          expect(v).toBeGreaterThanOrEqual(-0.01);
          expect(v).toBeLessThanOrEqual(1.01);
        }
      }
    }
  });

  it('gradients change colour across the board, metals are one colour, and doubles stay darker after two coats', () => {
    const a = paintTint(new THREE.Color(), 'sunset', base, { order: 0, noise: 0, coat: 1, double: false, pos: { u: 0, v: 0 } }).getHex();
    const b = paintTint(new THREE.Color(), 'sunset', base, { order: 0, noise: 0, coat: 1, double: false, pos: { u: 1, v: 1 } }).getHex();
    expect(a).not.toBe(b);
    const g1 = paintTint(new THREE.Color(), 'gilded', base, { order: 0, noise: 0, coat: 1, double: false }).getHex();
    const g2 = paintTint(new THREE.Color(), 'gilded', base, { order: 9, noise: 0, coat: 1, double: false }).getHex();
    expect(g1).toBe(g2);
    for (const id of PAINT_IDS) {
      const one = { h: 0, s: 0, l: 0 };
      const two = { h: 0, s: 0, l: 0 };
      paintTint(new THREE.Color(), id, base, { order: 1, noise: 0, coat: 1, double: true }).getHSL(one);
      paintTint(new THREE.Color(), id, base, { order: 1, noise: 0, coat: 2, double: true }).getHSL(two);
      expect(two.l).toBeLessThanOrEqual(one.l + 1e-9);
    }
  });

  it('a material can be made for every paint, and the moving ones move with one clock', () => {
    for (const id of PAINT_IDS) {
      const m = createPaintMaterial(id, null);
      expect(m).toBeInstanceOf(THREE.Material);
      m.dispose();
    }
    expect(PAINT_ANIMATED).toEqual(expect.arrayContaining(['aurora', 'holo', 'lavaPaint', 'fire']));
    const fire = createPaintMaterial('fire', null) as THREE.MeshStandardMaterial;
    const before = fire.map!.offset.y;
    animatePaint(fire, 'fire', 1.7);
    expect(fire.map!.offset.y).not.toBe(before);
    const holo = createPaintMaterial('holo', null) as THREE.MeshStandardMaterial;
    const c0 = holo.color.getHex();
    animatePaint(holo, 'holo', 4);
    expect(holo.color.getHex()).not.toBe(c0);
    // A still paint is left alone.
    const still = createPaintMaterial('classic', null) as THREE.MeshStandardMaterial;
    const s0 = still.color.getHex();
    animatePaint(still, 'classic', 9);
    expect(still.color.getHex()).toBe(s0);
    // Textures are shared per pattern and cloned per material (a scrolling board never moves another one).
    expect(paintTexture('fire')).toBe(paintTexture('fire'));
    expect(fire.map).not.toBe(paintTexture('fire'));
  });
});

describe('thumbnails of the whole catalogue', () => {
  it('every item has its own picture, and a PNG file can be saved for it', () => {
    const seen = new Map<string, string>();
    for (const item of SHOP_ITEMS) {
      const px = thumbnailPixels(item.kind, item.id);
      let hash = 0;
      for (let i = 0; i < px.length; i += 7) hash = (hash * 31 + px[i]) >>> 0;
      const key = `${item.kind}:${hash}`;
      expect({ id: item.id, twin: seen.get(key) }).toEqual({ id: item.id, twin: undefined });
      seen.set(key, item.id);
    }
    const png = thumbnailPng('ball', 'ruby');
    expect(Array.from(png.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(THUMB_VERSION).toBeTruthy();
  });
});

describe('frame rate watch', () => {
  beforeEach(() => perf.reset());

  const run = (fps: number, seconds: number) => {
    const dt = 1 / fps;
    let dropped = 0;
    for (let t = 0; t < seconds; t += dt) if (perf.frame(dt)) dropped++;
    return dropped;
  };

  it('stays at full quality at 60 fps', () => {
    expect(run(60, 10)).toBe(0);
    expect(perf.quality).toBe(0);
    expect(perf.fps).toBeGreaterThanOrEqual(58);
  });

  it('drops one step after 2 seconds under 50 fps, and again after 2 more, never below the lowest', () => {
    expect(run(40, LOW_FOR_SECONDS - 0.6)).toBe(0);
    expect(perf.quality).toBe(0);
    run(40, 1);
    expect(perf.quality).toBe(1);
    run(40, 2.6);
    expect(perf.quality).toBe(2);
    run(40, 10);
    expect(perf.quality).toBe(2);
  });

  it('a short dip does not change anything, and a pause (app in the background) is not a slow frame', () => {
    run(30, 1);
    run(60, 3);
    expect(perf.quality).toBe(0);
    expect(perf.frame(5)).toBe(false);
    expect(perf.quality).toBe(0);
  });

  it('lower quality means fewer particles and less scenery', () => {
    const plan = Array.from({ length: 10 }, (_, i) => i);
    expect(decorForQuality(plan, 0)).toHaveLength(10);
    expect(decorForQuality(plan, 1)).toHaveLength(5);
    expect(decorForQuality(plan, 2)).toHaveLength(0);
    const kept = (q: 0 | 1 | 2) => Array.from({ length: 100 }, (_, i) => keepParticle(i, q)).filter(Boolean).length;
    expect(kept(0)).toBe(100);
    expect(kept(1)).toBe(50);
    expect(kept(2)).toBe(25);
  });
});
