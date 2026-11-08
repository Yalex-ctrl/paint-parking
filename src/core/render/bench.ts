/**
 * The bench of the bridge ("Banc d'essai du pont", developer menu): it plays levels in a row by itself (the solution stored in the
 * level file, swipe after swipe at a normal pace) and records, for EVERY frame of the transitions, how long it took, which phase of the
 * passage it belongs to, every named task that ran during it (with its duration), the React commits, and what the GPU was given
 * (shader programs, geometries, textures). When the chosen number of transitions is over it writes a report (markdown): average,
 * 95th and 99th percentile, the worst frame, and for each frame over 20 ms the tasks that ran in it, then the causes ranked from the
 * most to the least costly.
 *
 * The recorder only costs a few array pushes per frame while a bench is running, and a single boolean test the rest of the time.
 * Read the figures of an OPTIMISED build (a development build is several times slower and distorts everything): it says which one it
 * was in the report.
 */

/** The phases of the passage from one level to the next, in order. */
export const PHASES = ['lastTile', 'exitOpening', 'ballExit', 'bridge', 'arrival', 'entryClose'] as const;
export type BridgePhase = (typeof PHASES)[number] | 'idle';

export const SLOW_MS = 20;
/** The goal of the passage (see docs/perf): no frame over this, and the 99th percentile under the second. */
export const GOAL_MAX_MS = 25;
export const GOAL_P99_MS = 18;

type Gpu = { programs: number; geometries: number; textures: number };
type Frame = { end: number; ms: number; phase: BridgePhase; gpu: Gpu; transition: number; gcs: number; gcMs: number };

/** The collections of the garbage collector so far (count, milliseconds), when Hermes gives its statistics; null otherwise. */
function gcStats(): { count: number; ms: number } | null {
  const h = (globalThis as unknown as { HermesInternal?: { getInstrumentedStats?: () => Record<string, number> } }).HermesInternal;
  const s = h?.getInstrumentedStats?.();
  if (!s || typeof s.js_numGCs !== 'number') return null;
  return { count: s.js_numGCs, ms: s.js_gcCPUTime ?? s.js_gcTime ?? 0 };
}
let lastGc: { count: number; ms: number } | null = null;
let gcAvailable = false;
type Task = { at: number; name: string; ms: number; kind: 'task' | 'commit' };

let on = false;
let phase: BridgePhase = 'idle';
let transition = 0;
let frames: Frame[] = [];
let tasks: Task[] = [];
let lastGpu: Gpu = { programs: 0, geometries: 0, textures: 0 };
let baseline: Gpu | null = null;
let growth: string[] = [];
let startedAt = 0;
let targetTransitions = 20;
let heapSamples: number[] = [];
/** The moments of each passage (name -> time, ms) and what was true then (was the next level ready?). */
let marks: Record<string, number>[] = [];
let notReady = 0;

export const benchRunning = (): boolean => on;
export const benchPhaseNow = (): BridgePhase => phase;

export function benchStart(transitions = 20): void {
  on = true;
  phase = 'idle';
  transition = 0;
  frames = [];
  tasks = [];
  growth = [];
  baseline = null;
  heapSamples = [];
  lastGc = null;
  gcAvailable = false;
  marks = [];
  notReady = 0;
  targetTransitions = transitions;
  startedAt = performance.now();
}

/** The scene moves on to another phase of the passage (the first frame after this one belongs to it). */
export function benchPhase(next: BridgePhase): void {
  if (!on || next === phase) return;
  if (next === 'lastTile') transition++;
  phase = next;
  if (next === 'lastTile' || next === 'ballExit' || next === 'bridge' || next === 'arrival') benchMark(next);
  if (next === 'entryClose') benchMark('swipeable');
}

/**
 * A moment of the passage ("lastTile", "exitSwipe", "ballExit", "handoff", "transitionRequested", "bridge", "arrival", "swipeable"),
 * to measure the waits between them. `nextReady` (for "transitionRequested") says whether the next level was already mounted and warm.
 */
