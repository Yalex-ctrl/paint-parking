import { t } from '@/core/i18n';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { LOADING } from '@/core/config/app';
import { TIPS, tipText } from '@/core/loadingRules';
import { particlePalette } from '@/core/render/paintPalette';
import { useThumbnail } from '@/core/render/useThumbnail';
import { useProfile } from '@/core/storage/profile';
import { Card3D } from '@/core/ui/Card3D';
import { endLoading, leaveAt, minDuration, useLoading } from '@/core/ui/loadingStore';
import { Text } from '@/core/ui/Text';
import { colors, fontSizes } from '@/core/ui/theme';

const LOGO = ['PAINT', 'MAZE'] as const;
const LETTERS = LOGO.join('').length;
const BAR_H = 18;
const BALL = 40;
const BASE = '#5b5486';

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

/** A letter of the logo: grey at first, filled with paint when the progress has passed it. */
function Letter({ char, index, progress, fill }: { char: string; index: number; progress: { get: () => number }; fill: string }) {
  const style = useAnimatedStyle(() => {
    const k = Math.max(0, Math.min(1, progress.get() * LETTERS - index));
    return { opacity: k, transform: [{ scale: 0.92 + 0.08 * k }] };
  });
  return (
    <View style={styles.letterBox}>
      <Text style={[styles.letter, { color: BASE }]}>{char}</Text>
      <Animated.View style={[StyleSheet.absoluteFill, style]}>
        <Text style={[styles.letter, { color: fill }]}>{char}</Text>
      </Animated.View>
    </View>
  );
}

/** The walls of the faint maze: short segments on a grid, chosen by a fixed pseudo-random sequence (the same every time). */
function mazePath(width: number, height: number): string {
  const cell = 46;
  let path = '';
  let seed = 7;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let y = 0; y <= Math.ceil(height / cell); y++) {
    for (let x = 0; x <= Math.ceil(width / cell); x++) {
      const px = x * cell;
      const py = y * cell;
      if (rnd() < 0.5) path += `M${px} ${py}H${px + cell}`;
      if (rnd() < 0.5) path += `M${px} ${py}V${py + cell}`;
    }
  }
  return path;
}

