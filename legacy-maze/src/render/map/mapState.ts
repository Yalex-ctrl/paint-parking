import * as THREE from 'three';

/** What a tap on the map hit. Screen coordinates are in pixels, for the floating "+1" and the pop-ups. */
export type MapHit = { kind: 'level' | 'chest' | 'balloon' | 'coin'; id: number; value?: number; sx: number; sy: number };

/**
 * State shared between the map screen (gestures, pop-ups) and the 3D scene. It is a plain mutable object read every
 * frame: scrolling and animations never go through React.
 */
export type MapShared = {
  /** World z the camera looks at, its speed (units/s) and whether a finger is on the map. */
  z: number;
  velocity: number;
  dragging: boolean;
  minZ: number;
  maxZ: number;
  /** World units per screen pixel at the focus, so a finger drag maps to a scroll distance. */
  worldPerPx: number;

  /** The level shown as the current one (the ball bounces on it). During the hop it is still the previous one. */
  current: number;
  stars: Record<number, number>;
  opened: number[];
  ball: string;
  paint: string;
  streak: number;
  dailyDone: boolean;
  /** Daily coins left to catch: nothing flies by once it is zero. */
  coinsLeft: number;

  /** The ball jumping from a finished level to the next (clock times in seconds; `start` < 0 = none). */
  hop: { from: number; to: number; start: number; duration: number } | null;
  /** Stars falling on a level that was just finished, and the padlock leaving the next one. */
  starDrop: { id: number; at: number } | null;
  lockPop: { id: number; at: number } | null;

  /** Bumped whenever the colours of the path must be worked out again (a level was finished, the progress was read). */
  pathVersion: number;

  /** Positions of the things that move, kept by the scene so a tap can find them. */
  dyn: { balloon: THREE.Vector3; coin: { active: boolean; pos: THREE.Vector3; value: number; caughtAt: number } };

  /** Set by the scene: leaves the resting (low frame rate) mode now. Called when a finger touches the map. */
  wake?: () => void;

  /** Outputs of the scene. */
  focusLevel: number;
  pickAt: (x: number, y: number) => MapHit | null;
  /** Called when the world at the centre of the screen changes. */
  onWorld?: (world: number) => void;
  /** The wooden signs announcing a world: slot, screen position, name (null = hidden). */
  onSign?: (slot: number, x: number, y: number, name: string | null) => void;
  /** The number of a level, drawn by the screen in the app's font: slot, level, screen position, size scale, locked, shown. */
  onLabel?: (slot: number, id: number, x: number, y: number, scale: number, locked: boolean, shown: boolean) => void;
  /** A flying coin was caught (value, where on screen). */
  onCoin?: (value: number, sx: number, sy: number) => void;
};

export function createMapShared(current: number): MapShared {
  return {
    z: 0,
    velocity: 0,
    dragging: false,
    minZ: -Infinity,
    maxZ: 6,
    worldPerPx: 0.012,
    current,
    stars: {},
    opened: [],
    ball: 'gold',
    paint: 'classic',
    streak: 0,
    dailyDone: false,
    coinsLeft: 0,
    dyn: { balloon: new THREE.Vector3(0, -99, 0), coin: { active: false, pos: new THREE.Vector3(), value: 1, caughtAt: 0 } },
    pathVersion: 0,
    hop: null,
    starDrop: null,
    lockPop: null,
    focusLevel: current,
    pickAt: () => null,
  };
}
