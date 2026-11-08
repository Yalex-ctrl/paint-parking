import dailyJson from '../assets/daily.json';
import levelsJson from '../assets/levels.json';
import { applyMove, createState } from '../src/game/engine';
import { DAILY_LEVELS } from '../src/game/dailyLevels';
import { levelSchema, normalizeLevel, validateLevel } from '../src/game/levelSchema';
import { LEVELS } from '../src/game/levels';
import type { Dir, Level } from '../src/game/types';

const LISTS = ['stops', 'corners', 'portals', 'doubles', 'fragile', 'bombs', 'coins', 'slides', 'raised', 'ramps', 'collapse'] as const;

describe('the format of a level', () => {
  it('is checked by the schema for every level of the campaign and every daily challenge', () => {
    expect(DAILY_LEVELS).toHaveLength(366);
    for (const raw of [...(levelsJson as unknown[]), ...(dailyJson as unknown[])]) {
      const r = levelSchema.safeParse(raw);
      expect({ id: (raw as { id: number }).id, ok: r.success, why: r.success ? '' : r.error.issues[0]?.message }).toEqual({ id: (raw as { id: number }).id, ok: true, why: '' });
    }
  });

  it('gives every optional list a value after normalisation (a file made before the slides has no list of slides)', () => {
    const old = { ...(dailyJson as unknown as Level[])[0], features: { stops: [], coins: [] } };
    const level = normalizeLevel(old);
    for (const k of LISTS) expect(Array.isArray(level.features[k])).toBe(true);
    for (const l of [...LEVELS, ...DAILY_LEVELS]) for (const k of LISTS) expect(Array.isArray(l.features[k])).toBe(true);
  });

  it('refuses a malformed level, and says which one', () => {
    const bad = { ...(levelsJson as unknown as Level[])[0], grid: 'not a grid' };
    expect(() => validateLevel(bad)).toThrow(/Malformed level 1/);
    expect(() => validateLevel({ ...(levelsJson as unknown as Level[])[0], start: [1] })).toThrow(/Malformed level/);
  });
});

describe('the stored solutions', () => {
  const replay = (level: Level) => {
    const state = createState(level);
    for (const m of level.solution) {
      const res = applyMove(level, state, m as Dir);
      if (!res) return { ok: false, why: `move ${m} did nothing` };
    }
    return { ok: state.finished && state.layers >= level.layers, why: `finished ${state.finished}, coats ${state.layers}/${level.layers}` };
  };

  it('of all the levels of the campaign paint everything and leave through the exit, without an exception', () => {
    for (const l of LEVELS) expect({ id: l.id, ...replay(l) }).toEqual({ id: l.id, ok: true, why: expect.any(String) });
  });

  it('of all the 366 daily challenges paint everything and leave through the exit, without an exception', () => {
    for (const l of DAILY_LEVELS) expect({ id: l.id, ...replay(l) }).toEqual({ id: l.id, ok: true, why: expect.any(String) });
  });
});
