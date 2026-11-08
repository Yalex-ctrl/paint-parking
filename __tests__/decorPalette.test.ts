import { readFileSync } from 'fs';
import { join } from 'path';
import * as THREE from 'three';

import { DECOR_MODELS } from '../src/core/render/decor/catalog';
import { NATURAL_COLORS } from '../src/core/render/decor/palette';
import { FLOWER_HEADS, proceduralParts } from '../src/core/render/decor/procedural';

/** Material names of a .glb, read straight from its JSON chunk. */
function materialNames(name: string): string[] {
  const b = readFileSync(join(__dirname, '../assets/models', `${name}.glb`));
  const json = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString()) as { materials?: { name: string }[] };
  return (json.materials ?? []).map((m) => m.name);
}

const hsl = (css: string) => {
  const out = { h: 0, s: 0, l: 0 };
  new THREE.Color(css).getHSL(out, THREE.SRGBColorSpace);
  return { h: out.h * 360, s: out.s, l: out.l };
};

describe('decor colours', () => {
  it('every material of every model has a natural colour assigned by name', () => {
    for (const m of DECOR_MODELS.filter((x) => !x.procedural)) {
      for (const name of materialNames(m.name)) expect(NATURAL_COLORS).toHaveProperty(name);
    }
  });

  it('bark is brown, leaves are green, stone is grey (no turquoise, no pink)', () => {
    for (const name of ['woodBark', 'woodBarkDark']) {
      const c = hsl(NATURAL_COLORS[name]);
      expect(c.h).toBeGreaterThan(15);
      expect(c.h).toBeLessThan(45);
      expect(c.l).toBeLessThan(0.45); // dark brown
    }
    for (const name of ['leafsGreen', 'leafsDark']) {
      const c = hsl(NATURAL_COLORS[name]);
      expect(c.h).toBeGreaterThan(85);
      expect(c.h).toBeLessThan(140); // green, not the kit's turquoise (~170)
    }
    for (const name of ['stone', '_defaultMat']) expect(hsl(NATURAL_COLORS[name]).s).toBeLessThan(0.15);
    expect(hsl(NATURAL_COLORS.woodInner).h).toBeLessThan(50); // cut wood is pale, still warm
  });

  it('the greenery is green and the flowers are not yellow or orange', () => {
    for (const name of ['bush_round', 'bush_wide', 'grass_tall']) {
      const color = proceduralParts(name)[0].geometry.getAttribute('color');
      const c = new THREE.Color();
      for (let i = 0; i < color.count; i++) {
        c.setRGB(color.getX(i), color.getY(i), color.getZ(i), THREE.LinearSRGBColorSpace);
        const out = { h: 0, s: 0, l: 0 };
        c.getHSL(out, THREE.SRGBColorSpace);
        expect(out.h * 360).toBeGreaterThan(85);
        expect(out.h * 360).toBeLessThan(140);
      }
    }
    // (white has no hue to speak of)
    for (const [name, css] of Object.entries(FLOWER_HEADS)) {
      if (name === 'flowers_white') continue;
      const { h } = hsl(css);
      expect(h < 15 || h > 70).toBe(true);
    }
  });

  it('only solid pieces: no flat leafy bushes, grass blades or kit flowers', () => {
    for (const m of DECOR_MODELS) expect(m.name).toMatch(/^(tree_|stone_|stump_|cactus_|dune_|bush_|flowers_|grass_tall)/);
  });
});
