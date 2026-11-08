import { verifyLevel } from '../src/game/generator';
import { clearInfiniteCache, fallbackLevel, generateInfiniteLevel } from '../src/game/infinite';
import { levelOfId } from '../src/game/dailyLevels';
import { MAX_COLS, MAX_ROWS, openRequired, specForLevel } from '../src/game/campaign';
import { openShareOfLevel } from '../src/game/levelgen';
import { INWARD, entrySideOf, exitSideOf } from '../src/game/sides';
import { LEVELS, LEVEL_COUNT } from '../src/game/levels';
import { solve, solveSteps } from '../src/game/solver';
import { createState } from '../src/game/engine';
import { OPPOSITE } from '../src/game/types';
import { themeForLevel } from '../src/core/worlds';

const FIRST = LEVEL_COUNT + 1;
const noWait = async () => {};

describe('levels after the stored campaign', () => {
  beforeEach(() => clearInfiniteCache());

  it('the sides continue the chain without building anything: entry of N+1 is opposite the exit of N', () => {
    for (let id = LEVEL_COUNT; id < LEVEL_COUNT + 400; id++) {
      expect(entrySideOf(id + 1)).toBe(OPPOSITE[exitSideOf(id)]);
      expect(exitSideOf(id)).not.toBe('D');
      expect(exitSideOf(id)).not.toBe(entrySideOf(id));
    }
    expect(entrySideOf(FIRST)).toBe(OPPOSITE[LEVELS[LEVEL_COUNT - 1].exit.dir]);
  });

  it('the next 100 levels are valid, solvable, linked, open enough, and within the grid limits', async () => {
    let prevExit = LEVELS[LEVEL_COUNT - 1].exit.dir;
    for (let id = FIRST; id < FIRST + 100; id++) {
      const level = await generateInfiniteLevel(id, { budgetMs: 120_000, defer: noWait });
      expect(level.id).toBe(id);
      expect(verifyLevel(level)).toBe(true);
      expect(level.entry!.side).toBe(OPPOSITE[prevExit]);
      expect(level.exit.dir).toBe(exitSideOf(id));
      const [dr, dc] = INWARD[level.entry!.side];
      expect([level.start[0], level.start[1]]).toEqual([level.entry!.r + dr, level.entry!.c + dc]);
      expect(level.cols - 2).toBeLessThanOrEqual(MAX_COLS);
      expect(level.rows - 2).toBeLessThanOrEqual(MAX_ROWS);
      // A level that fell back to a stored one is the same shape as a stored one, so it keeps its open zones too.
      expect(openShareOfLevel(level)).toBeGreaterThanOrEqual(openRequired(id) - 0.08);
      prevExit = level.exit.dir;
    }
  }, 3_600_000);

  it('asks for every unlocked mechanic over the range', () => {
    const seen = new Set<string>();
    for (let id = FIRST; id < FIRST + 100; id++) for (const m of specForLevel(id).mechanics) seen.add(m);
    expect([...seen].sort()).toEqual(['bomb', 'corner', 'double', 'fragile', 'portal', 'stop']);
  });

  it('is deterministic: the same level number gives the same level', async () => {
    const a = await generateInfiniteLevel(FIRST + 37, { budgetMs: 120_000, defer: noWait });
    clearInfiniteCache();
    const b = await generateInfiniteLevel(FIRST + 37, { budgetMs: 120_000, defer: noWait });
    expect(b.grid).toEqual(a.grid);
    expect(b.solution).toBe(a.solution);
  }, 300_000);

  it('works in small slices, giving the screen time to draw between them', async () => {
    let pauses = 0;
    const level = await generateInfiniteLevel(FIRST + 12, {
      budgetMs: 120_000,
      defer: async () => {
        pauses++;
      },
    });
    expect(verifyLevel(level)).toBe(true);
    expect(pauses).toBeGreaterThan(0);
  }, 300_000);

  it('falls back to a stored level, turned to fit, when the time runs out', async () => {
    for (const id of [FIRST + 55, FIRST + 56, FIRST + 57, FIRST + 58, FIRST + 59]) {
      clearInfiniteCache();
      let t = 0;
      const level = await generateInfiniteLevel(id, { budgetMs: 0, now: () => (t += 10), defer: noWait });
      expect(level.id).toBe(id);
      expect(level.solution).toBe(fallbackLevel(id).solution);
      expect(verifyLevel(level)).toBe(true);
      expect(level.entry!.side).toBe(entrySideOf(id));
      expect(level.exit.dir).toBe(exitSideOf(id));
      // The answer is remembered: asking again is instant.
      expect(await generateInfiniteLevel(id)).toBe(level);
    }
  });

  it('the fallback fits every pair of sides the chain can ask for', () => {
    for (let id = FIRST; id < FIRST + 300; id++) {
      const l = fallbackLevel(id);
      expect(l.entry!.side).toBe(entrySideOf(id));
      expect(l.exit.dir).toBe(exitSideOf(id));
      expect(verifyLevel(l)).toBe(true);
    }
  });

  it('the incremental solver finds the same answer as the plain one', () => {
    const level = LEVELS.find((l) => l.id > 20 && l.solution.length < 11)!;
    const plain = solve(level);
    const steps = solveSteps(level, createState(level));
    for (;;) {
      const r = steps.next();
      if (r.done) {
        expect(r.value?.moves).toBe(plain?.moves);
        break;
      }
    }
  });

  it('levelOfId serves them, and the worlds keep cycling', async () => {
    const level = await generateInfiniteLevel(FIRST + 101, { budgetMs: 120_000, defer: noWait });
    expect(levelOfId(FIRST + 101)).toBe(level);
    expect(levelOfId(FIRST + 5000).id).toBe(FIRST + 5000);
    expect(themeForLevel(501).id).toBe('forest');
    expect(themeForLevel(526).id).toBe('meadow');
  }, 300_000);
});
