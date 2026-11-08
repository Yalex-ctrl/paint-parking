/**
 * A tiny software renderer, to LOOK at the geometry of a level without a phone: `npx tsx scripts/preview.ts <what> <out-dir>`
 * where <what> is `showcase`, `level:<n>` or `daily:<n>` (n from 1). It draws the walls, the floor, the platforms, the ramps and the
 * chutes (the real geometry the game builds) with flat lighting from four sides and writes preview_0..3.png.
 * No textures, no shadows, no transparency: only the shapes and their colours, which is what a bug of construction shows in.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { BufferGeometry } from 'three';

import { DAILY_LEVELS } from '../src/game/dailyLevels';
import { encodePng } from '../src/core/png';
import { LEVELS } from '../src/game/levels';
import { showcaseLevel } from '../src/game/showcase';
import type { Level } from '../src/game/types';
import { themeForLevel } from '../src/core/worlds';
import { BASE_Y, PLATEAU_H, cellX, cellZ } from '../src/render/coords';
import { buildWallGeometry } from '../src/render/geometry';
import { tileHeight } from '../src/render/heights';
import { buildChuteParts } from '../src/render/slideGeometry';
import { buildTierParts } from '../src/render/tierGeometry';

type V3 = [number, number, number];
type Tri = { p: [V3, V3, V3]; c: [V3, V3, V3]; n: V3 };

const what = process.argv[2] ?? 'showcase';
const outDir = resolve(process.argv[3] ?? '.');
const level: Level = what === 'showcase' ? showcaseLevel() : what.startsWith('daily:') ? DAILY_LEVELS[Number(what.slice(6)) - 1] : LEVELS[Number(what.slice(6)) - 1];
const wood = themeForLevel(level.id).wood;

const tris: Tri[] = [];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => {
  const l = Math.hypot(...a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

function addGeometry(g: BufferGeometry, color: (i: number) => V3, offset: V3 = [0, 0, 0], doubleSided = false) {
  const pos = g.getAttribute('position');
  const idx = g.getIndex();
  const count = idx ? idx.count : pos.count;
  for (let t = 0; t < count; t += 3) {
    const ids = [0, 1, 2].map((k) => (idx ? idx.getX(t + k) : t + k));
    const p = ids.map((i) => [pos.getX(i) + offset[0], pos.getY(i) + offset[1], pos.getZ(i) + offset[2]] as V3) as [V3, V3, V3];
    const n = norm(cross(sub(p[1], p[0]), sub(p[2], p[0])));
    const c = ids.map((i) => color(i)) as [V3, V3, V3];
    tris.push({ p, c, n });
    if (doubleSided) tris.push({ p: [p[0], p[2], p[1]], c: [c[0], c[2], c[1]], n: [-n[0], -n[1], -n[2]] });
  }
}
const vertexColor = (g: BufferGeometry) => (i: number): V3 => {
  const a = g.getAttribute('color');
  return a ? [a.getX(i), a.getY(i), a.getZ(i)] : [0.6, 0.6, 0.6];
};

function quad(a: V3, b: V3, c: V3, d: V3, col: V3) {
  const n = norm(cross(sub(b, a), sub(d, a)));
  tris.push({ p: [a, b, c], c: [col, col, col], n }, { p: [a, c, d], c: [col, col, col], n });
}

// ---- the scene
const walls = buildWallGeometry(level, wood);
addGeometry(walls, vertexColor(walls));
const ground: V3 = [0.1, 0.09, 0.12];
const hw = level.cols / 2 + 3;
const hd = level.rows / 2 + 3;
quad([-hw, BASE_Y, -hd], [-hw, BASE_Y, hd], [hw, BASE_Y, hd], [hw, BASE_Y, -hd], ground);
const raised = new Set(level.features.raised.map(([r, c]) => r * level.cols + c));
const ramps = new Map(level.features.ramps.map((k) => [k.r * level.cols + k.c, k.up]));
for (let r = 0; r < level.rows; r++) {
  for (let c = 0; c < level.cols; c++) {
    if (level.grid[r][c] !== '.') continue;
    const x = cellX(level, c);
    const z = cellZ(level, r);
    const h = tileHeight(level, r, c);
    const col: V3 = raised.has(r * level.cols + c) ? [0.55, 0.45, 0.32] : [0.34, 0.3, 0.42];
    const up = ramps.get(r * level.cols + c);
    if (up) {
      const [dr, dc] = { U: [-1, 0], D: [1, 0], L: [0, -1], R: [0, 1] }[up];
      const hi = (px: number, pz: number): number => PLATEAU_H * Math.min(1, Math.max(0, ((px - x) * dc + (pz - z) * dr) + 0.5));
      const P = (px: number, pz: number): V3 => [px, hi(px, pz) - 0.01, pz];
      quad(P(x - 0.47, z - 0.47), P(x - 0.47, z + 0.47), P(x + 0.47, z + 0.47), P(x + 0.47, z - 0.47), [0.6, 0.5, 0.36]);
    } else {
      quad([x - 0.47, h - 0.01, z - 0.47], [x - 0.47, h - 0.01, z + 0.47], [x + 0.47, h - 0.01, z + 0.47], [x + 0.47, h - 0.01, z - 0.47], col);
      // the side of a platform tile
      if (raised.has(r * level.cols + c)) {
        const s = 0.47;
        quad([x - s, h - 0.01, z + s], [x + s, h - 0.01, z + s], [x + s, BASE_Y, z + s], [x - s, BASE_Y, z + s], [0.35, 0.24, 0.15]);
      }
    }
  }
}
const tier = buildTierParts(level, wood);
if (tier.trim) addGeometry(tier.trim, () => [0.4, 0.28, 0.17], [0, 0, 0], true);
if (tier.fittings) addGeometry(tier.fittings, vertexColor(tier.fittings));
for (const s of level.features.slides) {
  const p = buildChuteParts(level, s, wood);
  const ox = cellX(level, s.entry[1]);
  const oz = cellZ(level, s.entry[0]);
  addGeometry(p.wood, vertexColor(p.wood), [ox, 0, oz]);
  addGeometry(p.floor, () => [0.3, 0.27, 0.36], [ox, 0, oz]);
  addGeometry(p.flap, vertexColor(p.flap), [ox + p.hinge[0], p.hinge[1], oz + p.hinge[2]]);
}

// ---- the rasteriser
const W = 720;
const H = 540;
const FOV = (40 * Math.PI) / 180;
const LIGHT = norm([-0.55, 1.15, 0.8]);

function render(eye: V3, target: V3): Uint8Array {
  const f = norm(sub(target, eye));
  const r = norm(cross(f, [0, 1, 0]));
  const u = cross(r, f);
  const depth = new Float32Array(W * H).fill(Infinity);
  const img = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const t = Math.floor(i / W) / H;
    img[i * 4] = Math.round(150 + 40 * (1 - t));
    img[i * 4 + 1] = Math.round(190 + 30 * (1 - t));
    img[i * 4 + 2] = 235;
    img[i * 4 + 3] = 255;
  }
  const focal = H / 2 / Math.tan(FOV / 2);
  const project = (p: V3): [number, number, number] => {
    const d = sub(p, eye);
    const z = d[0] * f[0] + d[1] * f[1] + d[2] * f[2];
    const x = d[0] * r[0] + d[1] * r[1] + d[2] * r[2];
    const y = d[0] * u[0] + d[1] * u[1] + d[2] * u[2];
    return [W / 2 + (x / z) * focal, H / 2 - (y / z) * focal, z];
  };
  for (const t of tris) {
    const q = t.p.map(project) as [number, number, number][];
    if (q.some((v) => v[2] < 0.1)) continue;
    const minX = Math.max(0, Math.floor(Math.min(q[0][0], q[1][0], q[2][0])));
    const maxX = Math.min(W - 1, Math.ceil(Math.max(q[0][0], q[1][0], q[2][0])));
    const minY = Math.max(0, Math.floor(Math.min(q[0][1], q[1][1], q[2][1])));
    const maxY = Math.min(H - 1, Math.ceil(Math.max(q[0][1], q[1][1], q[2][1])));
    const area = (q[1][0] - q[0][0]) * (q[2][1] - q[0][1]) - (q[2][0] - q[0][0]) * (q[1][1] - q[0][1]);
    if (Math.abs(area) < 1e-9) continue;
    // two-sided light: the side facing the eye
    const toEye = norm(sub(eye, t.p[0]));
    const nn: V3 = t.n[0] * toEye[0] + t.n[1] * toEye[1] + t.n[2] * toEye[2] < 0 ? [-t.n[0], -t.n[1], -t.n[2]] : t.n;
    const lambert = Math.max(0, nn[0] * LIGHT[0] + nn[1] * LIGHT[1] + nn[2] * LIGHT[2]);
    const shade = 0.42 + 0.62 * lambert;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        const w0 = ((q[1][0] - px) * (q[2][1] - py) - (q[2][0] - px) * (q[1][1] - py)) / area;
        const w1 = ((q[2][0] - px) * (q[0][1] - py) - (q[0][0] - px) * (q[2][1] - py)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const z = w0 * q[0][2] + w1 * q[1][2] + w2 * q[2][2];
        const i = y * W + x;
        if (z >= depth[i]) continue;
        depth[i] = z;
        for (let k = 0; k < 3; k++) {
          const v = w0 * t.c[0][k] + w1 * t.c[1][k] + w2 * t.c[2][k];
          img[i * 4 + k] = Math.min(255, Math.round(255 * Math.pow(Math.min(1, v * shade), 0.82)));
        }
      }
    }
  }
  return img;
}

mkdirSync(outDir, { recursive: true });
const focusArg = process.argv[4];
// A close look: `r,c,distance` (a tile of the level and how far the camera is, in tiles).
const [fr, fc, fd] = focusArg ? focusArg.split(',').map(Number) : [0, 0, 0];
const centre: V3 = focusArg ? [cellX(level, fc), 0.6, cellZ(level, fr)] : [0, 0.3, 0];
const span = focusArg ? fd / 1.25 : Math.max(level.cols, level.rows);
// Four views: the game's own (65 degrees, from the front), then from the right, from behind, and from the left, lower.
const views: [number, number, number][] = [
  [0, 1.13, 0.9],
  [Math.PI / 2, 0.75, 0.85],
  [Math.PI, 0.9, 0.9],
  [-Math.PI / 2 + 0.4, 0.55, 0.85],
];
views.forEach(([yaw, pitch, dist], i) => {
  const d = focusArg ? fd * (0.8 + 0.4 * dist) : span * dist * 1.25;
  const eye: V3 = [centre[0] + Math.sin(yaw) * Math.cos(pitch) * d, centre[1] + Math.sin(pitch) * d, centre[2] + Math.cos(yaw) * Math.cos(pitch) * d];
  writeFileSync(resolve(outDir, `preview_${i}.png`), encodePng(W, H, render(eye, centre)));
});
console.log('wrote', views.length, 'views to', outDir);
