import { cropLevel, isCropped } from '../src/game/crop';
import { applyMove, createState } from '../src/game/engine';
import { verifyLevel } from '../src/game/generator';
import { solve } from '../src/game/solver';
import type { Dir } from '../src/game/types';
import { makeLevel } from './helpers';

describe('cropLevel', () => {
  // A single short corridor in a big board, with the exit on the top border.
  const grid = [
    '#########',
    '###..####',
    '#########',
    '#########',
    '#########',
    '#########',
    '#########',
  ];
  const level = { ...makeLevel(grid, [1, 3], { coins: [[1, 4]] }, { r: 0, c: 4, dir: 'U' }), solution: 'RU' };

  it('keeps the bounding box of the floor plus one tile of wall', () => {
    const cropped = cropLevel(level);
    expect(cropped.rows).toBe(3);
    expect(cropped.cols).toBe(4);
    expect(cropped.grid).toEqual(['####', '#..#', '####']);
    expect(cropped.start).toEqual([1, 1]);
    expect(cropped.features.coins).toEqual([[1, 2]]);
    expect(isCropped(cropped)).toBe(true);
    expect(isCropped(level)).toBe(false);
  });

  it('keeps the exit on the border and the level playable', () => {
    const cropped = cropLevel(level);
    expect(cropped.exit).toEqual({ r: 0, c: 2, dir: 'U' });
    const moves = solve(cropped)!.moves;
    expect(moves).toBe('RU');
    const state = createState(cropped);
    for (const m of moves) applyMove(cropped, state, m as Dir);
    expect(state.finished).toBe(true);
    expect(verifyLevel({ ...cropped, solution: moves })).toBe(true);
  });

  it('moves every special tile with the board', () => {
    const l = makeLevel(
      ['########', '########', '##.....#', '########', '########'],
      [2, 2],
      { stops: [[2, 4]], corners: [{ r: 2, c: 3, a: 'L', b: 'R' }], doubles: [[2, 5]], bombs: [[2, 6]] },
      { r: 2, c: 7, dir: 'R' },
    );
    const cropped = cropLevel(l);
    expect(cropped.rows).toBe(3);
    expect(cropped.cols).toBe(7);
    expect(cropped.start).toEqual([1, 1]);
    expect(cropped.features.stops).toEqual([[1, 3]]);
    expect(cropped.features.corners[0]).toMatchObject({ r: 1, c: 2 });
    expect(cropped.features.doubles).toEqual([[1, 4]]);
    expect(cropped.features.bombs).toEqual([[1, 5]]);
    expect(cropped.exit).toMatchObject({ r: 1, c: 6, dir: 'R' });
  });

  it('is idempotent', () => {
    const once = cropLevel(level);
    expect(cropLevel(once)).toEqual(once);
  });
});
