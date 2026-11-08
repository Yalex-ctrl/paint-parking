import { applyMove, createState } from '../src/game/engine';
import { DAILY_LEVELS } from '../src/game/dailyLevels';
import { computeGuide } from '../src/game/guide';
import { LEVELS } from '../src/game/levels';
import { DELTA, OPPOSITE, type Dir, type Level } from '../src/game/types';
import { themeForLevel } from '../src/core/worlds';
import { PLATEAU_H, WALL_H } from '../src/render/coords';
import { tallWalls, wallTop } from '../src/render/heights';
import { buildChuteParts, chuteTriangles } from '../src/render/slideGeometry';
import { slideLine, slideProblem, slidesProblem, SLIDE_CLEARANCE } from '../src/render/slidePath';
import { buildTierParts } from '../src/render/tierGeometry';
import { bestCameraTilt, hiddenFloorCells, MAX_EXTRA_TILT } from '../src/render/visibility';

const ALL = [...LEVELS, ...DAILY_LEVELS];
const withSlides = DAILY_LEVELS.filter((l) => (l.features.slides ?? []).length > 0);
const withTiers = DAILY_LEVELS.filter((l) => (l.features.raised ?? []).length > 0);

describe('platforms and their walls', () => {
  it('are 0.6 high, and only the walls that look at the platform alone rise from it', () => {
    expect(PLATEAU_H).toBeCloseTo(0.6, 6);
    expect(withTiers.length).toBeGreaterThan(40);
    for (const l of withTiers) {
      const raised = new Set(l.features.raised.map(([r, c]) => `${r},${c}`));
      for (const key of tallWalls(l)) {
        const r = Math.floor(key / l.cols);
        const c = key % l.cols;
        expect(wallTop(l, r, c)).toBeCloseTo(WALL_H + PLATEAU_H, 6);
        const around = (Object.values(DELTA) as [number, number][]).map(([dr, dc]) => [r + dr, c + dc]);
        const floors = around.filter(([rr, cc]) => l.grid[rr]?.[cc] === '.');
        // some platform tile on a side, and no low tile or ramp on any other
        expect(floors.some(([rr, cc]) => raised.has(`${rr},${cc}`))).toBe(true);
        expect(floors.every(([rr, cc]) => raised.has(`${rr},${cc}`))).toBe(true);
      }
    }
  });

  it('build their sides and ramp walls as real geometry, with nothing broken', () => {
    for (const l of withTiers) {
      const parts = buildTierParts(l, themeForLevel(l.id).wood);
      for (const g of [parts.trim, parts.fittings]) {
        if (!g) continue;
        const pos = g.getAttribute('position');
        for (let i = 0; i < pos.count * 3; i++) expect(Number.isFinite((pos.array as Float32Array)[i])).toBe(true);
      }
      expect(parts.triangles).toBeLessThan(3000);
    }
  });
});

