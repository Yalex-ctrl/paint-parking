import { applyTap, compile, createState, freeVehicles, replay, scan } from '../src/game/engine';
import { travelDir } from '../src/game/types';
import { lot } from './helpers';

/*
 * Grid used below (4 rows x 4 columns):
 *   . A A .      vehicle 0: horizontal car at row 0, cols 1-2, front to the right: goes right
 *   . . B .      vehicle 1: vertical car at col 2, rows 1-2, front down: goes down
 *   . . B .
 *   C C C .      vehicle 2: horizontal truck at row 3, cols 0-2, front to the left: goes left
 */
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

describe('tapping a vehicle', () => {
  it('sends it the one way its arrow shows: out of the lot when the way is clear, one move', () => {
    const board = compile(base());
    const state = createState(board);
    expect(applyTap(board, state, 0)).toEqual({ kind: 'exit', vehicle: 0, dir: 'R', steps: 1 });
    expect(state.moves).toBe(1);
    expect(state.collisions).toBe(0);
    expect(state.gone[0]).toBe(1);
    expect(state.exited).toBe(1);
    expect(applyTap(board, state, 2)).toEqual({ kind: 'exit', vehicle: 2, dir: 'L', steps: 0 });
  });

  it('bumps into what is in the way, comes back, and counts a move and a collision', () => {
    const board = compile(base());
    const state = createState(board);
    expect(applyTap(board, state, 1)).toEqual({ kind: 'bump', vehicle: 1, dir: 'D', steps: 0, blocker: { type: 'vehicle', id: 2 } });
    expect(state.moves).toBe(1);
    expect(state.collisions).toBe(1);
    expect(state.gone[1]).toBe(0);
    expect(state.finished).toBe(false);
  });

  it('a vehicle that has already left ignores the tap: no move counted', () => {
    const board = compile(base());
    const state = createState(board);
    applyTap(board, state, 0);
    expect(applyTap(board, state, 0)).toEqual({ kind: 'ignored', reason: 'gone' });
    expect(state.moves).toBe(1);
  });

  it('can go only one way: a vehicle blocked where its arrow points stays blocked, whatever is behind it', () => {
    // Vehicle 1 could leave upward if it were allowed: the place above it is free all the way, but its arrow points down.
    const board = compile(base());
    const state = createState(board);
    expect(travelDir(board.level.vehicles[1])).toBe('D');
    expect(scan(board, state, 1).open).toBe(false);
    expect(applyTap(board, state, 1).kind).toBe('bump');
    expect(applyTap(board, state, 1).kind).toBe('bump');
    expect(state.collisions).toBe(2);
  });

  it('a vehicle whose arrow points to its rear reverses out', () => {
    const level = lot({ rows: 1, cols: 5, vehicles: [[0, 2, 'R', 2, true]] });
    const board = compile(level);
    const state = createState(board);
    // Its front points right, its arrow left: it goes left.
    expect(travelDir(level.vehicles[0])).toBe('L');
    expect(applyTap(board, state, 0)).toEqual({ kind: 'exit', vehicle: 0, dir: 'L', steps: 2 });
  });

  it('the level is finished when every vehicle has left, in one tap each', () => {
    const board = compile(base());
    const state = createState(board);
    applyTap(board, state, 2);
    applyTap(board, state, 1);
    applyTap(board, state, 0);
    expect(state.finished).toBe(true);
    expect(state.moves).toBe(3);
    expect(state.collisions).toBe(0);
  });

  it('a vehicle that left stops being in the way', () => {
    const board = compile(base());
    const state = createState(board);
    expect(scan(board, state, 1).open).toBe(false);
    applyTap(board, state, 2);
    expect(scan(board, state, 1).open).toBe(true);
  });

  it('goes up to the obstacle (steps) before bumping', () => {
    const level = lot({ rows: 1, cols: 6, vehicles: [[0, 0, 'R', 2]], obstacles: [[0, 4]] });
    const board = compile(level);
    const state = createState(board);
    expect(applyTap(board, state, 0)).toEqual({ kind: 'bump', vehicle: 0, dir: 'R', steps: 2, blocker: { type: 'obstacle' } });
  });

  it('a void of the lot shape also stops a vehicle', () => {
    const level = lot({ rows: 3, cols: 3, vehicles: [[2, 0, 'R', 2]], voids: [[2, 2]] });
    const board = compile(level);
    const state = createState(board);
    expect(applyTap(board, state, 0)).toMatchObject({ kind: 'bump', steps: 0, blocker: { type: 'obstacle' } });
  });

  it('taps follow each other: several different vehicles leave one after the other', () => {
    const board = compile(base());
    const state = createState(board);
    const kinds = [2, 0, 1].map((id) => applyTap(board, state, id).kind);
    expect(kinds).toEqual(['exit', 'exit', 'exit']);
    expect(state.moves).toBe(3);
  });
});

