import { t } from '@/i18n';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, ClipPath, Defs, Ellipse, G, Path, Rect } from 'react-native-svg';

import { MONETIZATION } from '@/config/monetization';
import { canBreakPiggy, fillRatio } from '@/game/piggy';
import { useProfile } from '@/storage/profile';
import { colors } from '@/ui/theme';

const PINK = '#ff9db8';
const PINK_DARK = '#e8708f';
const PINK_LIGHT = '#ffc2d4';
const GOLD = '#ffd23f';

/**
 * A cute piggy bank drawn with shapes, with a coin slot on the back and a gauge: the lower part fills with gold coins as the
 * piggy bank fills (`ratio` 0-1).
 */
export function PiggyBank({ ratio, size = 120 }: { ratio: number; size?: number }) {
  // The body is the ellipse (cx 58, cy 62, rx 44, ry 32): the gold rises inside it from its bottom (y 94) to its top (y 30).
  const top = 94 - Math.max(0, Math.min(1, ratio)) * 64;
  return (
    <Svg width={size} height={(size * 100) / 125} viewBox="0 0 125 100">
      <Defs>
        <ClipPath id="body">
          <Ellipse cx="58" cy="62" rx="44" ry="32" />
        </ClipPath>
      </Defs>
      {/* tail */}
      <Path d="M101 56 C112 50 116 60 108 63 C103 65 108 71 114 68" stroke={PINK_DARK} strokeWidth="4" fill="none" strokeLinecap="round" />
      {/* legs */}
      <Rect x="30" y="84" width="14" height="14" rx="5" fill={PINK_DARK} />
      <Rect x="70" y="84" width="14" height="14" rx="5" fill={PINK_DARK} />
      {/* ear */}
      <Path d="M30 38 L38 14 L54 34 Z" fill={PINK_DARK} />
      {/* body */}
      <Ellipse cx="58" cy="62" rx="44" ry="32" fill={PINK} />
      <G clipPath="url(#body)">
        <Rect x="10" y={top} width="110" height="70" fill={GOLD} opacity={0.9} />
        <Rect x="10" y={top} width="110" height="4" fill="#fff2b0" opacity={0.7} />
      </G>
      <Ellipse cx="58" cy="62" rx="44" ry="32" fill="none" stroke={PINK_DARK} strokeWidth="3" />
      {/* the sheen */}
      <Path d="M30 50 C34 40 44 35 54 34" stroke={PINK_LIGHT} strokeWidth="4" fill="none" strokeLinecap="round" opacity={0.8} />
      {/* coin slot */}
      <Rect x="48" y="31" width="24" height="5" rx="2.5" fill="#7a2a40" />
      {/* snout */}
      <Ellipse cx="97" cy="68" rx="13" ry="11" fill={PINK_LIGHT} stroke={PINK_DARK} strokeWidth="3" />
      <Circle cx="93" cy="68" r="2.2" fill="#7a2a40" />
      <Circle cx="101" cy="68" r="2.2" fill="#7a2a40" />
      {/* eye */}
      <Circle cx="82" cy="52" r="4" fill="#3a1a2a" />
      <Circle cx="83.2" cy="50.8" r="1.3" fill="#fff" />
      {/* cheek */}
      <Circle cx="76" cy="64" r="5" fill="#ff7aa0" opacity={0.6} />
    </Svg>
  );
}

/** The small piggy bank button of the home screen and the map: its gauge, and a red dot when it can be broken. */
export function PiggyButton({ onPress }: { onPress: () => void }) {
  const profile = useProfile();
  return (
    <Pressable onPress={onPress} hitSlop={8} style={styles.button} accessibilityLabel={t('hud.piggy')}>
      <PiggyBank ratio={fillRatio(profile)} size={42} />
      {canBreakPiggy(profile) && <View style={styles.dot} />}
    </Pressable>
  );
}

export const PIGGY_CAPACITY = MONETIZATION.piggy.capacity;

const styles = StyleSheet.create({
  button: { width: 56, height: 46, borderRadius: 23, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', top: 2, right: 4, width: 14, height: 14, borderRadius: 7, backgroundColor: colors.red, borderWidth: 2, borderColor: colors.bg },
});
