import { LEVELS } from '../src/game/levels';

const rows: string[] = [];
for (let s = 0; s < 500; s += 25) {
  const chunk = LEVELS.slice(s, s + 25);
  const w = chunk.map((l) => l.cols - 2);
  const h = chunk.map((l) => l.rows - 2);
  const area = chunk.map((l) => (l.cols - 2) * (l.rows - 2));
  const moves = chunk.map((l) => l.solution.length);
  const avg = (a: number[]) => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1);
  rows.push(`${String(s + 1).padStart(3)}-${String(s + 25).padStart(3)}  avg ${avg(w)}x${avg(h)}  area avg ${avg(area)} min ${Math.min(...area)}  moves avg ${avg(moves)} min ${Math.min(...moves)} max ${Math.max(...moves)}`);
}
console.log(rows.join('\n'));
const tut = [25, 50, 75, 100, 125, 150].map((id) => `${id}:${LEVELS[id - 1].cols - 2}x${LEVELS[id - 1].rows - 2}`);
console.log('tutorials', tut.join(' '));
const small = LEVELS.filter((l) => l.id > 5 && !l.tutorial && (l.cols - 2) * (l.rows - 2) < 20).map((l) => `${l.id}:${l.cols - 2}x${l.rows - 2}`);
console.log('small non-tutorial (area<20):', small.join(' '));
