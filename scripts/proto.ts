import { failStats, tryCandidate, type LevelSpec } from '../src/game/levelgen';
import type { Mechanic } from '../src/game/types';

function run(label: string, rows: number, cols: number, mechanics: Mechanic[], tries: number, extra: Partial<LevelSpec['plan']> = {}) {
  const spec: LevelSpec = {
    id: 100,
    plan: { rows, cols, entrySide: 'D', exitSide: 'U', rooms: Math.round((rows * cols) / 11), pillars: 2, wide: 0.4, openMin: 0.35, fill: [0.4, 0.62], ...extra },
    mechanics,
    coins: 2,
    counts: {},
  };
  let ok = 0;
  let planFail = 0;
  const t0 = Date.now();
  const swipes: number[] = [];
  const opens: number[] = [];
  const amb: number[] = [];
  for (let s = 1; s <= tries; s++) {
    const c = tryCandidate(spec, s * 7919);
    if (!c) {
      planFail++;
      continue;
    }
    ok++;
    swipes.push(c.stats.swipes);
    opens.push(c.open);
    amb.push(c.stats.ambiguity);
  }
  const avg = (a: number[]) => (a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : '-');
  console.log(JSON.stringify(Object.assign({}, failStats)));
  for (const k of Object.keys(failStats)) delete failStats[k];
  console.log(`${label} ${rows}x${cols} [${mechanics}] ok ${ok}/${tries} in ${((Date.now() - t0) / 1000).toFixed(1)}s  swipes ${avg(swipes)}  open ${avg(opens.map((o) => o * 100))}%  amb ${avg(amb)}`);
}

run('plain', 5, 5, [], 30);
run('plain', 8, 7, [], 30);
run('plain', 12, 10, [], 20);
run('plain', 16, 12, [], 12);
run('corner', 8, 7, ['corner'], 20);
run('stop+corner', 10, 8, ['stop', 'corner'], 20);
run('portal', 10, 8, ['portal'], 20);
run('double', 10, 8, ['double'], 20);
run('fragile', 10, 8, ['fragile'], 20);
run('bomb', 10, 8, ['bomb'], 20);
