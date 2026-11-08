import { DAILY_LEVELS } from '../src/game/dailyLevels';
import { createState } from '../src/game/engine';
import { verifyLevel } from '../src/game/generator';
import { MAX_COLS, MAX_ROWS, minFloorArea, openRequired, wantedSteer } from '../src/game/campaign';
import { pathStats, steerScore } from '../src/game/difficulty';
import { INWARD, entrySideOf, exitSideOf } from '../src/game/sides';
import { LEVELS, LEVEL_COUNT } from '../src/game/levels';
import { openShareOfLevel } from '../src/game/levelgen';
import { usedMechanics } from '../src/game/analysis';
import { isReliefLevel, oldCurve, targetSteer } from '../src/game/curve';
import { DAILY_ONLY, OPPOSITE, UNLOCK_LEVEL, type CampaignMechanic, type Dir, type Level, type Mechanic } from '../src/game/types';

const isFloor = (l: Level, r: number, c: number) => l.grid[r]?.[c] === '.';

describe('stored campaign', () => {
  it('has the 500 levels, numbered one after the other', () => {
    expect(LEVEL_COUNT).toBe(500);
    LEVELS.forEach((l, i) => expect(l.id).toBe(i + 1));
  });

  it('every level has an entry and an exit on the sides drawn from its number', () => {
    for (const l of LEVELS) {
      expect(l.entry).toBeDefined();
      expect(l.entry!.side).toBe(entrySideOf(l.id));
      expect(l.exit.dir).toBe(exitSideOf(l.id));
      expect(l.exit.dir).not.toBe('D'); // the way on is always up, left or right
      expect(l.exit.dir).not.toBe(l.entry!.side);
    }
    expect(LEVELS[0].entry!.side).toBe('D');
  });

  it('the entry of every level is on the side opposite to the exit of the one before', () => {
    for (let i = 1; i < LEVELS.length; i++) {
      expect(LEVELS[i].entry!.side).toBe(OPPOSITE[LEVELS[i - 1].exit.dir]);
    }
  });

  it('entry and exit are openings of the outer wall, and the ball starts on the floor behind the entry with a move to make', () => {
    for (const l of LEVELS) {
      const { entry, exit } = l;
      for (const p of [entry!, exit]) {
        const border = p.r === 0 || p.c === 0 || p.r === l.rows - 1 || p.c === l.cols - 1;
        expect(border).toBe(true);
      }
      const [dr, dc] = INWARD[entry!.side];
      expect([l.start[0], l.start[1]]).toEqual([entry!.r + dr, entry!.c + dc]);
      expect(isFloor(l, l.start[0], l.start[1])).toBe(true);
      // the start tile is not walled in: the solution begins with a legal first move
      expect(createState(l).finished).toBe(false);
      expect(l.solution.length).toBeGreaterThan(0);
    }
  });

  it('every level is solvable by its stored solution, which paints everything and leaves through the exit', () => {
    for (const l of LEVELS) expect({ id: l.id, ok: verifyLevel(l) }).toEqual({ id: l.id, ok: true });
  });

  it('stays within 12 columns x 16 rows, and tutorials are at least 4x4', () => {
    for (const l of LEVELS) {
      expect(l.cols - 2).toBeLessThanOrEqual(MAX_COLS);
      expect(l.rows - 2).toBeLessThanOrEqual(MAX_ROWS);
      if (l.tutorial) {
        expect(l.cols - 2).toBeGreaterThanOrEqual(4);
        expect(l.rows - 2).toBeGreaterThanOrEqual(4);
      }
    }
  });

  it('is as big as the old campaign was 2.5 times later: no tiny levels once past the first two', () => {
    for (const l of LEVELS) {
      if (l.id <= 2) continue;
      const w = l.cols - 2;
      const h = l.rows - 2;
      if (!l.tutorial) expect({ id: l.id, ok: w * h >= minFloorArea(l.id) }).toEqual({ id: l.id, ok: true });
    }
    // level 14 looks like the old level 35: about 6x6
    const l14 = LEVELS[13];
    expect(l14.cols - 2).toBeGreaterThanOrEqual(5);
    expect(l14.rows - 2).toBeGreaterThanOrEqual(5);
    expect((l14.cols - 2) * (l14.rows - 2)).toBeGreaterThanOrEqual(30);
  });

  it('has the open zones asked for: 20 % up to level 10, 35 % up to level 50, 45 % after', () => {
    expect(openRequired(10)).toBe(0.2);
    expect(openRequired(11)).toBe(0.35);
    expect(openRequired(50)).toBe(0.35);
    expect(openRequired(51)).toBe(0.45);
    for (const l of LEVELS) {
      // levels 1 and 2 are tiny and kept as plain as a first lesson allows
      if (l.id <= 2) continue;
      expect({ id: l.id, ok: openShareOfLevel(l) >= openRequired(l.id) - 1e-9 }).toEqual({ id: l.id, ok: true });
    }
  });

  it('introduces the mechanics at levels 3, 12, 25, 40, 60 and 80, each by a tutorial that uses it, and never before', () => {
    expect(UNLOCK_LEVEL).toEqual({ corner: 3, stop: 12, portal: 25, double: 40, fragile: 60, bomb: 80 });
    for (const l of LEVELS) {
      for (const m of l.mechanics) expect({ id: l.id, m, ok: UNLOCK_LEVEL[m as CampaignMechanic] <= l.id }).toEqual({ id: l.id, m, ok: true });
      if (l.tutorial) expect(l.id).toBe(UNLOCK_LEVEL[l.tutorial as CampaignMechanic]);
    }
    for (const [m, id] of Object.entries(UNLOCK_LEVEL) as [Mechanic, number][]) {
      const l = LEVELS[id - 1];
      expect(l.tutorial).toBe(m);
      expect(l.mechanics).toContain(m); // the lesson shows the new piece, and it is used
      expect(usedMechanics(l, l.solution)).toContain(m);
    }
  });

  it('has none of the three newest mechanics (slides, platforms, the collapsing floor): they belong to the daily challenges', () => {
    for (const l of LEVELS) {
      expect({ id: l.id, bad: l.mechanics.filter((m) => DAILY_ONLY.includes(m)) }).toEqual({ id: l.id, bad: [] });
      expect(l.features.slides).toHaveLength(0);
      expect(l.features.raised).toHaveLength(0);
      expect(l.features.ramps).toHaveLength(0);
      expect(l.features.collapse).toHaveLength(0);
      expect(l.tutorial === undefined || !DAILY_ONLY.includes(l.tutorial as never)).toBe(true);
    }
  });

  it('never mixes more than three kinds of mechanics in a level once the tutorials are over', () => {
    for (const l of LEVELS) if (!l.tutorial) expect({ id: l.id, n: l.mechanics.filter((m) => m !== 'corner' && m !== 'stop').length <= 3 }).toEqual({ id: l.id, n: true });
  });

  it('has corners in at least one level out of two from level 3', () => {
    for (let id = 3; id + 1 <= 100; id += 2) {
      const pair = [LEVELS[id - 1], LEVELS[id]];
      // the lesson of a mechanic shows that piece and not corners
      if (pair.some((l) => l.tutorial)) continue;
      expect({ id, ok: pair.some((l) => l.mechanics.includes('corner')) }).toEqual({ id, ok: true });
    }
  });

  it('has no coins before level 5', () => {
    for (const l of LEVELS.slice(0, 4)) expect(l.features.coins).toHaveLength(0);
  });
});

