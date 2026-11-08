import { applyMove, createState, hasInfiniteLoop, isExitOpen, replay } from '../src/game/engine';
import { solve } from '../src/game/solver';
import type { Dir } from '../src/game/types';
import { makeLevel } from './helpers';

const cells = (path: readonly (readonly [number, number])[]) => path.map(([r, c]) => `${r},${c}`);

describe('plain sliding', () => {
  const level = makeLevel(['#######', '#.....#', '#######'], [1, 1]);

  it('slides to the wall and paints every tile on the way', () => {
    const s = createState(level);
    const res = applyMove(level, s, 'R')!;
    expect(cells(res.path)).toEqual(['1,2', '1,3', '1,4', '1,5']);
    expect(res.reason).toBe('wall');
    expect(s.pos).toEqual([1, 5]);
    expect(s.layers).toBe(5);
  });

  it('does not count a swipe into a wall as a move', () => {
    const s = createState(level);
    expect(applyMove(level, s, 'L')).toBeNull();
    expect(applyMove(level, s, 'U')).toBeNull();
    expect(s.moves).toBe(0);
  });
});

describe('stop tile', () => {
  const level = makeLevel(['#######', '#.....#', '#######'], [1, 1], { stops: [[1, 3]] });

  it('halts the ball on the tile even with open floor ahead', () => {
    const s = createState(level);
    const res = applyMove(level, s, 'R')!;
    expect(res.end).toEqual([1, 3]);
    expect(res.reason).toBe('stop');
    expect(cells(res.path)).toEqual(['1,2', '1,3']);
  });

  it('the next swipe leaves normally', () => {
    const s = replay(level, 'R');
    const res = applyMove(level, s, 'R')!;
    expect(res.end).toEqual([1, 5]);
    expect(res.reason).toBe('wall');
    expect(s.layers).toBe(5);
  });

  it('also stops a ball arriving from the other side', () => {
    const s = replay(level, 'RR');
    const res = applyMove(level, s, 'L')!;
    expect(res.end).toEqual([1, 3]);
  });
});

describe('corner', () => {
  // Vertical corridor up to a bend, then a corridor going right.
  const grid = ['#####', '#...#', '#.###', '#.###', '#####'];
  const level = makeLevel(grid, [3, 1], { corners: [{ r: 1, c: 1, a: 'D', b: 'R' }] });

  it('turns the ball 90 degrees without stopping, and paints the corner tile', () => {
    const s = createState(level);
    const res = applyMove(level, s, 'U')!;
    expect(cells(res.path)).toEqual(['2,1', '1,1', '1,2', '1,3']);
    expect(res.end).toEqual([1, 3]);
    expect(res.lastDir).toBe('R');
    expect(s.layers).toBe(level.layers); // everything got painted by a single swipe
  });

  it('works the other way round, and the turn is the exit side', () => {
    const s = replay(level, 'U');
    const res = applyMove(level, s, 'L')!;
    expect(res.end).toEqual([3, 1]);
    expect(res.lastDir).toBe('D');
  });

  it('acts as a wall for a ball arriving through a closed side', () => {
    // A corridor along row 1 with a bend at (1,2) that only opens Down and Right: from the left it is closed.
    const closed = makeLevel(['#####', '#...#', '#.#.#', '#####'], [1, 1], {
      corners: [{ r: 1, c: 2, a: 'D', b: 'R' }],
    });
    const s = createState(closed);
    expect(applyMove(closed, s, 'R')).toBeNull(); // blocked right away, no move
    expect(s.pos).toEqual([1, 1]);
  });

  it('cannot be left through a closed side either', () => {
    const s = replay(level, 'U'); // ball ends on (1,3), then comes back and rests on the corner
    applyMove(level, s, 'L'); // goes to (3,1) via the corner
    // From (3,1) swipe right/left/down: walls. Up goes through the corner again.
    expect(applyMove(level, s, 'R')).toBeNull();
  });
});

describe('portals', () => {
  const grid = ['#########', '#.......#', '#########'];

  it('moves the ball to the other portal and keeps going in the same direction', () => {
    const level = makeLevel(grid, [1, 1], { portals: [{ a: [1, 2], b: [1, 5] }] });
    const s = createState(level);
    const res = applyMove(level, s, 'R')!;
    expect(cells(res.path)).toEqual(['1,2', '1,5', '1,6', '1,7']);
    expect(res.steps[1].teleport).toBe(true);
    expect(res.end).toEqual([1, 7]);
    expect(s.coat[1 * 9 + 3]).toBe(0); // tiles skipped by the jump stay unpainted
    expect(s.coat[1 * 9 + 2]).toBe(1);
    expect(s.coat[1 * 9 + 5]).toBe(1);
  });

  it('stops on the exit portal when a wall is right after it', () => {
    const level = makeLevel(grid, [1, 1], { portals: [{ a: [1, 2], b: [1, 7] }] });
    const res = applyMove(level, createState(level), 'R')!;
    expect(res.end).toEqual([1, 7]);
    expect(res.reason).toBe('portal');
  });

  it('works from both ends', () => {
    const level = makeLevel(grid, [1, 7], { portals: [{ a: [1, 2], b: [1, 5] }] });
    const res = applyMove(level, createState(level), 'L')!;
    expect(cells(res.path)).toEqual(['1,6', '1,5', '1,2', '1,1']);
    expect(res.end).toEqual([1, 1]);
  });
});

