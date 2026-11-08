import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { PixelRatio } from 'react-native';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Canvas, useFrame, useThree } from '@react-three/fiber/native';

import type { WorldTheme } from '../game/worlds';

import { Ball } from './Ball';
import { MAX_PIXEL_RATIO, useQuality } from './perf';
import { PerfMonitor } from './PerfMonitor';
import { RenderStyleContext } from './style';
import type { SceneBus } from './bus';
import { CameraRig } from './CameraRig';
import { useDecorLibrary } from './decor/DecorLayer';
import { Director } from './Director';
import { FreeCamera } from './FreeCamera';
import { BallScreen } from './BallScreen';
import { FirstFrame } from './FirstFrame';
import { HintArrow } from './HintArrow';
import { ParticlePool } from './ParticlePool';
import { Particles } from './Particles';
import type { PreparedLevel } from './prepare';
import { linkOffset } from './transition';
import { Warmup } from './Warmup';
import { Trail } from './Trail';
import { LevelWorld } from './World';

/** Neutral dark used by the React Native containers around the canvas. */
export const SCENE_BG = '#1d1733';
/** Clear colour: only visible for a few frames at start-up. */
const SKY_BG = '#a9cdee';
const SHADOWS = true;

type Props = {
  /** The level being played. */
  current: PreparedLevel;
  /** The next level, mounted (hidden) as soon as it is prepared so the transition never waits. */
  next: PreparedLevel | null;
  /** Bump to rebuild the current board (restart). */
  runKey: number;
  bus: SceneBus;
  /** Scenery around the board (the "Décors" setting). */
  decor: boolean;
  /** False while another screen is on top: the scene stops drawing (no frame, no work) until it is shown again. */
  active?: boolean;
  /** The equipped ball skin and paint effect (shop ids). */
  ballSkin: string;
  paintEffect: string;
  /** Called once the scene has drawn its first frames. */
  onReady?: () => void;
  /** Developer tool: the camera turns round the board under the fingers (see FreeCamera.tsx). */
  freeCamera?: boolean;
};

const SKY_W = 2;
const SKY_H = 64;
const _top = new THREE.Color();
const _bottom = new THREE.Color();
const _c = new THREE.Color();
const _rgb = { r: 0, g: 0, b: 0 };

/** Writes the vertical sky gradient (row 0 is the bottom of the texture). */
function writeSky(data: Uint8Array, top: THREE.Color, bottom: THREE.Color) {
  for (let y = 0; y < SKY_H; y++) {
    _c.copy(bottom).lerp(top, y / (SKY_H - 1));
    _c.getRGB(_rgb, THREE.SRGBColorSpace);
    for (let x = 0; x < SKY_W; x++) {
      const i = (y * SKY_W + x) * 4;
      data[i] = Math.round(_rgb.r * 255);
      data[i + 1] = Math.round(_rgb.g * 255);
      data[i + 2] = Math.round(_rgb.b * 255);
      data[i + 3] = 255;
    }
  }
}

/** Fraction of the way to the new world's look covered per second (the sky and light fade over ~1 s). */
const THEME_FADE = 3;

/**
 * Sky and lights of the current world. They start at the world's look and, when the next world takes over,
 * glide to the new one instead of switching.
 */
