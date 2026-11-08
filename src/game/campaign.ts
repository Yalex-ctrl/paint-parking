import { isIndispensable } from './analysis';
import { coinsForLevel, mechanicsForLevel } from './progression';
import { RELIEF_FACTOR, isReliefLevel, targetSteer } from './curve';
import { pathStats, steerScore } from './difficulty';
import { createState } from './engine';
import { candidateSteps, openShareOfLevel, type Candidate, type LevelSpec } from './levelgen';
import { entrySideOf, exitSideOf } from './sides';
import { buildModel, solveSteps } from './solver';
import type { Level, Mechanic } from './types';

/**
 * The recipe of every level of the campaign (and of the ones generated later on the phone): size, rooms, mechanics and the
 * difficulty to aim for are all functions of the level number alone, so a level can always be rebuilt the same way.
 */

/** Largest board, in tiles of floor area: 12 columns by 16 rows (a tile stays at least about 26 px wide). */
export const MAX_COLS = 12;
export const MAX_ROWS = 16;

/** Share of floor tiles that belong to a 2x2 block of floor: levels 1-10, 11-50, then the rest. */
export const openRequired = (id: number) => (id <= 10 ? 0.2 : id <= 50 ? 0.35 : 0.45);

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/**
 * The size of the board follows the old campaign's size ramp (5x5 up to 11x13 over 500 levels) read 2.5 times faster, so the
 * new level N is about as big as the old level 2.5 x N: level 14 is about 6x6, level 100 about 9x12, full size by 200.
 */
const sizeRamp = (id: number) => {
  const t = clamp((2.5 * id - 1) / 499, 0, 1);
  return { w: 5 + 7 * Math.pow(t, 0.8), h: 5 + 11 * Math.pow(t, 0.8) };
};

/** Smallest floor area (tiles) a level from 3 on may have: most of what the ramp says. */
export const minFloorArea = (id: number) => {
  const { w, h } = sizeRamp(id);
  return Math.round(0.8 * w * h);
};

/** `bump` makes the recipe a little bigger (positive) or smaller (negative): used to steer toward the wanted difficulty. */
export function specForLevel(id: number, bump = 0, drop: readonly Mechanic[] = []): LevelSpec {
  const { mechanics: planned, tutorial } = mechanicsForLevel(id);
  const mechanics = planned.filter((m) => !drop.includes(m));
  // The size grows with the difficulty, reached 2.5 times earlier: full size by level 200.
  const t = Math.min(1, (2.5 * id) / 500);
  const ramp = sizeRamp(id);
  let cols = Math.round(ramp.w + bump * 0.6);
  let rows = Math.round(ramp.h + bump * 0.8);
  // Steering may make a board bigger, hardly ever much smaller than the ramp.
  cols = Math.max(cols, Math.round(ramp.w) - 1);
  rows = Math.max(rows, Math.round(ramp.h) - 1);
  if (id <= 2) {
    cols = 3;
    rows = 4;
  } else if (tutorial) {
    // A tutorial stays simple but never smaller than 4 x 4.
    cols = 5;
    rows = 5;
  } else {
    cols = Math.max(cols, 4);
    rows = Math.max(rows, 4);
  }
  cols = clamp(cols, 3, MAX_COLS);
  rows = clamp(rows, 4, MAX_ROWS);

  const tough = Math.max(0, id - 100);
  const counts: Partial<Record<Mechanic, number>> = tutorial
    ? { [tutorial]: 1 }
    : {
        corner: 1 + (id > 20 ? 1 : 0) + (id > 100 ? 1 : 0),
        stop: 1 + (id > 60 ? 1 : 0) + (id > 150 ? 1 : 0),
        portal: id > 120 ? 2 : 1,
        double: 1 + (id > 80 ? 1 : 0) + (id > 160 ? 1 : 0),
        fragile: 1 + (id > 140 ? 1 : 0),
        bomb: id > 150 ? 2 : 1,
      };
  return {
    id,
    plan: {
      rows,
      cols,
      entrySide: entrySideOf(id),
      exitSide: exitSideOf(id),
      rooms: Math.max(2, Math.round((rows * cols) / (id <= 2 ? 6 : 11)) + (bump > 0 ? 1 : 0)),
      pillars: id < 10 ? 0 : Math.min(8, 1 + Math.floor(id / 40) + Math.floor(tough / 60) + (bump > 0 ? 1 : 0)),
      wide: tutorial || id <= 2 ? 0.3 : 0.3 + 0.2 * t,
      // A margin over what has to be measured on the finished level.
      openMin: openRequired(id) + 0.03,
      fill: [0.38, 0.72],
    },
    mechanics,
    tutorial,
    coins: coinsForLevel(id),
    counts,
  };
}

