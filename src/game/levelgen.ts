import { analyzeSolution } from './analysis';
import { withinBudget } from '../render/budget';
import { slidesProblem } from '../render/slidePath';
import { hiddenFloorCells } from '../render/visibility';
import { beamSteps, type BeamResult } from './beam';
import { cropLevel } from './crop';
import { pathStats, steerScore, type PathStats } from './difficulty';
import { createState, hasInfiniteLoop, measure } from './engine';
import { buildModel } from './solver';
import { countBranches, countDeadEnds, LEVEL_COLORS, verifyLevel } from './generator';
import { createRng, type Rng } from './rng';
import { pickSlide, placeCollapse, placeTier } from './newFeatures';
import { makePlan, openShare, type Plan, type PlanSpec } from './rooms';
import { DELTA, DIRS, OPPOSITE, emptyFeatures, mechanicsOf, type Corner, type Dir, type Features, type Level, type Mechanic, type Slide, type Tutorial } from './types';

/**
 * Builds a level in three steps: a floor plan made of rooms and corridors (rooms.ts), the special tiles placed on it,
 * then a search for a way to paint everything and leave (beam.ts). A plan that cannot be solved is simply not a level.
 */
export type LevelSpec = {
  id: number;
  plan: PlanSpec;
  mechanics: Mechanic[];
  /** The level introduces this mechanic: one of it, alone, on a small map. */
  tutorial?: Tutorial;
  coins: number;
  /** How many of each special tile to place (more than one for the later levels). */
  counts: Partial<Record<Mechanic, number>>;
};

const idx = (cols: number, r: number, c: number) => r * cols + c;

/** The four neighbours of an inner tile that are floor. */
function openSides(plan: Plan, r: number, c: number): Dir[] {
  const out: Dir[] = [];
  for (const d of DIRS) {
    const [dr, dc] = DELTA[d];
    const nr = r + dr;
    const nc = c + dc;
    if (nr >= 0 && nc >= 0 && nr < plan.rows && nc < plan.cols && plan.floor[idx(plan.cols, nr, nc)]) out.push(d);
  }
  return out;
}

type Placed = { features: Features; fragileCells: [number, number][] };

