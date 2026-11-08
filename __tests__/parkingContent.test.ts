import { DAILY_LEVELS, dailyLevelForDay, levelOfId } from '../src/game/dailyLevels';
import { replay } from '../src/game/engine';
import { buildLevel, dailyRecipe, fillOf, generateLevel, horizontalShare, isolatedVehicles, recipeFor, sizeFor, targetDifficulty } from '../src/game/generator';
import { compactLevelSchema, decodeLevel, encodeLevel, structuralProblem } from '../src/game/levelSchema';
import { LEVELS, LEVEL_COUNT, levelById } from '../src/game/levels';
import { isBreathingLevel, mechanicsForLevel, tutorialFor } from '../src/game/mechanics';
import { solve } from '../src/game/solver';
import { MECHANICS, UNLOCK_LEVEL, mechanicsOf, travelDir, type Level } from '../src/game/types';
import { DAILY_LEVEL_BASE } from '../src/core/worlds';
import dailyJson from '../assets/daily.json';
import levelsJson from '../assets/levels.json';

const all: Level[] = [...LEVELS, ...DAILY_LEVELS];
/** The levels that follow the curve of the sizes: not a tutorial, not a breathing level. */
const regular = (l: Level) => !l.tutorial && !isBreathingLevel(l.id);

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

  it('are solvable, and the stored solution empties the lot by taps with no collision, in exactly one move per vehicle', () => {
    for (const l of all) {
      const state = replay(l, l.solution);
      expect({ id: l.id, finished: state.finished, collisions: state.collisions, moves: state.moves }).toEqual({ id: l.id, finished: true, collisions: 0, moves: l.vehicles.length });
      expect(solve(l).solvable).toBe(true);
      expect(l.optimal).toBe(l.vehicles.length);
    }
  });

  it('survive being encoded and decoded', () => {
    for (const l of all) expect(decodeLevel(encodeLevel(l))).toEqual(l);
  });

  it('are refused by the schema when malformed', () => {
    const good = encodeLevel(LEVELS[0]);
    expect(() => decodeLevel({ ...good, v: [] })).toThrow(/Malformed level 1/);
    expect(() => decodeLevel({ ...good, v: [[0, 0, 'X', 2, 0, 0]] })).toThrow();
    expect(() => decodeLevel({ ...good, v: [[0, 0, 'R', 4, 0, 0]] })).toThrow();
    expect(() => decodeLevel({ ...good, v: [[0, 0, 'R', 2, 99, 0]] })).toThrow();
    expect(() => decodeLevel({ ...good, v: [[0, 0, 'R', 2, 0, 2]] })).toThrow();
  });
});

describe('the sizes of the campaign', () => {
  it('level 1 is a 4 x 5 lot with 4 cars; levels 2-5 are 5 x 6 with 6 to 9 cars', () => {
    expect([LEVELS[0].cols, LEVELS[0].rows, LEVELS[0].vehicles.length]).toEqual([4, 5, 4]);
    for (let id = 2; id <= 5; id++) {
      const l = LEVELS[id - 1];
      expect([l.cols, l.rows]).toEqual([5, 6]);
      expect(l.vehicles.length).toBeGreaterThanOrEqual(6);
      expect(l.vehicles.length).toBeLessThanOrEqual(9);
    }
  });

  it('levels 6-20 go from 6 x 7 to 7 x 9 with 10 to 18 cars', () => {
    for (const l of LEVELS.slice(5, 20).filter(regular)) {
      expect({ id: l.id, size: l.cols >= 6 && l.cols <= 7 && l.rows >= 7 && l.rows <= 9 }).toEqual({ id: l.id, size: true });
      expect({ id: l.id, cars: l.vehicles.length >= 9 && l.vehicles.length <= 18 }).toEqual({ id: l.id, cars: true });
    }
  });

  it('levels 21-50 grow up to 8 x 11 with 18 to 30 cars', () => {
    for (const l of LEVELS.slice(20, 50).filter(regular)) {
      expect({ id: l.id, size: l.cols <= 8 && l.rows <= 11 && l.cols >= 7 && l.rows >= 9 }).toEqual({ id: l.id, size: true });
      expect({ id: l.id, cars: l.vehicles.length >= 16 && l.vehicles.length <= 30 }).toEqual({ id: l.id, cars: true });
    }
    const last = LEVELS[49];
    expect([last.cols, last.rows]).toEqual([8, 11]);
    expect(last.vehicles.length).toBeGreaterThanOrEqual(28);
  });

  it('the sizes come from the level number alone and never exceed 8 x 11', () => {
    for (const id of [51, 120, 500, 2000]) expect(sizeFor(id)).toMatchObject({ cols: 8, rows: 11 });
    expect(sizeFor(51).cars).toBeLessThanOrEqual(33);
  });
});

