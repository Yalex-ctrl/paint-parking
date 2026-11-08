import { applyTap, compile, createState, freeVehicles } from '../src/game/engine';
import { metrics, solve, solveBoard, trapCount } from '../src/game/solver';
import { lot } from './helpers';

const base = () =>
  lot({
    rows: 4,
    cols: 4,
    vehicles: [
      [0, 1, 'R', 2],
      [1, 2, 'D', 2],
      [3, 0, 'L', 3],
    ],
  });

describe('the solver', () => {
  it('finds the free vehicles of the start and an order that empties the lot', () => {
    const level = base();
    const s = solve(level);
    expect(s.solvable).toBe(true);
    expect(s.freeAt[0]).toEqual([0, 2]);
    expect(s.order).toHaveLength(3);
    // Round 1: the two free vehicles; round 2: the one they were holding up.
    expect(s.layers).toBe(2);
    expect(s.layerOf).toEqual([1, 2, 1]);
    // Tapping the order never collides.
    const board = compile(level);
    const state = createState(board);
    for (const id of s.order) expect(applyTap(board, state, id).kind).toBe('exit');
    expect(state.collisions).toBe(0);
    expect(state.finished).toBe(true);
  });

  it('says a lot cannot be emptied when two vehicles face each other', () => {
    // Two cars in one row, each going toward the other: each is in the way of the other for ever.
    const level = lot({
      rows: 1,
      cols: 6,
      vehicles: [
        [0, 1, 'R', 2],
        [0, 3, 'L', 2],
      ],
    });
    const s = solve(level);
    expect(s.solvable).toBe(false);
    expect(s.stuck).toEqual([0, 1]);
    expect(s.order).toEqual([]);
  });

  it('a vehicle blocked by an obstacle where its arrow points can never leave', () => {
    const level = lot({ rows: 1, cols: 5, vehicles: [[0, 0, 'R', 2]], obstacles: [[0, 4]] });
    expect(solve(level).solvable).toBe(false);
    // The same vehicle reversing the other way leaves.
    expect(solve(lot({ rows: 1, cols: 5, vehicles: [[0, 1, 'R', 2, true]], obstacles: [[0, 4]] })).solvable).toBe(true);
  });

  it('does not depend on the order in which free vehicles are tapped: any free vehicle can go first', () => {
    const level = lot({
      rows: 3,
      cols: 3,
      vehicles: [
        [0, 0, 'R', 2],
        [1, 0, 'R', 2],
        [2, 0, 'R', 2],
        [0, 2, 'D', 2],
      ],
    });
    const board = compile(level);
    const state = createState(board);
    for (const first of freeVehicles(board, state)) {
      const s = createState(board);
      applyTap(board, s, first);
      expect(solveBoard(board, s).solvable).toBe(true);
    }
  });

  it('keeps the barrier in account: it counts the vehicles that have already left', () => {
    const level = lot({
      rows: 2,
      cols: 4,
      vehicles: [
        [0, 0, 'R', 2],
        [1, 0, 'R', 2],
        [1, 2, 'R', 2],
      ],
      gates: [{ side: 'R', from: 0, to: 0, need: 2 }],
    });
    const s = solve(level);
    expect(s.solvable).toBe(true);
    expect(s.freeAt[0]).toEqual([2]); // vehicle 0 is held by the barrier, vehicle 1 by vehicle 2
    expect(s.order).toEqual([2, 1, 0]);
    expect(s.layerOf).toEqual([3, 2, 1]);
  });

  it('a barrier that needs more vehicles than there are makes the level unsolvable', () => {
    expect(solve(lot({ rows: 1, cols: 4, vehicles: [[0, 0, 'R', 2]], gates: [{ side: 'R', from: 0, to: 0, need: 2 }] })).solvable).toBe(false);
  });

  it('keeps the one-way arrows in account', () => {
    expect(solve(lot({ rows: 1, cols: 5, vehicles: [[0, 0, 'R', 2]], oneWays: [{ r: 0, c: 3, dir: 'L' }] })).solvable).toBe(false);
    expect(solve(lot({ rows: 1, cols: 5, vehicles: [[0, 0, 'R', 2]], oneWays: [{ r: 0, c: 3, dir: 'R' }] })).solvable).toBe(true);
  });

  it('measures the layers, the free vehicles per state, the chains, the free share and the traps', () => {
    const level = base();
    const m = metrics(level, solve(level));
    expect(m.layers).toBe(2);
    expect(m.avgChain).toBeCloseTo(1 / 3, 1);
    expect(m.avgFree).toBeGreaterThan(1);
    expect(m.freeStart).toBeCloseTo(2 / 3, 1);
    expect(m.traps).toBe(0);
  });

  it('counts a vehicle that looks free (its other way is clear) but is blocked where its arrow points as a trap', () => {
    // Vehicle 0 goes right into vehicle 1; behind it (to the left) the way is clear.
    const level = lot({
      rows: 1,
      cols: 7,
      vehicles: [
        [0, 2, 'R', 2],
        [0, 5, 'R', 2],
      ],
    });
    expect(trapCount(level)).toBe(1);
    expect(solve(level).solvable).toBe(true);
  });
});
