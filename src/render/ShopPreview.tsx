import { StyleSheet, View } from 'react-native';

import { Text } from '@/core/ui/Text';
import { colors } from '@/core/ui/theme';

/**
 * What the shop shows in big: the selected vehicle (or paint) driving over a strip of road with the paint that is on.
 * Placeholder until the 3D rendering of the vehicles is ported (see legacy-maze/src/render/ShopPreview.tsx for the version of
 * Paint Maze, which showed a rolling ball). The props keep their names so the screens do not change.
 */
export function ShopPreview(_props: { ball: string; paint: string }) {
  return (
    <View style={styles.box}>
      <Text style={styles.text}>🚗</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  text: { fontSize: 48 },
});
