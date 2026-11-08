import { applyGesture, compile, createState, freeVehicles } from '../src/game/engine';
import { metrics, solve, solveBoard } from '../src/game/solver';
import { lot } from './helpers';

describe('the solver', () => {
  it('finds the free vehicles of the start and an order that empties the lot', () => {
    const level = lot({
      rows: 4,
      cols: 4,
      vehicles: [
        [0, 1, 'R', 2],
        [1, 2, 'D', 2],
        [3, 0, 'L', 3],
      ],
    });
    const s = solve(level);
    expect(s.solvable).toBe(true);
    expect(s.freeAt[0]).toEqual([0, 2]);
    expect(s.order).toHaveLength(3);
    // Round 1: the two free vehicles; round 2: the one they were holding up.
    expect(s.layers).toBe(2);
    expect(s.layerOf).toEqual([1, 2, 1]);
    // Playing the order never collides.
    const board = compile(level);
    const state = createState(board);
    s.order.forEach((id, i) => expect(applyGesture(board, state, id, s.dirs[i]).kind).toBe('exit'));
    expect(state.collisions).toBe(0);
    expect(state.finished).toBe(true);
  });

  it('says a lot cannot be emptied when two vehicles shut each other in', () => {
    // Two cars face to face in one row of a lot closed by obstacles at both ends.
    const level = lot({ rows: 1, cols: 6, vehicles: [[0, 1, 'R', 2], [0, 3, 'L', 2]], obstacles: [[0, 0], [0, 5]] });
    const s = solve(level);
    expect(s.solvable).toBe(false);
    expect(s.stuck).toEqual([0, 1]);
    expect(s.order).toEqual([]);
  });

  it('does not depend on the order in which free vehicles are taken: any free vehicle can go first', () => {
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
    // Taking free vehicles in any order always ends with an empty lot.
    for (const first of freeVehicles(board, state)) {
      const s = createState(board);
      const dir = solveBoard(board, s).dirs[solveBoard(board, s).order.indexOf(first)];
      applyGesture(board, s, first, dir);
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
      // The arrow keeps vehicle 0 from simply leaving by the left.
      oneWays: [{ dir: 'R', lane: 0 }],
    });
    const s = solve(level);
    expect(s.solvable).toBe(true);
    expect(s.freeAt[0]).toEqual([1, 2]); // vehicle 0 is held back by the barrier
    expect(s.order.indexOf(0)).toBe(2);
    expect(s.layerOf[0]).toBe(2);
  });

  it('a barrier that needs more vehicles than there are makes the level unsolvable', () => {
    const level = lot({ rows: 1, cols: 4, vehicles: [[0, 0, 'R', 2]], gates: [{ side: 'R', from: 0, to: 0, need: 2 }], oneWays: [{ dir: 'R', lane: 0 }] });
    expect(solve(level).solvable).toBe(false);
  });

  it('keeps the one-way arrow in account', () => {
    // The only way out to the left is forbidden by the arrow, and the right is shut by an obstacle: stuck.
    const stuck = lot({ rows: 1, cols: 5, vehicles: [[0, 1, 'R', 2]], obstacles: [[0, 4]], oneWays: [{ dir: 'R', lane: 0 }] });
    expect(solve(stuck).solvable).toBe(false);
    // Allowing the left way makes it solvable.
    const ok = lot({ rows: 1, cols: 5, vehicles: [[0, 1, 'R', 2]], obstacles: [[0, 4]], oneWays: [{ dir: 'L', lane: 0 }] });
    expect(solve(ok).solvable).toBe(true);
    expect(solve(ok).dirs).toEqual(['L']);
  });

  it('measures the layers, the free vehicles per state, the chains and the traps', () => {
    const level = lot({
      rows: 4,
      cols: 4,
      vehicles: [
        [0, 1, 'R', 2],
        [1, 2, 'D', 2],
        [3, 0, 'L', 3],
      ],
    });
    const m = metrics(level, solve(level));
    expect(m.layers).toBe(2);
    expect(m.avgChain).toBeCloseTo(1 / 3, 1);
    expect(m.avgFree).toBeGreaterThan(1);
    expect(m.traps).toBe(0);
  });

  it('counts a vehicle that seems free (long empty run) but is shut in both ways as a trap', () => {
    // Vehicle 0 has a run of 2 free cells to its right, then a wall of obstacles, and a car right behind it on the left.
    const level = lot({ rows: 1, cols: 7, vehicles: [[0, 2, 'R', 2], [0, 0, 'R', 2]], obstacles: [[0, 6]] });
    const m = metrics(level, solve(level));
    expect(m.traps).toBe(1);
  });
});
