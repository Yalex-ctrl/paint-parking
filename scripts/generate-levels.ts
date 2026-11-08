/**
 * Pre-generates the campaign: `npm run generate-levels -- --count 150` -> assets/levels.json.
 *
 * Every level is built by game/campaign.ts (rooms and corridors, the mechanics of its number, the entry and exit sides drawn from
 * its number, and a search for the solution), steered toward the difficulty the OLD level of the same number had
 * (scripts/difficulty-baseline.json, measured before the three new mechanics), and then checked: solvable (the solver), every
 * floor tile visible, no endless slide, within the performance budget (draw calls and triangles). A level that fails a check stops the
 * generation. It can be run in pieces, for several processes at once:
 *   npx tsx scripts/generate-levels.ts --from 1 --to 25 --out /tmp/part1.json
 * and the pieces put together with scripts/merge-levels.ts. `--count N` builds levels 1 to N (150 by default; 2000 works the same).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import type { BufferGeometry } from 'three';

import { buildLevel } from '../src/game/campaign';
import { hasInfiniteLoop } from '../src/game/engine';
import { createState, applyMove } from '../src/game/engine';
import type { Dir, Level } from '../src/game/types';
import { BUDGET, estimateBudget } from '../src/render/budget';
import { buildWallGeometry, buildContactShadowGeometry, buildSlabGeometry } from '../src/render/geometry';
import { slidesProblem } from '../src/render/slidePath';
import { hiddenFloorCells } from '../src/render/visibility';

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const count = Number(arg('count', '150'));
const from = Number(arg('from', '1'));
const to = Number(arg('to', String(count)));
const OUT = resolve(arg('out', resolve(__dirname, '../assets/levels.json')));

const baselineFile = resolve(__dirname, 'difficulty-baseline.json');
const baseline: { id: number; steer: number }[] = existsSync(baselineFile) ? JSON.parse(readFileSync(baselineFile, 'utf8')) : [];

const tri = (g: BufferGeometry) => (g.index ? g.index.count : g.attributes.position.count) / 3;

/** The checks every level of the campaign must pass; returns what is wrong, or null. */
export function problems(level: Level): string | null {
  const state = createState(level);
  for (const m of level.solution) applyMove(level, state, m as Dir);
  if (!state.finished || state.layers < level.layers) return 'its solution does not paint everything and leave';
  if (hasInfiniteLoop(level)) return 'a slide can circle for ever';
  const over = slidesProblem(level);
  if (over) return `a chute is not over the board: ${over}`;
  const hidden = hiddenFloorCells(level);
  if (hidden.length) return `${hidden.length} floor tile(s) hidden by a platform or a chute`;
  const board = tri(buildWallGeometry(level)) + tri(buildContactShadowGeometry(level)) + tri(buildSlabGeometry(level));
  const b = estimateBudget(level, board);
  if (b.drawCalls >= BUDGET.drawCalls) return `${b.drawCalls} draw calls (limit ${BUDGET.drawCalls})`;
  if (b.triangles >= BUDGET.triangles) return `${b.triangles} triangles (limit ${BUDGET.triangles})`;
  return null;
}

const levels: Level[] = [];
const started = Date.now();
for (let id = from; id <= to; id++) {
  const t0 = Date.now();
  const wanted = baseline.find((b) => b.id === id)?.steer;
  const level = buildLevel(id, { acceptAny: true, wanted });
  if (!level) throw new Error(`No valid level for id ${id}`);
  const wrong = problems(level);
  if (wrong) throw new Error(`Level ${id} is rejected: ${wrong}`);
  levels.push(level);
  console.log(
    `#${id} ${level.cols - 2}x${level.rows - 2} swipes=${level.solution.length} (wanted ${wanted ?? '-'}) mech=[${level.mechanics}] entry=${level.entry?.side} exit=${level.exit.dir} (${((Date.now() - t0) / 1000).toFixed(1)}s, total ${((Date.now() - started) / 1000).toFixed(0)}s)`,
  );
}
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(levels));
console.log(`Wrote ${levels.length} levels to ${OUT}`);
