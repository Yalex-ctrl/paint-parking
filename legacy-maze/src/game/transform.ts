import { OPPOSITE, type Dir, type Level } from './types';

/**
 * Turns a level around: rotated by quarter turns and/or mirrored. The rules do not care about orientation, so the result is
 * as playable as the original; this is how a stored level can stand in for a level that could not be built, with the
 * entry and the exit on the sides the neighbouring levels expect.
 */
export type Orientation = { quarterTurns: number; mirror: boolean };

const TURN: Record<Dir, Dir> = { U: 'R', R: 'D', D: 'L', L: 'U' };

/** Where a direction (or a side) goes: mirrored left-right first, then turned clockwise. */
export function mapDir(d: Dir, o: Orientation): Dir {
  let out = d;
  if (o.mirror) out = out === 'L' ? 'R' : out === 'R' ? 'L' : out;
  for (let i = 0; i < (((o.quarterTurns % 4) + 4) % 4); i++) out = TURN[out];
  return out;
}

/** Where a cell goes. */
function mapCell(r: number, c: number, rows: number, cols: number, o: Orientation): [number, number] {
  let rr = r;
  let cc = c;
  let h = rows;
  let w = cols;
  if (o.mirror) cc = w - 1 - cc;
  for (let i = 0; i < (((o.quarterTurns % 4) + 4) % 4); i++) {
    [rr, cc] = [cc, h - 1 - rr]; // clockwise
    [h, w] = [w, h];
  }
  return [rr, cc];
}

export function transformLevel(level: Level, o: Orientation, id = level.id): Level {
  const turns = ((o.quarterTurns % 4) + 4) % 4;
  const swap = turns % 2 === 1;
  const rows = swap ? level.cols : level.rows;
  const cols = swap ? level.rows : level.cols;
  const cell = (r: number, c: number) => mapCell(r, c, level.rows, level.cols, o);
  const grid: string[][] = Array.from({ length: rows }, () => Array<string>(cols).fill('#'));
  for (let r = 0; r < level.rows; r++) {
    for (let c = 0; c < level.cols; c++) {
      const [nr, nc] = cell(r, c);
      grid[nr][nc] = level.grid[r][c];
    }
  }
  const pt = ([r, c]: readonly [number, number]): [number, number] => cell(r, c);
  const f = level.features;
  const [er, ec] = cell(level.exit.r, level.exit.c);
  return {
    ...level,
    id,
    rows,
    cols,
    grid: grid.map((row) => row.join('')),
    start: pt(level.start),
    exit: { r: er, c: ec, dir: mapDir(level.exit.dir, o) },
    ...(level.entry
      ? (() => {
          const [nr, nc] = cell(level.entry.r, level.entry.c);
          return { entry: { r: nr, c: nc, side: mapDir(level.entry.side, o) } };
        })()
      : {}),
    solution: level.solution
      .split('')
      .map((d) => mapDir(d as Dir, o))
      .join(''),
    features: {
      stops: f.stops.map(pt),
      corners: f.corners.map((k) => {
        const [r, c] = cell(k.r, k.c);
        return { r, c, a: mapDir(k.a, o), b: mapDir(k.b, o) };
      }),
      portals: f.portals.map((p) => ({ a: pt(p.a), b: pt(p.b) })),
      doubles: f.doubles.map(pt),
      fragile: f.fragile.map(pt),
      bombs: f.bombs.map(pt),
      coins: f.coins.map(pt),
      slides: (f.slides ?? []).map((s) => ({ ...s, entry: pt(s.entry), exit: pt(s.exit), mouth: mapDir(s.mouth, o), exitDir: mapDir(s.exitDir, o), path: s.path.map(pt) })),
      raised: (f.raised ?? []).map(pt),
      ramps: (f.ramps ?? []).map((k) => {
        const [r, c] = cell(k.r, k.c);
        return { r, c, up: mapDir(k.up, o) };
      }),
      collapse: (f.collapse ?? []).map(pt),
    },
  };
}

/** An orientation that sends the sides (`entry`, `exit`) of a level to the wanted ones, or null when none does. */
export function orientationFor(entry: Dir, exit: Dir, wantEntry: Dir, wantExit: Dir): Orientation | null {
  for (const mirror of [false, true]) {
    for (let quarterTurns = 0; quarterTurns < 4; quarterTurns++) {
      const o = { quarterTurns, mirror };
      if (mapDir(entry, o) === wantEntry && mapDir(exit, o) === wantExit) return o;
    }
  }
  return null;
}

/** "Straight" (the exit is opposite the entry) or "turn" (on a side next to it): a level can only stand in for one of its own kind. */
export const kindOfPassage = (entry: Dir, exit: Dir): 'straight' | 'turn' => (OPPOSITE[entry] === exit ? 'straight' : 'turn');
