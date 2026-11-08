import { StyleSheet, View } from 'react-native';

import { LEVELS } from '@/game/levels';
import { Text } from '@/core/ui/Text';
import { colors } from '@/core/ui/theme';
import { SCENE_BG } from '@/render/sceneBg';

/**
 * The level screen. Placeholder: the rules, the solver and the levels of the parking are in place (src/game), but the 3D
 * parking, the vehicles and the HUD are not ported yet. The screen of Paint Maze (HUD, steps, help of the first levels, result,
 * guided tour) is in legacy-maze/src/screens/GameScreen.tsx, to be adapted.
 */
export default function GameScreen() {
  return (
    <View style={styles.root}>
      <Text style={styles.title}>Paint Parking</Text>
      <Text style={styles.sub}>{`${LEVELS.length} niveaux prêts`}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: SCENE_BG },
  title: { color: colors.text, fontSize: 32 },
  sub: { color: colors.textMuted, fontSize: 16, marginTop: 8 },
});
