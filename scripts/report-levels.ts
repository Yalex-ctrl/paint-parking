/**
 * Prints, for each block of 25 levels: average grid size, average optimal swipes, share of open floor, and the difficulty
 * of the new level compared with the OLD level 2.5 x N (both measured the same way, see game/difficulty.ts).
 *   npx tsx scripts/report-levels.ts [levels.json]
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { oldCurve } from '../src/game/curve';
import { fullScore, pathStats, steerScore, trapShare } from '../src/game/difficulty';
import { openShareOfLevel } from '../src/game/levelgen';
import type { Level } from '../src/game/types';

const file = process.argv[2] ? resolve(process.argv[2]) : resolve(__dirname, '../assets/levels.json');
const levels = JSON.parse(readFileSync(file, 'utf8')) as Level[];
const full = JSON.parse(readFileSync(resolve(__dirname, 'baseline-curve.json'), 'utf8')) as { full: number; steer: number }[];
const oldFullAt = (v: number) => {
  const i = Math.min(full.length - 1, Math.max(0, Math.round(v) - 1));
  // Smooth a little: the mean of the old levels around v.
  const lo = Math.max(0, i - 10);
  const hi = Math.min(full.length - 1, i + 10);
  let s = 0;
  for (let k = lo; k <= hi; k++) s += full[k].full;
  return s / (hi - lo + 1);
};

const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
console.log('levels      grid(avg)   swipes  open%   steer(new) target(old 2.5N)   full(new) full(old 2.5N)   traps%');
for (let s = 0; s < levels.length; s += 25) {
  const block = levels.slice(s, s + 25);
  const stats = block.map((l) => pathStats(l));
  const steers = stats.map(steerScore);
  const traps = block.map((l) => trapShare(l, l.solution, { maxProbes: 12, timeMs: 40 }));
  const fulls = stats.map((st, i) => fullScore(st, traps[i]));
  const mid = s + 13;
  const w = avg(block.map((l) => l.cols - 2));
  const h = avg(block.map((l) => l.rows - 2));
  console.log(
    `${String(s + 1).padStart(3)}-${String(s + block.length).padStart(3)}   ${w.toFixed(1)}x${h.toFixed(1)}`.padEnd(26) +
      `${avg(block.map((l) => l.solution.length)).toFixed(1)}`.padStart(8) +
      `${(avg(block.map((l) => openShareOfLevel(l))) * 100).toFixed(0)}`.padStart(8) +
      `${avg(steers).toFixed(1)}`.padStart(12) +
      `${avg(block.map((_, i) => oldCurve(2.5 * (s + i + 1)))).toFixed(1)}`.padStart(16) +
      `${avg(fulls).toFixed(1)}`.padStart(16) +
      `${oldFullAt(2.5 * mid).toFixed(1)}`.padStart(14) +
      `${(avg(traps) * 100).toFixed(0)}`.padStart(10),
  );
}
