/**
 * Measures the difficulty of the CURRENT levels.json and writes it to scripts/difficulty-baseline.json: the curve the new
 * levels are steered by. Run it BEFORE regenerating the campaign.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { fullScore, pathStats, steerScore, trapShare } from '../src/game/difficulty';
import { LEVELS } from '../src/game/levels';

const OUT = resolve(__dirname, 'difficulty-baseline.json');
const only = process.argv[2] ? Number(process.argv[2]) : 150;
const rows: { id: number; swipes: number; choices: number; ambiguity: number; traps: number; steer: number; full: number; area: number }[] = [];
const started = Date.now();
for (const level of LEVELS.slice(0, only)) {
  const s = pathStats(level);
  const traps = trapShare(level);
  rows.push({
    id: level.id,
    swipes: s.swipes,
    choices: Math.round(s.choices * 100) / 100,
    ambiguity: Math.round(s.ambiguity * 100) / 100,
    traps: Math.round(traps * 1000) / 1000,
    steer: Math.round(steerScore(s) * 10) / 10,
    full: Math.round(fullScore(s, traps) * 10) / 10,
    area: (level.cols - 2) * (level.rows - 2),
  });
  if (level.id % 25 === 0) console.log(`#${level.id} swipes=${s.swipes} amb=${s.ambiguity.toFixed(2)} traps=${traps.toFixed(2)} (${((Date.now() - started) / 1000).toFixed(0)}s)`);
}
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(rows));
console.log(`Wrote ${rows.length} rows to ${OUT}`);
