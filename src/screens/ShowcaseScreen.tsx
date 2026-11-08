import { Redirect, useIsFocused } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '@/i18n';
import { testerTools } from '@/config/tester';
import { applyMove, createState, type GameState } from '@/game/engine';
import { SHOWCASE_MOVES, showcaseLevel } from '@/game/showcase';
import { GestureDetector } from 'react-native-gesture-handler';

import { GameCanvas, SCENE_BG } from '@/render/GameCanvas';
import { freeCameraGesture } from '@/render/FreeCamera';
import { SceneBus } from '@/render/bus';
import type { Level } from '@/game/types';
import { prepareLevel, type PreparedLevel } from '@/render/prepare';
import { bestCameraTilt } from '@/render/visibility';
import { initAudio } from '@/services/audio';
import { useProfile } from '@/storage/profile';
import { ScreenHeader } from '@/ui/ScreenHeader';
import { colors } from '@/ui/theme';

import { react } from './GameScreen';

/** Pause before the demonstration starts and between two swipes, and before it starts again from the beginning (milliseconds). */
const START_DELAY_MS = 1400;
const BETWEEN_MOVES_MS = 500;
const RESTART_DELAY_MS = 2600;

/** Plays the demonstration on the bus, one swipe after the other; calls `again` when it is over. Returns what stops it. */
function startDemo(level: Level, bus: SceneBus, again: () => void): () => void {
  const state: GameState = createState(level);
  let index = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const later = (fn: () => void, ms: number) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
  const next = () => {
    if (index >= SHOWCASE_MOVES.length) {
      later(again, RESTART_DELAY_MS);
      return;
    }
    const res = applyMove(level, state, SHOWCASE_MOVES[index++]);
    if (!res) return next();
    bus.slide({ result: res });
  };
  bus.clearInput();
  bus.onEvent = (event, strength) => react(event, strength);
  bus.onSlideDone = () => later(next, BETWEEN_MOVES_MS);
  later(next, START_DELAY_MS);
  return () => {
    if (timer) clearTimeout(timer);
    bus.onEvent = undefined;
    bus.onSlideDone = undefined;
  };
}

/**
 * Developer tool: the showcase of the new pieces (platform, ramp, slides, flap, painted tiles, x2, fragile wall, stop, bend). A board
 * outside the campaign on which the ball plays the same demonstration in a loop, with the real scene, sounds and vibrations. The
 * swipes are the demonstration's own; nothing is saved.
 */
export default function ShowcaseScreen() {
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const profile = useProfile();
  const bus = useMemo(() => new SceneBus(), []);
  const level = useMemo(() => {
    const l = showcaseLevel();
    const tilt = bestCameraTilt(l);
    return tilt > 0 ? { ...l, camTilt: tilt } : l;
  }, []);
  const freeGesture = useMemo(() => freeCameraGesture(bus), [bus]);
  const [viewport, setViewport] = useState<{ width: number; height: number } | null>(null);
  const [runKey, setRunKey] = useState(0);
  const margins = useMemo(() => ({ top: 24, bottom: insets.bottom + 24 }), [insets.bottom]);
  const prepared = useMemo<PreparedLevel | null>(() => (viewport ? prepareLevel(level, viewport, margins, true) : null), [viewport, level, margins]);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setViewport((v) => (v && v.width === width && v.height === height ? v : { width, height }));
  }, []);

  // The demonstration: one swipe after the other, then everything again.
  useEffect(() => {
    if (!prepared || !focused) return;
    initAudio();
    return startDemo(level, bus, () => setRunKey((k) => k + 1));
  }, [prepared, focused, level, bus, runKey]);

  // A developer tool: in a production build the route leads nowhere.
  if (!testerTools()) return <Redirect href="/" />;

  return (
    <View style={styles.root}>
      <ScreenHeader title={t('dev.showcase')} right={<View />} />
      <GestureDetector gesture={freeGesture}>
      <View style={styles.canvasWrap} onLayout={onLayout}>
        {prepared && (
          <GameCanvas
            current={prepared}
            next={null}
            runKey={runKey}
            bus={bus}
            decor
            active={focused}
            ballSkin={profile.equipped.ball}
            paintEffect={profile.equipped.paint}
            freeCamera
          />
        )}
      </View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  canvasWrap: { flex: 1, backgroundColor: SCENE_BG },
});
