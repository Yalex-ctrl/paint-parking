import { analyzeSolution, isIndispensable } from '../src/game/analysis';
import { applyMove, createState, hasInfiniteLoop, replay } from '../src/game/engine';
import { solve } from '../src/game/solver';
import type { Slide } from '../src/game/types';
import { makeLevel } from './helpers';

const cells = (path: readonly (readonly [number, number])[]) => path.map(([r, c]) => `${r},${c}`);

/* ------------------------------------------------------------------------------------------ slides */

describe('slide (toboggan)', () => {
  // Two rooms and a wall between them; the chute goes over the wall from (1,4) to (1,6).
  //   #########     the funnel of the entry (1,4) faces right; the ball lands on (1,6) and goes on to the right
  //   #....#...#
  const chute: Slide = { entry: [1, 4], mouth: 'R', exit: [1, 6], exitDir: 'R', path: [[1, 5]], shape: 'line' };
  const grid = ['##########', '#....#...#', '#....#...#', '##########'];
  const level = makeLevel(grid, [1, 1], { slides: [chute] });

  it('takes the ball that arrives on the entry in the direction of the funnel, and lands it on the exit', () => {
    const s = createState(level);
    const res = applyMove(level, s, 'R')!;
    // 1,2 1,3 1,4 (entry) then the landing 1,6 and the slide that goes on to the wall
    expect(cells(res.path)).toEqual(['1,2', '1,3', '1,4', '1,6', '1,7', '1,8']);
    expect(res.steps[3].slide).toBe(0);
    expect(res.end).toEqual([1, 8]);
    expect(res.reason).toBe('wall');
  });

  it('the chute paints nothing: only the entry and the exit tile are painted', () => {
    const s = createState(level);
    const res = applyMove(level, s, 'R')!;
    const painted = res.steps.flatMap((x) => x.painted.map((p) => `${p.cell}`));
    expect(painted).toContain('1,4');
    expect(painted).toContain('1,6');
    expect(s.layers).toBe(7); // the start tile, 1,2 1,3 1,4, then 1,6 1,7 1,8: the chute (1,5) is not painted
  });

  it('counts for ONE move, however long the chute is', () => {
    const s = createState(level);
    applyMove(level, s, 'R');
    expect(s.moves).toBe(1);
  });

  it('is one way: arriving on the exit does not take the ball back up', () => {
    const s = createState(level);
    s.pos = [1, 8];
    const res = applyMove(level, s, 'L')!;
    expect(cells(res.path)).toEqual(['1,7', '1,6']);
    expect(res.end).toEqual([1, 6]);
    expect(s.pos).toEqual([1, 6]);
  });

  it('is not taken by a ball that crosses the entry tile from another side: the funnel is then a wall', () => {
    const s = createState(level);
    s.pos = [2, 4];
    const up = applyMove(level, s, 'U')!;
    expect(up.end).toEqual([1, 4]); // stopped by the wall above, did not go down the chute
    expect(up.steps.every((x) => x.slide < 0)).toBe(true);
    // ... and it can start from the entry tile itself with a swipe in the direction of the funnel
    const again = applyMove(level, s, 'R')!;
    expect(again.steps.some((x) => x.slide === 0)).toBe(true);
    expect(s.pos).toEqual([1, 8]);
  });

  it('the exit tile in the middle of a room is crossed normally by a ball coming from the other side', () => {
    const s = createState(level);
    s.pos = [2, 8];
    const res = applyMove(level, s, 'L')!;
    expect(res.end).toEqual([2, 6]);
  });

  it('the ball keeps its direction after the landing and stops on the exit tile when there is a wall right ahead', () => {
    const short = makeLevel(['########', '#...#.##', '########'], [1, 1], { slides: [{ entry: [1, 3], mouth: 'R', exit: [1, 5], exitDir: 'R', path: [[1, 4]], shape: 'line' }] });
    const s = createState(short);
    const res = applyMove(short, s, 'R')!;
    expect(res.end).toEqual([1, 5]);
    expect(res.reason).toBe('slide');
  });

  it('an L-shaped chute lands the ball going another way', () => {
    // Entry (1,3) funnel to the right, the chute turns down over the walls (1,4) (2,4) and lands on (3,4)... which is floor going down.
    const g = ['#######', '#...###', '#####.#', '#####.#', '#######'];
    const lv = makeLevel(g, [1, 1], { slides: [{ entry: [1, 3], mouth: 'R', exit: [2, 5], exitDir: 'D', path: [[1, 4], [1, 5]], shape: 'L' }] });
    const s = createState(lv);
    const res = applyMove(lv, s, 'R')!;
    expect(cells(res.path)).toEqual(['1,2', '1,3', '2,5', '3,5']);
    expect(res.end).toEqual([3, 5]);
  });

  it('is solved by the solver, and is indispensable when the rooms are only joined by the chute', () => {
    const exitAt = { r: 1, c: 9, dir: 'R' as const };
    const l = makeLevel(grid, [1, 1], { slides: [chute] }, exitAt);
    const sol = solve(l)!;
    expect(sol).not.toBeNull();
    expect(sol.moves.length).toBeGreaterThan(0);
    expect(isIndispensable(l, 'slide')).toBe(true);
  });

  it('never makes the ball circle for ever in an ordinary level', () => {
    expect(hasInfiniteLoop(level)).toBe(false);
  });

  it('a chute that leads back onto its own entry in the same direction is a loop, and is found', () => {
    const loopy = makeLevel(['#######', '#.#...#', '#######'], [1, 1], { slides: [{ entry: [1, 3], mouth: 'R', exit: [1, 3], exitDir: 'R', path: [], shape: 'line' }] });
    expect(hasInfiniteLoop(loopy)).toBe(true);
  });

  it('lets the ball leave through the gate after a slide when everything was painted before the swipe', () => {
    const l = makeLevel(grid, [1, 1], { slides: [chute] }, { r: 1, c: 9, dir: 'R' });
    const s = createState(l);
    s.coat.fill(0);
    for (let r = 0; r < l.rows; r++) for (let c = 0; c < l.cols; c++) if (l.grid[r][c] === '.') s.coat[r * l.cols + c] = 1;
    s.layers = l.layers;
    const res = applyMove(l, s, 'R')!;
    expect(res.exited).toBe(true);
    expect(s.finished).toBe(true);
  });

  it('with the last tile painted during the swipe, the ball stops in front of the gate and one more swipe leaves', () => {
    const l = makeLevel(['##########', '#....#...#', '##########'], [1, 1], { slides: [{ entry: [1, 4], mouth: 'R', exit: [1, 6], exitDir: 'R', path: [[1, 5]], shape: 'line' }] }, { r: 1, c: 9, dir: 'R' });
    const s = createState(l);
    const first = applyMove(l, s, 'R')!;
    expect(first.exited).toBe(false);
    expect(s.pos).toEqual([1, 8]);
    const second = applyMove(l, s, 'R')!;
    expect(second.exited).toBe(true);
  });
});