describe('double coat', () => {
  const level = makeLevel(['#######', '#.....#', '#######'], [1, 1], { doubles: [[1, 3]] }, { r: 1, c: 6, dir: 'R' });

  it('needs two passes before the exit opens', () => {
    expect(level.layers).toBe(level.floorCount + 1);
    const s = createState(level);
    applyMove(level, s, 'R');
    expect(s.coat[1 * 7 + 3]).toBe(1);
    expect(isExitOpen(level, s)).toBe(false);
    applyMove(level, s, 'L');
    expect(s.coat[1 * 7 + 3]).toBe(2);
    expect(isExitOpen(level, s)).toBe(true);
    const res = applyMove(level, s, 'R')!;
    expect(res.exited).toBe(true);
  });

  it('a third pass changes nothing', () => {
    const s = replay(level, 'RL');
    const layers = s.layers;
    applyMove(level, s, 'R');
    expect(s.layers).toBe(layers);
  });
});

describe('fragile wall', () => {
  const level = makeLevel(['#######', '#..#..#', '#######'], [1, 1], { fragile: [[1, 3]] });

  it('stops the ball like a wall and breaks', () => {
    expect(level.floorCount).toBe(5); // 4 floor tiles + the fragile wall, which becomes floor
    const s = createState(level);
    const res = applyMove(level, s, 'R')!;
    expect(res.end).toEqual([1, 2]);
    expect(res.reason).toBe('fragile');
    expect(res.broke).toEqual([1, 3]);
    expect(s.broken[0]).toBe(1);
  });

  it('becomes floor that must be painted', () => {
    const s = replay(level, 'R');
    expect(s.layers).toBe(2);
    const res = applyMove(level, s, 'R')!;
    expect(cells(res.path)).toEqual(['1,3', '1,4', '1,5']);
    expect(s.layers).toBe(level.layers);
  });

  it('hitting it from right next to it is a move too', () => {
    const adjacent = makeLevel(['#######', '#..#..#', '#######'], [1, 2], { fragile: [[1, 3]] });
    const s = createState(adjacent);
    const res = applyMove(adjacent, s, 'R')!;
    expect(res.path).toHaveLength(0);
    expect(res.broke).toEqual([1, 3]);
    expect(s.moves).toBe(1);
    expect(applyMove(adjacent, s, 'R')!.path.length).toBeGreaterThan(0);
  });
});

describe('paint bomb', () => {
  // (1,1) is an isolated pocket; the bend (2,2) has walls on its left and above.
  const grid = ['######', '#.####', '##..##', '##.###', '######'];
  const level = makeLevel(grid, [3, 2], { bombs: [[2, 2]] });

  it('paints every floor tile of the 3x3 area, never walls, and the ball keeps going', () => {
    const s = createState(level);
    const res = applyMove(level, s, 'U')!;
    const bomb = res.steps.find((st) => st.bomb)!.bomb!;
    expect(cells(bomb.painted.map((p) => p.cell)).sort()).toEqual(['1,1', '2,3']); // the bend itself was already painted by the ball entering it
    expect(s.coat[1 * 6 + 1]).toBe(1); // the pocket the ball can never reach
    expect(s.layers).toBe(level.layers);
  });

  it('only explodes once', () => {
    const s = replay(level, 'U');
    expect(s.bombUsed[0]).toBe(1);
    const res = applyMove(level, s, 'D')!; // down through the bend again
    expect(res.steps.every((st) => st.bomb === null)).toBe(true);
  });

  it('does not paint a fragile wall that is still standing', () => {
    const g = ['#######', '#.#####', '##..#.#', '##.##.#', '#######'];
    const l = makeLevel(g, [3, 2], { bombs: [[2, 2]], fragile: [[2, 4]] });
    const s = createState(l);
    applyMove(l, s, 'U');
    expect(s.coat[2 * 7 + 4]).toBe(0);
  });
});

