/**
 * Turns the measured difficulty of the OLD campaign (scripts/baseline-curve.json) into the smooth, never-decreasing curve
 * the new levels are steered by (assets/curve.json). Run once after scripts/baseline.ts.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const rows = JSON.parse(readFileSync(resolve(__dirname, 'baseline-curve.json'), 'utf8')) as { id: number; steer: number; full: number }[];
const WINDOW = 41;
const smooth = (xs: number[]) =>
  xs.map((_, i) => {
    // A narrower window at the start, so the first levels keep their own (low) difficulty.
    const radius = Math.min((WINDOW - 1) / 2, Math.floor(i / 2));
    const lo = Math.max(0, i - radius);
    const hi = Math.min(xs.length - 1, i + radius);
    let s = 0;
    for (let k = lo; k <= hi; k++) s += xs[k];
    return s / (hi - lo + 1);
  });
const monotone = (xs: number[]) => {
  let m = 0;
  return xs.map((x) => (m = Math.max(m, x)));
};
const steer = monotone(smooth(rows.map((r) => r.steer))).map((v) => Math.round(v * 10) / 10);
const full = monotone(smooth(rows.map((r) => r.full))).map((v) => Math.round(v * 10) / 10);
writeFileSync(resolve(__dirname, '../assets/curve.json'), JSON.stringify({ steer, full }));
console.log('steer at 1, 25, 100, 250, 500:', [1, 25, 100, 250, 500].map((n) => steer[n - 1]));
