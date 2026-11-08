import { DELTA, OPPOSITE, axisOf, type Dir } from '../core/grid';

export { DELTA, DIRS, OPPOSITE, axisOf, type Cell, type Dir } from '../core/grid';

/** The mechanics that are introduced one after the other. */
export type Mechanic = 'obstacle' | 'truck' | 'gate' | 'oneWay';

/** In the order they are introduced. */
export const MECHANICS: readonly Mechanic[] = ['obstacle', 'truck', 'gate', 'oneWay'];

/** Level number at which each mechanic is introduced (by a tutorial level where it is alone and necessary). */
export const UNLOCK_LEVEL: Record<Mechanic, number> = {
  obstacle: 8,
  truck: 15,
  gate: 25,
  oneWay: 35,
};

/** A tutorial bubble: the first level of a mechanic. */
export type Tutorial = Mechanic;

/** Fixed objects: bollards, potted trees, posts. They never move. */
export type ObstacleKind = 'post' | 'planter' | 'bollard';
export const OBSTACLE_KINDS: readonly ObstacleKind[] = ['post', 'planter', 'bollard'];

/** How many body colours the renderer paints vehicles with (the index is `Vehicle.color`). */
export const VEHICLE_COLORS = 12;

/**
 * A vehicle: 2 cells (car) or 3 cells (truck) in a line, one cell wide. `r`, `c` is its top-left cell; `dir` is where its front
 * points, which also gives its axis (L / R = horizontal, U / D = vertical).
 *
 * A vehicle has ONE way to go, painted as an arrow on its roof: toward its front, or (`back`) toward its rear, in which case it
 * reverses out. A tap sends it that way; it can never go the other way.
 */
export type Vehicle = {
  id: number;
  r: number;
  c: number;
  dir: Dir;
  len: 2 | 3;
  color: number;
  /** True when the arrow points to the rear: the vehicle reverses. */
  back?: boolean;
};

export type Obstacle = { r: number; c: number; kind: ObstacleKind };

/**
 * A barrier that closes a part of the edge: the lanes `from`..`to` (rows for L / R, columns for U / D) of the side `side`. It opens
 * once `need` vehicles have left the lot, whichever lane they used.
 */
export type Gate = { side: Dir; from: number; to: number; need: number };

/**
 * A one-way arrow painted on a place: a vehicle may only drive over this place in the direction of the arrow; going over it in
 * any other direction is as good as hitting a wall. No vehicle is parked on it.
 */
export type OneWay = { r: number; c: number; dir: Dir };

export type LotShape = 'rect' | 'L' | 'cross' | 'islands';

export type Level = {
  id: number;
  seed: number;
  rows: number;
  cols: number;
  /** Cells that are not parking places (the missing corner of an L, the arms of a cross): nothing can enter them. */
  voids: [number, number][];
  obstacles: Obstacle[];
  vehicles: Vehicle[];
  gates: Gate[];
  oneWays: OneWay[];
  /** Vehicle ids in an order that empties the lot without a single collision (worked out by the solver). */
  solution: number[];
  /** The fewest moves: one tap per vehicle. */
  optimal: number;
  difficulty: number;
  /** Rounds of removal when every free vehicle leaves at each round. */
  layers: number;
  /** Mean number of free vehicles per state along the solution. */
  avgFree: number;
  /** Mean length of the chains of blocking vehicles. */
  avgChain: number;
  /** Vehicles that look free (their other way is clear) but are blocked where their arrow points. */
  traps: number;
  /** Share of the places taken by vehicles, 0..1. */
  fill: number;
  /** Share of the vehicles that can leave at the start, 0..1. */
  freeStart: number;
  shape: LotShape;
  mechanics: Mechanic[];
  /** Set on the first level of a mechanic: shows its one-time explanation. */
  tutorial?: Tutorial;
};

export const isHorizontal = (v: Pick<Vehicle, 'dir'>): boolean => axisOf(v.dir) === 'H';

/** The cells a vehicle covers. */
export function vehicleCells(v: Vehicle): [number, number][] {
  const out: [number, number][] = [];
  const horizontal = isHorizontal(v);
  for (let i = 0; i < v.len; i++) out.push(horizontal ? [v.r, v.c + i] : [v.r + i, v.c]);
  return out;
}

/** The way a vehicle drives when tapped: toward its front, or toward its rear when it reverses. */
export const travelDir = (v: Pick<Vehicle, 'dir' | 'back'>): Dir => (v.back ? OPPOSITE[v.dir] : v.dir);

/** The cell at the head of a vehicle driving in `dir`. */
export function leadCell(v: Vehicle, dir: Dir): [number, number] {
  const [dr, dc] = DELTA[dir];
  const horizontal = isHorizontal(v);
  const offset = horizontal ? (dc > 0 ? v.len - 1 : 0) : dr > 0 ? v.len - 1 : 0;
  return horizontal ? [v.r, v.c + offset] : [v.r + offset, v.c];
}

/** The row (horizontal vehicle) or column (vertical vehicle) a vehicle drives along. */
export const laneOf = (v: Pick<Vehicle, 'dir' | 'r' | 'c'>): number => (axisOf(v.dir) === 'H' ? v.r : v.c);

/** The mechanics a level really holds, in the order they are introduced. */
export function mechanicsOf(level: Pick<Level, 'obstacles' | 'vehicles' | 'gates' | 'oneWays'>): Mechanic[] {
  return MECHANICS.filter((m) => {
    switch (m) {
      case 'obstacle':
        return level.obstacles.length > 0;
      case 'truck':
        return level.vehicles.some((v) => v.len === 3);
      case 'gate':
        return level.gates.length > 0;
      case 'oneWay':
        return level.oneWays.length > 0;
    }
  });
}