describe('coins', () => {
  const level = makeLevel(['#######', '#.....#', '#######'], [1, 1], { coins: [[1, 3], [1, 5]] });

  it('are collected on the way and are not needed to finish', () => {
    expect(level.layers).toBe(5);
    const s = createState(level);
    const res = applyMove(level, s, 'R')!;
    expect(cells(res.coins)).toEqual(['1,3', '1,5']);
    expect(s.coinCount).toBe(2);
    expect(s.layers).toBe(level.layers);
  });

  it('are collected only once', () => {
    const s = replay(level, 'R');
    const res = applyMove(level, s, 'L')!;
    expect(res.coins).toHaveLength(0);
    expect(s.coinCount).toBe(2);
  });
});

describe('chains and loops', () => {
  // A square ring of four bends.
  const ring = makeLevel(['#####', '#...#', '#.#.#', '#...#', '#####'], [1, 2], {
    corners: [
      { r: 1, c: 1, a: 'D', b: 'R' },
      { r: 1, c: 3, a: 'L', b: 'D' },
      { r: 3, c: 3, a: 'U', b: 'L' },
      { r: 3, c: 1, a: 'R', b: 'U' },
    ],
  });

  it('detects a swipe that would circle forever', () => {
    expect(hasInfiniteLoop(ring)).toBe(true);
    const res = applyMove(ring, createState(ring), 'R')!;
    expect(res.looped).toBe(true);
  });

  it('detects two adjacent portals that would bounce the ball forever', () => {
    const grid = ['#######', '#.....#', '#.....#', '#######'];
    // A ball resting on one portal and swiped toward the other one is sent back and forth for ever.
    const level = makeLevel(grid, [2, 2], { portals: [{ a: [2, 3], b: [2, 2] }] });
    expect(hasInfiniteLoop(level)).toBe(true);
    expect(applyMove(level, createState(level), 'R')!.looped).toBe(true);
  });

  it('a slide can chain a corner, a portal and another corner', () => {
    const grid = ['#######', '#.....#', '###.###', '#######', '#.#####', '#.....#', '#######'];
    const level = makeLevel(grid, [1, 1], {
      corners: [
        { r: 1, c: 3, a: 'L', b: 'D' },
        { r: 5, c: 1, a: 'U', b: 'R' },
      ],
      portals: [{ a: [2, 3], b: [4, 1] }],
    });
    expect(hasInfiniteLoop(level)).toBe(false);
    const res = applyMove(level, createState(level), 'R')!;
    expect(cells(res.path)).toEqual(['1,2', '1,3', '2,3', '4,1', '5,1', '5,2', '5,3', '5,4', '5,5']);
    expect(res.steps[3].teleport).toBe(true);
    expect(res.end).toEqual([5, 5]);
    expect(res.reason).toBe('wall');
  });

  it('plain levels have no loops', () => {
    expect(hasInfiniteLoop(makeLevel(['#######', '#.....#', '#######'], [1, 1]))).toBe(false);
  });
});

describe('solver with mechanics', () => {
  it('needs the second pass of a double tile', () => {
    const level = makeLevel(['#######', '#.....#', '#######'], [1, 1], { doubles: [[1, 3]] }, { r: 1, c: 6, dir: 'R' });
    const res = solve(level)!;
    expect(res.moves).toBe('RLR');
  });

  it('solves a level that only a stop tile makes possible', () => {
    // A branch off the middle of the corridor can only be entered by halting on the stop tile.
    const grid = ['#######', '#.....#', '###.###', '###.###', '#######'];
    const level = makeLevel(grid, [1, 1], { stops: [[1, 3]] }, { r: 1, c: 6, dir: 'R' });
    const res = solve(level)!;
    expect(res).not.toBeNull();
    const s = replay(level, res.moves.slice(0, -1));
    expect(s.layers).toBe(level.layers);
    // Without the stop tile the branch cannot be reached.
    const noStop = makeLevel(grid, [1, 1], {}, { r: 1, c: 6, dir: 'R' });
    expect(solve(noStop)).toBeNull();
  });

  it('solves a level where a bomb paints a pocket the ball can never reach', () => {
    const grid = ['#####', '#.###', '##..#', '##.##', '#####'];
    const level = makeLevel(grid, [3, 2], { bombs: [[2, 2]] }, { r: 2, c: 4, dir: 'R' });
    const res = solve(level)!;
    expect(res.moves).toBe('UR');
    // Without the bomb the pocket is unreachable.
    expect(solve(makeLevel(grid, [3, 2], {}, { r: 2, c: 4, dir: 'R' }))).toBeNull();
  });

  it('opens a fragile wall on the way', () => {
    const level = makeLevel(['#######', '#..#..#', '#######'], [1, 1], { fragile: [[1, 3]] }, { r: 1, c: 6, dir: 'R' });
    const res = solve(level)!;
    expect(res.moves).toBe('RRR');
    const dirs = res.moves.split('') as Dir[];
    expect(dirs).toHaveLength(3);
  });
});
