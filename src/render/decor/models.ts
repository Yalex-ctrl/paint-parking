import { Asset } from 'expo-asset';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { NATURAL_COLORS } from './palette';
import { PROCEDURAL_NAMES, proceduralParts } from './procedural';

/* eslint-disable @typescript-eslint/no-require-imports -- Metro needs static require() paths. Only these 10 files of the Kenney Nature Kit (CC0)
   live in the project; nothing references the original download folder. */
const SOURCES: Record<string, number> = {
  tree_default: require('../../../assets/models/tree_default.glb'),
  tree_oak: require('../../../assets/models/tree_oak.glb'),
  tree_fat: require('../../../assets/models/tree_fat.glb'),
  tree_small: require('../../../assets/models/tree_small.glb'),
  tree_pineTallA: require('../../../assets/models/tree_pineTallA.glb'),
  stone_largeA: require('../../../assets/models/stone_largeA.glb'),
  stone_smallA: require('../../../assets/models/stone_smallA.glb'),
  stump_round: require('../../../assets/models/stump_round.glb'),
  cactus_tall: require('../../../assets/models/cactus_tall.glb'),
  cactus_short: require('../../../assets/models/cactus_short.glb'),
};

/** One mesh of a model: geometry/material are shared by every instance of the model. */
export type DecorPart = {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  /** The mesh's transform inside the model. */
  matrix: THREE.Matrix4;
  /** Name of the kit material this part used (leaves are re-coloured per world). */
  materialName?: string;
};

export type DecorLibrary = Map<string, DecorPart[]>;

let pending: Promise<DecorLibrary> | null = null;
let ready: DecorLibrary | null = null;

const materials = new Map<string, THREE.MeshStandardMaterial>();
function litMaterial(source: THREE.Material): THREE.Material {
  const original = (source as THREE.MeshBasicMaterial).color;
  const natural = NATURAL_COLORS[source.name];
  const key = source.name + (natural ? '' : original ? original.getHexString() : '');
  let m = materials.get(key);
  if (!m) {
    const color = natural ? new THREE.Color(natural) : original ? original.clone() : new THREE.Color('#888888');
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
    materials.set(key, m);
  }
  return m;
}

async function loadModel(name: string): Promise<DecorPart[]> {
  const asset = Asset.fromModule(SOURCES[name]);
  await asset.downloadAsync();
  const response = await fetch(asset.localUri ?? asset.uri);
  const buffer = await response.arrayBuffer();
  const gltf = await new GLTFLoader().parseAsync(buffer, '');
  gltf.scene.updateMatrixWorld(true);
  const parts: DecorPart[] = [];
  gltf.scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    parts.push({ geometry: mesh.geometry, material: litMaterial(material), matrix: mesh.matrixWorld.clone(), materialName: material.name });
  });
  return parts;
}

/**
 * Loads (once) every decor model. Call it early, e.g. from the home screen, so
 * starting a level never waits on file reads. A model that fails to load is
 * skipped: the game works without decor.
 */
export function preloadDecor(): Promise<DecorLibrary> {
  if (!pending) {
    pending = (async () => {
      const library: DecorLibrary = new Map();
      // Bushes, flowers and tall grass are built in code: no file to read.
      for (const name of PROCEDURAL_NAMES) library.set(name, proceduralParts(name));
      await Promise.all(
        Object.keys(SOURCES).map(async (name) => {
          try {
            library.set(name, await loadModel(name));
          } catch (err) {
            console.log(`[paint-parking] decor model ${name} failed to load:`, err);
          }
        }),
      );
      ready = library;
      return library;
    })();
  }
  return pending;
}

/** The library if it has already finished loading. */
export const getDecorLibrary = () => ready;