export function ThemeRig({ theme, span, shadows = true }: { theme: WorldTheme; span: number; shadows?: boolean }) {
  const scene = useThree((s) => s.scene);
  const ambient = useRef<THREE.AmbientLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const sun = useRef<THREE.DirectionalLight>(null);
  const [initial] = useState(() => theme);

  // What is shown now (mutated every frame, never React state).
  const shown = useRef({
    skyTop: new THREE.Color(initial.sky.top),
    skyBottom: new THREE.Color(initial.sky.bottom),
    ambient: new THREE.Color(initial.light.ambient),
    ambientI: initial.light.ambientIntensity,
    hemiSky: new THREE.Color(initial.light.hemiSky),
    hemiGround: new THREE.Color(initial.light.hemiGround),
    sun: new THREE.Color(initial.light.sun),
    sunI: initial.light.sunIntensity,
  });
  const target = useMemo(
    () => ({
      skyTop: new THREE.Color(theme.sky.top),
      skyBottom: new THREE.Color(theme.sky.bottom),
      ambient: new THREE.Color(theme.light.ambient),
      hemiSky: new THREE.Color(theme.light.hemiSky),
      hemiGround: new THREE.Color(theme.light.hemiGround),
      sun: new THREE.Color(theme.light.sun),
    }),
    [theme],
  );
  const sky = useMemo(() => {
    const data = new Uint8Array(SKY_W * SKY_H * 4);
    writeSky(data, _top.set(initial.sky.top), _bottom.set(initial.sky.bottom));
    const tex = new THREE.DataTexture(data, SKY_W, SKY_H, THREE.RGBAFormat);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    return tex;
  }, [initial]);
  useEffect(() => {
    scene.background = sky;
    return () => {
      scene.background = null;
      sky.dispose();
    };
  }, [scene, sky]);

  // The one light that casts shadows stops doing so when the phone cannot keep up.
  useEffect(() => {
    if (sun.current) sun.current.castShadow = SHADOWS && shadows;
  }, [shadows]);

  useFrame((_, dt) => {
    const k = 1 - Math.exp(-Math.min(dt, 0.1) * THEME_FADE);
    const cur = shown.current;
    const skyBefore = cur.skyTop.getHex() * 31 + cur.skyBottom.getHex();
    cur.skyTop.lerp(target.skyTop, k);
    cur.skyBottom.lerp(target.skyBottom, k);
    if (cur.skyTop.getHex() * 31 + cur.skyBottom.getHex() !== skyBefore) {
      writeSky(sky.image.data as unknown as Uint8Array, cur.skyTop, cur.skyBottom);
      sky.needsUpdate = true;
    }
    cur.ambient.lerp(target.ambient, k);
    cur.ambientI += (theme.light.ambientIntensity - cur.ambientI) * k;
    cur.hemiSky.lerp(target.hemiSky, k);
    cur.hemiGround.lerp(target.hemiGround, k);
    cur.sun.lerp(target.sun, k);
    cur.sunI += (theme.light.sunIntensity - cur.sunI) * k;
    if (ambient.current) {
      ambient.current.color.copy(cur.ambient);
      ambient.current.intensity = cur.ambientI;
    }
    if (hemi.current) {
      hemi.current.color.copy(cur.hemiSky);
      hemi.current.groundColor.copy(cur.hemiGround);
    }
    if (sun.current) {
      sun.current.color.copy(cur.sun);
      sun.current.intensity = cur.sunI;
    }
  });

  return (
    <>
      <ambientLight ref={ambient} intensity={initial.light.ambientIntensity} color={initial.light.ambient} />
      <hemisphereLight ref={hemi} args={[initial.light.hemiSky, initial.light.hemiGround, 0.55]} />
      {/* Key light from the front-left and above: lights the tops and the front faces of the walls. */}
      <directionalLight
        ref={sun}
        position={[-span * 0.55, span * 1.15, span * 0.8]}
        intensity={initial.light.sunIntensity}
        color={initial.light.sun}
        castShadow={SHADOWS}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-span * 0.95}
        shadow-camera-right={span * 0.95}
        shadow-camera-top={span * 0.95}
        shadow-camera-bottom={-span * 0.95}
        shadow-camera-near={0.5}
        shadow-camera-far={span * 5}
        shadow-bias={-0.0005}
        shadow-normalBias={0.02}
      />
    </>
  );
}

/** Small generated reflection map for the metal ball; null when expo-gl cannot build it. */
export function useEnvironment() {
  const gl = useThree((s) => s.gl);
  const [env, setEnv] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    let target: THREE.WebGLRenderTarget | null = null;
    try {
      const pmrem = new THREE.PMREMGenerator(gl as unknown as THREE.WebGLRenderer);
      target = pmrem.fromScene(new RoomEnvironment(), 0.04);
      setEnv(target.texture);
      pmrem.dispose();
    } catch (err) {
      console.log('[paint-parking] reflection map unavailable, using lights only:', err);
    }
    return () => target?.dispose();
  }, [gl]);
  return env;
}