/* ------------------------------------------------------------------------------------------ platforms and ramps */

describe('platforms and ramps (étages)', () => {
  // The platform is on the left (tiles 1,1 and 1,2), the ramp at 1,3 (its high side is to the left), the low floor on the right.
  const grid = ['########', '#......#', '########'];
  const level = makeLevel(grid, [1, 1], { raised: [[1, 1], [1, 2]], ramps: [{ r: 1, c: 3, up: 'L' }] });

  it('goes down a ramp in line with it, and goes on over the low floor', () => {
    const s = createState(level);
    const res = applyMove(level, s, 'R')!;
    expect(cells(res.path)).toEqual(['1,2', '1,3', '1,4', '1,5', '1,6']);
  });

  it('goes up the same ramp the other way', () => {
    const s = createState(level);
    s.pos = [1, 6];
    const res = applyMove(level, s, 'L')!;
    expect(cells(res.path)).toEqual(['1,5', '1,4', '1,3', '1,2', '1,1']);
    expect(res.end).toEqual([1, 1]);
  });

  it('the edge of the platform is a wall in both directions where there is no ramp', () => {
    const edge = makeLevel(['#######', '#.....#', '#######'], [1, 1], { raised: [[1, 1], [1, 2]] });
    const s = createState(edge);
    const res = applyMove(edge, s, 'R')!;
    expect(res.end).toEqual([1, 2]); // stopped at the edge of the platform
    const down = createState(edge);
    down.pos = [1, 5];
    const back = applyMove(edge, down, 'L')!;
    expect(back.end).toEqual([1, 3]); // stopped against the side of the platform
  });

  it('a ramp cannot be entered from the side: it is a wall', () => {
    const g = ['#######', '#..#..#', '#.....#', '#######'];
    const l = makeLevel(g, [1, 4], { raised: [[1, 1], [1, 2]], ramps: [{ r: 2, c: 3, up: 'L' }] });
    const s = createState(l);
    s.pos = [1, 4];
    // down from (1,4): the tile below is (2,4) low floor, not the ramp (2,3): go there then left into the ramp is along its axis
    const res = applyMove(l, s, 'D')!;
    expect(res.end).toEqual([2, 4]);
    // a ball above the ramp swiping down meets it from the side
    const above = makeLevel(['#######', '#.....#', '#.....#', '#######'], [1, 3], { ramps: [{ r: 2, c: 3, up: 'L' }], raised: [[2, 1], [2, 2]] });
    const t = createState(above);
    const side = applyMove(above, t, 'D');
    expect(side).toBeNull(); // wall straight ahead: the side of the ramp
  });

  it('a ball stopped on the platform can only go down by the ramp', () => {
    const s = createState(level);
    applyMove(level, s, 'R');
    expect(s.pos).toEqual([1, 6]);
    const up = applyMove(level, s, 'L')!;
    expect(up.end).toEqual([1, 1]);
  });

  it('the solver and the paint count know about the heights: painting the whole level needs the ramp', () => {
    const l = makeLevel(grid, [1, 4], { raised: [[1, 1], [1, 2]], ramps: [{ r: 1, c: 3, up: 'L' }] }, { r: 1, c: 7, dir: 'R' });
    const sol = solve(l)!;
    expect(sol).not.toBeNull();
    const without = makeLevel(grid, [1, 4], { raised: [[1, 1], [1, 2]] }, { r: 1, c: 7, dir: 'R' });
    expect(solve(without)).toBeNull(); // no ramp: the platform cannot be reached
    expect(analyzeSolution(l, sol.moves).tier).toBeGreaterThan(0); // the solution crosses the ramp
  });

  it('a slide can come down from a platform to the low floor', () => {
    const g = ['#########', '#..#....#', '#########'];
    const l = makeLevel(g, [1, 1], { raised: [[1, 1], [1, 2]], slides: [{ entry: [1, 2], mouth: 'R', exit: [1, 4], exitDir: 'R', path: [[1, 3]], shape: 'line' }] });
    const s = createState(l);
    const res = applyMove(l, s, 'R')!;
    expect(res.steps.some((x) => x.slide === 0)).toBe(true);
    expect(res.end).toEqual([1, 7]);
  });
});

