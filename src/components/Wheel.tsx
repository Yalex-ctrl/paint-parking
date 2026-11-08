import { useCallback, useImperativeHandle, useRef, forwardRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedReaction, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { G, Path, Text as SvgText } from 'react-native-svg';

import { playSfx } from '@/services/audio';
import { Haptics, impact } from '@/services/haptics';
import { colors } from '@/ui/theme';

export type WheelFace = { label: string; color: string };

const SIZE = 270;
const R = SIZE / 2 - 8;
const TWO_PI = Math.PI * 2;

/** The slice `i` of `n`, from the top, clockwise: a path of the circle. */
function slicePath(i: number, n: number): string {
  const a0 = (i / n) * TWO_PI - Math.PI / 2;
  const a1 = ((i + 1) / n) * TWO_PI - Math.PI / 2;
  const x = (a: number) => SIZE / 2 + Math.cos(a) * R;
  const y = (a: number) => SIZE / 2 + Math.sin(a) * R;
  return `M${SIZE / 2} ${SIZE / 2} L${x(a0)} ${y(a0)} A${R} ${R} 0 0 1 ${x(a1)} ${y(a1)} Z`;
}

export type WheelHandle = {
  /** Turns the wheel so that it ends on slice `index` (drawn before: the animation only shows it). `done` is called when it stops. */
  spin: (index: number, done: () => void) => void;
};

/**
 * The wheel of fortune: it turns fast, then slows down with a click and a light vibration at every slice, and stops on the slice
 * that was drawn, which then swells. The prize is decided before it turns; the animation just ends on it.
 */
export const Wheel = forwardRef<WheelHandle, { faces: WheelFace[] }>(function Wheel({ faces }, ref) {
  const n = faces.length;
  const rotation = useSharedValue(0);
  const swell = useSharedValue(0);
  const winner = useSharedValue(-1);
  const turned = useRef(0);
  const lastSlice = useSharedValue(0);

  const tick = useCallback(() => {
    playSfx('click', 0.55);
    impact(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  // A click each time a slice passes under the pointer.
  useAnimatedReaction(
    () => Math.floor((((-rotation.get() % 360) + 360) % 360) / (360 / n)),
    (slice, previous) => {
      if (previous !== null && slice !== previous) {
        lastSlice.set(slice);
        runOnJS(tick)();
      }
    },
  );

  useImperativeHandle(
    ref,
    () => ({
      spin: (index, done) => {
        // Slice `index` has its middle at (index + 0.5) x 360/n degrees from the top; the wheel turns the other way round to bring it up.
        const target = -((index + 0.5) * (360 / n));
        const base = turned.current;
        const current = ((base % 360) + 360) % 360;
        const targetMod = ((target % 360) + 360) % 360;
        let delta = targetMod - current;
        if (delta <= 0) delta += 360;
        const total = base + 360 * 5 + delta;
        turned.current = total;
        winner.set(-1);
        swell.set(0);
        rotation.set(
          withTiming(total, { duration: 4600, easing: Easing.out(Easing.cubic) }, (finished) => {
            if (finished) {
              winner.set(index);
              swell.set(withSequence(withTiming(1, { duration: 160 }), withTiming(0.4, { duration: 300 })));
              runOnJS(done)();
            }
          }),
        );
      },
    }),
    [n, rotation, swell, winner, turned],
  );

  const wheelStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.get()}deg` }] }));
  const glow = useAnimatedStyle(() => ({ opacity: swell.get() * 0.9, transform: [{ scale: 1 + swell.get() * 0.12 }] }));

  return (
    <View style={styles.box}>
      <Animated.View pointerEvents="none" style={[styles.glow, glow]} />
      <Animated.View style={wheelStyle}>
        <Svg width={SIZE} height={SIZE}>
          {faces.map((f, i) => (
            <Path key={i} d={slicePath(i, n)} fill={f.color} stroke="#1d1733" strokeWidth={3} />
          ))}
          {faces.map((f, i) => {
            const angle = ((i + 0.5) / n) * 360;
            return (
              <G key={`t${i}`} origin={`${SIZE / 2}, ${SIZE / 2}`} rotation={angle}>
                <SvgText x={SIZE / 2} y={SIZE / 2 - R * 0.66} fontSize={22} fontWeight="bold" fill="#ffffff" stroke="#1d1733" strokeWidth={0.8} textAnchor="middle" alignmentBaseline="middle">
                  {f.label}
                </SvgText>
              </G>
            );
          })}
        </Svg>
      </Animated.View>
      {/* The hub and the pointer, which do not turn. */}
      <View style={styles.hub} pointerEvents="none" />
      <View style={styles.pointer} pointerEvents="none" />
    </View>
  );
});

const styles = StyleSheet.create({
  box: { width: SIZE, height: SIZE + 18, alignItems: 'center', justifyContent: 'flex-end' },
  glow: { position: 'absolute', bottom: 0, width: SIZE, height: SIZE, borderRadius: SIZE / 2, backgroundColor: 'rgba(255, 233, 130, 0.35)' },
  hub: { position: 'absolute', bottom: SIZE / 2 - 22, width: 44, height: 44, borderRadius: 22, backgroundColor: colors.gold, borderWidth: 4, borderColor: colors.goldDeep },
  pointer: {
    position: 'absolute',
    top: 0,
    width: 0,
    height: 0,
    borderLeftWidth: 14,
    borderRightWidth: 14,
    borderTopWidth: 26,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: colors.red,
  },
});
