import { t } from '../src/i18n';
import { applyMove, createState } from '../src/game/engine';
import { computeGuide, guideMode, guideView, GUIDE_IDLE_MS, type Guide } from '../src/game/guide';
import { LEVELS } from '../src/game/levels';
import type { Dir } from '../src/game/types';
import { makeLevel } from './helpers';

const move = (dir: Dir): Guide => ({ kind: 'move', dir });
const view = (levelId: number, idleMs: number, guide: Guide | null, extra: { busy?: boolean; blocked?: boolean; daily?: boolean } = {}) =>
  guideView({ levelId, daily: extra.daily ?? false, idleMs, busy: extra.busy ?? false, blocked: extra.blocked ?? false, guide });

describe('which levels have help', () => {
  it('level 1 shows it at once, levels 2 to 5 after a pause, nothing from level 6 or in a daily challenge', () => {
    expect(guideMode(1, false)).toBe('immediate');
    for (const id of [2, 3, 4, 5]) expect(guideMode(id, false)).toBe('idle');
    for (const id of [6, 7, 20, 49]) expect(guideMode(id, false)).toBeNull();
    expect(guideMode(3, true)).toBeNull();
  });
});

describe('what the help shows', () => {
  it('level 1: the arrow before every swipe, as soon as the solver has the answer', () => {
    expect(view(1, 0, move('R'))).toEqual({ show: 'arrow', dir: 'R' });
    expect(view(1, 0, null)).toEqual({ show: 'none' }); // the solver is still working
  });

  it('levels 2 to 5: nothing before 5 seconds without a swipe, the arrow after', () => {
    expect(GUIDE_IDLE_MS).toBe(5000);
    for (const id of [2, 3, 4, 5]) {
      expect(view(id, 0, move('U'))).toEqual({ show: 'none' });
      expect(view(id, 4999, move('U'))).toEqual({ show: 'none' });
      expect(view(id, 5000, move('U'))).toEqual({ show: 'arrow', dir: 'U' });
    }
  });

  it('never while a ball rolls or something covers the level', () => {
    expect(view(1, 9000, move('R'), { busy: true })).toEqual({ show: 'none' });
    expect(view(3, 9000, move('R'), { blocked: true })).toEqual({ show: 'none' });
    expect(view(3, 9000, { kind: 'stuck' }, { busy: true })).toEqual({ show: 'none' });
  });

  it('a position with no solution left asks to start again, whatever the pause', () => {
    for (const id of [1, 2, 5]) expect(view(id, 0, { kind: 'stuck' })).toEqual({ show: 'restart' });
  });

  it('from level 6 on: no automatic help at all', () => {
    for (const id of [6, 7, 40]) {
      expect(view(id, 60_000, move('R'))).toEqual({ show: 'none' });
      expect(view(id, 60_000, { kind: 'stuck' })).toEqual({ show: 'none' });
    }
    expect(view(2, 60_000, move('R'), { daily: true })).toEqual({ show: 'none' });
  });
});

describe('the next good swipe, from where the ball is', () => {
  it('following the help from the start finishes every one of the first five levels in the optimal number of swipes', () => {
    for (const level of LEVELS.slice(0, 5)) {
      const state = createState(level);
      let swipes = 0;
      while (!state.finished && swipes < 40) {
        const g = computeGuide(level, state);
        expect(g.kind).toBe('move');
        if (g.kind !== 'move') break;
        expect(applyMove(level, state, g.dir)).not.toBeNull();
        swipes++;
      }
      expect({ id: level.id, finished: state.finished, swipes }).toEqual({ id: level.id, finished: true, swipes: level.solution.length });
    }
  });

  it('after a swipe the help did not suggest, it works out the next one from the new position', () => {
    for (const level of LEVELS.slice(0, 5)) {
      const state = createState(level);
      const best = computeGuide(level, state);
      const other = (['U', 'D', 'L', 'R'] as Dir[]).find((d) => (best.kind !== 'move' || d !== best.dir) && applyMove(level, state, d) !== null);
      if (!other) continue;
      // the position changed: the new answer is computed from it (and it still finishes the level)
      let swipes = 0;
      while (!state.finished && swipes < 60) {
        const g = computeGuide(level, state);
        if (g.kind !== 'move') break;
        applyMove(level, state, g.dir);
        swipes++;
      }
      expect({ id: level.id, finished: state.finished }).toEqual({ id: level.id, finished: true });
    }
  });

  it('says "stuck" when no solution is left from here', () => {
    // the right-hand tile cannot be reached: nothing will ever open the gate
    const lost = makeLevel(['#####', '#.#.#', '#####'], [1, 1], {}, { r: 1, c: 4, dir: 'R' });
    expect(computeGuide(lost, createState(lost))).toEqual({ kind: 'stuck' });
  });
});