/** Puts the special tiles on the plan (inner coordinates). Null when the plan has no room for what was asked. */
function placeFeatures(plan: Plan, spec: LevelSpec, rng: Rng): Placed | null {
  const { rows, cols, floor } = plan;
  const features = emptyFeatures();
  const taken = new Set<number>([idx(cols, plan.start[0], plan.start[1]), idx(cols, plan.exitTile[0], plan.exitTile[1])]);
  const floorTiles: [number, number][] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (floor[idx(cols, r, c)]) floorTiles.push([r, c]);
  const free = () => rng.shuffle(floorTiles).filter(([r, c]) => !taken.has(idx(cols, r, c)));
  const take = (r: number, c: number) => taken.add(idx(cols, r, c));
  const want = (m: Mechanic) => (spec.mechanics.includes(m) ? Math.max(1, spec.counts[m] ?? 1) : 0);

  // A platform first: everything else is placed knowing which tiles are on it (the ramp is a tile nothing else may use).
  const raised = new Set<number>();
  if (want('tier')) {
    const tier = placeTier(plan, taken, rng, { min: 3, max: Math.max(3, Math.floor(floorTiles.length * 0.45)) });
    if (!tier) return null;
    for (const i of tier.raised) raised.add(i);
    features.raised = tier.raised.map((i) => [Math.floor(i / cols) + 1, (i % cols) + 1] as [number, number]);
    features.ramps.push({ r: Math.floor(tier.ramp.i / cols) + 1, c: (tier.ramp.i % cols) + 1, up: tier.ramp.up });
    taken.add(tier.ramp.i);
  }

  // Bends: tiles with exactly two perpendicular open sides become corners (the ball goes round without stopping).
  for (let k = 0, n = want('corner'); k < n; k++) {
    const bends = free().filter(([r, c]) => {
      const s = openSides(plan, r, c);
      return s.length === 2 && s[0][0] !== s[1][0] && !(['U', 'D'].includes(s[0]) && ['U', 'D'].includes(s[1])) && !(['L', 'R'].includes(s[0]) && ['L', 'R'].includes(s[1]));
    });
    // Rare: a corner in the middle of a room, which turns two of its sides into walls.
    const pick = bends[0] ?? (spec.tutorial ? undefined : free().find(([r, c]) => openSides(plan, r, c).length >= 3));
    if (!pick) return null;
    const [r, c] = pick;
    const s = openSides(plan, r, c);
    const perpendicular = (a: Dir, b: Dir) => (a === 'U' || a === 'D') !== (b === 'U' || b === 'D');
    const pairs: [Dir, Dir][] = [];
    for (const a of s) for (const b of s) if (a < b && perpendicular(a, b)) pairs.push([a, b]);
    const [a, b] = rng.shuffle(pairs)[0] ?? [s[0], s[1]];
    features.corners.push({ r: r + 1, c: c + 1, a, b } as Corner);
    take(r, c);
  }

  for (let k = 0, n = want('stop'); k < n; k++) {
    // On the straight part of a corridor or inside a room: a tile that has floor on both sides along one axis.
    const spots = free().filter(([r, c]) => {
      const s = openSides(plan, r, c);
      return (s.includes('U') && s.includes('D')) || (s.includes('L') && s.includes('R'));
    });
    if (!spots.length) return null;
    const [r, c] = spots[0];
    features.stops.push([r + 1, c + 1]);
    take(r, c);
  }

  for (let k = 0, n = Math.min(2, want('portal')); k < n; k++) {
    const tiles = free();
    const a = tiles[0];
    // A portal joins two tiles of the same floor: it never takes the ball up or down a platform.
    const b = tiles.find(([r, c]) => a && Math.abs(r - a[0]) + Math.abs(c - a[1]) >= Math.max(3, Math.floor((rows + cols) / 4)) && raised.has(idx(cols, r, c)) === raised.has(idx(cols, a[0], a[1])));
    if (!a || !b) return null;
    features.portals.push({ a: [a[0] + 1, a[1] + 1], b: [b[0] + 1, b[1] + 1] });
    take(a[0], a[1]);
    take(b[0], b[1]);
  }

  for (let k = 0, n = want('double'); k < n; k++) {
    const t = free()[0];
    if (!t) return null;
    features.doubles.push([t[0] + 1, t[1] + 1]);
    take(t[0], t[1]);
  }

  const fragileCells: [number, number][] = [];
  for (let k = 0, n = Math.min(3, want('fragile')); k < n; k++) {
    // A single wall between two floor tiles (it must be broken to paint it, and opens a way through when it goes).
    const walls: [number, number][] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (floor[idx(cols, r, c)] || taken.has(idx(cols, r, c))) continue;
        const f = (rr: number, cc: number) => rr >= 0 && cc >= 0 && rr < rows && cc < cols && floor[idx(cols, rr, cc)] === 1;
        // A wall with floor on both sides along one axis: a divider between two parts, or a pillar inside a room.
        if ((f(r - 1, c) && f(r + 1, c)) || (f(r, c - 1) && f(r, c + 1))) walls.push([r, c]);
      }
    }
    const w = rng.shuffle(walls)[0];
    if (!w) return null;
    features.fragile.push([w[0] + 1, w[1] + 1]);
    fragileCells.push(w);
    take(w[0], w[1]);
  }

  for (let k = 0, n = Math.min(2, want('bomb')); k < n; k++) {
    // A tile with floor all around it, so the blast has something to paint.
    const spots = free().filter(([r, c]) => openSides(plan, r, c).length >= 3);
    const t = (spots.length ? spots : free())[0];
    if (!t) return null;
    features.bombs.push([t[0] + 1, t[1] + 1]);
    take(t[0], t[1]);
  }

  // Slides over the walls (never over a fragile wall: it would be floor once broken).
  const over = new Set<number>(fragileCells.map(([r, c]) => idx(cols, r, c)));
  for (let k = 0, n = Math.min(2, want('slide')); k < n; k++) {
    const shapes: Slide['shape'][] = spec.id >= 40 ? ['line', 'L', 'S', 'spiral'] : ['line', 'L', 'S'];
    const base = { raised, taken, over, shapes };
    const wantsPlatform = raised.size > 0 && k === 0;
    const slide =
      (wantsPlatform ? pickSlide(plan, { ...base, fromPlatform: true, minShortcut: 3 }, rng) : null) ??
      pickSlide(plan, { ...base, minShortcut: 3 }, rng) ??
      pickSlide(plan, { ...base, minShortcut: 1 }, rng);
    if (!slide) return null;
    features.slides.push({
      ...slide,
      entry: [slide.entry[0] + 1, slide.entry[1] + 1],
      exit: [slide.exit[0] + 1, slide.exit[1] + 1],
      path: slide.path.map(([r, c]) => [r + 1, c + 1] as [number, number]),
    });
    take(slide.entry[0], slide.entry[1]);
    take(slide.exit[0], slide.exit[1]);
    for (const [r, c] of slide.path) over.add(idx(cols, r, c));
  }

  // Tiles that collapse behind the ball.
  if (want('collapse')) {
    const picks = placeCollapse(plan, taken, rng, want('collapse'));
    if (!picks) return null;
    for (const i of picks) {
      features.collapse.push([Math.floor(i / cols) + 1, (i % cols) + 1]);
      taken.add(i);
    }
  }

  // Coins: optional, on tiles without anything else.
  for (const [r, c] of free().slice(0, spec.coins)) features.coins.push([r + 1, c + 1]);
  return { features, fragileCells };
}

