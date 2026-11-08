import { createRng } from '../../core/rng';
import { levelPoint, worldFirstLevel, worldLastLevel, STEP } from '../../game/mapLayout';
import type { WorldTheme } from '../../core/worlds';
import { DECOR_MODELS, type DecorModel } from '../../core/render/decor/catalog';
import type { Placed } from '../../core/render/decor/placement';

/** Pieces closer to the path than this (centre to centre, minus their own size) are not placed: the path stays clear. */
const PATH_CLEAR = 1.7;

/** Only trees and rocks (and bushes, cacti and dunes where the world has them): no flowers, no tufts, no small stones. */
const KEEP = new Set(['tree', 'stone', 'bush', 'cactus', 'dune']);
const WEIGHT: Record<string, number> = { tree: 3, stone: 1, bush: 0.6, cactus: 2, dune: 1.2 };

function pick(rng: ReturnType<typeof createRng>, theme: WorldTheme): DecorModel {
  const weight = (m: DecorModel) => ((theme.decor.weights[m.kind] ?? 0) > 0 ? WEIGHT[m.kind] ?? 0 : 0);
  const pool = DECOR_MODELS.filter((m) => KEEP.has(m.kind) && m.name !== 'stone_smallA' && weight(m) > 0 && (m.kind !== 'tree' || !theme.decor.onlyTrees || theme.decor.onlyTrees.includes(m.name)));
  let roll = rng.next() * pool.reduce((n, m) => n + weight(m), 0);
  for (const m of pool) {
    roll -= weight(m);
    if (roll <= 0) return m;
  }
  return pool[pool.length - 1];
}

/** A grove every this many levels, on each side of the path (the rest of the ground is clean grass). */
const GROVE_EVERY = 1.9;

/**
 * Scenery along both sides of the path for one world: a grove of three to five trees and rocks every couple of levels, close
 * together, with clean grass between them. Deterministic from the world number, never on the path. The pieces use the
 * catalogue and the per-world colours of the board's decor, so each world keeps one coherent set of greens.
 */
export function planMapDecor(world: number, theme: WorldTheme): Placed[] {
  const rng = createRng(world * 7919 + 101);
  const out: Placed[] = [];
  const first = worldFirstLevel(world);
  const last = worldLastLevel(world);
  for (let lvl = first - 1; lvl <= last + 1; lvl += GROVE_EVERY) {
    for (const side of [-1, 1]) {
      if (rng.next() < 0.2) continue;
      const centre = levelPoint(lvl + (rng.next() - 0.5) * 0.8);
      const anchorX = centre.x + side * (3.4 + rng.next() * 2.4);
      const anchorZ = centre.z + (rng.next() - 0.5) * STEP * 0.6;
      const size = 3 + Math.floor(rng.next() * 3);
      const grove: Placed[] = [];
      for (let k = 0; k < size; k++) {
        for (let attempt = 0; attempt < 6; attempt++) {
          const model = pick(rng, theme);
          const x = anchorX + (rng.next() - 0.5) * 2.6;
          const z = anchorZ + (rng.next() - 0.5) * 2.6;
          const scale = (model.scale[0] + rng.next() * (model.scale[1] - model.scale[0])) * 0.93;
          const r = model.radius * scale;
          const path = levelPoint(1 - z / STEP);
          if (Math.abs(x - path.x) < PATH_CLEAR + r) continue;
          // Pieces of a grove touch a little, they do not sit on each other.
          if (grove.some((g) => Math.hypot(g.x - x, g.z - z) < (g.model.radius * g.scale + r) * 0.7)) continue;
          grove.push({ model, x, z, rotY: rng.next() * Math.PI * 2, scale });
          break;
        }
      }
      out.push(...grove);
    }
  }
  return out;
}
