import { measure } from './engine';
import { countBranches, countDeadEnds } from './generator';
import { emptyFeatures, mechanicsOf, type Dir, type Features, type Level, type Ramp } from './types';

/**
 * The showcase of the developer menu ("Vitrine des éléments"): a special board, outside the campaign, that shows side by side a
 * platform with its walls, a ramp, a slide from the platform down to the low floor, a slide over the walls between two low floors,
 * painted tiles up and down, an x2 tile, a fragile wall, a stop tile and a bend. The ball plays a fixed demonstration over and over
 * (see SHOWCASE_MOVES). It only exists to look at the new pieces; no level, no rule and no save depends on it.
 *
 * The plan, without the outer wall (columns 0 to 13, rows 0 to 8): a two-wide corridor on the left, the low floor in the middle below the
 * platform, the platform above it (up the ramp), walls between, and a low room on the right.
 */
export const SHOWCASE_ID = 9000;

const PLAN = [
  '..###PPP###...',
  '..###PPP###...',
  '..###PPP###...',
  '..###PPP###...',
  '..#####R###...',
  '..###...###..#',
  '..###...###...',
  '..###...###...',
  '........######',
];

/** Where the ball starts: the low floor, next to the mouth of the slide with a bend. */
const START: [number, number] = [6, 6];

/**
 * The demonstration, one swipe each: through the slide with a bend, down the corridor, up the ramp onto the platform (it rolls past
 * the mouth of the slide below without taking it, and past the mouth of the platform's slide: it does not come in the right way),
 * onto the stop tile, then down the slide from the platform to the low floor, back to the exit of that slide (it stops against the
 * flap), over the x2 tile and the bend, and against the fragile wall.
 */
export const SHOWCASE_MOVES: Dir[] = ['L', 'D', 'R', 'U', 'L', 'D', 'R', 'L', 'D', 'D'];

export function showcaseLevel(): Level {
  const rows = PLAN.length + 2;
  const cols = PLAN[0].length + 2;
  const grid: string[] = [];
  const features: Features = emptyFeatures();
  for (let r = 0; r < rows; r++) {
    let line = '';
    for (let c = 0; c < cols; c++) {
      const inner = r >= 1 && c >= 1 && r <= PLAN.length && c <= PLAN[0].length;
      const ch = inner ? PLAN[r - 1][c - 1] : '#';
      line += ch === '#' ? '#' : '.';
      if (ch === 'P') features.raised.push([r, c]);
      if (ch === 'R') features.ramps.push({ r, c, up: 'U' } as Ramp);
    }
    grid.push(line);
  }
  // Inner coordinates (row, column) to the grid's.
  const g = (r: number, c: number): [number, number] => [r + 1, c + 1];
  features.stops.push(g(1, 5));
  features.doubles.push(g(2, 11));
  features.corners.push({ r: g(4, 11)[0], c: g(4, 11)[1], a: 'U', b: 'R' });
  features.fragile.push(g(5, 13));
  features.slides.push(
    // A straight one from the platform, over three wall tiles, down to the low floor of the right room.
    { entry: g(1, 7), mouth: 'R', exit: g(1, 11), exitDir: 'R', path: [g(1, 8), g(1, 9), g(1, 10)], shape: 'line' },
    // One with two bends, between the low floor of the middle and the corridor on the left.
    { entry: g(6, 5), mouth: 'L', exit: g(5, 1), exitDir: 'L', path: [g(6, 4), g(6, 3), g(5, 3), g(5, 2)], shape: 'S' },
    // A straight one on the low floor, over the walls between the middle and the right room (the demonstration does not take it).
    { entry: g(7, 7), mouth: 'R', exit: g(7, 11), exitDir: 'R', path: [g(7, 8), g(7, 9), g(7, 10)], shape: 'line' },
  );
  const start = g(START[0], START[1]);
  const { floorCount, layers } = measure(grid, features);
  return {
    id: SHOWCASE_ID,
    seed: SHOWCASE_ID,
    rows,
    cols,
    grid,
    start,
    // The gates are never used: the demonstration never paints everything.
    exit: { r: 0, c: cols - 2, dir: 'U' },
    entry: { r: rows - 1, c: start[1], side: 'D' },
    color: '#2a9d8f',
    solution: '',
    difficulty: 0,
    floorCount,
    layers,
    deadEnds: countDeadEnds(grid),
    branches: countBranches(grid),
    features,
    mechanics: mechanicsOf(features),
  };
}