/** The level around a plan and its tiles, cropped, without a solution yet. */
export function assemble(plan: Plan, placed: Placed, spec: LevelSpec, seed: number): Level {
  const rows = plan.rows + 2;
  const cols = plan.cols + 2;
  const grid: string[] = [];
  for (let r = 0; r < rows; r++) {
    let line = '';
    for (let c = 0; c < cols; c++) {
      const inner = r >= 1 && c >= 1 && r <= plan.rows && c <= plan.cols;
      line += inner && plan.floor[idx(plan.cols, r - 1, c - 1)] ? '.' : '#';
    }
    grid.push(line);
  }
  const start: [number, number] = [plan.start[0] + 1, plan.start[1] + 1];
  // Entry: the ring tile behind the start, on the entry side. Exit: the ring tile beyond the exit tile.
  const [er, ec] = DELTA[OPPOSITE[plan.entrySide]];
  const entry = { r: start[0] - er, c: start[1] - ec, side: plan.entrySide };
  const [xr, xc] = DELTA[plan.exitSide];
  const exitTile: [number, number] = [plan.exitTile[0] + 1, plan.exitTile[1] + 1];
  const exit = { r: exitTile[0] + xr, c: exitTile[1] + xc, dir: plan.exitSide };
  const f = placed.features;
  const { floorCount, layers } = measure(grid, f);
  return cropLevel({
    id: spec.id,
    seed,
    rows,
    cols,
    grid,
    start,
    exit,
    entry,
    color: LEVEL_COLORS[seed % LEVEL_COLORS.length],
    solution: '',
    difficulty: 0,
    floorCount,
    layers,
    deadEnds: countDeadEnds(grid),
    branches: countBranches(grid),
    features: f,
    mechanics: mechanicsOf(f),
    tutorial: spec.tutorial,
  });
}

export type Candidate = { level: Level; stats: PathStats; steer: number; open: number };

export type CandidateLimits = {
  beamWidth?: number;
  beamMs?: number;
  /** Search twice and keep the shorter answer. */
  retries?: number;
};

/** Why tries failed, for tuning (counts by step). */
export const failStats: Record<string, number> = {};
const fail = (why: string): null => {
  failStats[why] = (failStats[why] ?? 0) + 1;
  return null;
};

/** One try: a plan, its tiles, a solution. Null when any step fails. */
export function tryCandidate(spec: LevelSpec, seed: number, limits: CandidateLimits = {}): Candidate | null {
  const steps = candidateSteps(spec, seed, limits);
  for (;;) {
    const r = steps.next();
    if (r.done) return r.value;
  }
}

/** The same try, as a generator that pauses often (the search for the solution is what takes the time). */
export function* candidateSteps(spec: LevelSpec, seed: number, limits: CandidateLimits = {}): Generator<void, Candidate | null, void> {
  const rng = createRng(seed);
  const plan = makePlan(spec.plan, rng);
  if (!plan) return fail('plan');
  const placed = placeFeatures(plan, spec, rng);
  if (!placed) return fail('features');
  const level = assemble(plan, placed, spec, seed);
  if (hasInfiniteLoop(level)) return fail('loop');
  // The new mechanics must not hide a tile from the camera, and the level must stay within the performance budget.
  // A chute stays over the board (never over the edge or the grass) and keeps its clearance over the walls.
  if (slidesProblem(level)) return fail('overhang');
  if (hiddenFloorCells(level).length > 0) return fail('hidden');
  if (!withinBudget(level)) return fail('budget');

  let best: string | null = null;
  const tries = limits.retries ?? 2;
  for (let k = 0; k < tries; k++) {
    const res: BeamResult | null = yield* beamSteps(level, createState(level), { width: limits.beamWidth ?? 350, timeMs: limits.beamMs ?? 900, maxDepth: 90, seed: seed + k * 7919 }, buildModel(level));
    if (res && (best === null || res.moves.length < best.length)) best = res.moves;
    if (!res && k === 0) return fail('beam'); // unsolvable by the search: do not insist
  }
  if (!best) return fail('beam');
  const solved: Level = { ...level, solution: best };
  if (!verifyLevel(solved)) return fail('verify');
  // Every mechanic asked for must really be used by the solution.
  const used = analyzeSolution(solved, best);
  const usage: Record<Mechanic, number> = used;
  for (const m of spec.mechanics) if (!usage[m]) return fail('unused-' + m);
  const stats = pathStats(solved);
  const open = openShareOfLevel(solved);
  return { level: solved, stats, steer: steerScore(stats), open };
}

/** Share of the floor tiles that belong to a 2x2 block of floor, measured on a finished level. */
export function openShareOfLevel(level: Level): number {
  const floor = new Uint8Array(level.rows * level.cols);
  for (let r = 0; r < level.rows; r++) for (let c = 0; c < level.cols; c++) if (level.grid[r][c] === '.') floor[r * level.cols + c] = 1;
  return openShare(floor, level.rows, level.cols);
}
