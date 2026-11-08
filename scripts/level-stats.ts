/**
 * Prints the difficulty of lots built WITHOUT steering, to calibrate the curve (game/generator.ts targetDifficulty):
 *   npx tsx scripts/level-stats.ts 6 50 --samples 8
 * Columns: id, how many of the samples worked, then the min / mean / max difficulty and the mean number of vehicles and layers.
 */
import { generateLevel, recipeFor } from '../src/game/generator';
import type { Level } from '../src/game/types';

const ids = process.argv.slice(2).filter((a) => /^\d+$/.test(a)).map(Number);
const samples = Number(process.argv[process.argv.indexOf('--samples') + 1] || 8);

for (const id of ids) {
  const recipe = recipeFor(id);
  const found: Level[] = [];
  let tries = 0;
  while (found.length < samples && tries < samples * 40) {
    const level = generateLevel(id, recipe, 1000 + tries++);
    if (level) found.push(level);
  }
  const d = found.map((l) => l.difficulty);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  console.log(
    `#${id} ${recipe.cols}x${recipe.rows} ok=${found.length}/${tries} diff min=${Math.min(...d).toFixed(1)} mean=${mean(d).toFixed(1)} max=${Math.max(...d).toFixed(1)} vehicles=${mean(found.map((l) => l.vehicles.length)).toFixed(1)} layers=${mean(found.map((l) => l.layers)).toFixed(1)}`,
  );
}
