/**
 * Works out, for every level with a platform, a ramp or a chute, how much lower than the usual angle the camera may look (0 to 5
 * degrees) to show the sides of those pieces, and writes it in assets/levels.json as `camTilt`: the lowest angle at which the
 * visibility check still shows every floor tile. Run after `generate-levels` (and after a change of the visibility rule):
 *   npx tsx scripts/set-camera.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { Level } from '../src/game/types';
import { normalizeLevel } from '../src/game/levelSchema';
import { bestCameraTilt } from '../src/render/visibility';

for (const name of ['levels.json', 'daily.json']) {
  const file = resolve(__dirname, '../assets', name);
  const levels = JSON.parse(readFileSync(file, 'utf8')) as Level[];
  const histogram: Record<number, number> = {};
  for (const level of levels) {
    delete level.camTilt;
    const f = level.features ?? {};
    if (!(f.raised ?? []).length && !(f.slides ?? []).length) continue;
    const best = bestCameraTilt(normalizeLevel(level));
    if (best > 0) level.camTilt = best;
    histogram[best] = (histogram[best] ?? 0) + 1;
  }
  writeFileSync(file, JSON.stringify(levels));
  console.log(name, 'camera tilt (degrees lower) -> number of levels', histogram);
}
