import * as THREE from 'three';

import { setFeatureOverride } from '../src/core/config/features';
import { MONETIZATION } from '../src/core/config/monetization';
import { PROFILE_VERSION, defaultProfile, normalizeProfile } from '../src/core/economy';
import {
  STEP,
  catchMapCoin,
  chestLevel,
  chestState,
  levelAtZ,
  levelPoint,
  mapCoinsLeft,
  openChest,
  padState,
  visibleLevels,
  worldFirstLevel,
  worldLastLevel,
  worldOfLevel,
  worldsInWindow,
} from '../src/game/mapLayout';
import { themeForLevel } from '../src/core/worlds';
import { planMapDecor } from '../src/render/map/mapDecor';
import { numberGeometry, pathRibbon, starGeometry, worldGround } from '../src/render/map/mapGeometry';

const done = (upTo: number) => Object.fromEntries(Array.from({ length: upTo }, (_, i) => [i + 1, 3]));

describe('map layout', () => {
  it('level 1 is at the bottom, each next level is one STEP further up, and the path winds within bounds', () => {
    expect(levelPoint(1).z).toBeCloseTo(0, 9);
    for (let n = 1; n < 600; n++) {
      expect(levelPoint(n + 1).z).toBeCloseTo(levelPoint(n).z - STEP, 6);
      expect(Math.abs(levelPoint(n).x)).toBeLessThan(3.4);
      // Consecutive pads never overlap (the pad radius is under a step).
      expect(Math.hypot(levelPoint(n + 1).x - levelPoint(n).x, STEP)).toBeGreaterThan(1.5);
    }
    expect(levelAtZ(levelPoint(37).z)).toBeCloseTo(37, 6);
  });

  it('worlds are 25 levels each and the window never loads more than two of them', () => {
    expect(worldOfLevel(1)).toBe(0);
    expect(worldOfLevel(25)).toBe(0);
    expect(worldOfLevel(26)).toBe(1);
    expect(worldFirstLevel(4)).toBe(101);
    expect(worldLastLevel(4)).toBe(125);
    for (let focus = 1; focus < 700; focus++) {
      const { from, to } = visibleLevels(focus);
      expect(worldsInWindow(from, to).length).toBeLessThanOrEqual(2);
    }
  });

  it('a pad is done, current or locked', () => {
    const stars = done(4);
    expect(padState(3, 5, stars)).toBe('done');
    expect(padState(5, 5, stars)).toBe('current');
    // The developer mode that opens every level is off here (it is on by default in a development build).
    setFeatureOverride({ openLevels: false });
    expect(padState(9, 5, stars)).toBe('locked');
    setFeatureOverride({ openLevels: true });
    expect(padState(9, 5, stars)).toBe('done');
    setFeatureOverride({ openLevels: false });
  });
});

describe('chests', () => {
  it('there is one every 10 levels, locked until the 10 levels before it are done', () => {
    expect(chestLevel(1)).toBe(10);
    expect(chestLevel(3)).toBe(30);
    expect(chestState(1, done(9), [])).toBe('locked');
    expect(chestState(1, done(10), [])).toBe('ready');
    expect(chestState(2, done(10), [])).toBe('locked');
    expect(chestState(1, done(10), [1])).toBe('opened');
  });

  it('opens once, pays its coins once, and not before it is ready', () => {
    const p = defaultProfile();
    expect(openChest(p, 1, done(9))).toBeNull();
    const first = openChest(p, 1, done(10))!;
    const third = Math.floor(MONETIZATION.map.chestCoins * MONETIZATION.coinEarnMultiplier);
    expect(first.coins).toBe(third);
    expect(first.profile.coins).toBe(third);
    expect(first.profile.chestsOpened).toEqual([1]);
    expect(openChest(first.profile, 1, done(10))).toBeNull();
    expect(normalizeProfile({ version: PROFILE_VERSION, chestsOpened: [2] }).chestsOpened).toEqual([2]);
  });
});

