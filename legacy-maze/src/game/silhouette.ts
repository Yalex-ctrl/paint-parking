import type { Level } from './types';

/**
 * The visible shape of the board. A level is a rectangle of cells, but wall cells that touch no floor (not even
 * by a corner) are not built: they would only be big plain slabs of wood. The board follows its corridors,
 * with exactly one wall all around them, and the island's grass shows where the solid blocks used to be.
 */
export function isFloorLike(level: Level, r: number, c: number): boolean {
  if (r < 0 || c < 0 || r >= level.rows || c >= level.cols) return false;
  if (level.grid[r][c] === '.') return true;
  if (r === level.exit.r && c === level.exit.c) return true;
  if (level.entry && r === level.entry.r && c === level.entry.c) return true;
  return level.features.fragile.some(([fr, fc]) => fr === r && fc === c);
}

const trackCache = new WeakMap<Level, Set<number>>();
/** The wall cells a chute runs over: they are built (a chute never hangs over the grass), whatever the floor around them. */
function trackCells(level: Level): Set<number> {
  let set = trackCache.get(level);
  if (!set) {
    set = new Set();
    for (const s of level.features.slides ?? []) for (const [r, c] of s.path) set.add(r * level.cols + c);
    trackCache.set(level, set);
  }
  return set;
}

/** True for the cells that exist: corridors, the exit, fragile walls, the wall that touches them, and the wall under a chute. */
export function isPresentCell(level: Level, r: number, c: number): boolean {
  if (r < 0 || c < 0 || r >= level.rows || c >= level.cols) return false;
  if (trackCells(level).has(r * level.cols + c)) return true;
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (isFloorLike(level, r + dr, c + dc)) return true;
  return false;
}

/** Cells of the rectangle that are not built. */
export function carvedOutCount(level: Level): number {
  let n = 0;
  for (let r = 0; r < level.rows; r++) for (let c = 0; c < level.cols; c++) if (!isPresentCell(level, r, c)) n++;
  return n;
}
