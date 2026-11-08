import * as THREE from 'three';

/**
 * The shared textures and materials of the structures of the board (platforms, ramps, chutes) and of the shadow of the ball. Each is
 * made once, on first use (while a level is mounted in the background), and never again: the board never creates a material or a
 * texture while it is played. Every texture here is baked from numbers (no canvas on the phone) and is tiny.
 */
const make = (w: number, h: number, fill: (x: number, y: number) => [number, number, number, number]): THREE.DataTexture => {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = fill(x, y);
      const i = (y * w + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a;
    }
  }
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
};

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** The soft dark disc under the ball (alpha only, black): the lower the ball, the darker and the bigger. */
let shadowTex: THREE.DataTexture | null = null;
export const ballShadowTexture = () =>
  (shadowTex ??= make(48, 48, (x, y) => {
    const d = Math.hypot((x + 0.5) / 48 - 0.5, (y + 0.5) / 48 - 0.5) * 2;
    return [0, 0, 0, Math.round(255 * Math.pow(1 - smooth(0.15, 1, d), 1.4))];
  }));
let shadowMat: THREE.MeshBasicMaterial | null = null;
export const ballShadowMaterial = () =>
  (shadowMat ??= new THREE.MeshBasicMaterial({ map: ballShadowTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, opacity: 0.55 }));
let shadowGeo: THREE.PlaneGeometry | null = null;
export const ballShadowGeometry = () => {
  if (!shadowGeo) {
    shadowGeo = new THREE.PlaneGeometry(1, 1);
    shadowGeo.rotateX(-Math.PI / 2);
  }
  return shadowGeo;
};

/** The wood of the walls, as a material for the structures built on the board: same colours (vertex colours), same roughness. */
let woodMat: THREE.MeshStandardMaterial | null = null;
export const sharedWoodMaterial = () => (woodMat ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0 }));

/**
 * The floor of the trough of a chute: the colour of the low floor tiles of the board, with a fine darker line between two tiles
 * (the texture repeats once per tile along the chute: u = 0 is the line).
 */
let troughMat: THREE.MeshStandardMaterial | null = null;
export const troughFloorMaterial = () => {
  if (!troughMat) {
    const lines = make(32, 2, (x) => {
      const u = (x + 0.5) / 32;
      const line = 1 - 0.42 * (1 - smooth(0, 0.045, Math.min(u, 1 - u)));
      const v = Math.round(255 * line);
      return [v, v, v, 255];
    });
    troughMat = new THREE.MeshStandardMaterial({ map: lines, roughness: 0.9 });
    troughMat.color.setHSL(0.72, 0.18, 0.22);
  }
  return troughMat;
};

/** A chevron lying on the floor, pointing to +x, in an off-white that reads on the paint as well as on the wood. */
let chevronTex: THREE.DataTexture | null = null;
const chevronTexture = () =>
  (chevronTex ??= make(64, 64, (x, y) => {
    // Two arms from the tip back to the two corners, with a soft edge.
    const px = (x + 0.5) / 64;
    const py = (y + 0.5) / 64;
    const arm = (sy: number) => {
      const ax = 0.22;
      const ay = sy;
      const bx = 0.82;
      const by = 0.5;
      const dx = bx - ax;
      const dy = by - ay;
      const t = Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
      return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
    };
    const d = Math.min(arm(0.12), arm(0.88));
    return [247, 240, 224, Math.round(255 * (1 - smooth(0.055, 0.085, d)))];
  }));
let chevronGeo: THREE.PlaneGeometry | null = null;
export const chevronGeometry = () => {
  if (!chevronGeo) {
    chevronGeo = new THREE.PlaneGeometry(0.46, 0.46);
    chevronGeo.rotateX(-Math.PI / 2);
  }
  return chevronGeo;
};
let chevronMat: THREE.MeshBasicMaterial | null = null;
/** One material for every chevron (the ones of the entry tiles pulse by their instance colour, see Slides). */
export const chevronMaterial = () =>
  (chevronMat ??= new THREE.MeshBasicMaterial({ map: chevronTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, opacity: 0.88, toneMapped: false }));

/** The planks of the side of a platform: dark vertical boards with a light line on the top edge (v = 1 at the top). */
let plankTex: THREE.DataTexture | null = null;
const plankTexture = () => {
  if (!plankTex) {
    plankTex = make(64, 64, (x, y) => {
      const board = Math.floor(x / 16);
      const within = (x % 16) / 16;
      const gap = within < 0.07 || within > 0.95 ? 0.55 : 1;
      const tone = 0.9 + ((board * 37) % 5) * 0.025;
      const lit = y / 64 > 0.9 ? 1 : 0;
      const r = Math.round(255 * Math.min(1, 0.42 * tone * gap * (1 - lit) + 0.97 * lit));
      const g = Math.round(255 * Math.min(1, 0.29 * tone * gap * (1 - lit) + 0.9 * lit));
      const b = Math.round(255 * Math.min(1, 0.18 * tone * gap * (1 - lit) + 0.74 * lit));
      return [r, g, b, 255];
    });
    plankTex.wrapS = THREE.RepeatWrapping;
    plankTex.wrapT = THREE.ClampToEdgeWrapping;
  }
  return plankTex;
};
let plankMat: THREE.MeshStandardMaterial | null = null;
export const plankMaterial = () => (plankMat ??= new THREE.MeshStandardMaterial({ map: plankTexture(), roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));

/** The double arrow painted on a ramp at both ends (one up, one down): off-white, flat on the slope. */
let arrowTex: THREE.DataTexture | null = null;
const rampArrowTexture = () =>
  (arrowTex ??= make(64, 64, (x, y) => {
    const px = (x + 0.5) / 64;
    const py = (y + 0.5) / 64;
    // An up arrow on the left half, a down arrow on the right: a shaft and a triangular head.
    const arrow = (cx: number, up: boolean) => {
      const ay = up ? py : 1 - py;
      const shaft = Math.abs(px - cx) < 0.045 && ay > 0.12 && ay < 0.62;
      const half = (0.88 - ay) * 0.34;
      const head = ay >= 0.55 && ay < 0.88 && Math.abs(px - cx) < half;
      return shaft || head;
    };
    const on = arrow(0.3, true) || arrow(0.7, false);
    return [247, 240, 224, on ? 235 : 0];
  }));
let rampArrowMat: THREE.MeshStandardMaterial | null = null;
export const rampArrowMaterial = () =>
  (rampArrowMat ??= new THREE.MeshStandardMaterial({ map: rampArrowTexture(), transparent: true, depthWrite: false, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
let rampArrowGeo: THREE.PlaneGeometry | null = null;
export const rampArrowGeometry = () => {
  if (!rampArrowGeo) {
    rampArrowGeo = new THREE.PlaneGeometry(0.62, 0.34);
    rampArrowGeo.rotateX(-Math.PI / 2);
  }
  return rampArrowGeo;
};
