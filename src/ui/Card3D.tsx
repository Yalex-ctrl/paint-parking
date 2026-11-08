import { type ReactNode } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius } from './theme';

/** A raised card: a face on a darker edge, like the buttons but meant to hold content (shop items, offers...). */
export function Card3D({
  children,
  onPress,
  face = colors.surface,
  edge = colors.surfaceEdge,
  selected = false,
  borderColor,
  depth = 6,
  style,
  innerStyle,
}: {
  children: ReactNode;
  onPress?: () => void;
  face?: string;
  edge?: string;
  selected?: boolean;
  /** A coloured outline (the rarity of a shop item). */
  borderColor?: string;
  depth?: number;
  style?: StyleProp<ViewStyle>;
  innerStyle?: StyleProp<ViewStyle>;
}) {
  const body = (pressed: boolean) => (
    <View style={[styles.wrap, { paddingBottom: depth }]}>
      <View style={[styles.edge, { backgroundColor: selected ? colors.goldDeep : edge, top: depth }]} />
      <View
        style={[
          styles.face,
          { backgroundColor: face, transform: [{ translateY: pressed ? depth * 0.6 : 0 }] },
          borderColor ? { borderColor } : null,
          selected && { borderColor: colors.gold },
          innerStyle,
        ]}
      >
        <LinearGradient pointerEvents="none" colors={['rgba(255,255,255,0.07)', 'rgba(255,255,255,0.025)', 'rgba(255,255,255,0)']} locations={[0, 0.45, 1]} style={styles.gloss} />
        {children}
      </View>
    </View>
  );
  if (!onPress) return <View style={style}>{body(false)}</View>;
  return (
    <Pressable onPress={onPress} style={style}>
      {({ pressed }) => body(pressed)}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {},
  edge: { position: 'absolute', left: 0, right: 0, bottom: 0, borderRadius: radius.lg },
  face: { borderRadius: radius.lg, borderWidth: 2, borderColor: 'transparent', padding: 12, overflow: 'hidden' },
  gloss: { position: 'absolute', top: 0, left: 0, right: 0, height: '70%' },
});
