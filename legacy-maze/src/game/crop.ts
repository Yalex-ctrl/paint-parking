import type { Level } from './types';

/**
 * Crops a level to the bounding box of everything that matters (floor tiles and fragile walls,
 * which become floor) plus one tile of wall all around, so there is no solid block of wall around the
 * corridors. Nothing about the rules changes: the rows and columns that are removed contained only
 * walls that no slide could reach, and the one-tile margin stays solid.
 *
 * The exit stays on the border: it sits right beside a floor tile that was on the outer edge of the
 * playable area on its side, so after the crop it is exactly in the margin on that side.
 */
export function cropLevel(level: Level): Level {
  let r0 = Infinity;
  let r1 = -Infinity;
  let c0 = Infinity;
  let c1 = -Infinity;
  const take = (r: number, c: number) => {
    r0 = Math.min(r0, r);
    r1 = Math.max(r1, r);
    c0 = Math.min(c0, c);
    c1 = Math.max(c1, c);
  };
  for (let r = 0; r < level.rows; r++) for (let c = 0; c < level.cols; c++) if (level.grid[r][c] === '.') take(r, c);
  for (const [r, c] of level.features.fragile) take(r, c);
  // The chutes of the slides pass over walls: they are kept too.
  for (const s of level.features.slides ?? []) for (const [r, c] of s.path) take(r, c);

  // One tile of wall around; the exit cell must be inside (it is, by construction: see above).
  r0 = Math.min(r0 - 1, level.exit.r, level.entry?.r ?? Infinity);
  r1 = Math.max(r1 + 1, level.exit.r, level.entry?.r ?? -Infinity);
  c0 = Math.min(c0 - 1, level.exit.c, level.entry?.c ?? Infinity);
  c1 = Math.max(c1 + 1, level.exit.c, level.entry?.c ?? -Infinity);

  const shift = ([r, c]: [number, number]): [number, number] => [r - r0, c - c0];
  const f = level.features;
  return {
    ...level,
    rows: r1 - r0 + 1,
    cols: c1 - c0 + 1,
    grid: level.grid.slice(r0, r1 + 1).map((row) => row.slice(c0, c1 + 1)),
    start: shift(level.start),
    exit: { ...level.exit, r: level.exit.r - r0, c: level.exit.c - c0 },
    ...(level.entry ? { entry: { ...level.entry, r: level.entry.r - r0, c: level.entry.c - c0 } } : {}),
    features: {
      stops: f.stops.map(shift),
      corners: f.corners.map((k) => ({ ...k, r: k.r - r0, c: k.c - c0 })),
      portals: f.portals.map((p) => ({ a: shift(p.a), b: shift(p.b) })),
      doubles: f.doubles.map(shift),
      fragile: f.fragile.map(shift),
      bombs: f.bombs.map(shift),
      coins: f.coins.map(shift),
      slides: (f.slides ?? []).map((s) => ({ ...s, entry: shift(s.entry), exit: shift(s.exit), path: s.path.map(shift) })),
      raised: (f.raised ?? []).map(shift),
      ramps: (f.ramps ?? []).map((k) => ({ ...k, r: k.r - r0, c: k.c - c0 })),
      collapse: (f.collapse ?? []).map(shift),
    },
  };
}

/** True when the level is already cropped: every outer interior row/column holds floor or a fragile wall. */
export function isCropped(level: Level): boolean {
  const used = (r: number, c: number) =>
    level.grid[r][c] === '.' ||
    level.features.fragile.some(([fr, fc]) => fr === r && fc === c) ||
    (level.features.slides ?? []).some((s) => s.path.some(([pr, pc]) => pr === r && pc === c));
  const rowUsed = (r: number) => Array.from({ length: level.cols }, (_, c) => c).some((c) => used(r, c));
  const colUsed = (c: number) => Array.from({ length: level.rows }, (_, r) => r).some((r) => used(r, c));
  return rowUsed(1) && rowUsed(level.rows - 2) && colUsed(1) && colUsed(level.cols - 2);
}
