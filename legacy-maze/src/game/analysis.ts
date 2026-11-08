import { applyMove, buildBoard, createState, isOpen, measure } from './engine';
import { solve, type SolveOptions } from './solver';
import { MECHANICS, type Dir, type Level, type Mechanic } from './types';

export type Usage = {
  /** Moves that ended on a stop tile with open floor ahead (the tile really stopped the ball). */
  stop: number;
  /** Times the ball was turned by a corner. */
  corner: number;
  portal: number;
  fragile: number;
  /** Bombs that painted something. */
  bomb: number;
  /** Total coats needed on double tiles (inherent to the level). */
  double: number;
  /** Times the ball rode down a slide. */
  slide: number;
  /** Ramp tiles crossed (a platform is only worth anything when its ramp is taken). */
  tier: number;
  /** Tiles that collapsed behind the ball. */
  collapse: number;
};

/** Replays a solution and counts how it makes use of each mechanic. */
export function analyzeSolution(level: Level, moves: string): Usage {
  const b = buildBoard(level);
  const state = createState(level);
  const usage: Usage = { stop: 0, corner: 0, portal: 0, fragile: 0, bomb: 0, double: level.features.doubles.length, slide: 0, tier: 0, collapse: 0 };
  for (const m of moves) {
    const res = applyMove(level, state, m as Dir);
    if (!res) continue;
    if (res.reason === 'stop') {
      const end = res.end[0] * b.cols + res.end[1];
      const ahead = end + b.off[{ U: 0, D: 1, L: 2, R: 3 }[res.lastDir]];
      if (isOpen(b, state.broken, ahead)) usage.stop++;
    }
    res.steps.forEach((s, i) => {
      if (s.teleport) usage.portal++;
      if (s.slide >= 0) usage.slide++;
      if (b.rampUp[s.cell[0] * b.cols + s.cell[1]] >= 0) usage.tier++;
      const next = res.steps[i + 1];
      if (b.kind[s.cell[0] * b.cols + s.cell[1]] === 2 && next && next.dir !== s.dir) usage.corner++;
      if (s.bomb && s.bomb.painted.length > 0) usage.bomb++;
    });
    if (res.broke) usage.fragile++;
    usage.collapse += res.collapsed.length;
  }
  return usage;
}

/** The mechanics the given solution really relies on. */
export function usedMechanics(level: Level, moves: string): Mechanic[] {
  const u = analyzeSolution(level, moves);
  const used: Mechanic[] = [];
  for (const m of MECHANICS) if (u[m]) used.push(m);
  return used;
}

/** The same level with one mechanic taken away (to check that it is not decorative). */
export function stripMechanic(level: Level, mechanic: Mechanic): Level {
  const features = JSON.parse(JSON.stringify(level.features)) as Level['features'];
  switch (mechanic) {
    case 'stop':
      features.stops = [];
      break;
    case 'corner':
      features.corners = [];
      break;
    case 'portal':
      features.portals = [];
      break;
    case 'double':
      features.doubles = [];
      break;
    case 'fragile':
      features.fragile = []; // they stay plain walls
      break;
    case 'bomb':
      features.bombs = [];
      break;
    case 'slide':
      features.slides = []; // the entry is a plain tile again
      break;
    case 'tier':
      features.ramps = []; // the platform stays, and nothing leads to it
      break;
    case 'collapse':
      features.collapse = [];
      break;
  }
  return { ...level, features, ...measure(level.grid, features) };
}

/**
 * True when the mechanic matters: without it the level cannot be solved, or needs a
 * different number of swipes.
 */
export function isIndispensable(level: Level, mechanic: Mechanic, opts: SolveOptions = {}): boolean {
  const original = solve(level, opts);
  const stripped = solve(stripMechanic(level, mechanic), opts);
  if (!original) return false;
  return stripped === null || stripped.moves.length !== original.moves.length;
}
