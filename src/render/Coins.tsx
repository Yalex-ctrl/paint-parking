import { tileHeight } from './heights';
import { useContext, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { useFrame, useThree } from '@react-three/fiber/native';

import type { Cell, Level } from '../game/types';
import type { SceneBus } from './bus';
import { CAMERA_TILT_DEG } from './cameraFit';
import { cellX, cellZ } from './coords';
import { RenderStyleContext } from './style';
import { WorldKeyContext } from './worldContext';

/** 45 % of a cell across: clearly smaller than the ball (0.82), but not a speck. */
export const COIN_R = 0.225;
/** Height of its centre above the floor: about the middle of the ball, so it floats. */
export const COIN_HEIGHT = 0.41;
const COIN_FLY_SECONDS = 0.6;
const BOB = 0.05;
/**
 * The coins face the camera: the disc is tipped back until its face looks at the game's camera (which looks down at 65 degrees, a few
 * degrees less on the levels with platforms). A disc that only stood upright would be seen from above as a flat oval, lying on the floor.
 */
const TILT_RAD = (deg: number) => (-(CAMERA_TILT_DEG - deg) * Math.PI) / 180;

const GOLD = new THREE.Color('#ffd23f');
const GOLD_EDGE = new THREE.Color('#8f5600');
const GOLD_DEEP = new THREE.Color('#e0a000');

function part(g: THREE.BufferGeometry, color: THREE.Color): THREE.BufferGeometry {
  const n = g.getAttribute('position').count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.set([color.r, color.g, color.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  const out = g.index ? g.toNonIndexed() : g;
  out.deleteAttribute('uv');
  return out;
}

/**
 * One geometry for every coin: a thick disc facing +Z with a bright rim and an embossed ring on both faces (vertex colours),
 * so all the coins of a level are one draw call.
 */
export function buildCoinGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const body = new THREE.CylinderGeometry(COIN_R, COIN_R, 0.075, 24);
  body.rotateX(Math.PI / 2);
  parts.push(part(body, GOLD));
  parts.push(part(new THREE.TorusGeometry(COIN_R - 0.03, 0.03, 6, 24), GOLD_EDGE));
  for (const side of [-1, 1]) {
    const ring = new THREE.RingGeometry(COIN_R * 0.4, COIN_R * 0.62, 20);
    if (side < 0) ring.rotateY(Math.PI);
    ring.translate(0, 0, side * 0.04);
    parts.push(part(ring, GOLD_DEEP));
  }
  const merged = mergeGeometries(parts)!;
  parts.forEach((p) => p.dispose());
  merged.computeVertexNormals();
  return merged;
}

const M = new THREE.Matrix4();
const P = new THREE.Vector3();
const Q = new THREE.Quaternion();
const QY = new THREE.Quaternion();
const QL = new THREE.Quaternion();
const AXIS_X = new THREE.Vector3(1, 0, 0);
const S = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const FLY_TARGET = new THREE.Vector3();

/**
 * The coins of a level: upright shiny gold discs floating at mid height of the ball, bobbing a little and turning on their
 * vertical axis. A picked-up coin flies to the counter in the header (its screen position is on the bus).
 */
export function Coins({ level, bus }: { level: Level; bus: SceneBus }) {
  const cells = level.features.coins;
  const worldKey = useContext(WorldKeyContext);
  const camera = useThree((s) => s.camera);
  const { env } = useContext(RenderStyleContext);
  const mesh = useRef<THREE.InstancedMesh>(null);
  // The tilt that makes the coins face this level's camera (set once; the scene never allocates in a frame).
  const tilt = TILT_RAD(level.camTilt ?? 0);
  const geometry = useMemo(() => buildCoinGeometry(), []);
  useLayoutEffect(() => () => geometry.dispose(), [geometry]);
  const taken = useRef<(number | null)[]>([]);
  const start = useRef<THREE.Vector3[]>([]);
  const home = useMemo(() => cells.map((c) => new THREE.Vector3(cellX(level, c[1]), COIN_HEIGHT + tileHeight(level, c[0], c[1]), cellZ(level, c[0]))), [cells, level]);

  useLayoutEffect(() => {
    taken.current = cells.map(() => null);
    start.current = cells.map(() => new THREE.Vector3());
  }, [cells]);

  useEffect(
    () =>
      bus.on(
        'coin',
        (c: Cell) => {
          const i = cells.findIndex((x) => x[0] === c[0] && x[1] === c[1]);
          if (i >= 0 && taken.current[i] === null) {
            taken.current[i] = 0;
            start.current[i].copy(home[i]);
            start.current[i].y += Math.sin(performance.now() / 1000 * 2.2 + cells[i][0] * 2) * BOB;
          }
        },
        worldKey,
      ),
    [bus, cells, home, worldKey],
  );

  useFrame(({ clock }, rawDt) => {
    const m = mesh.current;
    if (!m) return;
    QL.setFromAxisAngle(AXIS_X, tilt);
    const t = clock.elapsedTime;
    const parent = m.parent;
    for (let i = 0; i < cells.length; i++) {
      const k0 = taken.current[i];
      let scale = 1;
      if (k0 === null || k0 === undefined) {
        P.copy(home[i]);
        P.y += Math.sin(t * 2.2 + cells[i][0] * 2) * BOB;
        QY.setFromAxisAngle(UP, t * 1.3 + cells[i][1] * 0.7);
      } else {
        const k = Math.min(1, k0 + Math.min(rawDt, 1 / 20) / COIN_FLY_SECONDS);
        taken.current[i] = k;
        const e = k * k * (3 - 2 * k);
        const target = bus.coinTarget;
        if (target && parent) {
          FLY_TARGET.set(target.x, target.y, 0.984).unproject(camera); // ~12 units in front of the camera
          parent.worldToLocal(FLY_TARGET);
          P.lerpVectors(start.current[i], FLY_TARGET, e);
          P.y += Math.sin(k * Math.PI) * 0.6; // a little arc
        } else {
          P.copy(start.current[i]);
          P.y += k * 1.6;
        }
        QY.setFromAxisAngle(UP, t * 1.3 + k * 9);
        scale = k >= 1 ? 0 : 1 - 0.55 * e;
      }
      Q.copy(QL).multiply(QY);
      S.setScalar(scale);
      m.setMatrixAt(i, M.compose(P, Q, S));
    }
    m.instanceMatrix.needsUpdate = true;
  });

  if (cells.length === 0) return null;
  return (
    <instancedMesh key={cells.length} ref={mesh} args={[geometry, undefined, cells.length]} frustumCulled={false}>
      <meshStandardMaterial
        vertexColors
        color="#ffffff"
        metalness={0.95}
        roughness={0.16}
        emissive="#d98a00"
        emissiveIntensity={0.5}
        envMap={env}
        envMapIntensity={1.4}
      />
    </instancedMesh>
  );
}
