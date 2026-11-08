import { measure } from '../src/game/engine';
import { emptyFeatures, type Dir, type Features, type Level } from '../src/game/types';

/**
 * A tiny hand-made level. `grid` includes the outer ring ('#' wall, '.' floor); the exit is on the
 * ring (by default a corner nobody can reach, so movement tests are not affected by it).
 */
export function makeLevel(
  grid: string[],
  start: [number, number],
  features: Partial<Features> = {},
  exit: { r: number; c: number; dir: Dir } = { r: 0, c: 0, dir: 'U' },
): Level {
  const f: Features = { ...emptyFeatures(), ...features };
  const { floorCount, layers } = measure(grid, f);
  return {
    id: 0,
    seed: 0,
    rows: grid.length,
    cols: grid[0].length,
    grid,
    start,
    exit,
    color: '#ff4d6d',
    solution: '',
    difficulty: 0,
    floorCount,
    layers,
    deadEnds: 0,
    branches: 0,
    features: f,
    mechanics: [],
  };
}
