import type { Gate, Level, Obstacle, OneWay, Vehicle } from '../src/game/types';

type Spec = {
  rows: number;
  cols: number;
  /** [row, col, front direction, length] */
  vehicles: [number, number, Vehicle['dir'], 2 | 3][];
  obstacles?: [number, number][];
  voids?: [number, number][];
  gates?: Gate[];
  oneWays?: OneWay[];
};

/** A small lot for the rule tests. The solution and the statistics are not filled (the tests that need them ask the solver). */
export function lot(spec: Spec): Level {
  const obstacles: Obstacle[] = (spec.obstacles ?? []).map(([r, c]) => ({ r, c, kind: 'post' }));
  return {
    id: 99,
    seed: 0,
    rows: spec.rows,
    cols: spec.cols,
    voids: spec.voids ?? [],
    obstacles,
    vehicles: spec.vehicles.map(([r, c, dir, len], id) => ({ id, r, c, dir, len, color: id % 12 })),
    gates: spec.gates ?? [],
    oneWays: spec.oneWays ?? [],
    solution: [],
    optimal: spec.vehicles.length,
    difficulty: 0,
    layers: 0,
    avgFree: 0,
    avgChain: 0,
    traps: 0,
    fill: 0,
    shape: 'rect',
    mechanics: [],
  };
}
