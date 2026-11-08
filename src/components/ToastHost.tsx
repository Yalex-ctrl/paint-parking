import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useToast } from '@/services/toast';
import { Text } from '@/ui/Text';
import { MARGIN, colors, fontSizes } from '@/ui/theme';

/** Shows the current toast, at the top of the screen under the header, above everything but never in the way of a touch. */
export function ToastHost() {
  const toast = useToast();
  const insets = useSafeAreaInsets();
  if (!toast) return null;
  return (
    <View style={[styles.wrap, { top: insets.top + 60 }]} pointerEvents="none">
      <Animated.View key={toast.id} entering={FadeInDown.duration(180)} exiting={FadeOut.duration(220)} style={styles.toast}>
        <Text style={styles.text}>{toast.message}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: MARGIN, right: MARGIN, alignItems: 'center', zIndex: 2000, elevation: 2000 },
  toast: { maxWidth: '100%', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 18, backgroundColor: 'rgba(18, 12, 34, 0.94)', borderWidth: 2, borderColor: 'rgba(255, 201, 60, 0.5)' },
  text: { color: colors.text, fontSize: fontSizes.sm, fontWeight: '800', textAlign: 'center' },
});
