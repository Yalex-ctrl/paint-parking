/**
 * Puts the pieces made by `generate-daily.ts --weekday d --out file` together and checks that no two challenges share a shape:
 *   npx tsx scripts/merge-daily.ts assets/daily.json daily_0.json daily_1.json ... daily_6.json
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { canonicalShape, overlap } from '../src/game/funDaily';
import type { Level } from '../src/game/types';

const [out, ...parts] = process.argv.slice(2);
const levels = parts.flatMap((p) => JSON.parse(readFileSync(resolve(p), 'utf8')) as Level[]).sort((a, b) => a.id - b.id);
levels.forEach((l, i) => {
  if (l.id !== 100000 + i + 1) throw new Error(`Hole or duplicate at challenge ${i + 1} (found ${l.id})`);
});
// Two challenges of the same size that share more than this of their floor are the same shape.
for (let i = 0; i < levels.length; i++) {
  for (let j = i + 1; j < levels.length; j++) {
    if (levels[i].rows === levels[j].rows && levels[i].cols === levels[j].cols && overlap(levels[i], levels[j]) > 0.8) console.warn(`Too alike: challenges ${i} and ${j} (redo ${j} with generate-daily.ts --only ${j} --against ${out})`);
  }
}
const seen = new Map<string, number>();
for (const l of levels) {
  const shape = canonicalShape(l);
  const other = seen.get(shape);
  if (other !== undefined) console.warn(`Same shape: challenges ${other} and ${l.id - 100000}`);
  seen.set(shape, l.id - 100000);
}
writeFileSync(resolve(out), JSON.stringify(levels));
console.log(`Wrote ${levels.length} challenges to ${out}`);