/** A faint maze drawn behind everything: short walls on a grid, in a barely visible white. */
function MazeWatermark() {
  const { width, height } = useWindowDimensions();
  const d = useMemo(() => mazePath(width, height), [width, height]);
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Path d={d} stroke="#ffffff" strokeOpacity={0.055} strokeWidth={6} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

/**
 * The loading screen of the whole app: entirely React Native (no 3D: the 3D is what is loading), so it stays smooth while the phone
 * works. A plain deep violet of the game's palette with a faint maze; the logo whose letters fill with the paint of the
 * player as the loading goes; a rounded bar along which the player's ball rolls, leaving paint; a card with a tip.
 * It comes in and goes out with a 300 ms fade, and stays at least 2.5 s at launch and 1.5 s between two screens. The progress shown
 * follows the real loading, and finishes smoothly to 100 % if the loading was faster.
 */
export function LoadingScreen() {
  const loading = useLoading();
  const profile = useProfile();
  const { width } = useWindowDimensions();
  const opacity = useSharedValue(1);
  const progress = useSharedValue(0.03);
  const [tipIndex, setTipIndex] = useState(() => Math.floor(Math.random() * TIPS.length));
  const readyAt = useRef<number | null>(null);
  const hiding = useRef(false);

  const palette = useMemo(() => particlePalette(profile.equipped.paint, 0xff5468).map(hex), [profile.equipped.paint]);
  const ballUri = useThumbnail('ball', profile.equipped.ball);
  const barW = Math.min(width - 64, 320);

  // A new wait: the screen comes in (at once at launch, in 300 ms between two screens), the progress starts again.
  useEffect(() => {
    if (!loading.covered) return;
    hiding.current = false;
    readyAt.current = null;
    progress.set(0.03);
    opacity.set(loading.kind === 'launch' ? 1 : withTiming(1, { duration: LOADING.fadeMs }));
  }, [loading.covered, loading.startedAt, loading.kind, opacity, progress]);

  // The progress follows the loading; the screen leaves when everything is ready and the minimum time has passed.
  useEffect(() => {
    if (!loading.covered) return;
    const id = setInterval(() => {
      const now = Date.now();
      const elapsed = now - loading.startedAt;
      const routeReady = loading.routeReady;
      // A screen that never says it is ready must not keep the loading screen for ever.
      const ready = (routeReady && (loading.kind === 'transition' || loading.launchReady)) || elapsed > 9000;
      if (ready && readyAt.current === null) readyAt.current = now;
      const leave = leaveAt({ ...loading, routeReady: true, launchReady: true }, readyAt.current);
      // What the real loading says; a transition has no steps to count, so it creeps toward 90 % until the screen is ready.
      const real = loading.kind === 'launch' ? loading.launchProgress * 0.7 + (routeReady ? 0.3 : 0) : Math.min(0.9, 0.15 + (elapsed / minDuration(loading)) * 0.75);
      if (leave === null) {
        progress.set(withTiming(Math.min(real, 0.96), { duration: 260, easing: Easing.out(Easing.quad) }));
      } else {
        // Ready: on to 100 % in the time that is left (at least a moment).
        progress.set(withTiming(1, { duration: Math.max(260, leave - now) }));
        if (!hiding.current && now >= leave + 40) {
          hiding.current = true;
          opacity.set(withTiming(0, { duration: LOADING.fadeMs }));
          setTimeout(endLoading, LOADING.fadeMs + 30);
        }
      }
    }, 90);
    return () => clearInterval(id);
  }, [loading, opacity, progress]);

  // The tip changes while the wait goes on.
  useEffect(() => {
    if (!loading.covered) return;
    const id = setInterval(() => setTipIndex((i) => (i + 1) % TIPS.length), LOADING.tipMs);
    return () => clearInterval(id);
  }, [loading.covered]);

  const wrap = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  const fillStyle = useAnimatedStyle(() => ({ width: BAR_H + progress.get() * (barW - BAR_H) }));
  const ballStyle = useAnimatedStyle(() => ({ transform: [{ translateX: progress.get() * (barW - BALL) }, { rotate: `${progress.get() * 1080}deg` }] }));

  if (!loading.covered) return null;
  const letters: { char: string; index: number }[][] = [];
  let n = 0;
  for (const word of LOGO) letters.push([...word].map((char) => ({ char, index: n++ })));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, wrap]} pointerEvents="auto">
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.loadingBg }]} />
      <MazeWatermark />

      <View style={styles.center}>
        <View style={styles.logo}>
          {letters.map((row, r) => (
            <View key={r} style={styles.row}>
              {row.map(({ char, index }) => (
                <Letter key={index} char={char} index={index} progress={progress} fill={palette[index % palette.length]} />
              ))}
            </View>
          ))}
        </View>

        <View style={[styles.barWrap, { width: barW }]}>
          <View style={[styles.track, { width: barW }]}>
            <Animated.View style={[styles.fill, { backgroundColor: palette[0] }, fillStyle]} />
          </View>
          <Animated.View style={[styles.ball, ballStyle]}>
            {ballUri ? <Image source={{ uri: ballUri }} style={styles.ballImage} /> : <View style={[styles.ballImage, { backgroundColor: colors.gold }]} />}
          </Animated.View>
        </View>
      </View>

      <View style={styles.tipWrap}>
        <Card3D innerStyle={styles.tipCard}>
          <Text style={styles.tipLabel}>{t('loading.tipLabel')}</Text>
          <Animated.View key={tipIndex} entering={FadeIn.duration(250)} exiting={FadeOut.duration(150)}>
            <Text style={styles.tip}>{tipText(TIPS[tipIndex])}</Text>
          </Animated.View>
        </Card3D>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  center: { ...({ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const), alignItems: 'center', justifyContent: 'center', gap: 56 },
  logo: { alignItems: 'center', gap: 2 },
  row: { flexDirection: 'row', gap: 2 },
  letterBox: { alignItems: 'center', justifyContent: 'center' },
  letter: { fontSize: fontSizes.huge, lineHeight: 62 },
  barWrap: { height: BALL, justifyContent: 'center' },
  track: { height: BAR_H, borderRadius: BAR_H / 2, backgroundColor: 'rgba(255, 255, 255, 0.16)', overflow: 'hidden' },
  fill: { height: BAR_H, borderRadius: BAR_H / 2 },
  ball: { position: 'absolute', left: 0, width: BALL, height: BALL },
  ballImage: { width: BALL, height: BALL, borderRadius: BALL / 2 },
  tipWrap: { position: 'absolute', left: 20, right: 20, bottom: 56, alignItems: 'center' },
  tipCard: { alignItems: 'center', gap: 4, paddingVertical: 12, paddingHorizontal: 18, minHeight: 78, justifyContent: 'center' },
  tipLabel: { color: colors.gold, fontSize: fontSizes.xs, fontWeight: '800', letterSpacing: 2 },
  tip: { color: colors.text, fontSize: fontSizes.md, textAlign: 'center' },
});
