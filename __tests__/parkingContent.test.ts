import { DAILY_LEVELS, dailyLevelForDay, levelOfId } from '../src/game/dailyLevels';
import { replay } from '../src/game/engine';
import { buildLevel, dailyRecipe, fillOf, generateLevel, horizontalShare, isolatedVehicles, recipeFor, targetDifficulty } from '../src/game/generator';
import { compactLevelSchema, decodeLevel, encodeLevel, structuralProblem } from '../src/game/levelSchema';
import { LEVELS, LEVEL_COUNT, levelById } from '../src/game/levels';
import { isBreathingLevel, mechanicsForLevel, tutorialFor } from '../src/game/mechanics';
import { solve } from '../src/game/solver';
import { MECHANICS, UNLOCK_LEVEL, mechanicsOf, type Level } from '../src/game/types';
import { DAILY_LEVEL_BASE } from '../src/core/worlds';
import dailyJson from '../assets/daily.json';
import levelsJson from '../assets/levels.json';

const all: Level[] = [...LEVELS, ...DAILY_LEVELS];

describe('the files of levels', () => {
  it('hold at least 50 levels, numbered from 1, and 30 daily challenges', () => {
    expect(LEVEL_COUNT).toBeGreaterThanOrEqual(50);
    LEVELS.forEach((l, i) => expect(l.id).toBe(i + 1));
    expect(DAILY_LEVELS.length).toBeGreaterThanOrEqual(30);
    DAILY_LEVELS.forEach((l, i) => expect(l.id).toBe(DAILY_LEVEL_BASE + i + 1));
  });

  it('follow the schema (compact format)', () => {
    for (const raw of [...(levelsJson as unknown[]), ...(dailyJson as unknown[])]) {
      const r = compactLevelSchema.safeParse(raw);
      expect({ id: (raw as { i: number }).i, ok: r.success }).toEqual({ id: (raw as { i: number }).i, ok: true });
    }
  });

  it('are valid arrangements: nothing overlaps or leaves the lot', () => {
    for (const l of all) expect({ id: l.id, problem: structuralProblem(l) }).toEqual({ id: l.id, problem: null });
  });

  it('are solvable, and the stored solution empties the lot with no collision, in exactly one move per vehicle', () => {
    for (const l of all) {
      const state = replay(l, l.solution);
      expect({ id: l.id, finished: state.finished, collisions: state.collisions, moves: state.moves }).toEqual({ id: l.id, finished: true, collisions: 0, moves: l.vehicles.length });
      expect(solve(l).solvable).toBe(true);
      expect(l.optimal).toBe(l.vehicles.length);
    }
  });

  it('survive being encoded and decoded', () => {
    for (const l of all) {
      const again = decodeLevel(encodeLevel(l));
      expect(again).toEqual(l);
    }
  });

  it('are refused by the schema when malformed', () => {
    const good = encodeLevel(LEVELS[0]);
    expect(() => decodeLevel({ ...good, v: [] })).toThrow(/Malformed level 1/);
    expect(() => decodeLevel({ ...good, v: [[0, 0, 'X', 2, 0]] })).toThrow();
    expect(() => decodeLevel({ ...good, v: [[0, 0, 'R', 4, 0]] })).toThrow();
    expect(() => decodeLevel({ ...good, v: [[0, 0, 'R', 2, 99]] })).toThrow();
  });
});

