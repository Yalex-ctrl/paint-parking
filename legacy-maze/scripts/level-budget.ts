/**
 * Re-checks every level of assets/levels.json against what the game needs: the solution replays, no chute can circle for ever, no
 * floor tile is hidden by a platform or a chute, and the estimated cost of the scene stays within the budget.
 * `npx tsx scripts/level-budget.ts` prints one line per level (size, optimum, mechanics, draw calls, triangles) and fails (exit 1) when
 * any level is out of budget. The cost is an estimate (see src/render/budget.ts), not a reading of the renderer.
 */
import { readFileSync } from 'node:fs';
import type { BufferGeometry } from 'three';
import { applyMove, createState, hasInfiniteLoop } from '../src/game/engine';
import type { Dir, Level } from '../src/game/types';
import { buildContactShadowGeometry, buildSlabGeometry, buildWallGeometry } from '../src/render/geometry';
import { slidesProblem } from '../src/render/slidePath';
import { hiddenFloorCells } from '../src/render/visibility';
import { BUDGET, estimateBudget } from '../src/render/budget';

const levels: Level[] = JSON.parse(readFileSync(new URL('../assets/levels.json', import.meta.url), 'utf8'));
const tri = (g: BufferGeometry) => (g.index ? g.index.count : g.attributes.position.count) / 3;
let bad = 0;
let maxCalls = 0;
let maxTri = 0;
for (const level of levels) {
  const state = createState(level);
  for (const m of level.solution) applyMove(level, state, m as Dir);
  const errors: string[] = [];
  if (!state.finished || state.layers < level.layers) errors.push('solution');
  if (hasInfiniteLoop(level)) errors.push('loop');
  const over = slidesProblem(level);
  if (over) errors.push(over);
  const hidden = hiddenFloorCells(level).length;
  if (hidden) errors.push(`${hidden} hidden`);
  const board = tri(buildWallGeometry(level)) + tri(buildContactShadowGeometry(level)) + tri(buildSlabGeometry(level));
  const b = estimateBudget(level, board);
  if (b.drawCalls >= BUDGET.drawCalls) errors.push(`${b.drawCalls} calls`);
  if (b.triangles >= BUDGET.triangles) errors.push(`${b.triangles} tris`);
  maxCalls = Math.max(maxCalls, b.drawCalls);
  maxTri = Math.max(maxTri, b.triangles);
  if (errors.length) bad++;
  console.log(`${String(level.id).padStart(4)} ${level.cols}x${level.rows} opt ${level.solution.length} [${(level.mechanics ?? []).join(',')}] calls ${b.drawCalls} tris ${Math.round(b.triangles)}${errors.length ? '  !! ' + errors.join(', ') : ''}`);
}
console.log(`\n${levels.length} levels, ${bad} out of budget or invalid; max ${maxCalls} draw calls (limit ${BUDGET.drawCalls}), max ${Math.round(maxTri)} triangles (limit ${BUDGET.triangles}).`);
process.exit(bad ? 1 : 0);
