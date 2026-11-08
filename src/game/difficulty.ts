import { solveBeam } from './beam';
import { applyMove, createState, type GameState } from './engine';
import type { Dir, Level } from './types';

const DIRS: Dir[] = ['U', 'D', 'L', 'R'];

const cloneState = (s: GameState): GameState => ({
  ...s,
  pos: [s.pos[0], s.pos[1]],
  coat: s.coat.slice(),
  broken: s.broken.slice(),
  bombUsed: s.bombUsed.slice(),
  coins: s.coins.slice(),
});

export type PathStats = {
  /** Swipes of the solution. */
  swipes: number;
  /** Legal swipes at each state of the solution, on average. */
  choices: number;
  /** Of those, how many paint something new, minus one: the real alternatives the player has to weigh. */
  ambiguity: number;
};

/** Replays the solution and looks at the choices the player has at each of its states. */
export function pathStats(level: Level, moves: string = level.solution): PathStats {
  const state = createState(level);
  let legalSum = 0;
  let ambSum = 0;
  let n = 0;
  for (const m of moves) {
    let legal = 0;
    let painting = 0;
    for (const d of DIRS) {
      const probe = cloneState(state);
      const res = applyMove(level, probe, d);
      if (!res) continue;
      legal++;
      if (res.steps.some((s) => s.painted.length > 0 || (s.bomb && s.bomb.painted.length > 0))) painting++;
    }
    legalSum += legal;
    ambSum += Math.max(0, painting - 1);
    n++;
    applyMove(level, state, m as Dir);
  }
  return { swipes: moves.length, choices: n ? legalSum / n : 0, ambiguity: n ? ambSum / n : 0 };
}

/**
 * Share of the wrong turns that cannot be undone: from each state next to the solution, the swipes that leave it, and of
 * those, the ones after which a search no longer finds a way to finish (a broken wall, a used bomb, a coat on the wrong
 * side of a portal...). A search that gives up is counted as a trap, so this is an upper estimate; it is measured the same
 * way on every level, which is what the comparison of two curves needs.
 */
export function trapShare(level: Level, moves: string = level.solution, opts: { width?: number; timeMs?: number; maxProbes?: number } = {}): number {
  const width = opts.width ?? 120;
  const timeMs = opts.timeMs ?? 80;
  const maxProbes = opts.maxProbes ?? 36;
  const state = createState(level);
  const probes: { state: GameState }[] = [];
  for (const m of moves) {
    for (const d of DIRS) {
      if (d === m) continue;
      const s = cloneState(state);
      const res = applyMove(level, s, d);
      if (res && !res.exited) probes.push({ state: s });
    }
    applyMove(level, state, m as Dir);
  }
  if (probes.length === 0) return 0;
  // A spread of probes along the whole solution.
  const stride = Math.max(1, Math.floor(probes.length / maxProbes));
  const picked = probes.filter((_, i) => i % stride === 0).slice(0, maxProbes);
  let stuck = 0;
  for (const p of picked) {
    if (!solveBeam(level, p.state, { width, timeMs, maxDepth: moves.length * 2 + 6 })) stuck++;
  }
  return stuck / picked.length;
}

export const AMBIGUITY_WEIGHT = 6;
export const TRAP_WEIGHT = 25;

/** The score the generator steers by: swipes of the solution and the real choices along it. */
export const steerScore = (s: PathStats) => s.swipes + AMBIGUITY_WEIGHT * s.ambiguity;

/** The full difficulty: the steering score plus the traps. */
export const fullScore = (s: PathStats, traps: number) => steerScore(s) + TRAP_WEIGHT * traps;