describe('a won level', () => {
  it('has nothing to solve: the help never runs the solver on the position of the ball standing on the gate', () => {
    for (const level of LEVELS.slice(0, 5)) {
      const state = createState(level);
      for (const m of level.solution) applyMove(level, state, m as Dir);
      expect(state.finished).toBe(true);
      expect(() => computeGuide(level, state)).not.toThrow();
    }
    // and the screen does not even ask
    const game = require('fs').readFileSync(require('path').join(__dirname, '../src/screens/GameScreen.tsx'), 'utf8');
    expect(game).toMatch(/!st \|\| st\.finished \|\| !guideMode/);
  });
});

import { startGuide } from '../src/game/guide';

describe('the search runs in the background, a few milliseconds at a time', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('gives the same answer as the direct search, without a single long block', () => {
    for (const level of LEVELS.slice(0, 5)) {
      const state = createState(level);
      let got: Guide | null = null;
      startGuide(level, state, (g) => (got = g));
      expect(got).toBeNull(); // nothing is computed in the swipe itself
      jest.advanceTimersByTime(5000);
      expect(got).toEqual(computeGuide(level, state));
    }
  });

  it('can be cancelled by the next swipe: the answer would be for the wrong position', () => {
    const level = LEVELS[2];
    const state = createState(level);
    let got: Guide | null = null;
    const cancel = startGuide(level, state, (g) => (got = g));
    cancel();
    jest.advanceTimersByTime(5000);
    expect(got).toBeNull();
  });

  it('a lost position is reported as stuck', () => {
    const lost = makeLevel(['#####', '#.#.#', '#####'], [1, 1], {}, { r: 1, c: 4, dir: 'R' });
    let got: Guide | null = null;
    startGuide(lost, createState(lost), (g) => (got = g));
    jest.advanceTimersByTime(5000);
    expect(got).toEqual({ kind: 'stuck' });
  });

  it('the screen only uses the sliced search', () => {
    const game = require('fs').readFileSync(require('path').join(__dirname, '../src/screens/GameScreen.tsx'), 'utf8');
    expect(game).toContain('startGuide(');
    expect(game).not.toContain('computeGuide(');
  });
});

describe('nothing to point at once every tile is painted', () => {
  it('no arrow when everything is painted (only the way out is left), in the first levels and with the hint button', () => {
    expect(guideView({ levelId: 1, daily: false, idleMs: 99_000, busy: false, blocked: false, guide: move('R'), allPainted: true })).toEqual({ show: 'none' });
    expect(guideView({ levelId: 3, daily: false, idleMs: 99_000, busy: false, blocked: false, guide: move('R'), allPainted: false })).toEqual({ show: 'arrow', dir: 'R' });
    const game = require('fs').readFileSync(require('path').join(__dirname, '../src/screens/GameScreen.tsx'), 'utf8');
    expect(game).toContain('allPainted: !!state.current && state.current.layers >= lv.layers');
    expect(game).toContain("t('game.allPainted')");
    expect(t('game.allPainted')).toBe('Tout est peint : rejoins la sortie !');
  });

  it('the arrow does not blink: no fade, no pulse, and no hand', () => {
    const arrow = require('fs').readFileSync(require('path').join(__dirname, '../src/render/HintArrow.tsx'), 'utf8');
    expect(arrow).not.toMatch(/white\.opacity|transparent: true|const fade|const pulse/);
    const game = require('fs').readFileSync(require('path').join(__dirname, '../src/screens/GameScreen.tsx'), 'utf8');
    expect(game).not.toContain('FirstHand');
  });
});
