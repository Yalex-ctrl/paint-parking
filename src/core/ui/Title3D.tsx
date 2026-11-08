import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { Text } from './Text';
import { fonts } from './theme';

const DEPTH = 7;
const SIZE = 64;

/** One letter in relief: the layers of its thickness stacked down and to the right, then the face on top. */
function Letter({ char, face, edge, paintDelay }: { char: string; face: string; edge: string; paintDelay?: number }) {
  const fill = useSharedValue(paintDelay === undefined ? 1 : 0);
  const pop = useSharedValue(1);
  useEffect(() => {
    if (paintDelay === undefined) return;
    // The paint fills the letter, with a little splash (a bounce) as it lands.
    fill.value = withDelay(paintDelay, withTiming(1, { duration: 380, easing: Easing.out(Easing.quad) }));
    pop.value = withDelay(paintDelay, withSequence(withTiming(1.22, { duration: 140 }), withSpring(1, { damping: 7, stiffness: 220 })));
  }, [paintDelay, fill, pop]);
  const faceStyle = useAnimatedStyle(() => ({ opacity: fill.value }));
  const wrap = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const glyph = { fontFamily: fonts.display, fontSize: SIZE, lineHeight: SIZE * 1.1 } as const;
  return (
    <Animated.View style={[styles.letter, wrap]}>
      {/* Soft shadow on the ground under the thickness. */}
      <Text style={[glyph, styles.shadow, { left: DEPTH * 0.9 + 5, top: DEPTH * 1.3 + 8 }]}>{char}</Text>
      {Array.from({ length: DEPTH }, (_, i) => (
        <Text key={i} style={[glyph, styles.layer, { color: edge, left: ((DEPTH - i) * 0.9) | 0, top: (DEPTH - i) * 1.3 }]}>
          {char}
        </Text>
      ))}
      {/* The bare letter (grey, not painted yet)... */}
      <Text style={[glyph, styles.layer, { color: '#6a6290' }]}>{char}</Text>
      {/* ...and its paint. */}
      <Animated.Text style={[glyph, styles.layer, { color: face }, faceStyle]}>{char}</Animated.Text>
    </Animated.View>
  );
}

const MAZE_COLORS: [string, string][] = [
  ['#ff5468', '#a3182d'],
  ['#2ec4b6', '#12786f'],
  ['#9b5de5', '#5b2aa3'],
  ['#4cc9f0', '#1d7ea0'],
];

/**
 * The logo "Paint Parking" in thick 3D lettering. At each opening the letters of MAZE are filled with paint one after the
 * other, each in its own colour, while PAINT stays cream.
 */
export function Title3D() {
  return (
    <View style={styles.wrap} pointerEvents="none">
      <View style={styles.row}>
        {'PAINT'.split('').map((ch, i) => (
          <Letter key={i} char={ch} face="#fff4d6" edge="#c9a46a" />
        ))}
      </View>
      <View style={[styles.row, { marginTop: -6 }]}>
        {'MAZE'.split('').map((ch, i) => (
          <Letter key={i} char={ch} face={MAZE_COLORS[i][0]} edge={MAZE_COLORS[i][1]} paintDelay={500 + i * 420} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  row: { flexDirection: 'row', justifyContent: 'center' },
  letter: { width: SIZE * 0.78, height: SIZE * 1.12, marginHorizontal: 1 },
  layer: { position: 'absolute', left: 0, top: 0, textAlign: 'center', width: SIZE * 0.78 },
  shadow: { position: 'absolute', textAlign: 'center', width: SIZE * 0.78, color: 'rgba(0,0,0,0.35)' },
});