function Scene({ current, next, runKey, bus, decor, ballSkin, paintEffect, onReady, freeCamera }: Props) {
  const pool = useMemo(() => new ParticlePool(190), []);
  const library = useDecorLibrary(decor);
  const env = useEnvironment();
  const quality = useQuality();
  const root = useRef<THREE.Group>(null);
  const groups = useRef(new Map<string, THREE.Group>());
  const register = useCallback((key: string, group: THREE.Group | null) => {
    if (group) groups.current.set(key, group);
    else groups.current.delete(key);
  }, []);

  const currentKey = `${current.id}-${runKey}`;
  const nextKey = next ? `${next.id}-0` : '';
  // The next board waits just "below" the current one on screen; the transition slides it into place.
  const nextOffset = useMemo(
    () => (next ? (linkOffset(current.level, next.level).toArray() as [number, number, number]) : ([0, -40, 0] as [number, number, number])),
    [current, next],
  );

  const warmOffset = useMemo(() => new THREE.Vector3(...nextOffset), [nextOffset]);

  // The board that has just been left stays mounted, hidden, for a moment after the ball has landed on the next one: taking it
  // down (its geometry, its textures) in the very frame of the landing would be one more thing to pay for there. It is the same
  // component instance (same key), so nothing is rebuilt; it is released a second and a half later. (State derived during the
  // render, so it is in the same commit as the change of level.)
  const [track, setTrack] = useState<{ key: string; prepared: PreparedLevel; leaving: { prepared: PreparedLevel; key: string } | null }>({ key: currentKey, prepared: current, leaving: null });
  if (track.key !== currentKey) {
    setTrack({ key: currentKey, prepared: current, leaving: track.prepared.id !== current.id ? { prepared: track.prepared, key: track.key } : null });
  }
  const leaving = track.leaving;
  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => setTrack((s) => (s.leaving === leaving ? { ...s, leaving: null } : s)), 1500);
    return () => clearTimeout(t);
  }, [leaving]);

  useLayoutEffect(() => {
    pool.setPaintEffect(paintEffect);
    pool.setPaintColor(current.level.color);
  }, [pool, current.level.color, paintEffect]);

  const span = Math.max(current.level.cols, current.level.rows);
  const style = useMemo(() => ({ ball: ballSkin, paint: paintEffect, env }), [ballSkin, paintEffect, env]);
  return (
    <RenderStyleContext.Provider value={style}>
      <CameraRig prepared={current} />
      <ThemeRig theme={current.theme} span={span} shadows={quality === 0} />
      <PerfMonitor />
      <BallScreen bus={bus} />
      <FirstFrame onReady={onReady} />
      <group ref={root}>
        <LevelWorld
          key={currentKey}
          prepared={current}
          worldKey={currentKey}
          bus={bus}
          library={library}
          offset={[0, 0, 0]}
          visible
          active
          register={register}
        />
        {leaving && (
          <LevelWorld
            key={leaving.key}
            prepared={leaving.prepared}
            worldKey={leaving.key}
            bus={bus}
            library={library}
            offset={[0, 0, 0]}
            visible={false}
            active={false}
            register={register}
          />
        )}
        {next && (
          <LevelWorld
            key={nextKey}
            prepared={next}
            worldKey={nextKey}
            bus={bus}
            library={library}
            offset={nextOffset}
            visible={false}
            active={false}
            register={register}
          />
        )}
        <Trail bus={bus} color={current.level.color} />
        <Ball level={current.level} resetKey={currentKey} bus={bus} particles={pool} envMap={env} />
        <Particles pool={pool} bus={bus} />
        <HintArrow bus={bus} />
      </group>
      <Warmup groups={groups} next={next} nextKey={nextKey} offset={warmOffset} />
      <Director
        bus={bus}
        pool={pool}
        groups={groups}
        current={current}
        currentKey={currentKey}
        next={next}
        nextKey={nextKey}
      />
      {/* After the Director: it moves the camera last. */}
      <FreeCamera bus={bus} enabled={!!freeCamera} />
    </RenderStyleContext.Provider>
  );
}

/**
 * The GL canvas. It stays mounted for the whole session (creating a GL context is slow); the
 * boards inside it come and go.
 */
function GameCanvasImpl(props: Props) {
  return (
    <Canvas
      style={{ flex: 1 }}
      flat
      frameloop={props.active === false ? 'never' : 'always'}
      shadows={SHADOWS ? { type: THREE.PCFShadowMap } : false}
      camera={{ fov: 40, near: 0.1, far: 300, position: [0, 10, 6] }}
      gl={{ antialias: true }}
      onCreated={({ gl, size }) => {
        gl.setClearColor(SKY_BG, 1);
        gl.toneMapping = THREE.NoToneMapping;
        gl.outputColorSpace = THREE.SRGBColorSpace;
        // The native Canvas starts at the device pixel ratio; cap it to keep 60 fps on dense screens.
        gl.setPixelRatio(Math.min(PixelRatio.get(), MAX_PIXEL_RATIO));
        gl.setSize(size.width, size.height, false);
      }}
    >
      <Scene {...props} />
    </Canvas>
  );
}

export const GameCanvas = memo(GameCanvasImpl);
