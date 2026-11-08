import { isPresentCell } from '../game/silhouette';
import type { Level } from '../game/types';
import { groundY, wallTop } from './heights';

export type SurfaceKind = 'out' | 'floor' | 'wall';

/** What is under a world (x, z) point: used so splashes land on the board instead of falling into the void. */
export class BoardSurface {
  constructor(private readonly level: Level) {}

  col(x: number) {
    return Math.floor(x + this.level.cols / 2);
  }
  row(z: number) {
    return Math.floor(z + this.level.rows / 2);
  }

  /** Height of the floor at a point (a platform, the slope of a ramp). */
  groundAt(x: number, z: number): number {
    return groundY(this.level, x, z);
  }

  /** Height of the wall top at a point (the walls that stand on a platform are taller). */
  wallTopAt(x: number, z: number): number {
    return wallTop(this.level, this.row(z), this.col(x));
  }

  halfExtents() {
    return { x: this.level.cols / 2, z: this.level.rows / 2 };
  }

  /** Distance (in cells) from a point to the board rectangle; 0 on the board. */
  distOutside(x: number, z: number): number {
    return Math.hypot(Math.max(Math.abs(x) - this.level.cols / 2, 0), Math.max(Math.abs(z) - this.level.rows / 2, 0));
  }

  kind(x: number, z: number): SurfaceKind {
    const { rows, cols, grid, exit } = this.level;
    const r = this.row(z);
    const c = this.col(x);
    if (r < 0 || c < 0 || r >= rows || c >= cols) return 'out';
    if (!isPresentCell(this.level, r, c)) return 'out'; // not built: the grass of the island
    if (r === exit.r && c === exit.c) return 'wall'; // the gate, closed
    return grid[r][c] === '.' ? 'floor' : 'wall';
  }

  /**
   * Distance from a point on a wall top to the nearest rounded edge, so stains
   * are not drawn hanging over the bevel. Infinity when no edge is near.
   */
  edgeDistance(x: number, z: number): number {
    const u = x + this.level.cols / 2;
    const v = z + this.level.rows / 2;
    const c = Math.floor(u);
    const r = Math.floor(v);
    let d = Infinity;
    const open = (rr: number, cc: number) => this.kind(cc - this.level.cols / 2 + 0.5, rr - this.level.rows / 2 + 0.5) !== 'wall';
    if (open(r - 1, c)) d = Math.min(d, v - r);
    if (open(r + 1, c)) d = Math.min(d, r + 1 - v);
    if (open(r, c - 1)) d = Math.min(d, u - c);
    if (open(r, c + 1)) d = Math.min(d, c + 1 - u);
    return d;
  }
}
