/**
 * A trace of the passage from one level to the next, to find what really makes a frame long. It records, from the moment the ball
 * leaves the board to a moment after it has landed on the next one:
 *  - every frame: how long it took;
 *  - everything that ran on the JavaScript side (named work: the saves, the re-renders of the screen, the sounds, the solver...) with
 *    the time it took and when;
 *  - on the GPU side, what changed on each frame: shader programs compiled, geometries and textures created (uploaded).
 * When the transition is over the frames over 25 ms are printed with what ran during them, and after ten transitions a summary says
 * how many frames were over 25 ms and the worst one. It costs a few array pushes per frame, and nothing outside a transition.
 *
 * To read it in production mode (the development mode of Expo Go is much slower and distorts everything): `npx expo start --no-dev
 * --minify`, play ten levels in a row, and read the lines that start with [trace] in the terminal.
 */
import { benchRunning, benchTask } from './bench';

export const SLOW_FRAME_MS = 25;
const KEEP = 10;

type Frame = { end: number; ms: number; programs: number; geometries: number; textures: number };
type Work = { at: number; name: string; ms: number };

let active = false;
let frames: Frame[] = [];
let work: Work[] = [];
let started = 0;
let lastGpu = { programs: 0, geometries: 0, textures: 0 };
const history: { frames: number; slow: number; worst: number }[] = [];

export const tracing = (): boolean => active;

/** The ball has left the board: start recording. */
export function traceStart(): void {
  active = true;
  frames = [];
  work = [];
  started = performance.now();
}

/** Records a piece of work that has just run (`ms` long, ending now). */
export function traceWork(name: string, ms: number): void {
  benchTask(name, ms);
  if (!active) return;
  work.push({ at: performance.now(), name, ms });
}

/** Runs `fn` and records how long it took when a trace is running. */
export function traced<T>(name: string, fn: () => T): T {
  if (!active && !benchRunning()) return fn();
  const t0 = performance.now();
  try {
    return fn();
  } finally {
    traceWork(name, performance.now() - t0);
  }
}

/** Called once per frame by the scene, with the frame's duration (seconds) and the counters of the renderer. */
export function traceFrame(dt: number, gpu: { programs: number; geometries: number; textures: number }): void {
  if (!active) {
    lastGpu = gpu;
    return;
  }
  frames.push({
    end: performance.now(),
    ms: dt * 1000,
    programs: gpu.programs - lastGpu.programs,
    geometries: gpu.geometries - lastGpu.geometries,
    textures: gpu.textures - lastGpu.textures,
  });
  lastGpu = gpu;
}

/** What to say about one slow frame: the work that ran inside it and what the GPU was given. */
export function describeFrame(index: number, f: Frame, items: Work[]): string {
  const startOfFrame = f.end - f.ms;
  const inside = items.filter((w) => w.at > startOfFrame && w.at <= f.end + 1);
  const js = inside.length ? inside.map((w) => `${w.name} ${w.ms.toFixed(1)}ms`).join(', ') : 'nothing named (see the frames around it)';
  const gpu = [f.programs > 0 ? `+${f.programs} shader program(s)` : '', f.geometries > 0 ? `+${f.geometries} geometry(ies) uploaded` : '', f.textures > 0 ? `+${f.textures} texture(s) uploaded` : '']
    .filter(Boolean)
    .join(', ');
  return `[trace]   frame ${index} ${f.ms.toFixed(0)} ms | JS: ${js} | GPU: ${gpu || 'nothing new'}`;
}

/** The ball has landed (and a little time has passed): stop, print the slow frames, and every ten transitions a summary. */
export function traceEnd(label = ''): { frames: number; slow: number; worst: number } {
  if (!active) return { frames: 0, slow: 0, worst: 0 };
  active = false;
  const slowFrames = frames.map((f, i) => ({ f, i })).filter(({ f }) => f.ms > SLOW_FRAME_MS);
  const worst = frames.reduce((m, f) => Math.max(m, f.ms), 0);
  const result = { frames: frames.length, slow: slowFrames.length, worst };
  history.push(result);
  if (history.length > KEEP) history.shift();
  if (typeof __DEV__ !== 'undefined') {
    console.log(`[trace] transition ${label}: ${frames.length} frames in ${(performance.now() - started).toFixed(0)} ms, ${slowFrames.length} over ${SLOW_FRAME_MS} ms, worst ${worst.toFixed(0)} ms${__DEV__ ? ' (development mode: slower)' : ''}`);
    for (const { f, i } of slowFrames) console.log(describeFrame(i, f, work));
    // Long pieces of JS work outside the slow frames are worth a line too.
    const long = work.filter((w) => w.ms >= 8);
    if (long.length) console.log(`[trace]   work over 8 ms: ${long.map((w) => `${w.name} ${w.ms.toFixed(1)}`).join(', ')}`);
    if (history.length === KEEP) {
      const total = history.reduce((n, h) => n + h.slow, 0);
      const w = history.reduce((m, h) => Math.max(m, h.worst), 0);
      console.log(`[trace] SUMMARY of the last ${KEEP} transitions: ${total} frames over ${SLOW_FRAME_MS} ms, worst ${w.toFixed(0)} ms`);
    }
  }
  return result;
}

/** For tests. */
export function traceReset(): void {
  active = false;
  frames = [];
  work = [];
  history.length = 0;
  lastGpu = { programs: 0, geometries: 0, textures: 0 };
}
export const traceHistory = () => history.slice();
