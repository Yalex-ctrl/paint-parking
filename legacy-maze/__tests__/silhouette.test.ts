import { DAILY_LEVELS } from '../src/game/dailyLevels';
import { LEVELS } from '../src/game/levels';
import { carvedOutCount, isFloorLike, isPresentCell } from '../src/game/silhouette';
import { floorSize } from '../src/game/sizeRules';
import { boardShadowAlpha, SHADOW_MARGIN } from '../src/render/boardShadow';

describe('board silhouette', () => {
  it('keeps every floor cell, and one wall all around it, on every stored level', () => {
    for (const l of [...LEVELS, ...DAILY_LEVELS]) {
      for (let r = 0; r < l.rows; r++) {
        for (let c = 0; c < l.cols; c++) {
          if (!isFloorLike(l, r, c)) continue;
          for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
              const rr = r + dr;
              const cc = c + dc;
              if (rr >= 0 && cc >= 0 && rr < l.rows && cc < l.cols) expect(isPresentCell(l, rr, cc)).toBe(true);
            }
          }
        }
      }
    }
  });

  it('leaves out the solid blocks deep inside big boards (no huge plain wooden areas)', () => {
    const big = LEVELS.filter((l) => l.id > 50);
    const withHoles = big.filter((l) => carvedOutCount(l) > 0).length;
    expect(withHoles).toBeGreaterThan(big.length * 0.5);
  });

  it('every stored level is cropped: all four sides of the floor touch the border wall', () => {
    for (const l of [...LEVELS, ...DAILY_LEVELS]) {
      expect([...l.grid[1]].includes('.')).toBe(true);
      expect([...l.grid[l.rows - 2]].includes('.')).toBe(true);
      expect(l.grid.some((row) => row[1] === '.')).toBe(true);
      expect(l.grid.some((row) => row[l.cols - 2] === '.')).toBe(true);
    }
  });

  it('draws a soft shadow of the built shape: dark under the board, nothing far away', () => {
    const l = LEVELS[89];
    const { w, h, alpha } = boardShadowAlpha(l);
    expect(alpha[0]).toBe(0);
    const c = Math.floor((l.exit.c + SHADOW_MARGIN + 0.5) * 6);
    const y = Math.floor(h - (l.exit.r + SHADOW_MARGIN + 0.5) * 6);
    expect(alpha[y * w + c]).toBeGreaterThan(0.5);
  });
});

describe('campaign size curve', () => {
  it('the grid really grows: small at first, 12x16 at the end, and the average never goes down by more than a hair', () => {
    const avg = (from: number, to: number) => {
      const xs = LEVELS.slice(from - 1, to).map((l) => floorSize(l).w * floorSize(l).h);
      return xs.reduce((a, b) => a + b, 0) / xs.length;
    };
    const ramp = [1, 26, 51, 76].map((s) => avg(s, s + 24));
    for (let i = 1; i < ramp.length; i++) expect(ramp[i]).toBeGreaterThanOrEqual(ramp[i - 1] - 6);
    expect(avg(1, 5)).toBeLessThan(30);
    expect(avg(LEVELS.length - 24, LEVELS.length)).toBeGreaterThan(70);
  });
});
