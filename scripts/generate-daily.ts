/**
 * Pre-generates the daily challenges: `npm run generate-daily -- --count 30` -> assets/daily.json (the app handles 366).
 *
 * Bigger and more spectacular than the campaign (many trucks, lots in the shape of an L or a cross, islands of obstacles), steered
 * toward the difficulty of levels 40-50. The paint and the vehicle of the day are drawn from the date alone (core/dailyLoadout.ts).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { buildLevel, dailyRecipe, targetDifficulty } from '../src/game/generator';
import { encodeLevel } from '../src/game/levelSchema';
import type { Level } from '../src/game/types';
import { problems, tableRow } from './generate-levels';

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const count = Number(arg('count', '30'));
const from = Number(arg('from', '1'));
const to = Number(arg('to', String(count)));
const OUT = resolve(arg('out', resolve(__dirname, '../assets/daily.json')));

const levels: Level[] = [];
const started = Date.now();
for (let n = from; n <= to; n++) {
  const t0 = Date.now();
  // Challenge n has the id n (the app adds its own offset); its recipe depends on n alone.
  // Some shapes (a cross, an L) cannot be made as hard as asked: accept a little less, step by step, until it works.
  const recipe = dailyRecipe(n - 1);
  let level: Level | null = null;
  for (let less = 0; less < 6 && !level; less++) {
    try {
      level = buildLevel(n, { recipe, target: targetDifficulty(45) + (n % 5) * 1.5, attempts: 300, tolerance: 1.5, minDifficulty: 22 - 2 * less });
    } catch {
      // Nothing that hard fits this shape: accept a little less.
    }
  }
  if (!level) throw new Error(`No valid challenge for number ${n}`);
  const wrong = problems(level);
  if (wrong) throw new Error(`Challenge ${n} is rejected: ${wrong}`);
  levels.push(level);
  console.log(`#${n} ${level.shape} ${level.cols}x${level.rows} vehicles=${level.vehicles.length} layers=${level.layers} diff=${level.difficulty} (${((Date.now() - t0) / 1000).toFixed(1)}s, total ${((Date.now() - started) / 1000).toFixed(0)}s)`);
}
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(levels.map(encodeLevel)));
console.log(`Wrote ${levels.length} challenges to ${OUT}`);
console.log(levels.map(tableRow).join('\n'));
