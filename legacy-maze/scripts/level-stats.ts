/** Prints a difficulty summary of assets/levels.json: `npx tsx scripts/level-stats.ts`. */
import levelsJson from '../assets/levels.json';
import { countBranches, countDeadEnds } from '../src/game/generator';
import type { Level } from '../src/game/types';

const levels = levelsJson as unknown as Level[];

console.log('id    grille  cases  coups  culs-de-sac  embranchements');
for (const id of [1, 10, 15, 25, 50, 100, 250, 500]) {
  const l = levels[id - 1];
  console.log(
    `${String(id).padEnd(5)} ${`${l.cols - 2}x${l.rows - 2}`.padEnd(7)} ${String(l.floorCount).padEnd(6)} ${String(l.solution.length).padEnd(6)} ${String(countDeadEnds(l.grid)).padEnd(12)} ${countBranches(l.grid)}`,
  );
}
const bad = levels.filter((l) => l.id >= 15 && (countDeadEnds(l.grid) < 2 || countBranches(l.grid) < 1));
console.log(`\nniveaux >= 15 avec < 2 culs-de-sac ou 0 embranchement : ${bad.length}/${levels.length - 14}`);
