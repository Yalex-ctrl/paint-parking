/**
 * Pre-generates the 366 daily challenges: `npm run generate-daily` -> assets/daily.json.
 * Challenge number i is played on weekday i % 7 (Monday = 0) and puts forward the mechanic of that day (dailyMechanics.ts: slides,
 * platforms, the collapsing floor, slides and platforms, bends in a spiral, portals and bombs, a mix), in a corridor in a recognisable
 * shape with many bends (game/funDaily.ts), solvable, as hard as levels 150 to 200 of the campaign by the same difficulty score,
 * with every tile in view, within the performance budget, and no two sharing a shape.
 * It can be run in pieces, one weekday each, for several processes at once:
 *   npx tsx scripts/generate-daily.ts --weekday 2 --out /tmp/daily_2.json
 * and the pieces put together with scripts/merge-daily.ts.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { themeForIndex } from '../src/game/dailyThemes';
import { buildFunLevel, canonicalShape, overlap } from '../src/game/funDaily';
import type { Level } from '../src/game/types';

const COUNT = 366;
const MAX_ATTEMPTS = 12000;
/** Two levels of the same size that share more of their floor than this are the same shape. */
const SAME_SHAPE = 0.8;
const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const weekday = arg('weekday') !== undefined ? Number(arg('weekday')) : null;
/** Redo one challenge (its number, from 0) so that it differs from every other of an existing file: --only 123 --against assets/daily.json */
const only = arg('only') !== undefined ? Number(arg('only')) : null;
const against = arg('against');
const OUT = resolve(arg('out') ?? resolve(__dirname, '../assets/daily.json'));

const levels: Level[] = [];
const seen = new Set<string>();
const bySize = new Map<string, Level[]>();
const started = Date.now();
if (only !== null && against) {
  const others = (JSON.parse(readFileSync(resolve(against), 'utf8')) as Level[]).filter((_, i) => i !== only);
  for (const o of others) {
    seen.add(canonicalShape(o));
    const key = `${o.rows}x${o.cols}`;
    bySize.set(key, [...(bySize.get(key) ?? []), o]);
  }
}
for (let index = 0; index < COUNT; index++) {
  if (weekday !== null && index % 7 !== weekday) continue;
  if (only !== null && index !== only) continue;
  const theme = themeForIndex(index);
  let accepted: Level | null = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS && !accepted; attempt++) {
    const level = buildFunLevel({ theme, seed: index * 100_003 + 7777 + (attempt + (only !== null ? 50_000 : 0)) * 31, index });
    if (!level) continue;
    const shape = canonicalShape(level);
    if (seen.has(shape)) continue;
    const sameSize = bySize.get(`${level.rows}x${level.cols}`) ?? [];
    if (sameSize.some((o) => overlap(o, level) > SAME_SHAPE)) continue;
    accepted = level;
    seen.add(shape);
    sameSize.push(level);
    bySize.set(`${level.rows}x${level.cols}`, sameSize);
  }
  if (!accepted) throw new Error(`No daily level for day ${index} (${theme})`);
  accepted.id = 100000 + index + 1;
  levels.push(accepted);
  console.log(`${index + 1}/${COUNT} (${((Date.now() - started) / 1000).toFixed(0)}s) ${theme}: ${accepted.solution.length} swipes, difficulty ${accepted.difficulty}, ${accepted.mechanics.join('+')}`);
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(levels));
console.log(`Wrote ${levels.length} daily levels to ${OUT}`);