describe('free vehicles', () => {
  it('lists the vehicles that can leave right now', () => {
    const board = compile(base());
    expect(freeVehicles(board, createState(board))).toEqual([0, 2]);
  });
});

describe('the barrier', () => {
  const level = () =>
    lot({
      rows: 2,
      cols: 4,
      vehicles: [
        [0, 0, 'R', 2],
        [1, 0, 'R', 2],
        [1, 2, 'R', 2],
      ],
      gates: [{ side: 'R', from: 0, to: 0, need: 2 }],
    });

  it('is shut until enough vehicles have left, then opens', () => {
    const board = compile(level());
    const state = createState(board);
    expect(applyTap(board, state, 0)).toMatchObject({ kind: 'bump', blocker: { type: 'gate', index: 0 } });
    expect(applyTap(board, state, 2)).toMatchObject({ kind: 'exit' }); // lane 1 has no barrier
    expect(applyTap(board, state, 1)).toMatchObject({ kind: 'exit' });
    expect(applyTap(board, state, 0)).toMatchObject({ kind: 'exit' }); // 2 vehicles have left
  });

  it('only closes the lanes it covers, on the side it is on', () => {
    const level2 = lot({ rows: 2, cols: 4, vehicles: [[0, 2, 'R', 2, true]], gates: [{ side: 'R', from: 0, to: 0, need: 2 }] });
    const board = compile(level2);
    const state = createState(board);
    // This vehicle goes left, the barrier is on the right.
    expect(applyTap(board, state, 0)).toMatchObject({ kind: 'exit', dir: 'L' });
  });
});

describe('the one-way arrow', () => {
  it('lets a vehicle over it only the way it shows', () => {
    const wrong = lot({ rows: 1, cols: 5, vehicles: [[0, 0, 'R', 2]], oneWays: [{ r: 0, c: 3, dir: 'L' }] });
    const b1 = compile(wrong);
    expect(applyTap(b1, createState(b1), 0)).toMatchObject({ kind: 'bump', blocker: { type: 'oneWay' }, steps: 1 });
    const right = lot({ rows: 1, cols: 5, vehicles: [[0, 0, 'R', 2]], oneWays: [{ r: 0, c: 3, dir: 'R' }] });
    const b2 = compile(right);
    expect(applyTap(b2, createState(b2), 0)).toMatchObject({ kind: 'exit', steps: 3 });
  });

  it('a vehicle crossing it sideways is stopped too', () => {
    const level = lot({ rows: 3, cols: 3, vehicles: [[0, 1, 'D', 2]], oneWays: [{ r: 2, c: 1, dir: 'R' }] });
    const board = compile(level);
    expect(applyTap(board, createState(board), 0)).toMatchObject({ kind: 'bump', blocker: { type: 'oneWay' } });
  });
});

describe('replay', () => {
  it('taps an order and returns the final state', () => {
    const state = replay(base(), [2, 1, 0]);
    expect(state.finished).toBe(true);
    expect(state.collisions).toBe(0);
  });
});