export function benchMark(name: string, nextReady?: boolean): void {
  if (!on || transition === 0) return;
  (marks[transition] ??= {})[name] = performance.now();
  if (name === 'transitionRequested' && nextReady === false) notReady++;
}

/** A named piece of work that has just run (`ms` long, ending now). */
export function benchTask(name: string, ms: number, kind: Task['kind'] = 'task'): void {
  if (!on) return;
  tasks.push({ at: performance.now(), name, ms, kind });
}

/** Runs `fn` and records it when a bench is running. */
export function benchTimed<T>(name: string, fn: () => T): T {
  if (!on) return fn();
  const t0 = performance.now();
  try {
    return fn();
  } finally {
    benchTask(name, performance.now() - t0);
  }
}

/** A React commit of a component (its render and its effects, as far as a hook can see): see useCommitTimer. */
export function benchCommit(name: string, ms: number): void {
  benchTask(name, ms, 'commit');
}

/**
 * One frame, from the scene's loop: its duration (seconds) and the counters of the renderer. The first frame of a bench fixes the
 * reference: after it the number of shader programs must never go up (a rise is a compilation in the middle of the passage).
 */
export function benchFrame(dt: number, gpu: Gpu): void {
  if (!on) {
    lastGpu = gpu;
    return;
  }
  if (dt <= 0 || dt > 1) {
    lastGpu = gpu;
    return;
  }
  if (!baseline) baseline = gpu;
  const gc = gcStats();
  if (gc) gcAvailable = true;
  if (phase !== 'idle') {
    frames.push({
      end: performance.now(),
      ms: dt * 1000,
      phase,
      gpu: { programs: gpu.programs - lastGpu.programs, geometries: gpu.geometries - lastGpu.geometries, textures: gpu.textures - lastGpu.textures },
      transition,
      gcs: gc && lastGc ? gc.count - lastGc.count : 0,
      gcMs: gc && lastGc ? gc.ms - lastGc.ms : 0,
    });
  }
  lastGc = gc;
  if (gpu.programs > (baseline?.programs ?? 0) && phase !== 'idle' && growth.length < 30) {
    growth.push(`programs ${baseline?.programs} -> ${gpu.programs} during ${phase} of transition ${transition}`);
    baseline = { ...baseline!, programs: gpu.programs };
  }
  const mem = (performance as unknown as { memory?: { usedJSHeapSize?: number } }).memory;
  if (mem?.usedJSHeapSize && heapSamples.length < 20000) heapSamples.push(mem.usedJSHeapSize);
  lastGpu = gpu;
}

export const benchTransitions = (): number => transition;
/** The bench has recorded `n` passages and the game is at rest again. */
export const benchIsDone = (n = targetTransitions): boolean => on && transition >= n && phase === 'idle';

const percentile = (sorted: number[], q: number): number => (sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]);
const fmt = (n: number): string => n.toFixed(1);

export type BenchReport = { markdown: string; frames: number; max: number; p99: number; slow: number };

