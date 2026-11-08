/** Puts the pieces made by `generate-levels.ts --from --to --out` together: `npx tsx scripts/merge-levels.ts out.json part1.json part2.json ...` */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { Level } from '../src/game/types';

const [out, ...parts] = process.argv.slice(2);
const levels = parts.flatMap((p) => JSON.parse(readFileSync(resolve(p), 'utf8')) as Level[]).sort((a, b) => a.id - b.id);
levels.forEach((l, i) => {
  if (l.id !== i + 1) throw new Error(`Hole or duplicate at level ${i + 1} (found ${l.id})`);
});
writeFileSync(resolve(out), JSON.stringify(levels));
console.log(`Wrote ${levels.length} levels to ${out}`);
