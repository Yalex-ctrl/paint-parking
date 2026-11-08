import { analyzeSolution } from '../src/game/analysis';
import { DAILY_LEVELS, dailyLevelForDay } from '../src/game/dailyLevels';
import { dailyLoadout, loadoutText, unownedOf } from '../src/core/dailyLoadout';
import { addDays, weekdayMonday0 } from '../src/core/dates';
import { canonicalShape, FUN, overlap } from '../src/game/funDaily';
import { verifyLevel } from '../src/game/generator';
import { difficultyScore } from '../src/game/scoring';
import { solve } from '../src/game/solver';
import { SHOP_ITEMS } from '../src/core/shopItems';

describe('the daily challenges', () => {
  it('are 366, one theme per weekday, all solvable, with many bends', () => {
    expect(DAILY_LEVELS).toHaveLength(366);
    for (const l of DAILY_LEVELS) {
      expect(verifyLevel(l)).toBe(true);
      expect(l.features.corners.length).toBeGreaterThanOrEqual(FUN.minCornersUsed);
    }
  });

  it('every solution goes round at least four bends, and is long enough', () => {
    for (const l of DAILY_LEVELS) {
      const u = analyzeSolution(l, l.solution);
      expect({ id: l.id, bends: u.corner >= FUN.minCornersUsed }).toEqual({ id: l.id, bends: true });
      expect(l.solution.length).toBeGreaterThanOrEqual(FUN.minSwipesTeleport);
    }
    // the great majority of the bends of the figure are really crossed in one swipe or another
    const some = DAILY_LEVELS.filter((_, i) => i % 11 === 0);
    expect(some.every((l) => analyzeSolution(l, l.solution).corner >= 4)).toBe(true);
  });

  it('are as hard as levels 150 to 200 of the campaign by the same score (137 to 205, median 175)', () => {
    const scores: number[] = [];
    for (const l of DAILY_LEVELS.filter((_, i) => i % 6 === 0)) {
      const res = solve(l, { maxStates: 400_000, maxMoves: 48 })!;
      expect(res.moves.length).toBe(l.solution.length);
      scores.push(difficultyScore({ optimalMoves: res.moves.length, deadEnds: l.deadEnds, floorCount: l.layers, states: res.states }));
    }
    for (const s of scores) {
      expect(s).toBeGreaterThanOrEqual(FUN.minDifficulty);
      expect(s).toBeLessThanOrEqual(FUN.maxDifficulty);
    }
    const median = scores.sort((a, b) => a - b)[Math.floor(scores.length / 2)];
    expect(median).toBeGreaterThan(155);
    expect(median).toBeLessThan(215);
  });

  it('have no two the same shape, in any orientation', () => {
    const shapes = new Set(DAILY_LEVELS.map(canonicalShape));
    expect(shapes.size).toBe(366);
    // and no two of the same size share nearly the same floor
    const bySize = new Map<string, typeof DAILY_LEVELS>();
    for (const l of DAILY_LEVELS) bySize.set(`${l.rows}x${l.cols}`, [...(bySize.get(`${l.rows}x${l.cols}`) ?? []), l]);
    for (const group of bySize.values()) {
      for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) expect(overlap(group[i], group[j])).toBeLessThanOrEqual(0.8);
    }
  });

  it('follow the day of the week: slides on Monday, platforms Tuesday, the collapsing floor Wednesday, slides and platforms Thursday, spiral bends Friday, portals and bombs Saturday, a mix on Sunday', () => {
    for (let i = 0; i < 14; i++) {
      const day = addDays('2026-06-01', i); // a Monday
      const level = dailyLevelForDay(day);
      expect((level.id - 100000 - 1) % 7).toBe(weekdayMonday0(day));
    }
    const of = (weekday: number) => DAILY_LEVELS.filter((_, i) => i % 7 === weekday);
    expect(of(0).every((l) => l.features.slides.length > 0)).toBe(true);
    expect(of(1).every((l) => l.features.raised.length > 0 && l.features.ramps.length > 0)).toBe(true);
    expect(of(2).every((l) => l.features.collapse.length > 0)).toBe(true);
    expect(of(3).every((l) => l.features.slides.length > 0 && l.features.raised.length > 0)).toBe(true);
    expect(of(4).every((l) => l.features.corners.length >= 4)).toBe(true);
    expect(of(5).every((l) => l.features.portals.length > 0 && l.features.bombs.length > 0)).toBe(true);
    expect(of(6).every((l) => l.features.slides.length > 0 && l.features.collapse.length > 0)).toBe(true);
  });

  it('use the x2 tiles and stop pockets: the corridors are not plain', () => {
    const withDoubles = DAILY_LEVELS.filter((l) => l.features.doubles.length > 0).length;
    expect(withDoubles).toBeGreaterThan(200);
    expect(DAILY_LEVELS.every((l) => l.features.stops.length >= 3)).toBe(true);
  });
});

describe('the ball and the paint of the day', () => {
  it('are the same for everyone on a given date, come from the whole catalogue, and change from day to day', () => {
    const a = dailyLoadout('2026-05-12');
    const b = dailyLoadout('2026-05-12');
    expect(a.ball.id).toBe(b.ball.id);
    expect(a.paint.id).toBe(b.paint.id);
    expect(a.ball.kind).toBe('ball');
    expect(a.paint.kind).toBe('paint');
    expect(SHOP_ITEMS.some((i) => i.id === a.ball.id)).toBe(true);
    const seen = new Set<string>();
    for (let i = 0; i < 60; i++) seen.add(dailyLoadout(addDays('2026-01-01', i)).ball.id);
    expect(seen.size).toBeGreaterThan(15);
  });

  it('can be items the player does not own, which the card after the challenge offers', () => {
    const l = dailyLoadout('2026-05-12');
    expect(unownedOf(l, [])).toHaveLength(2);
    expect(unownedOf(l, [l.ball.id, l.paint.id])).toHaveLength(0);
    expect(loadoutText(l)).toMatch(/^Aujourd’hui : balle .+ \+ peinture .+$/);
  });

  it('only apply to the challenge: the game keeps the equipment of the player', () => {
    const fs = require('fs');
    const path = require('path');
    const game = fs.readFileSync(path.join(__dirname, '../src/screens/GameScreen.tsx'), 'utf8');
    expect(game).toMatch(/dailyKit\?\.ball\.id \?\? profile\.equipped\.ball/);
    expect(game).toMatch(/dailyKit\?\.paint\.id \?\? profile\.equipped\.paint/);
    expect(game).toMatch(/isDailyNow \? dailyLoadout/);
  });
});
