import { applyMove, createState } from '../src/game/engine';
import { solve } from '../src/game/solver';
import { verifyLevel } from '../src/game/generator';
import { LEVELS } from '../src/game/levels';
import { DAILY_LEVELS } from '../src/game/dailyLevels';
import type { Dir } from '../src/game/types';
import { makeLevel } from './helpers';

/** The gate is a wall for the whole slide: it only lets the ball through if every tile was painted BEFORE the swipe. */

describe('filling the last tile in the same move', () => {
  it('stops the ball in front of the gate: the exit needs one more swipe', () => {
    const level = makeLevel(['#######', '#.....#', '#######'], [1, 1], {}, { r: 1, c: 6, dir: 'R' });
    const state = createState(level);
    const first = applyMove(level, state, 'R')!;
    expect(first.exited).toBe(false);
    expect(state.finished).toBe(false);
    expect(state.layers).toBe(level.layers); // everything is painted now...
    expect(first.end).toEqual([1, 5]); // ...and the ball waits right in front of the gate
    const second = applyMove(level, state, 'R')!;
    expect(second.exited).toBe(true);
    expect(state.finished).toBe(true);
    expect(solve(level)!.moves).toBe('RR');
  });

  it('works the same through a corner, a portal and a bomb', () => {
    const corner = makeLevel(['#####', '#...#', '###.#', '###.#', '#####'], [1, 1], { corners: [{ r: 1, c: 3, a: 'L', b: 'D' }] }, { r: 4, c: 3, dir: 'D' });
    const s1 = createState(corner);
    expect(applyMove(corner, s1, 'R')!.exited).toBe(false);
    expect(applyMove(corner, s1, 'D')!.exited).toBe(true);
    const portal = makeLevel(['########', '#..#####', '########', '####...#', '########'], [1, 1], { portals: [{ a: [1, 2], b: [3, 4] }] }, { r: 3, c: 7, dir: 'R' });
    const s2 = createState(portal);
    expect(applyMove(portal, s2, 'R')!.exited).toBe(false);
    expect(applyMove(portal, s2, 'R')!.exited).toBe(true);
  });

  it('the exit is only open when every tile was painted before the swipe', () => {
    const level = makeLevel(['#####', '#...#', '###.#', '#####'], [1, 1], {}, { r: 1, c: 4, dir: 'R' });
    const state = createState(level);
    applyMove(level, state, 'R');
    applyMove(level, state, 'D'); // the last tile
    expect(state.finished).toBe(false);
    applyMove(level, state, 'U');
    const out = applyMove(level, state, 'R')!;
    expect(out.exited).toBe(true);
  });
});

describe('every stored level', () => {
  it('has a solution whose last swipe is the only one that leaves, after everything was painted', () => {
    for (const l of [...LEVELS, ...DAILY_LEVELS]) {
      if (!verifyLevel(l)) throw new Error(`level ${l.id} does not verify`);
      const state = createState(l);
      for (let i = 0; i < l.solution.length - 1; i++) applyMove(l, state, l.solution[i] as Dir);
      // before the last swipe the board is full and the ball is not out yet
      expect({ id: l.id, full: state.layers === l.layers, finished: state.finished }).toEqual({ id: l.id, full: true, finished: false });
    }
  });
});