describe('coins flying over the map', () => {
  it('pays 1 for a coin (a giant one counts for its value, also 1), at most 5 a day', () => {
    let p = defaultProfile();
    const day = '2026-05-10';
    expect(MONETIZATION.map.flyingCoinsPerDay).toBe(5);
    expect(MONETIZATION.map.giantCoinValue).toBe(1);
    expect(mapCoinsLeft(p, day)).toBe(MONETIZATION.map.flyingCoinsPerDay);
    for (let i = 0; i < 4; i++) p = catchMapCoin(p, day, 1).profile;
    expect(p.coins).toBe(4);
    const giant = catchMapCoin(p, day, MONETIZATION.map.giantCoinValue);
    expect(giant.paid).toBe(1); // only what is left of the day's 5
    expect(giant.profile.coins).toBe(5);
    const more = catchMapCoin(giant.profile, day, 1);
    expect(more.paid).toBe(0);
    expect(more.profile).toBe(giant.profile);
  });

  it('the quota starts again the next day', () => {
    let p = defaultProfile();
    for (let i = 0; i < 5; i++) p = catchMapCoin(p, '2026-05-10', 1).profile;
    expect(mapCoinsLeft(p, '2026-05-10')).toBe(0);
    expect(mapCoinsLeft(p, '2026-05-11')).toBe(5);
    expect(catchMapCoin(p, '2026-05-11', 1).paid).toBe(1);
  });
});

describe('map geometry', () => {
  it('numbers are blocks of cubes, centred, lying flat, and cached', () => {
    const g = numberGeometry('128');
    g.computeBoundingBox();
    const box = g.boundingBox!;
    expect(box.max.x + box.min.x).toBeCloseTo(0, 5);
    expect(box.max.y - box.min.y).toBeCloseTo(0.1, 5); // flat: only the thickness of a cube
    expect(box.max.z - box.min.z).toBeGreaterThan(0.4); // five cubes tall
    expect(numberGeometry('128')).toBe(g);
    expect(numberGeometry('7').getAttribute('position').count).toBeLessThan(g.getAttribute('position').count);
    const wide = numberGeometry('1000');
    wide.computeBoundingBox();
    expect(wide.boundingBox!.max.x - wide.boundingBox!.min.x).toBeGreaterThan(1.4);
  });

  it('a star is a solid 5-pointed shape', () => {
    const g = starGeometry();
    g.computeBoundingBox();
    expect(g.boundingBox!.max.y).toBeCloseTo(0.26, 1);
    expect(g.getAttribute('position').count).toBeGreaterThan(30);
  });

  it('the ground blends from the previous world into this one, and faces up', () => {
    const near = new THREE.Color('#ffffff');
    const far = new THREE.Color('#ffffff');
    const prev = new THREE.Color('#000000');
    const g = worldGround(26, 50, near, far, prev, prev);
    const pos = g.getAttribute('position');
    const col = g.getAttribute('color');
    let first = 0;
    let last = 0;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getZ(i) === pos.getZ(0)) first = Math.max(first, col.getX(i));
      if (pos.getZ(i) === pos.getZ(pos.count - 1)) last = Math.max(last, col.getX(i));
    }
    expect(first).toBeLessThan(0.2); // still the old world
    expect(last).toBeGreaterThan(0.9); // fully the new one
    expect(g.getAttribute('normal').getY(0)).toBeGreaterThan(0.9);
  });

  it('the path ribbon follows the pads and lies flat facing up', () => {
    const r = pathRibbon(1, 6, 1.6, new THREE.Color('#aaaa88'), new THREE.Color('#999977'));
    const pos = r.getAttribute('position');
    const n = r.getAttribute('normal');
    for (let i = 0; i < pos.count; i += 7) expect(n.getY(i)).toBeGreaterThan(0.9);
    // The ribbon passes through the first pad.
    let nearest = Infinity;
    for (let i = 0; i < pos.count; i++) nearest = Math.min(nearest, Math.hypot(pos.getX(i) - levelPoint(1).x, pos.getZ(i) - levelPoint(1).z));
    expect(nearest).toBeLessThan(1);
  });
});

describe('map scenery', () => {
  it.each([0, 1, 2, 3, 4, 5, 19])('world %p has plenty of scenery, none of it on the path', (w) => {
    const theme = themeForLevel(worldFirstLevel(w));
    const plan = planMapDecor(w, theme);
    expect(plan.length).toBeGreaterThan(30);
    for (const p of plan) {
      const path = levelPoint(levelAtZ(p.z));
      expect(Math.abs(p.x - path.x)).toBeGreaterThan(1.7);
    }
    // Deterministic.
    expect(planMapDecor(w, theme).length).toBe(plan.length);
  });

  it('each world has its own kind of scenery', () => {
    const names = (w: number) => new Set(planMapDecor(w, themeForLevel(worldFirstLevel(w))).map((p) => p.model.name));
    expect([...names(4)].some((n) => n.startsWith('cactus'))).toBe(true);
    expect([...names(0)].some((n) => n.startsWith('cactus'))).toBe(false);
    for (const n of names(3)) if (n.startsWith('tree_')) expect(['tree_pineTallA', 'tree_small']).toContain(n);
  });
});