/** Stops the bench and builds the report. `label` is "before" or "after" (or anything else). */
export function benchFinish(label: string): BenchReport {
  on = false;
  const ms = frames.map((f) => f.ms).sort((a, b) => a - b);
  const avg = ms.reduce((a, b) => a + b, 0) / Math.max(1, ms.length);
  const p95 = percentile(ms, 0.95);
  const p99 = percentile(ms, 0.99);
  const max = ms[ms.length - 1] ?? 0;
  const slowFrames = frames.filter((f) => f.ms > SLOW_MS);
  const lines: string[] = [];
  lines.push(`# Bridge bench: ${label}`);
  lines.push('');
  lines.push(`- Build: **${typeof __DEV__ !== 'undefined' && __DEV__ ? 'DEVELOPMENT (slower, not the reference)' : 'optimised (release)'}**`);
  lines.push(`- Transitions played: ${Math.min(transition, targetTransitions)}, frames recorded in the passages: ${frames.length}, bench length: ${((performance.now() - startedAt) / 1000).toFixed(0)} s`);
  lines.push(`- Frame time (ms): average **${fmt(avg)}**, 95th percentile **${fmt(p95)}**, 99th percentile **${fmt(p99)}**, worst **${fmt(max)}**`);
  lines.push(`- Frames over ${SLOW_MS} ms: **${slowFrames.length}**, over ${GOAL_MAX_MS} ms: **${frames.filter((f) => f.ms > GOAL_MAX_MS).length}**`);
  lines.push(`- Goals: no frame over ${GOAL_MAX_MS} ms (${max <= GOAL_MAX_MS ? 'met' : 'NOT met'}), 99th percentile under ${GOAL_P99_MS} ms (${p99 < GOAL_P99_MS ? 'met' : 'NOT met'})`);
  lines.push(`- Shader programs: ${growth.length === 0 ? 'constant during every passage' : `ROSE ${growth.length} time(s): ${growth.join('; ')}`}`);
  if (gcAvailable) {
    const withGc = frames.filter((f) => f.gcs > 0);
    const gcTotal = withGc.reduce((a, f) => a + f.gcMs, 0);
    const worstGc = withGc.reduce((m, f) => Math.max(m, f.gcMs), 0);
    lines.push(`- Garbage collector during the passages: **${withGc.reduce((a, f) => a + f.gcs, 0)}** collection(s) in ${withGc.length} frame(s), ${fmt(gcTotal)} ms in all, the longest ${fmt(worstGc)} ms${worstGc > 10 ? ' (OVER 10 ms)' : ''}; the slow frames that contain one: ${slowFrames.filter((f) => f.gcs > 0).length}`);
  } else if (heapSamples.length > 1) {
    let drops = 0;
    let bigDrop = 0;
    for (let i = 1; i < heapSamples.length; i++) {
      const d = heapSamples[i - 1] - heapSamples[i];
      if (d > 512 * 1024) {
        drops++;
        bigDrop = Math.max(bigDrop, d);
      }
    }
    lines.push(`- JS heap: ${(heapSamples[0] / 1048576).toFixed(1)} -> ${(heapSamples[heapSamples.length - 1] / 1048576).toFixed(1)} MB, collections seen (drops over 0.5 MB): ${drops}, biggest ${(bigDrop / 1048576).toFixed(1)} MB`);
  } else {
    lines.push('- JS heap: not readable on this runtime (collections cannot be counted; see "unexplained" frames below)');
  }
  // The waits between two moments of the passage.
  const spans: [string, string, string][] = [
    ['exitSwipe', 'ballExit', 'swipe toward the exit -> the ball starts to leave'],
    ['ballExit', 'handoff', 'the ball rolls out of the board'],
    ['handoff', 'transitionRequested', 'the result is settled (stars, coins, profile)'],
    ['transitionRequested', 'bridge', 'the crossing starts (0 = no wait for the next level)'],
    ['bridge', 'arrival', 'the crossing'],
    ['arrival', 'swipeable', 'the ball is down until a swipe is possible'],
  ];
  lines.push('');
  lines.push('## Waits between the moments of the passage');
  lines.push('');
  lines.push('| from -> to | what | average ms | worst ms |');
  lines.push('|---|---|---|---|');
  for (const [a, b, what] of spans) {
    const d = marks.filter((m) => m && m[a] !== undefined && m[b] !== undefined).map((m) => m[b] - m[a]);
    if (d.length === 0) continue;
    lines.push(`| ${a} -> ${b} | ${what} | ${fmt(d.reduce((x, y) => x + y, 0) / d.length)} | ${fmt(Math.max(...d))} |`);
  }
  lines.push('');
  lines.push(`The next level was **not** ready (mounted and warm) when the crossing was requested in ${notReady} of ${Math.min(transition, targetTransitions)} passages.`);
  lines.push('');
  lines.push('## By phase');
  lines.push('');
  lines.push('| phase | frames | average ms | 99th ms | worst ms | frames > 20 ms |');
  lines.push('|---|---|---|---|---|---|');
  for (const p of PHASES) {
    const m = frames.filter((f) => f.phase === p).map((f) => f.ms).sort((a, b) => a - b);
    if (m.length === 0) continue;
    lines.push(`| ${p} | ${m.length} | ${fmt(m.reduce((a, b) => a + b, 0) / m.length)} | ${fmt(percentile(m, 0.99))} | ${fmt(m[m.length - 1])} | ${m.filter((x) => x > SLOW_MS).length} |`);
  }

  // The tasks of each slow frame, and what they cost in total.
  const cost = new Map<string, { total: number; frames: number; max: number; kind: string }>();
  let unexplained = 0;
  const detail: string[] = [];
  for (const f of slowFrames) {
    const start = f.end - f.ms;
    const inside = tasks.filter((t) => t.at > start && t.at <= f.end + 1);
    const named = inside.reduce((a, t) => a + t.ms, 0);
    const gpu = [f.gpu.programs > 0 ? `+${f.gpu.programs} program(s)` : '', f.gpu.geometries > 0 ? `+${f.gpu.geometries} geometry(ies)` : '', f.gpu.textures > 0 ? `+${f.gpu.textures} texture(s)` : ''].filter(Boolean).join(', ');
    // Slow, and almost nothing named in it, no new GPU object: the time went to something that is not instrumented (a collection of
    // the garbage collector is the first suspect).
    if (inside.length === 0 && !gpu && f.gcs === 0) unexplained++;
    if (f.gcs > 0) {
      const c = cost.get('garbage collector') ?? { total: 0, frames: 0, max: 0, kind: 'gc' };
      c.total += f.gcMs;
      c.frames++;
      c.max = Math.max(c.max, f.gcMs);
      cost.set('garbage collector', c);
    }
    for (const t of inside) {
      const c = cost.get(t.name) ?? { total: 0, frames: 0, max: 0, kind: t.kind };
      c.total += t.ms;
      c.frames++;
      c.max = Math.max(c.max, t.ms);
      cost.set(t.name, c);
    }
    if (gpu) {
      const c = cost.get(`GPU: ${gpu.replace(/[+0-9]/g, '#')}`) ?? { total: 0, frames: 0, max: 0, kind: 'gpu' };
      c.total += f.ms;
      c.frames++;
      c.max = Math.max(c.max, f.ms);
      cost.set(`GPU: ${gpu.replace(/[+0-9]/g, '#')}`, c);
    }
    detail.push(`- transition ${f.transition}, ${f.phase}, **${fmt(f.ms)} ms** (named work ${fmt(named)} ms) | ${inside.length ? inside.map((t) => `${t.name} ${fmt(t.ms)}ms`).join(', ') : 'nothing named'} | GPU: ${gpu || 'nothing new'}`);
  }
  lines.push('');
  lines.push(`## Causes, most costly first (over the ${slowFrames.length} frames above ${SLOW_MS} ms)`);
  lines.push('');
  lines.push('| cause | kind | total ms | frames | worst ms |');
  lines.push('|---|---|---|---|---|');
  for (const [name, c] of [...cost.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 25)) lines.push(`| ${name} | ${c.kind} | ${fmt(c.total)} | ${c.frames} | ${fmt(c.max)} |`);
  if (unexplained > 0) lines.push(`| (nothing named: suspect the garbage collector or something not instrumented) | - | - | ${unexplained} | - |`);
  lines.push('');
  lines.push('## Frames over 20 ms');
  lines.push('');
  lines.push(...(detail.length ? detail.slice(0, 80) : ['None.']));
  const markdown = lines.join('\n');
  frames = [];
  tasks = [];
  return { markdown, frames: ms.length, max, p99, slow: slowFrames.length };
}
