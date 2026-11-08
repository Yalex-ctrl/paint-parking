import { DECOR_MODELS } from '../core/render/decor/catalog';
import { createRng } from '../core/rng';
import type { Level } from '../game/types';
import { PLATE_MARGIN } from './coords';

export type Placed = { name: string; x: number; z: number; scale: number; rot: number };

/** Trees, bushes and stones round the plate, always outside it; the same for the same level. */
export function planDecor(level: Level): Placed[] {
  const rng = createRng(level.seed ^ 0x51ed270b);
  const hw = level.cols / 2 + PLATE_MARGIN;
  const hd = level.rows / 2 + PLATE_MARGIN;
  const pool = DECOR_MODELS.filter((m) => m.kind === 'tree' || m.kind === 'bush' || m.kind === 'stone' || m.kind === 'flower');
  const out: Placed[] = [];
  let guard = 0;
  while (out.length < 14 && guard++ < 200) {
    const model = rng.pick(pool);
    const angle = rng.next() * Math.PI * 2;
    // A point on a ring a little beyond the plate (a rounded rectangle).
    const reach = 1.2 + rng.next() * 5;
    const x = Math.cos(angle) * (hw + reach);
    const z = Math.sin(angle) * (hd + reach);
    if (Math.abs(x) < hw + model.radius * 2 && Math.abs(z) < hd + model.radius * 2) continue;
    if (out.some((o) => Math.hypot(o.x - x, o.z - z) < 1.1)) continue;
    out.push({ name: model.name, x, z, scale: model.scale[0] + rng.next() * (model.scale[1] - model.scale[0]), rot: rng.next() * Math.PI * 2 });
  }
  return out;
}


/** One key per mounted piece of scenery: the model, the index of its part and how many are placed (unique in the whole list). */
export const decorKey = (name: string, part: number, count: number): string => `${name}-${part}-${count}`;
