import { readFileSync } from 'fs';
import { join } from 'path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { DECOR_MODELS } from '../src/render/decor/catalog';
import { proceduralParts } from '../src/render/decor/procedural';

/** Parses the real .glb files exactly like the app does (ArrayBuffer -> GLTFLoader). */
describe('decor models', () => {
  it.each(DECOR_MODELS.filter((m) => !m.procedural).map((m) => [m.name, m] as const))('%s parses and matches the catalog', async (name, model) => {
    const file = readFileSync(join(__dirname, '../assets/models', `${name}.glb`));
    const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
    const gltf = await new GLTFLoader().parseAsync(buffer, '');
    let meshes = 0;
    gltf.scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes++;
    });
    expect(meshes).toBeGreaterThan(0);

    const box = new THREE.Box3().setFromObject(gltf.scene);
    // Kenney models share a -0.05 baseline: planted slightly into the ground.
    expect(box.min.y).toBeCloseTo(-0.05, 1);
    expect(box.max.y - box.min.y).toBeCloseTo(model.height, 1);
    const footprint = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2;
    expect(footprint).toBeGreaterThan(model.radius * 0.7);
    expect(footprint).toBeLessThan(model.radius * 1.4);
  });
});

describe('procedural greenery', () => {
  it.each(DECOR_MODELS.filter((m) => m.procedural).map((m) => [m.name, m] as const))('%s is a solid volume that matches the catalog', (name, model) => {
    const parts = proceduralParts(name);
    expect(parts).toHaveLength(1);
    const geo = parts[0].geometry;
    geo.computeBoundingBox();
    const box = geo.boundingBox!;
    expect(box.min.y).toBeGreaterThanOrEqual(-0.05); // stands on (slightly in) the ground
    expect(box.max.y).toBeGreaterThan(model.height * 0.7);
    expect(box.max.y).toBeLessThan(model.height * 1.3);
    const reach = Math.max(Math.abs(box.min.x), Math.abs(box.max.x), Math.abs(box.min.z), Math.abs(box.max.z));
    expect(reach).toBeGreaterThan(model.radius * 0.6);
    expect(reach).toBeLessThan(model.radius * 1.4);
    // Plants have volume: they are not a single flat sheet.
    expect(box.max.y - box.min.y).toBeGreaterThan(0.3);
    expect(geo.getAttribute('color')).toBeDefined();
  });
});
