import { CAMPAIGN_MECHANICS, UNLOCK_LEVEL } from '../src/game/types';
import {
  DAILY_LEVEL_BASE,
  isDailyLevelId,
  isNewWorldStart,
  mechanicsNewInWorld,
  shiftHue,
  themeForLevel,
  worldIndexOf,
  worldProgress,
} from '../src/core/worlds';

describe('worlds', () => {
  it('changes every 25 levels', () => {
    expect([1, 25].map(worldIndexOf)).toEqual([0, 0]);
    expect([26, 50].map(worldIndexOf)).toEqual([1, 1]);
    expect([51, 100, 101, 125].map(worldIndexOf)).toEqual([2, 3, 4, 4]);
    expect(worldIndexOf(126)).toBe(5);
    expect(worldIndexOf(500)).toBe(19);
  });

  it('has five distinct worlds: forest, flowery meadow, autumn, snow, desert', () => {
    const names = [1, 26, 51, 76, 101].map((id) => themeForLevel(id).name);
    expect(names).toEqual(['Forêt', 'Prairie fleurie', 'Automne', 'Neige', 'Désert']);
    const ground = new Set([1, 26, 51, 76, 101].map((id) => themeForLevel(id).ground.near));
    const sky = new Set([1, 26, 51, 76, 101].map((id) => themeForLevel(id).sky.top));
    expect(ground.size).toBe(5);
    expect(sky.size).toBe(5);
    // the same world for all of its 25 levels
    for (let id = 26; id <= 50; id++) expect(themeForLevel(id)).toBe(themeForLevel(26));
  });

  it('gives each world its own ambiance: white snow, sand desert, orange autumn leaves', () => {
    const near = (id: number) => themeForLevel(id).ground.near;
    const channel = (css: string) => [1, 3, 5].map((i) => parseInt(css.slice(i, i + 2), 16));
    const [sr, sg, sb] = channel(near(76));
    expect(Math.min(sr, sg, sb)).toBeGreaterThan(220); // snow is almost white
    const [dr, dg, db] = channel(near(101));
    expect(dr).toBeGreaterThan(dg);
    expect(dg).toBeGreaterThan(db); // sand: red > green > blue
    const [lr, lg, lb] = channel(themeForLevel(51).foliage.leaves);
    expect(lr).toBeGreaterThan(lg);
    expect(lg).toBeGreaterThan(lb); // orange leaves
    expect(themeForLevel(1).foliage.leaves).not.toBe(themeForLevel(51).foliage.leaves);
  });

  it('picks decor to fit: pines in the snow, cacti in the desert, flowers in the meadow', () => {
    expect(themeForLevel(76).decor.onlyTrees).toEqual(expect.arrayContaining(['tree_pineTallA']));
    expect(themeForLevel(76).decor.weights.flower ?? 0).toBe(0);
    expect(themeForLevel(101).decor.weights.cactus ?? 0).toBeGreaterThan(0);
    expect(themeForLevel(101).decor.weights.tree ?? 0).toBe(0);
    const meadow = themeForLevel(26).decor.weights;
    expect(meadow.flower ?? 0).toBeGreaterThan(meadow.tree ?? 0);
    expect(themeForLevel(1).decor.weights.tree ?? 0).toBeGreaterThan(themeForLevel(1).decor.weights.flower ?? 0);
  });

  it('repeats the cycle with colour variants', () => {
    const first = themeForLevel(1);
    const second = themeForLevel(126); // 6th world: the forest again
    expect(second.id).toBe(first.id);
    expect(second.name).toBe('Forêt II');
    expect(second.ground.near).not.toBe(first.ground.near);
    expect(themeForLevel(251).name).toBe('Forêt III');
    // the snow stays white
    expect(themeForLevel(201).ground.near).toBe(themeForLevel(76).ground.near);
    expect(themeForLevel(201).name).toBe('Neige II');
  });

  it('tracks progress inside a world, for the bar shown between two levels', () => {
    expect(worldProgress(1)).toMatchObject({ world: 0, levelInWorld: 1, total: 25 });
    expect(worldProgress(25)).toMatchObject({ world: 0, levelInWorld: 25, fraction: 1 });
    expect(worldProgress(26)).toMatchObject({ world: 1, levelInWorld: 1 });
    expect(worldProgress(40).fraction).toBeCloseTo(15 / 25);
  });

  it('knows when a new world starts and what is new in it', () => {
    expect(isNewWorldStart(1)).toBe(false);
    expect(isNewWorldStart(26)).toBe(true);
    expect(isNewWorldStart(27)).toBe(false);
    expect(isNewWorldStart(51)).toBe(true);
    // The mechanics come at levels 3, 12, 25, 40, 60 and 80, in the middle of worlds: no world starts with a new one.
    expect([1, 2, 3, 4, 5, 6].flatMap(mechanicsNewInWorld)).toEqual([]);
    for (const m of CAMPAIGN_MECHANICS) expect(UNLOCK_LEVEL[m] % 25).not.toBe(1);
  });

  it('gives the daily challenge a look of its own', () => {
    expect(isDailyLevelId(DAILY_LEVEL_BASE + 12)).toBe(true);
    expect(isDailyLevelId(500)).toBe(false);
    expect(themeForLevel(DAILY_LEVEL_BASE + 12).id).toBe('daily');
  });

  it('rotates a hue without touching what has none', () => {
    expect(shiftHue('#808080', 90)).toBe('#808080');
    expect(shiftHue('#ff0000', 120)).toBe('#00ff00');
    expect(shiftHue('#ff0000', 0)).toBe('#ff0000');
    expect(shiftHue('#4f9a3c', 360)).toBe('#4f9a3c');
  });
});
