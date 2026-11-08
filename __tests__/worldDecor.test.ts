import levelsJson from '../assets/levels.json';
import { themeForLevel } from '../src/game/worlds';
import type { Level } from '../src/game/types';
import { planDecor, worldOk } from '../src/render/decor/placement';
import { FOREST_GROUND, groundColors } from '../src/render/island';

const levels = levelsJson as unknown as Level[];

/** Names of the pieces planned around a handful of levels of the world that level 'first' opens. */
function piecesIn(first: number): string[] {
  const theme = themeForLevel(first);
  const names: string[] = [];
  for (let id = first; id < first + 12; id++) for (const p of planDecor(levels[(id - 1) % levels.length], () => true, theme.decor)) names.push(p.model.name);
  return names;
}

describe('decor by world', () => {
  it('the desert is cacti and stones, with no tree at all', () => {
    const names = piecesIn(101);
    expect(names.some((n) => n.startsWith('cactus_'))).toBe(true);
    expect(names.some((n) => n.startsWith('tree_'))).toBe(false);
  });

  it('the snow world only has firs and small trees', () => {
    const trees = piecesIn(76).filter((n) => n.startsWith('tree_'));
    expect(trees.length).toBeGreaterThan(0);
    for (const t of trees) expect(['tree_pineTallA', 'tree_small']).toContain(t);
  });

  it('the meadow has many more flowers than the forest, and cacti only grow in the desert', () => {
    const flowers = (names: string[]) => names.filter((n) => n.startsWith('flowers_')).length;
    expect(flowers(piecesIn(26))).toBeGreaterThan(flowers(piecesIn(1)));
    for (const first of [1, 26, 51, 76]) expect(piecesIn(first).some((n) => n.startsWith('cactus_'))).toBe(false);
  });

  it('whatever the world, nothing is ever planted on the board or in the exit lane', () => {
    for (const first of [1, 26, 51, 76, 101]) {
      const theme = themeForLevel(first);
      for (let id = first; id < first + 6; id++) {
        for (const p of planDecor(levels[(id - 1) % levels.length], () => true, theme.decor)) expect(worldOk(levels[(id - 1) % levels.length], p)).toBe(true);
      }
    }
  });

  it('each world has its own ground colour', () => {
    const grounds = [1, 26, 51, 76, 101].map((id) => groundColors(themeForLevel(id).ground).near.getHexString());
    expect(new Set(grounds).size).toBe(5);
    expect(groundColors({ near: '#6f9a58', far: '#4c7a45' }).near.getHex()).toBe(FOREST_GROUND.near.getHex());
  });
});
