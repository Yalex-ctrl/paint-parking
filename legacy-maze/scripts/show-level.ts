/** Prints levels as ASCII: `npx tsx scripts/show-level.ts 25 50 75`. */
import levelsJson from '../assets/levels.json';
import type { Level } from '../src/game/types';

const levels = levelsJson as unknown as Level[];
const ARROW = { U: '^', D: 'v', L: '<', R: '>' } as const;

for (const id of process.argv.slice(2).map(Number)) {
  const l = levels[id - 1];
  const g = l.grid.map((row) => row.split(''));
  const f = l.features;
  f.stops.forEach(([r, c]) => (g[r][c] = 'S'));
  f.corners.forEach((k) => (g[k.r][k.c] = 'C'));
  f.portals.forEach((p, i) => {
    g[p.a[0]][p.a[1]] = String.fromCharCode(65 + i);
    g[p.b[0]][p.b[1]] = String.fromCharCode(97 + i);
  });
  f.doubles.forEach(([r, c]) => (g[r][c] = '2'));
  f.fragile.forEach(([r, c]) => (g[r][c] = 'X'));
  f.bombs.forEach(([r, c]) => (g[r][c] = 'B'));
  f.coins.forEach(([r, c]) => (g[r][c] = 'o'));
  g[l.start[0]][l.start[1]] = '@';
  g[l.exit.r][l.exit.c] = ARROW[l.exit.dir];
  console.log(`#${id} ${l.cols - 2}x${l.rows - 2} mech=[${l.mechanics}] ${l.tutorial ? 'TUTORIAL ' : ''}solution=${l.solution}`);
  console.log(g.map((r) => r.join('')).join('\n'));
  if (f.corners.length) console.log('corners:', f.corners.map((k) => `(${k.r},${k.c}):${k.a}+${k.b}`).join(' '));
  console.log();
}
