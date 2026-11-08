import levelsJson from '../assets/levels.json';
import type { Level } from '../src/game/types';
import { buildContactShadowGeometry, buildCornerWallGeometry, buildWallGeometry } from '../src/render/geometry';
import { BASE_Y, WALL_H } from '../src/render/coords';

const levels = levelsJson as unknown as Level[];

/** Every triangle must face the same way as its stored vertex normals (no inside-out faces). */
function checkWinding(geo: ReturnType<typeof buildWallGeometry>, expectNormals: boolean) {
  const pos = geo.getAttribute('position');
  const nor = geo.getAttribute('normal');
  const idx = geo.getIndex()!;
  let bad = 0;
  for (let t = 0; t < idx.count; t += 3) {
    const [a, b, c] = [idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)];
    const ab = [pos.getX(b) - pos.getX(a), pos.getY(b) - pos.getY(a), pos.getZ(b) - pos.getZ(a)];
    const ac = [pos.getX(c) - pos.getX(a), pos.getY(c) - pos.getY(a), pos.getZ(c) - pos.getZ(a)];
    const n = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ];
    if (Math.hypot(n[0], n[1], n[2]) < 1e-9) continue; // degenerate sliver
    const ref = expectNormals ? [nor.getX(a), nor.getY(a), nor.getZ(a)] : [0, 1, 0];
    if (n[0] * ref[0] + n[1] * ref[1] + n[2] * ref[2] <= 0) bad++;
  }
  return bad;
}

describe('render geometry', () => {
  it.each([1, 20, 50, 80, 100])('wall mesh of level %p is valid and outward-facing', (id) => {
    const geo = buildWallGeometry(levels[id - 1]);
    const p = geo.getAttribute('position');
    for (let i = 0; i < p.array.length; i++) expect(Number.isFinite(p.array[i])).toBe(true);
    expect(geo.getIndex()!.count).toBeGreaterThan(0);
    expect(checkWinding(geo, true)).toBe(0);
  });

  it('contact shadows lie flat and face up', () => {
    const geo = buildContactShadowGeometry(levels[60]);
    expect(geo.getAttribute('color').itemSize).toBe(4);
    expect(checkWinding(geo, false)).toBe(0);
  });

  it('leaves a hole in the wall block where a fragile wall stands (it is a separate block)', () => {
    const level = levels.find((l) => l.features.fragile.length > 0)!;
    const geo = buildWallGeometry(level);
    const pos = geo.getAttribute('position');
    const idx = geo.getIndex()!;
    const [fr, fc] = level.features.fragile[0];
    const cx = fc - level.cols / 2 + 0.5;
    const cz = fr - level.rows / 2 + 0.5;
    for (let t = 0; t < idx.count; t += 3) {
      const ys = [0, 1, 2].map((k) => pos.getY(idx.getX(t + k)));
      if (ys.some((y) => y < WALL_H - 0.2)) continue; // only the top surface
      const mx = [0, 1, 2].reduce((n, k) => n + pos.getX(idx.getX(t + k)), 0) / 3;
      const mz = [0, 1, 2].reduce((n, k) => n + pos.getZ(idx.getX(t + k)), 0) / 3;
      expect(Math.abs(mx - cx) < 0.5 && Math.abs(mz - cz) < 0.5).toBe(false);
    }
  });

  it.each([
    ['D', 'R'],
    ['U', 'L'],
    ['D', 'L'],
    ['U', 'R'],
  ])('the curved wall of a %s+%s corner stays within the tile and is finite', (a, b) => {
    const geo = buildCornerWallGeometry(a, b);
    const p = geo.getAttribute('position');
    expect(p.count).toBeGreaterThan(0);
    for (let i = 0; i < p.count; i++) {
      for (const v of [p.getX(i), p.getY(i), p.getZ(i)]) expect(Number.isFinite(v)).toBe(true);
      expect(Math.abs(p.getX(i))).toBeLessThanOrEqual(0.62);
      expect(Math.abs(p.getZ(i))).toBeLessThanOrEqual(0.62);
      expect(p.getY(i)).toBeGreaterThanOrEqual(0);
      expect(p.getY(i)).toBeLessThan(WALL_H);
    }
    expect(BASE_Y).toBeLessThan(0);
  });
});