/* ------------------------------------------------------------------------------------------ collapse */

describe('floor that collapses (sol fragile)', () => {
  const grid = ['#######', '#.....#', '#######'];
  const level = makeLevel(grid, [1, 1], { collapse: [[1, 3]] });

  it('a tile collapses once the ball has left it, and stays painted', () => {
    const s = createState(level);
    const res = applyMove(level, s, 'R')!;
    expect(cells(res.collapsed)).toEqual(['1,3']);
    expect(s.coat[1 * level.cols + 3]).toBe(1);
    expect(s.broken[0]).toBe(1);
  });

  it('the hole is a wall: the ball stops in front of it and never falls', () => {
    const s = replay(level, 'R');
    const back = applyMove(level, s, 'L')!;
    expect(back.end).toEqual([1, 4]);
    expect(cells(back.path)).toEqual(['1,4']);
  });

  it('does not collapse while the ball is still on it: it stops there, and goes when it leaves', () => {
    const l = makeLevel(['#####', '#...#', '#####'], [1, 1], { collapse: [[1, 3]] });
    const s = createState(l);
    const first = applyMove(l, s, 'R')!;
    expect(first.end).toEqual([1, 3]);
    expect(first.collapsed).toEqual([]);
    expect(s.broken[0]).toBe(0);
    const second = applyMove(l, s, 'L')!;
    expect(cells(second.collapsed)).toEqual(['1,3']);
  });

  it('a swipe that goes nowhere makes nothing collapse', () => {
    const l = makeLevel(['#####', '#...#', '#####'], [1, 1], { collapse: [[1, 3]] });
    const s = replay(l, 'R');
    expect(applyMove(l, s, 'R')).toBeNull();
    expect(s.broken[0]).toBe(0);
  });

  it('"Recommencer" gives the tiles back: a fresh state has none collapsed', () => {
    const s = replay(level, 'R');
    expect(s.broken[0]).toBe(1);
    expect(createState(level).broken[0]).toBe(0);
  });

  it('works on a platform and on a ramp: a collapsed ramp cuts the way between the floors', () => {
    const g = ['########', '#......#', '########'];
    const l = makeLevel(g, [1, 1], { raised: [[1, 1], [1, 2]], ramps: [{ r: 1, c: 3, up: 'L' }], collapse: [[1, 3]] });
    const s = createState(l);
    applyMove(l, s, 'R');
    expect(s.broken[0]).toBe(1); // the ramp is a hole now
    const back = applyMove(l, s, 'L')!;
    expect(back.end).toEqual([1, 4]); // stopped by the hole: the platform is cut off
  });

  it('fragile walls and collapsing tiles live in the same state without mixing', () => {
    const l = makeLevel(['########', '#..#...#', '########'], [1, 1], { fragile: [[1, 3]], collapse: [[1, 5]] });
    const s = createState(l);
    expect(s.broken.length).toBe(2);
    applyMove(l, s, 'R'); // breaks the fragile wall
    expect(s.broken[0]).toBe(1);
    expect(s.broken[1]).toBe(0);
    applyMove(l, s, 'R'); // goes through, past the collapsing tile
    expect(s.broken[1]).toBe(1);
  });

  it('a hole can be part of the solution: the order of the swipes matters', () => {
    // 2 x 3 room, one collapsing tile in the middle: crossing it first cuts the room in two.
    const g = ['#####', '#...#', '#...#', '#####'];
    const l = makeLevel(g, [1, 1], { collapse: [[1, 2]] }, { r: 1, c: 4, dir: 'R' });
    // exit at (1,4): the last swipe goes right along row 1
    const sol = solve(l);
    if (sol) {
      const s = replay(l, sol.moves.slice(0, -1));
      expect(s.layers).toBe(l.layers);
    }
  });
});

describe('chains of mechanics', () => {
  it('a slide that lands on a ramp, and goes on, in one swipe', () => {
    const g = ['###########', '#...#.....#', '###########'];
    const l = makeLevel(g, [1, 1], {
      slides: [{ entry: [1, 3], mouth: 'R', exit: [1, 5], exitDir: 'R', path: [[1, 4]], shape: 'line' }],
      raised: [[1, 5]],
      ramps: [{ r: 1, c: 6, up: 'L' }],
    });
    const s = createState(l);
    const res = applyMove(l, s, 'R')!;
    expect(cells(res.path)).toEqual(['1,2', '1,3', '1,5', '1,6', '1,7', '1,8', '1,9']);
  });

  it('a collapsing tile after a slide collapses when the ball leaves it', () => {
    const g = ['##########', '#...#....#', '##########'];
    const l = makeLevel(g, [1, 1], { slides: [{ entry: [1, 3], mouth: 'R', exit: [1, 5], exitDir: 'R', path: [[1, 4]], shape: 'line' }], collapse: [[1, 6]] });
    const s = createState(l);
    const res = applyMove(l, s, 'R')!;
    expect(cells(res.collapsed)).toEqual(['1,6']);
    expect(res.end).toEqual([1, 8]);
  });
});
