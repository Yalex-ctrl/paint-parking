import { t, useLanguage } from '@/i18n';
import { StyleSheet, View } from 'react-native';

import { formatDuration } from '@/game/duration';
import { useLivesView } from '@/storage/lives';
import { Icon } from '@/ui/Icon';
import { Text } from '@/ui/Text';
import { colors, fontSizes } from '@/ui/theme';

/**
 * A heart with the number of lives, and under it "+1 dans 12:34" while one is missing ("Plein" when there are 5). While lives
 * are unlimited: a heart with the infinity sign and the time left.
 */
export function LivesPill({ compact = false, short = false, tight = false }: { compact?: boolean; short?: boolean; tight?: boolean }) {
  useLanguage();
  const v = useLivesView();
  const sub = v.vip ? '' : v.infinite ? t('lives.infiniteLeft', { time: formatDuration(v.infiniteLeftMs) }) : v.full ? t('lives.full') : v.nextInMs !== null ? (short ? formatDuration(v.nextInMs) : t('lives.plusOneIn', { time: formatDuration(v.nextInMs) })) : '';
  // In the header (compact) the countdown is written under the pill, and only while a life is missing.
  const missing = !v.vip && !v.infinite && !v.full && v.nextInMs !== null ? t('lives.plusOneIn', { time: formatDuration(v.nextInMs) }) : '';
  const pill = (
    <View style={[styles.pill, tight ? styles.pillTight : null]}>
      <Icon name="heart" size={tight ? 16 : compact ? 20 : 24} color={v.count === 0 && !v.infinite ? colors.textMuted : colors.red} />
      {v.infinite ? <Icon name="infinity" size={20} color={colors.text} /> : <Text style={styles.count}>{v.count}</Text>}
      {!compact && sub !== '' && <Text style={styles.sub}>{sub}</Text>}
    </View>
  );
  if (!compact) return pill;
  return (
    <View style={styles.column}>
      {pill}
      {missing !== '' && (
        <Text style={styles.caption} pointerEvents="none" numberOfLines={1}>
          {missing}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.overlay,
  },
  pillTight: { paddingHorizontal: 6, gap: 3, height: 30, borderRadius: 15 },
  count: { color: colors.text, fontSize: fontSizes.md, fontWeight: '800' },
  sub: { color: colors.textSoft, fontSize: fontSizes.xs, fontWeight: '700', fontVariant: ['tabular-nums'] },
  column: { alignItems: 'flex-start', gap: 1 },
  // In the header the time sits under the pill, left-aligned with it.
  caption: { color: colors.text, fontSize: 10, lineHeight: 12, fontWeight: '800', fontVariant: ['tabular-nums'], textShadowColor: 'rgba(0, 0, 0, 0.7)', textShadowRadius: 3, paddingLeft: 4 },
});