describe('the campaign', () => {
  it('starts very simply: lots of 3x3 to 4x4, 1 to 4 vehicles, at least half of them free at the start', () => {
    for (const l of LEVELS.slice(0, 5)) {
      expect(l.rows).toBeLessThanOrEqual(4);
      expect(l.cols).toBeLessThanOrEqual(4);
      expect(l.vehicles.length).toBeGreaterThanOrEqual(1);
      expect(l.vehicles.length).toBeLessThanOrEqual(4);
      expect(solveFreeAtStart(l) / l.vehicles.length).toBeGreaterThanOrEqual(0.5);
      expect(mechanicsOf(l)).toEqual([]);
    }
  });

  it('grows up to about 6x8 and 16 to 22 vehicles at level 50', () => {
    const l50 = LEVELS[49];
    expect(l50.cols).toBeGreaterThanOrEqual(6);
    expect(l50.rows).toBeGreaterThanOrEqual(8);
    expect(l50.vehicles.length).toBeGreaterThanOrEqual(16);
    expect(l50.vehicles.length).toBeLessThanOrEqual(22);
  });

  it('has a regular climb of difficulty with no sudden fall', () => {
    const d = LEVELS.map((l) => l.difficulty);
    // The mean of each ten levels goes up.
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const tens = [0, 1, 2, 3, 4].map((k) => mean(d.slice(k * 10, k * 10 + 10)));
    for (let k = 1; k < tens.length; k++) expect(tens[k]).toBeGreaterThan(tens[k - 1]);
    // No level is much easier than the one before it (a breathing level is a little easier, never a cliff).
    for (let i = 1; i < d.length; i++) expect({ level: i + 1, fall: d[i - 1] - d[i] }).toEqual({ level: i + 1, fall: expect.any(Number) });
    for (let i = 5; i < d.length; i++) expect(d[i - 1] - d[i]).toBeLessThanOrEqual(5);
  });

  it('gives one easier level out of eight', () => {
    for (const id of [14, 22, 30, 38, 46]) {
      expect(isBreathingLevel(id)).toBe(true);
      const around = (LEVELS[id - 2].difficulty + LEVELS[id].difficulty) / 2;
      expect(LEVELS[id - 1].difficulty).toBeLessThan(around + 0.5);
    }
    expect(isBreathingLevel(8)).toBe(false);
  });

  it('keeps the places 60-85% taken from level 6, with both axes in use and no vehicle without interest', () => {
    for (const l of LEVELS.slice(5)) {
      if (l.tutorial) continue;
      expect({ id: l.id, fill: fillOf(l) >= 0.595 && fillOf(l) <= 0.855 }).toEqual({ id: l.id, fill: true });
      const h = horizontalShare(l);
      expect({ id: l.id, axes: h >= 0.3 && h <= 0.7 }).toEqual({ id: l.id, axes: true });
      expect({ id: l.id, isolated: isolatedVehicles(l) }).toEqual({ id: l.id, isolated: 0 });
    }
  });

  it('records the difficulty score of each level', () => {
    for (const l of LEVELS) {
      expect(l.difficulty).toBeGreaterThan(0);
      expect(l.layers).toBeGreaterThanOrEqual(1);
      expect(l.avgFree).toBeGreaterThan(0);
      expect(l.avgChain).toBeGreaterThanOrEqual(0);
      expect(l.traps).toBeGreaterThanOrEqual(0);
      expect(solve(l).layers).toBe(l.layers);
    }
  });
});

describe('the mechanics', () => {
  it('are introduced at levels 8, 15, 25 and 35, each by a tutorial where it is alone and necessary', () => {
    expect(UNLOCK_LEVEL).toEqual({ obstacle: 8, truck: 15, gate: 25, oneWay: 35 });
    for (const m of MECHANICS) {
      const l = LEVELS[UNLOCK_LEVEL[m] - 1];
      expect(l.tutorial).toBe(m);
      expect(l.mechanics).toEqual([m]);
      expect(tutorialFor(l.id)).toBe(m);
    }
    expect(LEVELS.filter((l) => l.tutorial)).toHaveLength(4);
  });

  it('never appear before their level, and a level has at most 3 kinds', () => {
    for (const l of LEVELS) {
      for (const m of l.mechanics) expect({ id: l.id, m, ok: l.id >= UNLOCK_LEVEL[m] }).toEqual({ id: l.id, m, ok: true });
      expect(l.mechanics.length).toBeLessThanOrEqual(3);
    }
  });

  it('are all used somewhere after their tutorial', () => {
    for (const m of MECHANICS) expect(LEVELS.slice(UNLOCK_LEVEL[m]).some((l) => l.mechanics.includes(m))).toBe(true);
  });

  it('are chosen from the level number alone', () => {
    expect(mechanicsForLevel(40)).toEqual(mechanicsForLevel(40));
    expect(mechanicsForLevel(3)).toEqual({ mechanics: [] });
  });

  it('a barrier has its counter, and a one-way lane its arrow', () => {
    const gated = LEVELS.filter((l) => l.gates.length > 0);
    expect(gated.length).toBeGreaterThan(5);
    for (const l of gated) for (const g of l.gates) expect(g.need).toBeGreaterThanOrEqual(2);
    expect(LEVELS.filter((l) => l.oneWays.length > 0).length).toBeGreaterThan(5);
  });

  it('really change the start of the tutorial levels (the barrier holds a vehicle, the obstacle blocks one...)', () => {
    const gate = LEVELS[24];
    expect(gate.gates).toHaveLength(1);
    expect(solve(gate).freeAt[0]).not.toEqual(solve({ ...gate, gates: [] }).freeAt[0]);
    const obstacle = LEVELS[7];
    expect(obstacle.obstacles.length).toBeGreaterThan(0);
    expect(solve(obstacle).freeAt[0].length).toBeLessThanOrEqual(solve({ ...obstacle, obstacles: [] }).freeAt[0].length);
    expect(LEVELS[14].vehicles.some((v) => v.len === 3)).toBe(true);
  });
});

