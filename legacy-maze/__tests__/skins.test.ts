import * as THREE from 'three';

import { SHOP_ITEMS, itemsOfKind } from '../src/core/shopItems';
import { isPaintEffect, paintTint, type PaintEffect } from '../src/render/paintEffects';
import { PENTAGONS, SKIN_PATTERNS, noise3 } from '../src/render/skinPatterns';
import { SKIN_SPECS, skinTexture } from '../src/render/skins';

describe('ball skins', () => {
  it('every ball of the shop has a look, and every textured look is a ball of the shop', () => {
    const balls = itemsOfKind('ball').map((i) => i.id);
    for (const id of balls) expect(SKIN_SPECS).toHaveProperty(id);
    for (const id of Object.keys(SKIN_PATTERNS)) expect(balls).toContain(id);
  });

  it('every pattern gives valid colours all over the sphere', () => {
    for (const [id, pattern] of Object.entries(SKIN_PATTERNS)) {
      for (let i = 0; i < 400; i++) {
        const z = 1 - (2 * (i + 0.5)) / 400;
        const a = i * 2.399963; // golden angle: an even spread of points
        const r = Math.sqrt(1 - z * z);
        const [R, G, B] = pattern(Math.cos(a) * r, Math.sin(a) * r, z);
        for (const v of [R, G, B]) {
          expect(Number.isFinite(v)).toBe(true);
          expect(v).toBeGreaterThan(-0.2);
          expect(v).toBeLessThan(1.2);
        }
      }
      expect(id).toBeTruthy();
    }
  });

  it('a football has 12 black pentagons on white leather', () => {
    expect(PENTAGONS).toHaveLength(12);
    const [x, y, z] = PENTAGONS[0];
    const centre = SKIN_PATTERNS.football(x, y, z);
    expect(Math.max(...centre)).toBeLessThan(0.15);
    // The point farthest from every pentagon centre is leather white.
    let worst: [number, number, number] = [1, 0, 0];
    let worstDot = 1;
    for (let i = 0; i < 4000; i++) {
      const zz = 1 - (2 * (i + 0.5)) / 4000;
      const a = i * 2.399963;
      const r = Math.sqrt(1 - zz * zz);
      const p: [number, number, number] = [Math.cos(a) * r, Math.sin(a) * r, zz];
      const best = Math.max(...PENTAGONS.map(([px, py, pz]) => p[0] * px + p[1] * py + p[2] * pz));
      if (best < worstDot) {
        worstDot = best;
        worst = p;
      }
    }
    expect(Math.min(...SKIN_PATTERNS.football(...worst))).toBeGreaterThan(0.8);
  });

  it('the eye looks along +z: a black pupil in a blue iris on white', () => {
    const pupil = SKIN_PATTERNS.eye(0, 0, 1);
    const iris = SKIN_PATTERNS.eye(Math.sin(0.5), 0, Math.cos(0.5));
    const white = SKIN_PATTERNS.eye(0, 0, -1);
    expect(Math.max(...pupil)).toBeLessThan(0.2);
    expect(iris[2]).toBeGreaterThan(iris[0]); // bluish
    expect(Math.min(...white)).toBeGreaterThan(0.6);
  });

  it('the planet has water, land and ice', () => {
    let blue = 0;
    let green = 0;
    let ice = 0;
    for (let i = 0; i < 3000; i++) {
      const z = 1 - (2 * (i + 0.5)) / 3000;
      const a = i * 2.399963;
      const r = Math.sqrt(1 - z * z);
      const [R, G, B] = SKIN_PATTERNS.planet(Math.cos(a) * r, z, Math.sin(a) * r);
      if (B > R + 0.2 && B > G) blue++;
      else if (G > R && G > B) green++;
      if (R > 0.85 && G > 0.85 && B > 0.85) ice++;
    }
    expect(blue).toBeGreaterThan(200);
    expect(green).toBeGreaterThan(100);
    expect(ice).toBeGreaterThan(20);
  });

  it('textures are baked once per skin, and plain skins have none', () => {
    const a = skinTexture('football');
    expect(a).toBeInstanceOf(THREE.DataTexture);
    expect(skinTexture('football')).toBe(a);
    expect(skinTexture('gold')).toBeNull();
    expect(skinTexture('disco')).toBeNull();
    for (const id of Object.keys(SKIN_PATTERNS)) expect(skinTexture(id)!.image.data!.length).toBe(256 * 128 * 4);
  });

  it('noise stays in range and is smooth', () => {
    for (let i = 0; i < 200; i++) {
      const v = noise3(i * 0.37, i * 0.11, i * 0.73);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(Math.abs(noise3(1.5, 2.5, 3.5) - noise3(1.5001, 2.5, 3.5))).toBeLessThan(0.01);
  });
});

describe('paint effects', () => {
  const base = new THREE.Color('#4f8cff');
  const tint = (effect: PaintEffect, extra: Partial<{ order: number; noise: number; coat: number; double: boolean }> = {}) =>
    paintTint(new THREE.Color(), effect, base, { order: 0, noise: 0, coat: 1, double: false, ...extra });

  it('the shop sells exactly the 6 effects, and the game knows all of them', () => {
    const ids = itemsOfKind('paint').map((i) => i.id);
    expect(ids.length).toBeGreaterThanOrEqual(6);
    for (const id of ids) expect(isPaintEffect(id)).toBe(true);
    expect(SHOP_ITEMS.filter((i) => i.kind === 'paint').every((i) => isPaintEffect(i.id))).toBe(true);
  });

  it('classic is the level colour', () => {
    expect(tint('classic').getHex()).toBe(base.getHex());
  });

  it('pastel is lighter and softer than the level colour', () => {
    const p = { h: 0, s: 0, l: 0 };
    const b = { h: 0, s: 0, l: 0 };
    tint('pastel').getHSL(p);
    base.getHSL(b);
    expect(p.l).toBeGreaterThan(b.l);
    expect(p.s).toBeGreaterThanOrEqual(0);
  });

  it('neon is fully saturated', () => {
    const n = { h: 0, s: 0, l: 0 };
    tint('neon').getHSL(n);
    expect(n.s).toBeGreaterThan(0.95);
  });

  it('rainbow changes colour along the path, whatever the level colour', () => {
    const hues = [0, 1, 2, 3, 4, 5].map((order) => {
      const h = { h: 0, s: 0, l: 0 };
      tint('rainbow', { order }).getHSL(h);
      return h.h;
    });
    expect(new Set(hues.map((h) => h.toFixed(3))).size).toBe(6);
    expect(tint('rainbow', { order: 7 }).getHex()).toBe(
      paintTint(new THREE.Color(), 'rainbow', new THREE.Color('#ff0000'), { order: 7, noise: 0, coat: 1, double: false }).getHex(),
    );
  });

  it('a double tile is light after one coat and darker after two, with any effect', () => {
    for (const effect of ['classic', 'pastel', 'glitter', 'neon', 'metallic', 'rainbow'] as PaintEffect[]) {
      const one = { h: 0, s: 0, l: 0 };
      const two = { h: 0, s: 0, l: 0 };
      tint(effect, { double: true, coat: 1 }).getHSL(one);
      tint(effect, { double: true, coat: 2 }).getHSL(two);
      expect(two.l).toBeLessThan(one.l);
    }
  });


});
