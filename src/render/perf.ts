import { useSyncExternalStore } from 'react';

/**
 * Frame-rate watch and adaptive quality. The scene reports each frame; if the average stays under 50 fps for 2 seconds, the
 * quality drops one step (1: no shadows, half the scenery, fewer particles; 2: no scenery, a quarter of the particles).
 * It never goes back up during a session, so a struggling phone does not oscillate.
 */
export type Quality = 0 | 1 | 2;

export const LOW_FPS = 50;
export const LOW_FOR_SECONDS = 2;
const WINDOW = 0.5; // the average is taken over half a second

type Listener = () => void;

/**
 * The pixel ratio the scenes are drawn at. It must be the screen's own ratio: on a phone the drawing buffer already has the
 * device size, and asking for less does not make the picture coarser, it shrinks it into a corner of the screen.
 * (3 is only an upper bound for very dense screens.)
 */
export const MAX_PIXEL_RATIO = 3;

/** A frame longer than this is a visible hitch (two frames at 60 fps). */
export const HITCH_MS = 33.4;

/** Frames of one phase of play (a level, a transition, the map): how many, how many hitched, the longest one. */
export type PhaseStats = { frames: number; hitches: number; worstMs: number };

class PerfStore {
  fps = 60;
  /** Longest frame of the last window (ms), and the number of draw calls of the last frame. */
  worstMs = 0;
  calls = 0;
  /** What is going on ("level", "transition", "map"...) and the frame stats of each phase since the app started. */
  phase = 'level';
  readonly phases: Record<string, PhaseStats> = {};
  private windowWorst = 0;
  quality: Quality = 0;
  private lowFor = 0;
  private frames = 0;
  private elapsed = 0;
  private listeners = new Set<Listener>();

  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getFps = () => this.fps;
  getWorst = () => this.worstMs;
  getQuality = () => this.quality;

  /** Called once per rendered frame with its duration in seconds. Returns true when the quality just dropped. */
  frame(dt: number, calls = 0, adapt = true): boolean {
    if (dt <= 0 || dt > 1) return false; // a pause (the app in the background), not a slow frame
    const ms = dt * 1000;
    const st = (this.phases[this.phase] ??= { frames: 0, hitches: 0, worstMs: 0 });
    st.frames++;
    if (ms > HITCH_MS) st.hitches++;
    if (ms > st.worstMs) st.worstMs = ms;
    this.calls = calls;
    if (ms > this.windowWorst) this.windowWorst = ms;
    this.frames++;
    this.elapsed += dt;
    if (this.elapsed < WINDOW) return false;
    this.fps = Math.round(this.frames / this.elapsed);
    this.worstMs = Math.round(this.windowWorst);
    this.windowWorst = 0;
    this.lowFor = this.fps < LOW_FPS ? this.lowFor + this.elapsed : 0;
    this.frames = 0;
    this.elapsed = 0;
    let dropped = false;
    if (adapt && this.lowFor >= LOW_FOR_SECONDS && this.quality < 2) {
      this.quality = (this.quality + 1) as Quality;
      this.lowFor = 0;
      dropped = true;
    }
    this.listeners.forEach((l) => l());
    return dropped;
  }

  /** Switches the phase being measured; in development the one that ends is printed (frames, hitches over 33 ms, longest). */
  setPhase(name: string) {
    if (name === this.phase) return;
    if (__DEV__) {
      const st = this.phases[this.phase];
      if (st && st.frames > 0) console.log(`[perf] ${this.phase}: ${st.frames} frames, ${st.hitches} over ${Math.round(HITCH_MS)} ms, worst ${Math.round(st.worstMs)} ms`);
    }
    this.phases[this.phase] = { frames: 0, hitches: 0, worstMs: 0 };
    this.phase = name;
  }

  /** The scene was paused or replaced: start measuring again. */
  restart() {
    this.frames = 0;
    this.elapsed = 0;
    this.lowFor = 0;
  }

  reset() {
    this.quality = 0;
    this.fps = 60;
    this.restart();
    this.listeners.forEach((l) => l());
  }
}

export const perf = new PerfStore();

export const useQuality = () => useSyncExternalStore(perf.subscribe, perf.getQuality, perf.getQuality);
export const useWorst = () => useSyncExternalStore(perf.subscribe, perf.getWorst, perf.getWorst);
export const useFps = () => useSyncExternalStore(perf.subscribe, perf.getFps, perf.getFps);

/** Whether a particle should be spawned, given the quality (every particle at 0, half at 1, a quarter at 2). */
export function keepParticle(counter: number, quality: Quality = perf.quality): boolean {
  return quality === 0 || counter % (quality === 1 ? 2 : 4) === 0;
}

/** Pieces of scenery kept at a quality: all, every other one, none. */
export function decorForQuality<T>(plan: T[], quality: Quality): T[] {
  return quality === 0 ? plan : quality === 1 ? plan.filter((_, i) => i % 2 === 0) : [];
}
