import { themeForLevel, worldIndexOf } from '../src/core/worlds';

const rgb = (css: string): [number, number, number] => {
  const n = parseInt(css.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const hue = (css: string) => {
  const [r, g, b] = rgb(css).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};
const sat = (css: string) => {
  const [r, g, b] = rgb(css).map((v) => v / 255);
  const max = Math.max(r, g, b);
  return max === 0 ? 0 : (max - Math.min(r, g, b)) / max;
};
const distance = (a: string, b: string) => {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2) / 441.7;
};

const WORLD_OF_INDEX = ['forest', 'meadow', 'autumn', 'snow', 'desert'];

describe('world colours over the whole cycle (levels 1 to 2000)', () => {
  const levels = Array.from({ length: 2000 }, (_, i) => i + 1);

  it('the world follows the level number: 25 levels each, five worlds in a cycle, forever', () => {
    for (const id of levels) {
      expect(themeForLevel(id).id).toBe(WORLD_OF_INDEX[worldIndexOf(id) % 5]);
    }
    expect(worldIndexOf(500)).toBe(19);
    expect(themeForLevel(500).id).toBe('desert');
    expect(themeForLevel(501).id).toBe('forest');
    expect(themeForLevel(1000).id).toBe('desert');
  });

  it('the desert is always sand, never green', () => {
    for (const id of levels.filter((i) => themeForLevel(i).id === 'desert')) {
      const t = themeForLevel(id);
      for (const c of [t.ground.near, t.ground.far]) {
        expect(hue(c)).toBeGreaterThan(30);
        expect(hue(c)).toBeLessThan(50);
      }
    }
  });

  it('the snow is white with a blue tint, in every cycle', () => {
    for (const id of levels.filter((i) => themeForLevel(i).id === 'snow')) {
      const t = themeForLevel(id);
      for (const c of [t.ground.near, t.ground.far]) {
        expect(Math.min(...rgb(c))).toBeGreaterThan(190);
        const [r, , b] = rgb(c);
        expect(b).toBeGreaterThanOrEqual(r); // never warmer than white
        expect(sat(c)).toBeLessThan(0.15);
      }
    }
  });

  it('autumn ground is green-brown and the greens stay green', () => {
    for (const id of levels) {
      const t = themeForLevel(id);
      const h = hue(t.ground.near);
      if (t.id === 'autumn') {
        expect(h).toBeGreaterThan(45);
        expect(h).toBeLessThan(75);
      }
      if (t.id === 'forest' || t.id === 'meadow') {
        expect(h).toBeGreaterThan(80);
        expect(h).toBeLessThan(120);
      }
    }
  });

  it('every world: the ground stands out from the sky behind it, and so does the edge of the island', () => {
    for (const id of levels) {
      const t = themeForLevel(id);
      expect(distance(t.ground.near, t.sky.bottom)).toBeGreaterThan(0.2);
      expect(distance(t.ground.far, t.sky.bottom)).toBeGreaterThan(0.12);
      expect(distance(t.ground.rimTop, t.sky.bottom)).toBeGreaterThan(0.2);
      expect(distance(t.ground.rimBottom, t.sky.bottom)).toBeGreaterThan(0.3);
      // The slice of earth / ice gets darker toward its bottom: its own shadow.
      expect(rgb(t.ground.rimBottom).reduce((a, b) => a + b)).toBeLessThan(rgb(t.ground.rimTop).reduce((a, b) => a + b));
    }
  });

  it('the daily challenge has its own look too', () => {
    const t = themeForLevel(100_001);
    expect(t.id).toBe('daily');
    expect(distance(t.ground.near, t.sky.bottom)).toBeGreaterThan(0.2);
  });
});
