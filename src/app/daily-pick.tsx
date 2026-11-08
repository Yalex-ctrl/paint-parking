import { Redirect, useRouter } from 'expo-router';
import { FlatList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatDate, t } from '@/i18n';
import { testerTools } from '@/config/tester';
import { DAILY_LEVELS, dailyIndexForDay } from '@/game/dailyLevels';
import { addDays, dayKeyOf, parseDay } from '@/game/dates';
import { Card3D } from '@/ui/Card3D';
import { ScreenHeader } from '@/ui/ScreenHeader';
import { Text } from '@/ui/Text';
import { MARGIN, colors, fontSizes } from '@/ui/theme';

const COLUMNS = 5;
const GAP = 10;
const ITEM_H = 74;

/** The next day on which each challenge is the one of the day (from today), to show its date in the list. */
function nextDates(): Map<number, string> {
  const out = new Map<number, string>();
  const today = dayKeyOf(new Date());
  for (let i = 0; i < 366 + 7; i++) {
    const day = addDays(today, i);
    const idx = dailyIndexForDay(day);
    if (!out.has(idx)) {
      const { year, month, day: dom } = parseDay(day);
      out.set(idx, formatDate(new Date(year, month - 1, dom), { weekday: 'short', day: 'numeric', month: 'short' }));
    }
  }
  return out;
}
const DATES = nextDates();

/** Developer tool: play any of the 366 daily challenges (the player is always given today's). */
export default function DailyPickScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // A developer tool: in a production build the route leads nowhere.
  if (!testerTools()) return <Redirect href="/" />;
  return (
    <View style={styles.root}>
      <ScreenHeader title={t('dev.pickDaily')} />
      <FlatList
        data={DAILY_LEVELS}
        keyExtractor={(l) => String(l.id)}
        numColumns={COLUMNS}
        contentContainerStyle={{ padding: MARGIN, paddingBottom: insets.bottom + 24, gap: GAP }}
        columnWrapperStyle={{ gap: GAP }}
        initialNumToRender={60}
        windowSize={9}
        renderItem={({ item, index }) => (
          <Card3D style={styles.cell} depth={4} face={colors.surface} innerStyle={styles.cellInner} onPress={() => router.dismissTo({ pathname: '/', params: { daily: '1', challenge: String(index + 1) } })}>
            <Text style={styles.num}>{index + 1}</Text>
            <Text style={styles.size}>{DATES.get(index) ?? ''}</Text>
            <Text style={styles.size}>{item.star ?? ''}</Text>
          </Card3D>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  cell: { flex: 1, height: ITEM_H },
  cellInner: { alignItems: 'center', justifyContent: 'center', padding: 2, height: ITEM_H - 4, gap: 1 },
  num: { color: colors.text, fontSize: fontSizes.md, fontWeight: '700' },
  size: { color: colors.textMuted, fontSize: fontSizes.xs },
});
