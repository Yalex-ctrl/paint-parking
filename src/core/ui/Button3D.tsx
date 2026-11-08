import { useEffect, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';

import { playSfx } from '@/core/services/audio';
import { impact } from '@/core/services/haptics';
import { useTourTarget } from '@/core/tour/targets';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';
import { buttonColors, fonts, radius, type ButtonVariant } from './theme';

type Size = 'lg' | 'md' | 'sm' | 'xs';
const SIZES: Record<Size, { height: number; depth: number; font: number; padX: number; icon: number }> = {
  lg: { height: 64, depth: 8, font: 24, padX: 28, icon: 28 },
  md: { height: 52, depth: 7, font: 18, padX: 20, icon: 22 },
  sm: { height: 40, depth: 5, font: 15, padX: 14, icon: 18 },
  // The icon buttons of the level header, which carry a caption under them.
  xs: { height: 30, depth: 4, font: 13, padX: 10, icon: 17 },
};

export type Button3DProps = {
  label?: string;
  icon?: IconName;
  variant?: ButtonVariant;
  size?: Size;
  /** A round button holding only an icon. */
  round?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  /** The button floats gently (2-3 px, about 3 s); `floatDelay` offsets it from the other buttons. */
  float?: boolean;
  floatDelay?: number;
  /** Anything else on the face, after the label (a price, a badge). */
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Stretches to the width of its container. */
  block?: boolean;
  /** The guided tour can point at this button and press it (see tour/targets). */
  tourId?: string;
};

/**
 * THE button of the app: a coloured face on a darker edge that gives it thickness. Pressing sinks the face into
 * the edge, with a small scale and a light haptic. Light faces carry dark text, dark faces carry white text.
 */
export function Button3D({
  label,
  icon,
  variant = 'primary',
  size = 'md',
  round = false,
  onPress,
  disabled = false,
  float = false,
  floatDelay = 0,
  children,
  style,
  block = false,
  tourId,
}: Button3DProps) {
  const c = buttonColors[variant];
  const s = SIZES[size];
  const faceH = s.height;
  const press = useSharedValue(0);
  const bob = useSharedValue(0);

  useEffect(() => {
    if (!float) return;
    bob.value = withDelay(
      floatDelay,
      withRepeat(
        withSequence(
          withTiming(-3, { duration: 1500, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: 1500, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
      ),
    );
  }, [float, floatDelay, bob]);

  // The tour's hand presses the button: the same sink, sound and vibration as a finger (the press itself is the tour's business).
  const tourRef = useTourTarget(tourId, () => {
    press.set(withSequence(withSpring(1, { damping: 18, stiffness: 400 }), withDelay(140, withSpring(0, { damping: 12, stiffness: 300 }))));
    impact(Haptics.ImpactFeedbackStyle.Light);
    playSfx('click', 0.7);
  });

  const outer = useAnimatedStyle(() => ({
    transform: [{ translateY: bob.value }, { scale: 1 - press.value * 0.03 }],
  }));
  const face = useAnimatedStyle(() => ({ transform: [{ translateY: press.value * s.depth }] }));

  const radiusPx = round ? faceH / 2 : Math.min(radius.xl, faceH / 2 + 4);
  const dim = disabled ? 0.55 : 1;
  const content = (
    <>
      {icon && <Icon name={icon} size={s.icon} color={c.text} />}
      {label !== undefined && (
        <Text style={{ color: c.text, fontSize: s.font, fontFamily: fonts.display }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
          {label}
        </Text>
      )}
      {children}
    </>
  );

  return (
    <Animated.View ref={tourRef as never} collapsable={false} style={[block && { alignSelf: 'stretch' }, outer, style]}>
      <Pressable
        disabled={disabled}
        onPress={onPress}
        onPressIn={() => {
          press.set(withSpring(1, { damping: 18, stiffness: 400 }));
          impact(Haptics.ImpactFeedbackStyle.Light);
          playSfx('click', 0.7);
        }}
        onPressOut={() => {
          press.set(withSpring(0, { damping: 12, stiffness: 300 }));
        }}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={{ opacity: dim }}
      >
        <View style={{ height: faceH + s.depth, width: round ? faceH : undefined }}>
          {/* The edge: the same shape, lower and darker. */}
          <View style={[styles.edge, { top: s.depth, borderRadius: radiusPx, backgroundColor: c.edge }]} />
          <Animated.View
            style={[
              styles.face,
              { height: faceH, borderRadius: radiusPx, backgroundColor: c.face, paddingHorizontal: round ? 0 : s.padX },
              face,
            ]}
          >
            {/* A soft reflection on the top third: a white fade that follows the rounded shape (an arc on a round button). */}
            <LinearGradient
              pointerEvents="none"
              colors={['rgba(255,255,255,0.26)', 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0)']}
              locations={[0, 0.55, 1]}
              style={[styles.gloss, { height: faceH * 0.45 }]}
            />
            {content}
          </Animated.View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  edge: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  face: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, overflow: 'hidden' },
  gloss: { position: 'absolute', top: 0, left: 0, right: 0 },
});