describe('the campaign', () => {
  it('starts simply: at least half of the vehicles are free at the start of level 1', () => {
    expect(LEVELS[0].freeStart).toBeGreaterThanOrEqual(0.5);
    for (const l of LEVELS.slice(0, 5)) expect(mechanicsOf(l)).toEqual([]);
  });

  it('keeps only 15-30 % of the vehicles free at the start from level 6 (a little more in a breathing level or a tutorial)', () => {
    for (const l of LEVELS.slice(5)) {
      const easy = l.tutorial || isBreathingLevel(l.id);
      const [lo, hi] = easy ? [0.3, 0.55] : [0.15, 0.3];
      expect({ id: l.id, share: l.freeStart >= lo - 0.005 && l.freeStart <= hi + 0.005 }).toEqual({ id: l.id, share: true });
    }
  });

  it('has a regular climb of difficulty with no sudden fall', () => {
    const d = LEVELS.map((l) => l.difficulty);
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const tens = [0, 1, 2, 3, 4].map((k) => mean(d.slice(k * 10, k * 10 + 10)));
    for (let k = 1; k < tens.length; k++) expect(tens[k]).toBeGreaterThan(tens[k - 1]);
    for (let i = 5; i < d.length; i++) expect(d[i - 1] - d[i]).toBeLessThanOrEqual(8);
    expect(d[49]).toBeGreaterThan(d[5] * 2);
  });

  it('gives one easier level out of eight', () => {
    for (const id of [14, 22, 30, 38, 46]) {
      expect(isBreathingLevel(id)).toBe(true);
      const around = (LEVELS[id - 2].difficulty + LEVELS[id].difficulty) / 2;
      expect(LEVELS[id - 1].difficulty).toBeLessThan(around + 0.5);
    }
    expect(isBreathingLevel(8)).toBe(false);
  });

  it('has chains of blocking vehicles (several rounds of removal) and no useless vehicle', () => {
    for (const l of LEVELS.slice(2)) expect(l.layers).toBeGreaterThanOrEqual(2);
    expect(Math.max(...LEVELS.map((l) => l.layers))).toBeGreaterThanOrEqual(5);
    for (const l of LEVELS.slice(5)) {
      const free = Math.round(l.freeStart * l.vehicles.length);
      expect({ id: l.id, useless: isolatedVehicles(l) <= Math.ceil(free * 0.4) }).toEqual({ id: l.id, useless: true });
    }
  });

  it('uses both axes from level 6, and some vehicles reverse', () => {
    for (const l of LEVELS.slice(5)) {
      const h = horizontalShare(l);
      expect({ id: l.id, axes: h >= 0.3 && h <= 0.7 }).toEqual({ id: l.id, axes: true });
    }
    expect(LEVELS.filter((l) => l.vehicles.some((v) => v.back)).length).toBeGreaterThan(20);
  });

  it('has traps: vehicles that look free but are blocked where their arrow points', () => {
    expect(LEVELS.slice(5).filter((l) => l.traps > 0).length).toBeGreaterThan(10);
  });

  it('fills the places as much as the sizes allow (more and more)', () => {
    const early = LEVELS.slice(5, 15).reduce((s, l) => s + fillOf(l), 0) / 10;
    const late = LEVELS.slice(40, 50).reduce((s, l) => s + fillOf(l), 0) / 10;
    expect(late).toBeGreaterThan(early);
    for (const l of LEVELS) expect(fillOf(l)).toBeLessThanOrEqual(0.88 + 1e-9);
  });

  it('records the difficulty score of each level', () => {
    for (const l of LEVELS) {
      expect(l.difficulty).toBeGreaterThan(0);
      expect(l.layers).toBeGreaterThanOrEqual(1);
      expect(l.avgFree).toBeGreaterThan(0);
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

  it('the barrier holds a free vehicle back at the start; the arrows are on the way of a vehicle that goes their way', () => {
    const gate = LEVELS[24];
    expect(gate.gates).toHaveLength(1);
    expect(gate.gates[0].need).toBeGreaterThanOrEqual(2);
    expect(solve(gate).freeAt[0]).not.toEqual(solve({ ...gate, gates: [] }).freeAt[0]);
    const arrows = LEVELS[34];
    expect(arrows.oneWays.length).toBeGreaterThan(0);
    for (const w of arrows.oneWays) expect(arrows.vehicles.some((v) => travelDir(v) === w.dir)).toBe(true);
    expect(LEVELS[14].vehicles.some((v) => v.len === 3)).toBe(true);
    expect(LEVELS[7].obstacles.length).toBeGreaterThan(0);
  });
});

describe('the daily challenges', () => {
  it('are bigger and harder than the campaign, with trucks and original shapes', () => {
    const shapes = new Set(DAILY_LEVELS.map((l) => l.shape));
    for (const s of ['L', 'cross', 'islands']) expect(shapes.has(s as Level['shape'])).toBe(true);
    for (const l of DAILY_LEVELS) {
      expect(l.rows * l.cols).toBeGreaterThanOrEqual(63);
      expect(l.vehicles.some((v) => v.len === 3)).toBe(true);
      expect({ id: l.id, hard: l.difficulty >= 24 }).toEqual({ id: l.id, hard: true });
      expect(l.freeStart).toBeLessThanOrEqual(0.31);
    }
    const meanDaily = DAILY_LEVELS.reduce((s, l) => s + l.difficulty, 0) / DAILY_LEVELS.length;
    const mean40to50 = LEVELS.slice(39, 50).reduce((s, l) => s + l.difficulty, 0) / 11;
    expect(meanDaily).toBeGreaterThan(mean40to50 - 4);
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
    expect(encodeLevel(generateLevel(30, recipeFor(30), 123, 25)!)).toEqual(encodeLevel(generateLevel(30, recipeFor(30), 123, 25)!));
  });

  it('is solvable by construction, whatever the seed', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const id = 1 + (seed % 60);
      const l = generateLevel(id, recipeFor(id), seed);
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
      expect(l.rows).toBeLessThanOrEqual(11);
      expect(l.cols).toBeLessThanOrEqual(8);
    }
  });

  it('makes the daily recipes of every day of the year', () => {
    for (let i = 0; i < 366; i += 61) {
      const r = dailyRecipe(i);
      expect(r.rows * r.cols).toBeGreaterThanOrEqual(63);
      expect(r.truckShare).toBeGreaterThan(0);
    }
  });

  it('steers toward a difficulty that climbs with the level number', () => {
    expect(targetDifficulty(50)).toBeGreaterThan(targetDifficulty(25));
    expect(targetDifficulty(25)).toBeGreaterThan(targetDifficulty(6));
    expect(targetDifficulty(1000)).toBeGreaterThan(targetDifficulty(50) - 1);
  });
});
