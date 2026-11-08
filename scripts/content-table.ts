/**
 * The table of the campaign against the difficulty baseline: `npx tsx scripts/content-table.ts` prints one line per level
 * (size, optimum, mechanics, new steer score, old steer score, gap) and the mean gap per block of 25 levels.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { pathStats, steerScore } from '../src/game/difficulty';
import type { Level } from '../src/game/types';

const levels = JSON.parse(readFileSync(resolve(__dirname, '../assets/levels.json'), 'utf8')) as Level[];
const base = JSON.parse(readFileSync(resolve(__dirname, 'difficulty-baseline.json'), 'utf8')) as { id: number; steer: number }[];
let within = 0;
const rows = levels.map((l) => {
  const neu = steerScore(pathStats(l));
  const old = base.find((b) => b.id === l.id)?.steer ?? NaN;
  const gap = (neu - old) / old;
  if (Math.abs(gap) <= 0.1) within++;
  console.log(`${String(l.id).padStart(4)} ${String(l.cols - 2).padStart(2)}x${String(l.rows - 2).padEnd(2)} opt ${String(l.solution.length).padStart(2)} ${(l.mechanics ?? []).join('+').padEnd(26)} new ${neu.toFixed(1).padStart(5)} old ${old.toFixed(1).padStart(5)} ${(gap * 100).toFixed(0).padStart(4)}%`);
  return { id: l.id, neu, old };
});
for (let s = 0; s < rows.length; s += 25) {
  const b = rows.slice(s, s + 25);
  const n = b.reduce((a, r) => a + r.neu, 0) / b.length;
  const o = b.reduce((a, r) => a + r.old, 0) / b.length;
  console.log(`levels ${s + 1}-${s + b.length}: new ${n.toFixed(1)} old ${o.toFixed(1)} gap ${(((n - o) / o) * 100).toFixed(1)}%`);
}
console.log(`${within}/${rows.length} levels within 10 % of the old level of the same number`);
