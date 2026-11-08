import levelsJson from '../assets/levels.json';
import { applyMove, createState } from '../src/game/engine';
import type { Dir, Level } from '../src/game/types';
import { GROUND_Y, WALL_H, cellX, cellZ } from '../src/render/coords';
import { DecalPool, ParticlePool, SPLASH_LIMIT, hexOf } from '../src/core/render/ParticlePool';
import { BoardSurface } from '../src/render/surface';

const levels = levelsJson as unknown as Level[];

type Stain = { x: number; y: number; z: number; radius: number; hex: number };

/** Replays a level's solution through the real engine, splashing along every slide, and returns every stain created. */
function simulate(level: Level, withDebris = false) {
  const surface = new BoardSurface(level);
  const pool = new ParticlePool(190);
  pool.setPaintColor(level.color);
  const decals = new DecalPool(40);
  const stains: Stain[] = [];
  const add = decals.add.bind(decals);
  decals.add = (x, y, z, nx, ny, nz, radius, hex) => {
    stains.push({ x, y, z, radius, hex });
    add(x, y, z, nx, ny, nz, radius, hex);
  };

  let farthest = 0;
  const step = (n: number) => {
    for (let i = 0; i < n; i++) {
      pool.update(1 / 60, surface, decals);
      for (let k = 0; k < pool.size; k++) {
        if (pool.life[k] > 0) farthest = Math.max(farthest, surface.distOutside(pool.x[k], pool.z[k]));
      }
    }
  };

  const state = createState(level);
  for (const m of level.solution) {
    const res = applyMove(level, state, m as Dir);
    if (!res) continue;
    for (const s of res.steps) {
      pool.trail(cellX(level, s.cell[1]), cellZ(level, s.cell[0]), s.dir);
      step(3);
    }
    if (res.reason !== 'exit') {
      pool.impact(cellX(level, res.end[1]), cellZ(level, res.end[0]), res.lastDir);
      if (withDebris) pool.debris(cellX(level, res.end[1]), cellZ(level, res.end[0]));
    }
    step(90);
  }
  return { stains, surface, farthest };
}

describe('paint splashes', () => {
  it.each([1, 20, 50, 80, 100])('level %p: stains only on wall tops and the grass next to the board, never on floor cells', (id) => {
    const level = levels[id - 1];
    const { stains, surface } = simulate(level);
    expect(stains.length).toBeGreaterThan(0);
    for (const s of stains) {
      const kind = surface.kind(s.x, s.z);
      expect(kind).not.toBe('floor');
      if (kind === 'wall') expect(s.y).toBeCloseTo(WALL_H + 0.006, 3); // top of a wall
      else {
        expect(s.y).toBeCloseTo(GROUND_Y + 0.006, 3); // the grass
        expect(surface.distOutside(s.x, s.z)).toBeLessThanOrEqual(1.05); // close to the board
      }
    }
  });

  it('stains take the colour of the level', () => {
    const level = levels[99];
    const { stains } = simulate(level);
    for (const s of stains) expect(s.hex).toBe(hexOf(level.color));
  });

  it('keeps stains small and droplets within ~1 cell of the board', () => {
    for (const id of [10, 20, 60, 99]) {
      const { stains, farthest } = simulate(levels[id - 1]);
      for (const s of stains) expect(s.radius).toBeLessThan(0.22);
      expect(farthest).toBeLessThanOrEqual(1.35); // range + one frame of travel
    }
  });

  it('the landing splash stays within one cell of the start tile', () => {
    for (const id of [1, 50, 99]) {
      const level = levels[id - 1];
      const surface = new BoardSurface(level);
      const pool = new ParticlePool(190);
      const decals = new DecalPool(40);
      const x = cellX(level, level.start[1]);
      const z = cellZ(level, level.start[0]);
      pool.splash(x, 0.2, z);
      let farthest = 0;
      for (let i = 0; i < 150; i++) {
        pool.update(1 / 60, surface, decals);
        for (let k = 0; k < pool.size; k++) {
          if (pool.life[k] > 0) farthest = Math.max(farthest, Math.hypot(pool.x[k] - x, pool.z[k] - z));
        }
      }
      expect(farthest).toBeGreaterThan(0.3); // it does splash
      expect(farthest).toBeLessThanOrEqual(SPLASH_LIMIT);
    }
  });

  it('wood splinters never leave stains', () => {
    const level = levels[80];
    const surface = new BoardSurface(level);
    const pool = new ParticlePool(80);
    const decals = new DecalPool(40);
    let stains = 0;
    const add = decals.add.bind(decals);
    decals.add = (...args) => {
      stains++;
      add(...args);
    };
    for (let k = 0; k < 10; k++) pool.debris(0, 0);
    for (let i = 0; i < 120; i++) pool.update(1 / 60, surface, decals);
    expect(stains).toBe(0);
  });

  it('caps the stains on screen at 40, replacing the oldest', () => {
    const decals = new DecalPool(40);
    for (let i = 0; i < 200; i++) decals.add(i, 0, 0, 0, 1, 0, 0.1, 0xffffff);
    // Ring buffer: the pool only ever holds `size` distinct slots.
    expect(decals.size).toBe(40);
    const slots = new Set(decals.fresh);
    expect(slots.size).toBe(40);
  });
});
