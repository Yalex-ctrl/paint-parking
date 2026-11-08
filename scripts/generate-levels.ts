/**
 * Pre-generates the campaign: `npm run generate-levels -- --count 50` -> assets/levels.json (compact format).
 *
 * Every level is built backwards by game/generator.ts (so it can always be emptied), steered toward the difficulty curve, then checked:
 * the solver empties it, the arrangement is valid, the schema accepts it and its solution replays without a single collision. A level
 * that fails a check stops the generation. It can be run in pieces, for several processes at once:
 *   npx tsx scripts/generate-levels.ts --from 1 --to 500 --out /tmp/part1.json
 * and the pieces put together with scripts/merge-levels.ts. `--count N` builds levels 1 to N (2000 works the same).
 * `--table docs/LEVEL_TABLE.md` also writes the table of difficulty.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { replay } from '../src/game/engine';
import { buildLevel } from '../src/game/generator';
import { decodeLevel, encodeLevel, structuralProblem } from '../src/game/levelSchema';
import type { Level } from '../src/game/types';

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const count = Number(arg('count', '50'));
const from = Number(arg('from', '1'));
const to = Number(arg('to', String(count)));
const OUT = resolve(arg('out', resolve(__dirname, '../assets/levels.json')));
const TABLE = arg('table', '');

/** The checks every level must pass; returns what is wrong, or null. */
export function problems(level: Level): string | null {
  const bad = structuralProblem(level);
  if (bad) return bad;
  const again = decodeLevel(encodeLevel(level));
  if (again.vehicles.length !== level.vehicles.length) return 'does not survive the file format';
  const state = replay(level, level.solution);
  if (!state.finished) return 'its solution does not empty the lot';
  if (state.collisions !== 0 || state.moves !== level.optimal) return 'its solution has a collision';
  return null;
}

export const tableRow = (l: Level) =>
  `| ${l.id} | ${l.cols}x${l.rows} | ${l.vehicles.length} | ${l.vehicles.filter((v) => v.len === 3).length} | ${Math.round(l.freeStart * 100)}% | ${l.layers} | ${l.avgFree.toFixed(1)} | ${l.avgChain.toFixed(1)} | ${l.traps} | ${Math.round(l.fill * 100)}% | ${l.difficulty.toFixed(1)} | ${l.mechanics.join(', ') || '-'}${l.tutorial ? ' (tuto)' : ''} |`;

if (require.main === module) {
  const levels: Level[] = [];
  const started = Date.now();
  for (let id = from; id <= to; id++) {
    const t0 = Date.now();
    const level = buildLevel(id);
    const wrong = problems(level);
    if (wrong) throw new Error(`Level ${id} is rejected: ${wrong}`);
    levels.push(level);
    console.log(`#${id} ${level.cols}x${level.rows} vehicles=${level.vehicles.length} layers=${level.layers} diff=${level.difficulty} (${((Date.now() - t0) / 1000).toFixed(1)}s, total ${((Date.now() - started) / 1000).toFixed(0)}s)`);
  }
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(levels.map(encodeLevel)));
  console.log(`Wrote ${levels.length} levels to ${OUT}`);
  const header = '| # | Taille (colxlig) | Véhicules | Camions | Libres au départ | Couches | Libres moy. | Chaîne moy. | Pièges | Remplissage | Difficulté | Mécaniques |\n|---|---|---|---|---|---|---|---|---|---|---|---|';
  const table = `${header}\n${levels.map(tableRow).join('\n')}\n`;
  console.log(table);
  if (TABLE) writeFileSync(resolve(TABLE), table);
}