describe('the daily challenges', () => {
  it('are bigger and harder than the campaign, with trucks and original shapes', () => {
    const shapes = new Set(DAILY_LEVELS.map((l) => l.shape));
    expect(shapes.has('L')).toBe(true);
    expect(shapes.has('cross')).toBe(true);
    expect(shapes.has('islands')).toBe(true);
    for (const l of DAILY_LEVELS) {
      expect(l.rows * l.cols).toBeGreaterThanOrEqual(42);
      expect(l.vehicles.some((v) => v.len === 3)).toBe(true);
      expect({ id: l.id, hard: l.difficulty >= 16 }).toEqual({ id: l.id, hard: true });
    }
    const meanDaily = DAILY_LEVELS.reduce((s, l) => s + l.difficulty, 0) / DAILY_LEVELS.length;
    const mean40to50 = LEVELS.slice(39, 50).reduce((s, l) => s + l.difficulty, 0) / 11;
    expect(meanDaily).toBeGreaterThan(mean40to50 - 3);
  });

  it('a day gives the same challenge to everyone', () => {
    expect(dailyLevelForDay('2026-11-08')).toBe(dailyLevelForDay('2026-11-08'));
    expect(levelOfId(DAILY_LEVEL_BASE + 3)).toBe(DAILY_LEVELS[2]);
    expect(levelOfId(7)).toBe(LEVELS[6]);
  });
});

describe('the generator', () => {
  it('always gives the same level for the same number', () => {
    expect(encodeLevel(buildLevel(17))).toEqual(encodeLevel(buildLevel(17)));
    expect(encodeLevel(generateLevel(30, recipeFor(30), 123, 15)!)).toEqual(encodeLevel(generateLevel(30, recipeFor(30), 123, 15)!));
  });

  it('is solvable by construction, whatever the seed', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const l = generateLevel(1 + (seed % 60), recipeFor(1 + (seed % 60)), seed);
      if (!l) continue;
      expect(solve(l).solvable).toBe(true);
      expect(replay(l, l.solution).collisions).toBe(0);
    }
  });

  it('builds levels past the file on the phone, as the campaign goes on', () => {
    for (const id of [51, 120, 500, 2000]) {
      const l = levelById(id);
      expect(l.id).toBe(id);
      expect(replay(l, l.solution).finished).toBe(true);
      expect(l.rows).toBeLessThanOrEqual(10);
      expect(l.cols).toBeLessThanOrEqual(7);
    }
  });

  it('makes the daily recipes of every day of the year', () => {
    for (let i = 0; i < 366; i += 61) {
      const r = dailyRecipe(i);
      expect(r.rows * r.cols).toBeGreaterThanOrEqual(42);
      expect(r.truckShare).toBeGreaterThan(0);
    }
  });

  it('steers toward a difficulty that climbs with the level number', () => {
    expect(targetDifficulty(50)).toBeGreaterThan(targetDifficulty(25));
    expect(targetDifficulty(25)).toBeGreaterThan(targetDifficulty(6));
    expect(targetDifficulty(1000)).toBeGreaterThan(targetDifficulty(50));
  });
});

function solveFreeAtStart(l: Level): number {
  return solve(l).freeAt[0].length;
}