describe('difficulty curve', () => {
  const steer = (l: Level) => steerScore(pathStats(l));

  it('target is the old campaign at 2.5 times the speed up to level 500, increasing and capped in growth after', () => {
    for (const id of [1, 10, 40, 100, 200, 500]) expect(targetSteer(id)).toBeCloseTo(oldCurve(2.5 * id), 6);
    for (let id = 2; id <= 1500; id++) expect(targetSteer(id)).toBeGreaterThanOrEqual(targetSteer(id - 1) - 1e-9);
    expect(targetSteer(1500) - targetSteer(500)).toBeLessThan(40);
    expect(targetSteer(40)).toBeGreaterThan(targetSteer(10) * 1.3);
  });

  it('every block of 25 levels is as hard as the curve says (within 15 %), and gets harder', () => {
    let previous = 0;
    for (let from = 1; from + 24 <= LEVEL_COUNT; from += 25) {
      const block = LEVELS.slice(from - 1, from + 24);
      const got = block.reduce((a, l) => a + steer(l), 0) / 25;
      const want = block.reduce((a, l) => a + wantedSteer(l.id), 0) / 25;
      expect({ from, off: Math.abs(got - want) / want <= 0.15 }).toEqual({ from, off: true });
      expect(got).toBeGreaterThan(previous * 0.97);
      previous = got;
    }
  });

  it('relief levels (one in eight) are easier than their neighbours on average', () => {
    const relief = LEVELS.filter((l) => l.id > 30 && l.id <= 480 && isReliefLevel(l.id));
    const around = LEVELS.filter((l) => l.id > 30 && l.id <= 480 && !isReliefLevel(l.id));
    const avg = (ls: Level[]) => ls.reduce((a, l) => a + steer(l) / targetSteer(l.id), 0) / ls.length;
    expect(avg(relief)).toBeLessThan(avg(around));
  });

  it('the average solution grows along the campaign', () => {
    const avg = (from: number) => LEVELS.slice(from - 1, from + 24).reduce((a, l) => a + l.solution.length, 0) / 25;
    expect(avg(76)).toBeGreaterThan(avg(51));
    expect(avg(51)).toBeGreaterThan(avg(26));
    expect(avg(26)).toBeGreaterThan(avg(1));
  });
});

describe('daily challenges', () => {
  it('stay isolated levels: no entry needed, and solvable', () => {
    for (const l of DAILY_LEVELS.slice(0, 40)) {
      expect(verifyLevel(l)).toBe(true);
      expect((['U', 'D', 'L', 'R'] as Dir[]).includes(l.exit.dir)).toBe(true);
    }
  });
});
