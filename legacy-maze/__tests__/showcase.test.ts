import { applyMove, buildBoard, createState } from '../src/game/engine';
import { SHOWCASE_MOVES, showcaseLevel } from '../src/game/showcase';
import { OPPOSITE } from '../src/game/types';
import { hiddenFloorCells } from '../src/render/visibility';
import { slidesProblem } from '../src/render/slidePath';

describe('the showcase of the developer menu', () => {
  const level = showcaseLevel();

  it('has every piece it promises', () => {
    const f = level.features;
    expect(f.raised.length).toBeGreaterThan(0);
    expect(f.ramps).toHaveLength(1);
    expect(f.slides).toHaveLength(3);
    expect(f.doubles).toHaveLength(1);
    expect(f.fragile).toHaveLength(1);
    expect(f.stops).toHaveLength(1);
    expect(f.corners).toHaveLength(1);
    // one chute comes down from the platform, the other joins two low floors
    const raised = new Set(f.raised.map((c) => c.join()));
    expect(f.slides.filter((s) => raised.has(s.entry.join()) && !raised.has(s.exit.join()))).toHaveLength(1);
    expect(f.slides.filter((s) => !raised.has(s.entry.join()) && !raised.has(s.exit.join()))).toHaveLength(2);
    // one of them bends, one comes down from the platform, one is straight on the low floor
    expect(f.slides.some((s) => s.shape !== 'line')).toBe(true);
  });

  it('keeps its chutes over the board and every tile in view', () => {
    expect(slidesProblem(level)).toBeNull();
    expect(hiddenFloorCells(level)).toEqual([]);
  });

  it('plays its demonstration: ramp, platform, slide down, then the flap of the exit stops the ball', () => {
    const state = createState(level);
    const where: [number, number][] = [];
    for (const dir of SHOWCASE_MOVES) {
      const res = applyMove(level, state, dir);
      expect(res).not.toBeNull();
      where.push([state.pos[0], state.pos[1]]);
    }
    expect(where).toEqual([
      [6, 1],
      [9, 1],
      [9, 8],
      [1, 8],
      [1, 6],
      [2, 6],
      [2, 14],
      [2, 12],
      [5, 14],
      [5, 14],
    ]);
    // the ball is back on the exit tile of the platform's slide after a swipe toward it: it stopped against the flap
    const slide = level.features.slides[0];
    expect(OPPOSITE[slide.exitDir]).toBe('L');
    expect(buildBoard(level).slideTo.length).toBeGreaterThan(0);
  });

  it('shows the slide from the platform: it is taken from the platform and lands on the low floor', () => {
    const state = createState(level);
    for (const dir of SHOWCASE_MOVES.slice(0, 6)) applyMove(level, state, dir);
    const res = applyMove(level, state, 'R')!;
    expect(res.steps.some((s) => s.slide >= 0)).toBe(true);
  });
});