describe('chutes (toboggans à arceaux)', () => {
  it('stay over the board: nothing hangs over the edge, over the grass, or into a wall', () => {
    for (const l of withSlides) expect({ id: l.id, problem: slidesProblem(l) }).toEqual({ id: l.id, problem: null });
  });

  it('flag a chute that runs along the edge of the board', () => {
    const l = withSlides[3];
    const s = l.features.slides[0];
    const moved: Level = { ...l, features: { ...l.features, slides: [{ ...s, path: s.path.map(([, c]) => [0, c] as [number, number]) }] } };
    expect(slideProblem(moved, moved.features.slides[0])).not.toBeNull();
  });

  it('keep the floor of the trough above the walls it crosses, with room to spare', () => {
    for (const l of withSlides) {
      for (const s of l.features.slides) {
        const line = slideLine(l, s, 8);
        const rail = s.path.slice(1, -1).map(([r, c]) => wallTop(l, r, c) + SLIDE_CLEARANCE);
        expect(rail.length === 0 || Math.max(...line.floor) >= Math.min(...rail) - 1e-6).toBe(true);
        // the floor is flush with the floor of the entry tile at the mouth and of the exit tile at the end
        expect(line.floor[0]).toBeCloseTo(line.floor[1], 1);
      }
    }
  });

  it('are made of finite triangles, all inside the board, and light enough', () => {
    for (const l of withSlides) {
      for (const s of l.features.slides) {
        const wood = themeForLevel(l.id).wood;
        const p = buildChuteParts(l, s, wood);
        const [ox, oz] = [s.entry[1] - l.cols / 2 + 0.5, s.entry[0] - l.rows / 2 + 0.5];
        for (const g of [p.wood, p.floor, p.flap]) {
          const pos = g.getAttribute('position').array as Float32Array;
          for (let i = 0; i < pos.length; i += 3) {
            expect(Number.isFinite(pos[i] + pos[i + 1] + pos[i + 2])).toBe(true);
          }
        }
        // the wood (rims, arches, trestles, gantries) never leaves the rectangle of the board
        const wp = p.wood.getAttribute('position').array as Float32Array;
        for (let i = 0; i < wp.length; i += 3) {
          expect(Math.abs(wp[i] + ox)).toBeLessThanOrEqual(l.cols / 2 + 1e-3);
          expect(Math.abs(wp[i + 2] + oz)).toBeLessThanOrEqual(l.rows / 2 + 1e-3);
        }
        expect(chuteTriangles(l, s, wood)).toBeLessThan(9000);
        // the paint is drawn quad by quad: its geometry is the floor's, in the order of the ride
        expect(p.newOverlay().getIndex()!.count).toBe(p.floorQuads * 6);
      }
    }
  });

  it('show the way at all times: two chevrons on the entry, chevrons in the trough, a flap and its gantry at the exit', () => {
    for (const l of withSlides) {
      for (const s of l.features.slides) {
        const p = buildChuteParts(l, s, themeForLevel(l.id).wood);
        expect(p.entryChevrons).toHaveLength(2);
        expect(p.troughChevrons.length).toBeGreaterThanOrEqual(1);
        expect(p.flap.getAttribute('position').count).toBeGreaterThan(40);
        // the hinge is above the floor of the trough, a little before its end
        expect(p.hinge[1]).toBeGreaterThan(0.5);
      }
    }
  });

  it('a ball that arrives on the exit tile travelling toward the chute stops against the flap', () => {
    let checked = 0;
    for (const l of withSlides) {
      for (const s of l.features.slides) {
        const [dr, dc] = DELTA[s.exitDir];
        const beyond: [number, number] = [s.exit[0] + dr, s.exit[1] + dc];
        if (l.grid[beyond[0]]?.[beyond[1]] !== '.') continue;
        const state = createState(l);
        state.pos = beyond;
        const res = applyMove(l, state, OPPOSITE[s.exitDir]);
        expect(res).not.toBeNull();
        expect([state.pos[0], state.pos[1]]).toEqual([s.exit[0], s.exit[1]]);
        expect(res!.steps.some((st) => st.slide >= 0)).toBe(false);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(5);
  });

  it('are never named by the help arrow from the side of the exit', () => {
    for (const l of withSlides.slice(0, 6)) {
      const state = createState(l);
      const check = () => {
        for (const s of l.features.slides) {
          if (state.pos[0] === s.exit[0] && state.pos[1] === s.exit[1]) {
            const g = computeGuide(l, state);
            if (g.kind === 'move') expect(g.dir).not.toBe(OPPOSITE[s.exitDir]);
          }
        }
      };
      check();
      for (const m of l.solution) {
        applyMove(l, state, m as Dir);
        check();
      }
    }
  });
});

describe('the camera angle of each level', () => {
  it('is stored, between 0 and 5 degrees lower, and every tile is still in view at that angle', () => {
    let lowered = 0;
    for (const l of ALL) {
      const t = l.camTilt ?? 0;
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(MAX_EXTRA_TILT);
      if (t > 0) lowered++;
      expect({ id: l.id, hidden: hiddenFloorCells(l).length }).toEqual({ id: l.id, hidden: 0 });
    }
    expect(lowered).toBeGreaterThan(10);
  });

  it('is the lowest angle the visibility check allows', () => {
    for (const l of [...withSlides, ...withTiers].slice(0, 12)) expect(l.camTilt ?? 0).toBe(bestCameraTilt(l));
  });

  it('only changes levels that have something raised', () => {
    for (const l of ALL) if (l.camTilt) expect((l.features.raised ?? []).length + (l.features.slides ?? []).length).toBeGreaterThan(0);
  });
});
