import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { MONETIZATION } from '@/config/monetization';
import { formatNumber } from '@/i18n';
import { CoinIcon } from '@/ui/CoinIcon';
import { Text } from '@/ui/Text';

/**
 * The gauge of the piggy bank: a light track (it must show on the dark background), a pink gradient that fills, and the amount
 * written on it ("1 240 / 3 000"). `coins` is what is inside.
 */
export function PiggyGauge({ coins, height = 22 }: { coins: number; height?: number }) {
  const capacity = MONETIZATION.piggy.capacity;
  const ratio = Math.max(0, Math.min(1, coins / capacity));
  return (
    <View style={[styles.track, { height, borderRadius: height / 2 }]}>
      {ratio > 0 && (
        <LinearGradient colors={['#ff9fc2', '#ff4f93']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.fill, { width: `${Math.max(ratio * 100, 6)}%`, borderRadius: height / 2 }]} />
      )}
      <View style={styles.label} pointerEvents="none">
        <Text style={[styles.text, { fontSize: Math.round(height * 0.55) }]} numberOfLines={1}>
          {formatNumber(coins)} / {formatNumber(capacity)}
        </Text>
        <CoinIcon size={Math.round(height * 0.6)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: { alignSelf: 'stretch', overflow: 'hidden', backgroundColor: 'rgba(255, 255, 255, 0.28)', borderWidth: 1.5, borderColor: 'rgba(255, 255, 255, 0.45)' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  label: { ...StyleSheet.absoluteFill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  text: { color: '#ffffff', fontWeight: '800', fontVariant: ['tabular-nums'], textShadowColor: 'rgba(80, 10, 40, 0.8)', textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 } },
});
