import { useContext, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber/native';

import { themeForLevel } from '../game/worlds';
import type { Level, Slide } from '../game/types';
import type { SceneBus } from './bus';
import { cellWorld } from './coords';
import { paintTint, isPaintEffect, sharedPaintMaterial } from './paintEffects';
import { buildChuteParts } from './slideGeometry';
import { slideLine } from './slidePath';
import { RenderStyleContext } from './style';
import { WorldKeyContext } from './worldContext';
import { chevronGeometry, chevronMaterial, sharedWoodMaterial, troughFloorMaterial } from './slideVisuals';

/** The flap opens this wide (radians) when the ball comes out, fast, and shuts a little slower. */
const FLAP_OPEN = 1.3;
const FLAP_OPEN_SPEED = 16;
const FLAP_CLOSE_SPEED = 11;
/** The flap starts opening when the ball is this far (world units) from the end of the chute. */
const FLAP_LEAD = 0.75;
/** The shudder of the flap when the ball runs into it from outside. */
const HIT_SECONDS = 0.28;
const HIT_AMPLITUDE = 0.09;
/** The entry chevrons breathe about every two seconds. */
const PULSE_PERIOD = 2;

const NO_SLIDES: Slide[] = [];
const tmpM = new THREE.Matrix4();
const WHITE = new THREE.Color(1, 1, 1);
const pulseColor = new THREE.Color();

type Flap = { angle: number; hit: number; opened: boolean };

/**
 * The slides (toboggans) of a level: the covered wooden chute, its floor, the paint of the ball on that floor, the chevrons that say
 * which way it goes, and the flap that shuts the exit. The geometries are shared by form (built while the level was prepared); what moves
 * is the pulse of the entry chevrons, the flap, and how much of the paint is drawn (a draw range: nothing is created or changed in a
 * geometry while the ball rides).
 */
export function Slides({ level, bus }: { level: Level; bus: SceneBus }) {
  const worldKey = useContext(WorldKeyContext);
  const { paint: paintId, env } = useContext(RenderStyleContext);
  const effect = isPaintEffect(paintId) ? paintId : 'classic';
  const slides = level.features.slides ?? NO_SLIDES;
  const theme = themeForLevel(level.id);
  const parts = useMemo(() => slides.map((s) => buildChuteParts(level, s, theme.wood)), [level, slides, theme.wood]);
  const overlays = useMemo(() => parts.map((p) => p.newOverlay()), [parts]);
  useEffect(() => () => overlays.forEach((g) => g.dispose()), [overlays]);
  const wood = sharedWoodMaterial();
  const floor = troughFloorMaterial();
  const paintMaterial = useMemo(() => sharedPaintMaterial(effect, env), [effect, env]);
  const paintColor = useMemo(() => {
    const out = new THREE.Color();
    return paintTint(out, effect, new THREE.Color(level.color), { order: 0, noise: 0, coat: 1, double: false, pos: { u: 0.5, v: 0.5 } });
  }, [effect, level.color]);

  const overlayRefs = useRef<(THREE.InstancedMesh | null)[]>([]);
  const flapRefs = useRef<(THREE.Group | null)[]>([]);
  const chevrons = useRef<THREE.InstancedMesh>(null);
  const reach = useRef<number[]>(slides.map(() => 0));
  const drawn = useRef<number[]>(slides.map(() => -1));
  const flaps = useRef<Flap[]>(slides.map(() => ({ angle: 0, hit: -1, opened: false })));
  /** Length of each chute's plan curve, for the lead of the flap. */
  const lengths = useMemo(() => slides.map((s) => slideLine(level, s, 8).length), [level, slides]);

  const origins = useMemo(() => slides.map((s) => cellWorld(level, s.entry)), [level, slides]);
  const entryCount = parts.reduce((n, p) => n + p.entryChevrons.length, 0);
  const troughCount = parts.reduce((n, p) => n + p.troughChevrons.length, 0);

  useLayoutEffect(() => {
    overlayRefs.current.forEach((m) => {
      if (!m) return;
      m.setMatrixAt(0, tmpM.identity());
      m.instanceMatrix.needsUpdate = true;
      m.setColorAt(0, paintColor);
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    });
  }, [paintColor, overlays]);

  useLayoutEffect(() => {
    const mesh = chevrons.current;
    if (!mesh) return;
    const shift = new THREE.Matrix4();
    let n = 0;
    // The ones of the entry tiles first (they pulse), then the ones in the troughs (steady).
    for (const pick of [(i: number) => parts[i].entryChevrons, (i: number) => parts[i].troughChevrons]) {
      parts.forEach((_, i) => {
        const [ox, oz] = origins[i];
        shift.makeTranslation(ox, 0, oz);
        for (const m of pick(i)) {
          tmpM.copy(m).premultiply(shift);
          mesh.setMatrixAt(n, tmpM);
          mesh.setColorAt(n, WHITE);
          n++;
        }
      });
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [parts, origins]);

  useLayoutEffect(() => {
    return bus.on(
      'flapHit',
      (i) => {
        const f = flaps.current[i];
        if (f) f.hit = 0;
      },
      worldKey,
    );
  }, [bus, worldKey]);

  const chevronMat = chevronMaterial();
  useFrame(({ clock }, rawDt) => {
    if (slides.length === 0) return;
    const dt = Math.min(rawDt, 1 / 20);
    // The entry chevrons breathe in brightness (a colour per instance: one draw call for every chevron of the level).
    const mesh = chevrons.current;
    if (mesh && entryCount > 0) {
      const k = 0.72 + 0.28 * Math.sin((clock.elapsedTime / PULSE_PERIOD) * Math.PI * 2);
      pulseColor.setRGB(k, k, k);
      for (let n = 0; n < entryCount; n++) mesh.setColorAt(n, pulseColor);
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    for (let i = 0; i < slides.length; i++) {
      const ride = bus.inChute && bus.chuteIndex === i;
      if (ride) reach.current[i] = Math.max(reach.current[i], bus.chuteU);
      // The paint: more of the overlay is drawn as the ball goes on (a draw range, no change of geometry).
      const quads = parts[i].floorQuads;
      const want = Math.min(quads, Math.ceil(reach.current[i] * quads));
      if (want !== drawn.current[i]) {
        drawn.current[i] = want;
        overlays[i].setDrawRange(0, want * 6);
      }
      // The flap: it opens as the ball nears the end, and shuts as soon as it is out.
      const f = flaps.current[i];
      const near = ride && bus.chuteU * lengths[i] > lengths[i] - FLAP_LEAD - 0.5;
      if (near) {
        f.angle = Math.min(FLAP_OPEN, f.angle + FLAP_OPEN_SPEED * dt);
        if (!f.opened && f.angle > 0.15) {
          f.opened = true;
          bus.onEvent?.('flapOpen');
        }
      } else if (f.angle > 0) {
        f.angle = Math.max(0, f.angle - FLAP_CLOSE_SPEED * dt);
        if (f.angle === 0 && f.opened) {
          f.opened = false;
          bus.onEvent?.('flapClose');
        }
      }
      let shake = 0;
      if (f.hit >= 0) {
        f.hit += dt;
        shake = f.hit < HIT_SECONDS ? Math.sin(f.hit * 70) * HIT_AMPLITUDE * (1 - f.hit / HIT_SECONDS) : 0;
        if (f.hit >= HIT_SECONDS) f.hit = -1;
      }
      const g = flapRefs.current[i];
      if (g) g.rotation.x = -f.angle + shake;
    }
  });

  if (slides.length === 0) return null;
  return (
    <group>
      {slides.map((s, i) => {
        const [x, z] = origins[i];
        const p = parts[i];
        return (
          <group key={`${s.entry}`} position={[x, 0, z]}>
            <mesh geometry={p.wood} material={wood} castShadow receiveShadow frustumCulled={false} />
            <mesh geometry={p.floor} material={floor} receiveShadow frustumCulled={false} />
            <instancedMesh
              ref={(m) => {
                overlayRefs.current[i] = m;
              }}
              args={[overlays[i], paintMaterial, 1]}
              frustumCulled={false}
              receiveShadow
            />
            <group position={p.hinge} rotation={[0, p.yaw, 0]}>
              <group
                ref={(g) => {
                  flapRefs.current[i] = g;
                }}
              >
                <mesh geometry={p.flap} material={wood} castShadow />
              </group>
            </group>
          </group>
        );
      })}
      {entryCount + troughCount > 0 && <instancedMesh ref={chevrons} args={[chevronGeometry(), chevronMat, entryCount + troughCount]} frustumCulled={false} renderOrder={4} />}
    </group>
  );
}
