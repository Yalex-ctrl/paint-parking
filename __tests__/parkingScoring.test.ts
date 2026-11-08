import { MONETIZATION } from '../src/core/config/monetization';
import { SCORING } from '../src/core/config/scoring';
import { levelScore, movePoints, targetSeconds, timePoints } from '../src/core/points';
import { applyTap, compile, createState } from '../src/game/engine';
import { GUIDE_IDLE_MS, guideMode, hintAvailable, nextHint } from '../src/game/guide';
import { LEVELS } from '../src/game/levels';
import { activeLimit, levelScoring, moveLimit, recomputeStars, starsFor, twoStarMoves } from '../src/game/scoring';
import { DAILY_LEVELS } from '../src/game/dailyLevels';

describe('stars', () => {
  it('3 with no collision, 2 with one or two, 1 with more', () => {
    expect(starsFor(10, 10)).toBe(3);
    expect(starsFor(11, 10)).toBe(2);
    expect(starsFor(12, 10)).toBe(2);
    expect(starsFor(13, 10)).toBe(1);
    expect(twoStarMoves(10)).toBe(12);
  });

  it('are worked out again from the best moves of an older save', () => {
    expect(recomputeStars({ 1: 3, 2: 3, 3: 2 }, { 1: 5, 2: 9 }, (id) => (id === 3 ? null : 5))).toEqual({ 1: 3, 2: 1, 3: 2 });
  });
});

describe('the limit of moves', () => {
  it('is none in levels 1-5, the vehicles + 3 in levels 6-20, the vehicles + 2 beyond', () => {
    for (let id = 1; id <= 5; id++) expect(moveLimit(id, 4)).toBeNull();
    expect(moveLimit(6, 5)).toBe(8);
    expect(moveLimit(20, 10)).toBe(13);
    expect(moveLimit(21, 10)).toBe(12);
    expect(moveLimit(500, 20)).toBe(22);
  });

  it('is never in force in a daily challenge', () => {
    expect(activeLimit(30, 10, true)).toBeNull();
    expect(activeLimit(30, 10, false)).toBe(12);
  });

  it('is shown with the thresholds of the stars', () => {
    expect(levelScoring(30, 10)).toEqual({ minimum: 10, limit: 12, twoStars: 12 });
  });

  it('leaves room to finish every level of the campaign with the optimum', () => {
    for (const l of LEVELS) {
      const limit = moveLimit(l.id, l.optimal);
      if (limit !== null) expect(limit).toBeGreaterThanOrEqual(l.optimal);
    }
  });
});

describe('points', () => {
  it('give 1000 x optimum / moves for the moves', () => {
    expect(movePoints(10, 10)).toBe(1000);
    expect(movePoints(10, 12)).toBeCloseTo(833.33, 1);
    expect(movePoints(10, 20)).toBe(500);
  });

  it('count a target time of 2 s + 1.2 s per vehicle', () => {
    expect(SCORING.targetBaseSec).toBe(2);
    expect(SCORING.targetPerOptimumSec).toBe(1.2);
    expect(targetSeconds(10)).toBeCloseTo(14, 5);
    expect(timePoints(10, 14)).toBe(1000);
    expect(timePoints(10, 42)).toBe(0);
  });

  it('make a perfect level with no collision, in time and without a hint', () => {
    const d = levelScore({ level: 50, optimum: 10, moves: 10, seconds: 10, hintUsed: false });
    expect(d.perfect).toBe(true);
    expect(d.total).toBe(Math.round((2000 * 1.5) / 10) * 10);
    expect(levelScore({ level: 50, optimum: 10, moves: 11, seconds: 10, hintUsed: false }).perfect).toBe(false);
  });
});

describe('the lives rules are the ones of Paint Maze', () => {
  it('levels 1-5 and the daily challenge cost no life', () => {
    expect(MONETIZATION.lives.freeUntilLevel).toBe(5);
    expect(MONETIZATION.moves.freeUntilLevel).toBe(5);
  });
});

describe('the help of the first levels', () => {
  it('shows the hand every time on level 1, after 5 s of doing nothing on levels 2-5, never after', () => {
    expect(guideMode(1)).toBe('always');
    for (const id of [2, 3, 4, 5]) expect(guideMode(id)).toBe('idle');
    expect(guideMode(6)).toBe('off');
    expect(GUIDE_IDLE_MS).toBe(5000);
  });

  it('the hint exists from level 6', () => {
    expect(hintAvailable(5)).toBe(false);
    expect(hintAvailable(6)).toBe(true);
  });

  it('always points at a vehicle that can leave now: following it finishes every level with no collision', () => {
    for (const l of [...LEVELS, ...DAILY_LEVELS]) {
      const board = compile(l);
      const state = createState(board);
      let guard = 0;
      while (!state.finished && guard++ < 100) {
        const hint = nextHint(board, state)!;
        expect(hint).not.toBeNull();
        const r = applyTap(board, state, hint.vehicle);
        expect({ id: l.id, kind: r.kind }).toEqual({ id: l.id, kind: 'exit' });
      }
      expect(state.finished).toBe(true);
      expect(state.collisions).toBe(0);
    }
  });

  it('level 1: a vehicle is pointed at from the very first move', () => {
    const board = compile(LEVELS[0]);
    const hint = nextHint(board, createState(board))!;
    expect(hint.vehicle).toBeGreaterThanOrEqual(0);
  });
});
