import type { BufferGeometry } from 'three';

import { DAILY_LEVELS } from '../src/game/dailyLevels';
import { DAILY_STARS, MAX_KINDS, MAX_SLIDES, kindsOf, newMechanicsOf, starsForIndex } from '../src/game/dailyMechanics';
import { analyzeSolution } from '../src/game/analysis';
import { applyMove, createState, hasInfiniteLoop } from '../src/game/engine';
import { LEVELS } from '../src/game/levels';
import { DAILY_ONLY, type Dir, type Level } from '../src/game/types';
import { BUDGET, estimateBudget } from '../src/render/budget';
import { buildContactShadowGeometry, buildSlabGeometry, buildWallGeometry } from '../src/render/geometry';
import { slidesProblem } from '../src/render/slidePath';
import { hiddenFloorCells } from '../src/render/visibility';

const tris = (g: BufferGeometry) => (g.index ? g.index.count : g.attributes.position.count) / 3;
const budgetOk = (level: Level) => {
  const board = tris(buildWallGeometry(level)) + tris(buildContactShadowGeometry(level)) + tris(buildSlabGeometry(level));
  const b = estimateBudget(level, board);
  return b.drawCalls < BUDGET.drawCalls && b.triangles < BUDGET.triangles;
};

describe('the 100 levels of the campaign', () => {
  it('are all solvable by their stored solution, in budget, without an endless slide', () => {
    for (const level of LEVELS) {
      const state = createState(level);
      for (const m of level.solution) applyMove(level, state, m as Dir);
      expect({ id: level.id, done: state.finished && state.layers >= level.layers, loop: hasInfiniteLoop(level), budget: budgetOk(level) }).toEqual({ id: level.id, done: true, loop: false, budget: true });
    }
  });

  it('hold none of the mechanics reserved for the daily challenges', () => {
    for (const l of LEVELS) expect(l.mechanics.some((m) => DAILY_ONLY.includes(m))).toBe(false);
  });
});

describe('the 366 daily challenges', () => {
  it('follow the mechanic of their weekday, with at most three kinds of piece and two slides', () => {
    expect(DAILY_LEVELS).toHaveLength(366);
    DAILY_LEVELS.forEach((l, index) => {
      const stars = starsForIndex(index);
      expect({ index, star: l.star }).toEqual({ index, star: stars[0] });
      for (const m of stars) expect({ index, m, has: l.mechanics.includes(m) }).toEqual({ index, m, has: true });
      expect(kindsOf(l)).toBeLessThanOrEqual(MAX_KINDS);
      expect(l.features.slides.length).toBeLessThanOrEqual(MAX_SLIDES);
      // a challenge only holds the new mechanics its weekday puts forward
      for (const m of DAILY_ONLY) if (l.mechanics.includes(m)) expect({ index, m, wanted: stars.includes(m) }).toEqual({ index, m, wanted: true });
    });
  });

  it('really use the mechanics of the day in their best solution', () => {
    DAILY_LEVELS.forEach((l, index) => {
      const usage = analyzeSolution(l, l.solution);
      for (const m of starsForIndex(index)) {
        if (m === 'slide' || m === 'tier' || m === 'collapse') expect({ index, m, used: usage[m] > 0 }).toEqual({ index, m, used: true });
      }
    });
  });

  it('keep every tile in view, stay in budget, never loop, and keep their slides over the board', () => {
    for (const l of DAILY_LEVELS) {
      expect({ id: l.id, hidden: hiddenFloorCells(l).length, loop: hasInfiniteLoop(l), over: slidesProblem(l), budget: budgetOk(l) }).toEqual({ id: l.id, hidden: 0, loop: false, over: null, budget: true });
    }
  });

  it('explain each new mechanic they hold, once (the bubbles of the first meeting)', () => {
    const l = DAILY_LEVELS[3];
    expect(newMechanicsOf(l)).toEqual(['slide', 'tier']);
    expect(DAILY_STARS).toHaveLength(7);
  });
});
