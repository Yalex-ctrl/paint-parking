import { File, Paths } from 'expo-file-system';
import { useEffect, useState, type MutableRefObject } from 'react';

import type { GameState } from '@/game/engine';
import type { Dir, Level } from '@/game/types';
import { benchFinish, benchIsDone, benchMark, benchPhaseNow, benchStart, benchTransitions } from '@/render/bench';
import type { SceneBus } from '@/render/bus';

/** How often the bench looks whether the next swipe can be played (milliseconds): about the pace of a player who knows the level. */
const TICK_MS = 320;
/** The number of passages from one level to the next that a bench plays. */
export const BENCH_TRANSITIONS = 20;

type Inputs = {
  /** "before", "after" or any name: the bench is on when this is not empty. */
  label: string;
  levelRef: MutableRefObject<Level | null>;
  state: MutableRefObject<GameState | null>;
  busy: MutableRefObject<boolean>;
  swipe: (dir: Dir) => void;
  bus: SceneBus;
};

/** Writes the report next to the app's documents (readable from the device), and prints it in the terminal between two markers. */
async function publish(label: string, markdown: string): Promise<string> {
  console.log(`[bench] ===== BEGIN docs/perf/bridge-${label}.md`);
  for (const line of markdown.split('\n')) console.log(`[bench] ${line}`);
  console.log(`[bench] ===== END docs/perf/bridge-${label}.md`);
  try {
    const file = new File(Paths.document, `bridge-${label}.md`);
    file.create({ overwrite: true });
    await file.write(markdown);
    return file.uri;
  } catch (error) {
    console.log('[bench] the report could not be written to a file:', error);
    return '';
  }
}

/**
 * The bench of the bridge (see render/bench.ts): plays the stored solution of every level, swipe after swipe, until the chosen number
 * of passages to the next level has been recorded; then writes and shows the report. Returns the line to show on screen (null while
 * it runs or when there is no bench).
 */
export function useBridgeBench({ label, levelRef, state, busy, swipe, bus }: Inputs): { running: boolean; summary: string | null } {
  const [summary, setSummary] = useState<string | null>(null);
  useEffect(() => {
    if (!label) return;
    benchStart(BENCH_TRANSITIONS);
    let finished = false;
    const id = setInterval(() => {
      if (finished) return;
      if (benchIsDone(BENCH_TRANSITIONS)) {
        finished = true;
        clearInterval(id);
        const report = benchFinish(label);
        publish(label, report.markdown).then((uri) =>
          setSummary(`${BENCH_TRANSITIONS} passages: ${report.frames} frames, 99th ${report.p99.toFixed(1)} ms, worst ${report.max.toFixed(0)} ms, ${report.slow} over 20 ms${uri ? `\n${uri}` : ''}`),
        );
        return;
      }
      const level = levelRef.current;
      const s = state.current;
      if (!level || !s || busy.current || bus.transitioning || bus.exiting || bus.transitionRequested) return;
      const move = level.solution[s.moves];
      if (move) {
        // The last swipe of a level is the one that leaves through the exit.
        if (s.moves === level.solution.length - 1) benchMark('exitSwipe');
        swipe(move as Dir);
      }
    }, TICK_MS);
    return () => {
      finished = true;
      clearInterval(id);
    };
    // The bench starts once, with the screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [label]);
  return { running: label !== '' && summary === null, summary };
}

/** For the screen's title line while it runs. */
export const benchProgress = (): string => `${Math.min(benchTransitions(), BENCH_TRANSITIONS)}/${BENCH_TRANSITIONS} (${benchPhaseNow()})`;
