import { useMemo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { colors } from '@/core/ui/theme';

const THUMB = 26;

/** A volume slider (0 to 1): drag the knob or tap the bar. */
export function Slider({ value, onChange, disabled = false }: { value: number; onChange: (v: number) => void; disabled?: boolean }) {
  const [width, setWidth] = useState(0);

  const gesture = useMemo(() => {
    const span = Math.max(1, width - THUMB);
    const to = (x: number) => onChange(Math.max(0, Math.min(1, (x - THUMB / 2) / span)));
    return Gesture.Pan()
      .runOnJS(true)
      .minDistance(0)
      .enabled(!disabled)
      .onBegin((e) => to(e.x))
      .onUpdate((e) => to(e.x));
  }, [width, disabled, onChange]);

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const x = Math.max(0, Math.min(1, value)) * Math.max(0, width - THUMB);
  return (
    <GestureDetector gesture={gesture}>
      <View style={[styles.hit, disabled && { opacity: 0.4 }]} onLayout={onLayout}>
        <View style={styles.track} pointerEvents="none">
          <View style={[styles.fill, { width: x + THUMB / 2 }]} />
        </View>
        <View style={[styles.thumb, { left: x }]} pointerEvents="none" />
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  hit: { height: 36, justifyContent: 'center' },
  track: { height: 10, borderRadius: 5, backgroundColor: colors.bgDeep, overflow: 'hidden' },
  fill: { height: 10, backgroundColor: colors.gold },
  thumb: { position: 'absolute', top: 5, width: THUMB, height: THUMB, borderRadius: THUMB / 2, backgroundColor: colors.text, borderWidth: 3, borderColor: colors.gold },
});
