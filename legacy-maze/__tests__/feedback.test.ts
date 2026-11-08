import { readFileSync } from 'fs';
import { join } from 'path';
import * as THREE from 'three';

import { LEVELS } from '../src/game/levels';
import { PAINT_IDS } from '../src/render/paintStyles';
import { particlePalette } from '../src/render/paintPalette';
import { ParticlePool } from '../src/core/render/ParticlePool';
import { buildCoinGeometry, COIN_HEIGHT, COIN_R } from '../src/render/Coins';
import { BALL_R } from '../src/render/coords';
import { entryKeepOut, exitKeepOut } from '../src/core/render/decor/placement';
import { prepareLevel } from '../src/render/prepare';
import { lockGeometry } from '../src/render/map/mapGeometry';

describe('coins', () => {
  it('stand upright, small (45 % of a cell), at about the middle of the ball, in one geometry', () => {
    const g = buildCoinGeometry();
    g.computeBoundingBox();
    const size = g.boundingBox!.getSize(new THREE.Vector3());
    expect(size.x).toBeCloseTo(0.45, 1);
    expect(size.y).toBeCloseTo(0.45, 1);
    expect(size.z).toBeLessThan(0.15); // a thin disc facing +Z: it stands on its edge, it is not lying flat
    expect(Math.abs(COIN_HEIGHT - BALL_R)).toBeLessThan(0.1);
    expect(COIN_R * 2).toBeCloseTo(0.45, 2);
    expect(g.getAttribute('color')).toBeDefined();
    g.dispose();
  });
});

describe('paint particles', () => {
  const base = 0x3366cc;
  it('every paint has a palette; multicoloured paints have several colours, metals stay metallic', () => {
    for (const id of PAINT_IDS) expect(particlePalette(id, base).length).toBeGreaterThan(0);
    for (const id of ['rainbow', 'stained', 'confetti', 'sunset', 'mosaic']) expect(new Set(particlePalette(id, base)).size).toBeGreaterThan(3);
    expect(particlePalette('classic', base)).toEqual([base]);
    const gold = new THREE.Color(particlePalette('gilded', base)[0]);
    expect(gold.r).toBeGreaterThan(gold.b);
    const fire = particlePalette('fire', base).map((h) => new THREE.Color(h));
    expect(fire.filter((c) => c.r > c.b).length).toBeGreaterThan(fire.length / 2);
  });

  it('the pool throws droplets in the colours of the equipped paint, and not only the level colour', () => {
    const pool = new ParticlePool(200);
    pool.setPaintEffect('stained');
    pool.setPaintColor('#3366cc');
    pool.blast(0, 0.3, 0, 120);
    const seen = new Set<number>();
    for (let i = 0; i < pool.size; i++) if (pool.life[i] > 0) seen.add(pool.hex[i]);
    expect(seen.size).toBeGreaterThan(3);
  });
});

describe('map padlock', () => {
  it('is a round dark badge with a white padlock, in vertex colours, lying flat', () => {
    const g = lockGeometry();
    g.computeBoundingBox();
    const box = g.boundingBox!;
    expect(box.max.x - box.min.x).toBeCloseTo(0.64, 1);
    expect(box.max.y).toBeLessThan(0.2);
    expect(g.getAttribute('color')).toBeDefined();
    g.dispose();
  });
});

describe('scenery in play', () => {
  const screen = { width: 390, height: 844 };
  const margins = { top: 171, bottom: 100 };
  it('has 8 to 12 pieces on boards from level 13 on (a few on the tiniest ones), none on the exit, the entry or the bridge', () => {
    for (const id of [1, 3, 5, 11, 13, 14, 20, 30, 50, 51, 80, 100]) {
      const p = prepareLevel(LEVELS[id - 1], screen, margins, true);
      expect({ id, ok: p.decor.length <= 12 && (id < 13 || p.decor.length >= 8) }).toEqual({ id, ok: true });
      const lanes = [exitKeepOut(p.level), entryKeepOut(p.level)!];
      for (const d of p.decor) {
        for (const e of lanes) expect(d.x > e.minX && d.x < e.maxX && d.z > e.minZ && d.z < e.maxZ).toBe(false);
        // never over the board
        expect(Math.abs(d.x) > p.level.cols / 2 || Math.abs(d.z) > p.level.rows / 2).toBe(true);
      }
      p.dispose();
    }
  });
});

describe('development tools stay out of production', () => {
  const read = (f: string) => readFileSync(join(__dirname, '../src', f), 'utf8');
  it('fps badge, level picker and every test tool only exist where the tester tools are (never in production)', () => {
    expect(read('screens/GameScreen.tsx')).toMatch(/testerTools\(\) && settings\?\.showPerf && <FpsCounter/);
    expect(read('screens/GameScreen.tsx')).toMatch(/testerTools\(\)\s*\?\s*\[\s*\{ key: 'levels'[^\]]*key: 'tester'/);
    expect(read('app/tester.tsx')).toMatch(/dev\.refill[\s\S]*dev\.empty[\s\S]*dev\.skip30/);
    expect(read('app/tester.tsx')).toMatch(/dev\.plus1000/);
    for (const screen of ['app/levels.tsx', 'app/daily-pick.tsx', 'app/tester.tsx', 'screens/ShowcaseScreen.tsx']) expect(read(screen)).toMatch(/if \(!testerTools\(\)\) return <Redirect/);
    expect(read('app/settings.tsx')).toMatch(/testerTools\(\) && \(/);
  });
});
