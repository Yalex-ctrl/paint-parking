import { applyGesture, applyTap, compile, createState, freeVehicles, openDirs, replay } from '../src/game/engine';
import { lot } from './helpers';

/*
 * Grid used below (4 rows x 4 columns):
 *   . A A .      vehicle 0: horizontal car at row 0, cols 1-2, front to the right
 *   . . B .      vehicle 1: vertical car at col 2, rows 1-2, front down
 *   . . B .
 *   C C C .      vehicle 2: horizontal truck at row 3, cols 0-2, front to the left
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

describe('moving a vehicle', () => {
  it('leaves the lot when the way to the edge is clear, and counts one move', () => {
    const board = compile(base());
    const state = createState(board);
    const r = applyGesture(board, state, 0, 'R');
    expect(r).toEqual({ kind: 'exit', vehicle: 0, dir: 'R', steps: 1 });
    expect(state.moves).toBe(1);
    expect(state.collisions).toBe(0);
    expect(state.gone[0]).toBe(1);
    expect(state.exited).toBe(1);
  });

  it('can leave backward too (a swipe the other way)', () => {
    const board = compile(base());
    const state = createState(board);
    expect(applyGesture(board, state, 0, 'L')).toMatchObject({ kind: 'exit', dir: 'L', steps: 1 });
  });

  it('bumps into the vehicle in the way, comes back and counts a move and a collision', () => {
    const board = compile(base());
    const state = createState(board);
    const r = applyGesture(board, state, 1, 'D');
    expect(r).toEqual({ kind: 'bump', vehicle: 1, dir: 'D', steps: 0, blocker: { type: 'vehicle', id: 2 } });
    expect(state.moves).toBe(1);
    expect(state.collisions).toBe(1);
    expect(state.gone[1]).toBe(0);
    expect(state.finished).toBe(false);
  });

  it('a tap makes the vehicle go forward', () => {
    const board = compile(base());
    const state = createState(board);
    expect(applyTap(board, state, 0)).toMatchObject({ kind: 'exit', dir: 'R' });
    expect(applyTap(board, state, 2)).toMatchObject({ kind: 'exit', dir: 'L', steps: 0 });
  });

  it('ignores a gesture along the other axis: no move counted', () => {
    const board = compile(base());
    const state = createState(board);
    expect(applyGesture(board, state, 0, 'U')).toEqual({ kind: 'ignored', reason: 'offAxis' });
    expect(applyGesture(board, state, 1, 'L')).toEqual({ kind: 'ignored', reason: 'offAxis' });
    expect(state.moves).toBe(0);
    expect(state.collisions).toBe(0);
  });

  it('ignores a gesture on a vehicle that has already left', () => {
    const board = compile(base());
    const state = createState(board);
    applyGesture(board, state, 0, 'R');
    expect(applyGesture(board, state, 0, 'R')).toEqual({ kind: 'ignored', reason: 'gone' });
    expect(state.moves).toBe(1);
  });

  it('the level is finished when every vehicle has left', () => {
    const board = compile(base());
    const state = createState(board);
    applyGesture(board, state, 2, 'L');
    applyGesture(board, state, 1, 'D');
    applyGesture(board, state, 0, 'R');
    expect(state.finished).toBe(true);
    expect(state.moves).toBe(3);
    expect(state.collisions).toBe(0);
  });

  it('a vehicle that left stops being in the way', () => {
    const board = compile(base());
    const state = createState(board);
    expect(openDirs(board, state, 1)).toEqual([]);
    applyGesture(board, state, 2, 'L');
    expect(openDirs(board, state, 1)).toEqual(['D']);
  });

  it('advances up to the obstacle (steps) before bumping', () => {
    const level = lot({ rows: 1, cols: 6, vehicles: [[0, 0, 'R', 2]], obstacles: [[0, 4]] });
    const board = compile(level);
    const state = createState(board);
    expect(applyGesture(board, state, 0, 'R')).toEqual({ kind: 'bump', vehicle: 0, dir: 'R', steps: 2, blocker: { type: 'obstacle' } });
  });

  it('a void of the lot shape also stops a vehicle', () => {
    const level = lot({ rows: 3, cols: 3, vehicles: [[2, 0, 'R', 2]], voids: [[2, 2]] });
    const board = compile(level);
    const state = createState(board);
    expect(applyGesture(board, state, 0, 'R')).toMatchObject({ kind: 'bump', steps: 0, blocker: { type: 'obstacle' } });
  });
});

describe('free vehicles', () => {
  it('lists the vehicles that can leave right now', () => {
    const board = compile(base());
    const state = createState(board);
    expect(freeVehicles(board, state)).toEqual([0, 2]);
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
    expect(applyGesture(board, state, 0, 'R')).toMatchObject({ kind: 'bump', blocker: { type: 'gate', index: 0 } });
    expect(applyGesture(board, state, 2, 'R')).toMatchObject({ kind: 'exit' }); // lane 1 has no barrier
    expect(applyGesture(board, state, 1, 'R')).toMatchObject({ kind: 'exit' });
    expect(applyGesture(board, state, 0, 'R')).toMatchObject({ kind: 'exit' }); // 2 vehicles have left
  });

  it('only closes the lanes it covers, on the side it is on', () => {
    const board = compile(level());
    const state = createState(board);
    expect(applyGesture(board, state, 0, 'L')).toMatchObject({ kind: 'exit' });
  });
});

describe('the one-way arrow', () => {
  it('allows leaving only in the direction of the arrow', () => {
    const level = lot({ rows: 1, cols: 4, vehicles: [[0, 1, 'R', 2]], oneWays: [{ dir: 'R', lane: 0 }] });
    const board = compile(level);
    const state = createState(board);
    expect(applyGesture(board, state, 0, 'L')).toMatchObject({ kind: 'bump', blocker: { type: 'oneWay' }, steps: 1 });
    expect(applyGesture(board, state, 0, 'R')).toMatchObject({ kind: 'exit' });
  });
});

describe('replay', () => {
  it('plays an order and returns the final state', () => {
    const state = replay(base(), [2, 1, 0]);
    expect(state.finished).toBe(true);
    expect(state.collisions).toBe(0);
  });
});
