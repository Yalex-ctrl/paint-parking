import * as THREE from 'three';

import levelsJson from '../assets/levels.json';
import { LEVEL_COLORS } from '../src/game/generator';
import { applyMove, createState, replay } from '../src/game/engine';
import { COINS_FROM_LEVEL, coinsForLevel } from '../src/game/progression';
import { createRng } from '../src/game/rng';
import { starsFor } from '../src/game/scoring';
import { solveFrom } from '../src/game/solver';
import type { Dir, Level } from '../src/game/types';

const levels = levelsJson as unknown as Level[];

describe('rng', () => {
  it('is deterministic per seed', () => {
    const a = createRng(7);
    const b = createRng(7);
    expect([a.next(), a.next(), a.int(0, 100)]).toEqual([b.next(), b.next(), b.int(0, 100)]);
    expect(createRng(8).next()).not.toBe(createRng(7).next());
  });
});

describe('coins', () => {
  it('has no coins in the first five levels, then one to three on every level (two on average)', () => {
    expect(COINS_FROM_LEVEL).toBe(6);
    for (const l of levels) {
      expect(l.features.coins.length).toBe(coinsForLevel(l.id));
      if (l.id <= 5) expect(l.features.coins.length).toBe(0);
      else expect(l.features.coins.length).toBeGreaterThanOrEqual(1);
      if (l.id > 5) expect(l.features.coins.length).toBeLessThanOrEqual(3);
    }
    const from6 = levels.filter((l) => l.id >= 6);
    const avg = from6.reduce((n, l) => n + l.features.coins.length, 0) / from6.length;
    expect(avg).toBeGreaterThan(1.9);
    expect(avg).toBeLessThan(2.1);
  });

  it('are optional: finishing never needs them', () => {
    for (const l of levels.slice(0, 300)) {
      const state = createState(l);
      for (const m of l.solution) applyMove(l, state, m as Dir);
      expect(state.finished).toBe(true);
    }
  });
});

describe('level colours', () => {
  const hueOf = (css: string) => {
    const out = { h: 0, s: 0, l: 0 };
    new THREE.Color(css).getHSL(out, THREE.SRGBColorSpace);
    return out.h * 360;
  };
  const BALL_HUE = hueOf('#ffcc33');

  it('uses no yellow, gold or orange, so the golden ball always stands out from the paint', () => {
    for (const color of LEVEL_COLORS) {
      const h = hueOf(color);
      expect(h < 15 || h > 70).toBe(true);
      const gap = Math.min(Math.abs(h - BALL_HUE), 360 - Math.abs(h - BALL_HUE));
      expect(gap).toBeGreaterThanOrEqual(40);
    }
  });

  it('every level of the campaign is painted in one of them', () => {
    for (const level of levels) expect(LEVEL_COLORS).toContain(level.color);
  });
});

describe('solver hints', () => {
  it('finds a continuation from a mid-game state on a small level', () => {
    const level = levels[40];
    const state = replay(level, level.solution.slice(0, 2));
    const hint = solveFrom(level, state, { maxStates: 200_000 });
    expect(hint).not.toBeNull();
    expect(hint!.moves.length).toBeLessThanOrEqual(level.solution.length - 2);
  });

  it('works from a state that already used special tiles', () => {
    const level = levels.find((l) => l.mechanics.includes('fragile') && l.id > 60 && l.solution.length < 16)!;
    const state = replay(level, level.solution.slice(0, 3));
    const hint = solveFrom(level, state, { maxStates: 300_000 });
    expect(hint).not.toBeNull();
  });

  it('finds a way out even after a detour', () => {
    const level = levels[30];
    const state = createState(level);
    const dirs: Dir[] = ['U', 'D', 'L', 'R'];
    for (let i = 0; i < 4; i++) for (const d of dirs) if (applyMove(level, state, d)) break;
    expect(solveFrom(level, state, { maxStates: 300_000 })).not.toBeNull();
  });
});

describe('stars', () => {
  it('3 = optimum, 2 = up to optimum x 1.25 (rounded up, at least +1), 1 beyond', () => {
    expect(starsFor(10, 10)).toBe(3);
    expect(starsFor(9, 10)).toBe(3);
    expect(starsFor(11, 10)).toBe(2);
    expect(starsFor(13, 10)).toBe(2); // 12.5 rounded up
    expect(starsFor(14, 10)).toBe(1);
    expect(starsFor(3, 2)).toBe(2); // at least one more than the optimum
    expect(starsFor(4, 2)).toBe(1);
  });
  it('optimal play always earns 3 stars on every level', () => {
    for (const level of levels) expect(starsFor(level.solution.length, level.solution.length)).toBe(3);
  });
});