/** The steering score wanted for level `id`. Levels 1 and 2 and the tutorials are not steered: they only have to be easy. */
export function wantedSteer(id: number): number {
  const base = targetSteer(id);
  return isReliefLevel(id) && !mechanicsForLevel(id).tutorial ? base * RELIEF_FACTOR : base;
}

export type BuildOptions = {
  /** Candidates to try at most. */
  attempts?: number;
  /** Stop looking after this long (ms) and take the best so far; leave out for a fully deterministic build. */
  timeMs?: number;
  /** How close to the wanted score (as a share of it) is good enough to stop. */
  tolerance?: number;
  /** Take the closest level found even when it is far from the wanted difficulty (the stored campaign must never have a hole). */
  acceptAny?: boolean;
  /** Looking for a better answer is worth it for the stored campaign, not for the phone. */
  exact?: boolean;
  /** The steering score to aim for, instead of the one of the curve (the stored campaign aims at the measured one of the old levels). */
  wanted?: number;
};

/** Floor tiles are one tile of wall away from the border of the cropped level: its floor is `rows - 2` by `cols - 2` at most. */
function sizeOk(level: Level, spec: LevelSpec): boolean {
  const w = level.cols - 2;
  const h = level.rows - 2;
  if (spec.tutorial) return w >= 4 && h >= 4;
  // Not much smaller than asked for: no tiny level among big ones.
  if (spec.id > 2 && w * h < minFloorArea(spec.id)) return false;
  return w >= spec.plan.cols - 1 && h >= spec.plan.rows - 1;
}

/** The shortest solution the exhaustive search can show, when the level is small enough for it. */
function* tighten(c: Candidate): Generator<void, Candidate, void> {
  if (c.stats.swipes > 22) return c;
  const exact = yield* solveSteps(c.level, createState(c.level), { maxStates: 150_000, maxMoves: c.stats.swipes - 1 }, buildModel(c.level));
  if (!exact) return c;
  const level = { ...c.level, solution: exact.moves };
  const stats = pathStats(level);
  return { ...c, level, stats, steer: steerScore(stats) };
}

/**
 * Builds level `id`: the first candidate whose difficulty is close enough to the curve, else the closest one found.
 * Deterministic in `attempts` (the same level every time) as long as no time limit is given.
 */
export function buildLevel(id: number, opts: BuildOptions = {}): Level | null {
  const steps = buildLevelSteps(id, opts);
  for (;;) {
    const r = steps.next();
    if (r.done) return r.value;
  }
}

/** The same build as a generator, pausing often: a phone runs it a few milliseconds at a time behind the level being played. */
export function* buildLevelSteps(id: number, opts: BuildOptions = {}): Generator<void, Level | null, void> {
  const attempts = opts.attempts ?? 400;
  const tolerance = opts.tolerance ?? 0.1;
  const deadline = opts.timeMs !== undefined ? Date.now() + opts.timeMs : Infinity;
  const tutorial = mechanicsForLevel(id).tutorial;
  const wanted = opts.wanted ?? wantedSteer(id);
  let best: { level: Level; miss: number } | null = null;
  let bump = 0;
  const recent: number[] = [];

  for (let k = 0; k < attempts && Date.now() < deadline; k++) {
    // After a long search without any candidate the lighter pieces are given up one by one, so the campaign never has a hole.
    const drop: Mechanic[] = [];
    if (k >= 250 && !best && !tutorial) drop.push('double');
    if (k >= 330 && !best && !tutorial) drop.push('bomb', 'portal');
    const spec = specForLevel(id, bump, drop);
    let cand: Candidate | null = yield* candidateSteps(spec, id * 1_000_003 + k * 7919);
    if (!cand) continue;
    if (!sizeOk(cand.level, spec)) continue;
    if (openShareOfLevel(cand.level) < openRequired(id)) continue;
    if (opts.exact !== false) cand = yield* tighten(cand);

    if (id <= 2) {
      if (cand.stats.swipes >= 2 && cand.stats.swipes <= 4) return cand.level;
      continue;
    }
    if (tutorial) {
      // A tutorial must show what the new tile does: without it the level is different (or impossible).
      if (cand.stats.swipes > 9 || !isIndispensable(cand.level, tutorial === 'slideDown' ? 'slide' : tutorial, { maxStates: 150_000 })) continue;
      return cand.level;
    }

    const miss = Math.abs(cand.steer - wanted) / wanted;
    if (!best || miss < best.miss) best = { level: cand.level, miss };
    if (miss <= tolerance) return cand.level;

    // Steer the recipe: too easy -> a bit bigger, too hard -> a bit smaller (within the limits of the board).
    recent.push(cand.steer - wanted);
    if (recent.length >= 12) {
      const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
      bump = clamp(bump + (mean < -wanted * 0.12 ? 1 : mean > wanted * 0.12 ? -1 : 0), -3, 5);
      recent.length = 0;
    }
  }
  return best && (opts.acceptAny || best.miss <= 0.4) ? best.level : null;
}
