/**
 * Looks for levels that are the same board: the same floor plan, also turned or mirrored.
 *   node scripts/find-duplicates.js [assets/levels.json]
 */
const { readFileSync } = require('node:fs');
const levels = JSON.parse(readFileSync(process.argv[2] || 'assets/levels.json', 'utf8'));

const rotate = (g) => Array.from({ length: g[0].length }, (_, c) => g.map((row) => row[c]).reverse().join(''));
const mirror = (g) => g.map((row) => [...row].reverse().join(''));
function canonical(grid) {
  let g = grid;
  const all = [];
  for (let m = 0; m < 2; m++) {
    for (let r = 0; r < 4; r++) {
      all.push(g.join('/'));
      g = rotate(g);
    }
    g = mirror(g);
  }
  return all.sort()[0];
}

const seen = new Map();
const dups = [];
for (const l of levels) {
  const key = canonical(l.grid);
  if (seen.has(key)) dups.push([seen.get(key), l.id]);
  else seen.set(key, l.id);
}
console.log(`${levels.length} levels, ${dups.length} repeated floor plans`);
dups.slice(0, 40).forEach(([a, b]) => console.log(`  level ${b} is level ${a} (turned or mirrored)`));
process.exitCode = dups.length ? 1 : 0;
