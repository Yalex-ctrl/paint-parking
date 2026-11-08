import { timed } from './profiler';
import type * as THREE from 'three';

import type { Paint, SlideResult } from '../game/engine';
import type { Cell, Dir } from '../game/types';
import type { DecalPool } from './ParticlePool';
import type { BoardSurface } from './surface';

/** The state of the developer tool "Caméra libre" (see FreeCamera.tsx): where the camera orbits the board while it is active. */
export type FreeCam = { active: boolean; yaw: number; pitch: number; dist: number };

/** What the ball has to animate: the outcome of a swipe already computed by the engine. */
export type SlideCommand = { result: SlideResult };

/** Notifications from the ball to the scene's pieces (board, features, camera...). */
type Handlers = {
  /** A coat of paint reaches a tile; `delay` (s) staggers it (used by bomb blasts). */
  paint: (p: Paint, delay?: number) => void;
  coin: (cell: Cell) => void;
  bomb: (center: Cell, painted: Paint[]) => void;
  breakWall: (cell: Cell) => void;
  /** The ball goes into ('in') or comes out of ('out') a portal. */
  portal: (cell: Cell, kind: 'in' | 'out') => void;
  /** The ball rolls over a collapsing tile: it trembles a little and lets a little dust go. */
  crumble: (cell: Cell) => void;
  /** The ball has left a collapsing tile: it trembles, then breaks (see `fall`). */
  collapse: (cell: Cell) => void;
  /** The tile has just broken: the pieces fall (the colour of the tile, as a css hex). */
  fall: (cell: Cell, color: string) => void;
  /** The ball has run into the flap at the exit of a chute from the outside (the slide of that index): the flap shudders. */
  flapHit: (slide: number) => void;
};

/** Notifications from the scene to the screen (haptics, sounds, counters). */
export type GameEvent =
  | 'impact'
  | 'stop'
  | 'coin'
  | 'bomb'
  | 'break'
  | 'teleport'
  | 'exitOpen'
  | 'landed'
  | 'tile'
  | 'gate'
  | 'double'
  /** The ball goes into a chute / leaves it (`strength` of the leaving: how fast it was going, 0..1). */
  | 'chuteIn'
  | 'chuteOut'
  /** While the ball is in a chute (once a frame, `strength` = its speed, 0..1): the whoosh follows it. */
  | 'chuteRide'
  /** The flap of a chute exit opens (the ball comes out) and shuts again, and the ball runs into it from the outside. */
  | 'flapOpen'
  | 'flapClose'
  | 'flapHit'
  /** A tile has broken and fallen. */
  | 'collapse'
  /** The ball lands at the bottom of a ramp, fast. */
  | 'rampLand';

type Listener<K extends keyof Handlers> = { fn: Handlers[K]; key: string | undefined };

/**
 * Imperative channel between the React screen and the 3D scene. The scene polls it from
 * useFrame, so swipes never trigger a React re-render.
 */
export class SceneBus {
  pending: SlideCommand | null = null;
  hint: { dir: Dir; until: number } | null = null;
  /** Latest ball world position, written by the ball, read by the hint arrow and the trail. */
  ballX = 0;
  ballZ = 0;
  /** Height of the middle of the ball (above the floor it is on: platform, ramp, chute). */
  ballY = 0.41;
  /** True while the ball is in a chute, which one (index in the slides of the level) and how far along (0 to 1): the paint follows. */
  inChute = false;
  chuteIndex = -1;
  chuteU = 0;
  freeCam: FreeCam = { active: false, yaw: 0, pitch: 0.9, dist: 14 };
  /** True while the ball is rolling (drives the paint trail). */
  rolling = false;
  /** Where and how fast the ball was when it dropped off the board through the exit (read by the level transition). */
  exitFall: { x: number; y: number; z: number; vx: number; vz: number; coasted: number } | null = null;
  /** Where the coin counter is on screen, in NDC (-1..1): picked-up coins fly there. */
  coinTarget: { x: number; y: number } | null = null;
  /** True while the ball is rolling out of the board and dropping off it. */
  exiting = false;
  /** Where the ball is on screen (NDC -1..1), updated every frame by the scene: floating words follow it. */
  ballNdc: { x: number; y: number } | null = null;

  /** The board that currently receives the ball's notifications (two boards exist during a transition). */
  activeKey = '';
  /** Collision data of the active board, used by the splash particles. */
  surface: BoardSurface | null = null;
  decals: DecalPool | null = null;
  /** The ball's objects, so the level transition can move it. */
  ball: { group: THREE.Group; body: THREE.Mesh } | null = null;
  /** The board whose exit has just opened (every tile painted), and when (seconds, performance clock). */
  exitOpenKey = '';
  exitOpenAt = 0;
  /** The board whose entry gate is open because the ball is arriving through it (empty = all closed). */
  arrivalKey = '';
  /** The level has no next one (a daily challenge): the ball only rolls off along a short stub and disappears. */
  exitOnly = false;
  /** True from the moment the ball leaves the board until the next level is ready to play. */
  transitioning = false;
  /** Asks the director to run the level transition (the next board must be mounted). */
  transitionRequested = false;

  private handlers: { [K in keyof Handlers]?: Listener<K>[] } = {};

  /**
   * Subscribes a scene piece to a notification; returns the unsubscribe function. A `key`
   * restricts the listener to notifications sent while that board is the active one.
   */
  on<K extends keyof Handlers>(kind: K, fn: Handlers[K], key?: string): () => void {
    const list = (this.handlers[kind] ??= []) as Listener<K>[];
    const entry: Listener<K> = { fn, key };
    list.push(entry);
    return () => {
      const i = list.indexOf(entry);
      if (i >= 0) list.splice(i, 1);
    };
  }

  emit<K extends keyof Handlers>(kind: K, ...args: Parameters<Handlers[K]>) {
    const list = this.handlers[kind] as Listener<K>[] | undefined;
    if (!list) return;
    for (const l of list.slice()) {
      if (l.key === undefined || l.key === this.activeKey) timed(`emit ${String(kind)}`, () => (l.fn as (...a: Parameters<Handlers[K]>) => void)(...args));
    }
  }

  /** Set by the screen. */
  onEvent?: (event: GameEvent, strength?: number) => void;
  onSlideDone?: (exited: boolean) => void;
  /** The ball is about to fall into the next level: stars, sounds... */
  onTransitionStart?: () => void;
  /** The next board has settled and the ball has landed: the new level is playable. */
  onTransitionDone?: () => void;

  /** A level (re)starts: no swipe waits to be played and no hint is shown. */
  clearInput() {
    this.pending = null;
    this.hint = null;
  }

  slide(cmd: SlideCommand) {
    this.pending = cmd;
  }

  showHint(dir: Dir, ms = 3000) {
    this.hint = { dir, until: performance.now() + ms };
  }
}
