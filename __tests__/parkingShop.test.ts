import { MONETIZATION } from '../src/core/config/monetization';
import { DEFAULT_BALL, RARITY_PRICE, RARITIES, SHOP_ITEMS, itemById, itemsOfKind } from '../src/core/shopItems';
import { itemName } from '../src/core/i18n/names';
import i18n from '../src/core/i18n';
import fr from '../src/core/i18n/fr.json';
import en from '../src/core/i18n/en.json';
import { SKIN_SPECS, specOf } from '../src/render/skinSpecs';
import { THUMB_SIZE, thumbnailPixels } from '../src/render/thumbnails';
import { skinGeometry } from '../src/render/vehicleGeometry';

const vehicles = itemsOfKind('ball');

describe('the vehicles of the shop', () => {
  it('are about forty, plus the twelve of the VIP pass, all with a different id', () => {
    const regular = vehicles.filter((v) => v.exclusive !== 'vip');
    expect(regular.length).toBeGreaterThanOrEqual(38);
    expect(regular.length).toBeLessThanOrEqual(45);
    expect(vehicles.filter((v) => v.exclusive === 'vip')).toHaveLength(12);
    expect(new Set(SHOP_ITEMS.map((i) => i.id)).size).toBe(SHOP_ITEMS.length);
  });

  it('keep the rarities and the prices of Paint Maze: a bought vehicle is priced inside the range of its rarity', () => {
    for (const v of vehicles) {
      if (v.price === undefined) continue;
      const [lo, hi] = RARITY_PRICE[v.rarity];
      expect({ id: v.id, ok: v.price >= lo && v.price <= hi }).toEqual({ id: v.id, ok: true });
    }
    for (const r of RARITIES) expect(vehicles.some((v) => v.rarity === r)).toBe(true);
  });

  it('have a name in French and in English, and a look', () => {
    for (const v of vehicles) {
      expect({ id: v.id, fr: (fr.items as Record<string, string>)[v.id] }).toEqual({ id: v.id, fr: expect.any(String) });
      expect({ id: v.id, en: (en.items as Record<string, string>)[v.id] }).toEqual({ id: v.id, en: expect.any(String) });
      expect({ id: v.id, spec: !!SKIN_SPECS[v.id] }).toEqual({ id: v.id, spec: true });
    }
    expect(itemName('taxi')).toBe(i18n.language === 'fr' ? 'Taxi' : itemName('taxi'));
  });

  it('no name mentions a real make or a logo', () => {
    const names = vehicles.map((v) => (fr.items as Record<string, string>)[v.id].toLowerCase());
    for (const brand of ['ferrari', 'tesla', 'bmw', 'ford', 'toyota', 'renault', 'peugeot', 'volkswagen', 'mini cooper', 'lamborghini', 'porsche']) {
      expect(names.some((n) => n.includes(brand))).toBe(false);
    }
  });

  it('are what the rewards of the game give: the default, the starter pack, the milestones, the chests, the worlds, the ads, the VIP', () => {
    const ids: string[] = [
      DEFAULT_BALL,
      ...MONETIZATION.products.starterPack.skins,
      MONETIZATION.dailyReward.day7Skin,
      ...Object.values(MONETIZATION.daily.skinMilestones),
      ...Object.values(MONETIZATION.shop.chestRewards),
      ...Object.values(MONETIZATION.shop.worldEndRewards),
      ...MONETIZATION.rewards.adUnlock.items,
      ...MONETIZATION.vip.balls,
    ];
    for (const id of ids) expect({ id, exists: !!itemById(id) }).toEqual({ id, exists: true });
    // The reward of a milestone is a vehicle that cannot be bought.
    for (const id of Object.values(MONETIZATION.daily.skinMilestones)) expect(itemById(id)?.exclusive).toBeDefined();
  });

  it('every look builds a geometry for a car and for a truck', () => {
    for (const v of vehicles) {
      for (const len of [2, 3] as const) {
        const g = skinGeometry(specOf(v.id), len);
        expect(g.attributes.position.count).toBeGreaterThan(100);
        expect(g.attributes.color.count).toBe(g.attributes.position.count);
      }
    }
  });

  it('every card has a picture, and no two vehicles have the same one', () => {
    const seen = new Map<string, string>();
    for (const v of vehicles) {
      const px = thumbnailPixels('ball', v.id);
      expect(px.length).toBe(THUMB_SIZE * THUMB_SIZE * 4);
      expect(px.some((x, i) => i % 4 === 3 && x > 200)).toBe(true);
      const key = Buffer.from(px).toString('base64');
      expect({ id: v.id, same: seen.get(key) ?? null }).toEqual({ id: v.id, same: null });
      seen.set(key, v.id);
    }
  });

  it('the paints still draw their picture', () => {
    const px = thumbnailPixels('paint', 'rainbow');
    expect(px.some((x, i) => i % 4 === 3 && x > 200)).toBe(true);
  });
});

describe('the texts no longer talk about balls', () => {
  const texts = (o: unknown, path = ''): string[] => (typeof o === 'string' ? [o.replace(/{{[^}]*}}/g, '')] : Object.entries(o as object).flatMap(([k, v]) => texts(v, path ? `${path}.${k}` : k)));
  it('in French', () => {
    const hits = texts(fr).filter((l) => /\bballes?\b/i.test(l));
    expect(hits).toEqual([]);
  });
  it('in English', () => {
    const hits = texts(en).filter((l) => /\bballs?\b/i.test(l) && !l.startsWith('gallery.'));
    expect(hits).toEqual([]);
  });
});
