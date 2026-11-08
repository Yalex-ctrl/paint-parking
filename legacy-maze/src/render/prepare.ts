import * as THREE from 'three';

import type { Level } from '../game/types';
import { themeForLevel, type WorldTheme } from '../core/worlds';
import { fitCamera, type Margins } from './cameraFit';
import { planForCameraSteps } from '../core/render/decor/planner';
import { islandSpecFor } from './islandLayout';
import type { Placed } from '../core/render/decor/placement';
import { buildContactShadowGeometry, buildSlabGeometry, buildWallGeometry, type BoardGeometries } from './geometry';
import { buildChuteParts } from './slideGeometry';
import { buildIslandGeometry, cellKey, groundColors, type IslandSpec } from './island';

export type Viewport = { width: number; height: number };

/** Extra room (px) kept between the decor and the buttons, so nothing is cut off or half hidden by them. */
export const BUTTON_CLEARANCE = 28;

/**
 * Everything heavy about a level, built ahead of time (while the previous level is being
 * played) so that starting it never stalls a frame: wall/shadow geometry, the grass island
 * with its pit, the decor plan and the camera framing.
 */
export type PreparedLevel = {
  id: number;
  level: Level;
  /** The look of the world this level belongs to (ground, sky, light, foliage). */
  theme: WorldTheme;
  geometries: BoardGeometries;
  island: THREE.BufferGeometry;
  islandSpec: IslandSpec;
  decor: Placed[];
  /** Camera position framing this level; the orientation is the same for every level. */
  cameraPosition: THREE.Vector3;
  cameraQuaternion: THREE.Quaternion;
  /** Distance from the camera to the point it looks at. */
  dist: number;
  dispose: () => void;
};

/**
 * Builds everything a level needs, one piece at a time: it pauses (`yield`) between the camera, the scenery plan, the board
 * geometry and the island, so the next level can be prepared behind the one being played, a piece per frame, instead of
 * stalling a frame for all of it.
 */
export function* prepareLevelSteps(level: Level, viewport: Viewport, margins: Margins, decorOn: boolean): Generator<void, PreparedLevel, void> {
  const camera = new THREE.PerspectiveCamera();
  const { dist } = fitCamera(camera, level, viewport.width, viewport.height, margins);
  // Decor stays between the header and the buttons: nothing may show behind them.
  const safe = {
    top: 1 - (2 * margins.top) / viewport.height,
    bottom: -1 + (2 * (margins.bottom + BUTTON_CLEARANCE)) / viewport.height,
  };
  const theme = themeForLevel(level.id);
  yield;
  const decor = decorOn ? yield* planForCameraSteps(level, camera, safe, theme.decor) : [];
  yield;
  const walls = buildWallGeometry(level, theme.wood);
  yield;
  const shadows = buildContactShadowGeometry(level);
  const slab = buildSlabGeometry(level);
  const geometries: BoardGeometries = { walls, shadows, slab };
  // The chutes are built (and cached by shape) here, never while the level is played.
  for (const s of level.features.slides ?? []) buildChuteParts(level, s, theme.wood);
  yield;
  const islandSpec = islandSpecFor(level);
  const island = buildIslandGeometry(level, islandSpec, groundColors(theme.ground));
  return {
    id: level.id,
    level,
    theme,
    geometries,
    island,
    islandSpec,
    decor,
    cameraPosition: camera.position.clone(),
    cameraQuaternion: camera.quaternion.clone(),
    dist,
    dispose: () => {
      geometries.walls.dispose();
      geometries.shadows.dispose();
      geometries.slab.dispose();
      island.dispose();
    },
  };
}

/** All the steps at once (the first level, and tests). */
export function prepareLevel(level: Level, viewport: Viewport, margins: Margins, decorOn: boolean): PreparedLevel {
  const steps = prepareLevelSteps(level, viewport, margins, decorOn);
  for (;;) {
    const r = steps.next();
    if (r.done) return r.value;
  }
}

export { cellKey };
