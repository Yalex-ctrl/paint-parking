import { t } from '@/core/i18n';
import { useScreenReady } from '@/core/ui/useScreenReady';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { FlatList, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { testerTools } from '@/core/config/tester';
import { MECHANIC_ICONS } from '@/game/dailyMechanics';
import { LEVELS } from '@/game/levels';
import type { Mechanic } from '@/game/types';
import { loadProgress, type Progress } from '@/core/storage/progress';
import { Button3D } from '@/core/ui/Button3D';
import { Card3D } from '@/core/ui/Card3D';
import { Icon, type IconName } from '@/core/ui/Icon';
import { ScreenHeader } from '@/core/ui/ScreenHeader';
import { Text } from '@/core/ui/Text';
import { MARGIN, colors, fontSizes } from '@/core/ui/theme';

const COLUMNS = 5;
const GAP = 10;
const ITEM_H = 64;
const ROWS = Math.ceil(LEVELS.length / COLUMNS);

/** Developer tool: every stored level is open so the whole campaign can be tested. The player uses the map. */
export default function LevelsScreen() {
  useScreenReady('/levels');
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [progress, setProgress] = useState<Progress | null>(null);
  const list = useRef<FlatList>(null);
  const [query, setQuery] = useState('');
  // A number typed in the search box takes the list to that level.
  const search = (text: string) => {
    const digits = text.replace(/\D/g, '');
    setQuery(digits);
    const n = Number(digits);
    if (n >= 1 && n <= LEVELS.length) list.current?.scrollToIndex({ index: Math.floor((n - 1) / COLUMNS), animated: true, viewPosition: 0.3 });
  };

  useFocusEffect(
    useCallback(() => {
      loadProgress().then(setProgress);
    }, []),
  );
  const current = progress?.current ?? 1;
  const typed = Number(query);
  const play = (id: number) => router.dismissTo({ pathname: '/', params: { level: String(id), daily: '' } });

  // A developer tool: in a production build the route leads nowhere.
  if (!testerTools()) return <Redirect href="/" />;

  return (
    <View style={styles.root}>
      <ScreenHeader title={t('dev.levels')} />
      <TextInput value={query} onChangeText={search} keyboardType="number-pad" placeholder={t('tester.search')} placeholderTextColor={colors.textMuted} style={styles.search} />
      {/* Any number can be played, also past the stored levels (the ones after the last are generated on the phone). */}
      {typed >= 1 && <Button3D size="sm" variant="neutral" icon="play" label={t('tester.playLevel', { id: typed })} onPress={() => play(typed)} style={styles.play} />}
      <FlatList
        ref={list}
        data={LEVELS}
        keyExtractor={(l) => String(l.id)}
        numColumns={COLUMNS}
        contentContainerStyle={{ padding: MARGIN, paddingBottom: insets.bottom + 24, gap: GAP }}
        columnWrapperStyle={{ gap: GAP }}
        initialNumToRender={60}
        windowSize={9}
        getItemLayout={(_, row) => ({ length: ITEM_H, offset: MARGIN + row * (ITEM_H + GAP), index: row })}
        initialScrollIndex={Math.min(Math.max(Math.floor((Math.min(current, 500) - 1) / COLUMNS) - 1, 0), ROWS - 1)}
        renderItem={({ item }) => {
          const stars = progress?.stars[item.id] ?? 0;
          return (
            <Card3D
              style={styles.cell}
              depth={4}
              selected={item.id === current}
              face={stars > 0 ? colors.violetDeep : colors.surface}
              innerStyle={styles.cellInner}
              onPress={() => play(item.id)}
            >
              <Text style={styles.num}>{item.id}</Text>
              <View style={styles.stars}>
                {[0, 1, 2].map((i) => (
                  <Icon key={i} name="star" size={11} color={i < stars ? colors.gold : colors.bgDeep} />
                ))}
              </View>
              {/* The size of the grid, and the pieces the level holds (small icons). */}
              <Text style={styles.size}>
                {item.cols - 2}×{item.rows - 2}
              </Text>
              <View style={styles.stars}>
                {item.mechanics
                  .filter((m: Mechanic) => m !== 'stop' && m !== 'corner')
                  .map((m: Mechanic) => (
                    <Icon key={m} name={MECHANIC_ICONS[m] as IconName} size={11} color={colors.gold} />
                  ))}
              </View>
            </Card3D>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  cell: { flex: 1, height: ITEM_H },
  cellInner: { alignItems: 'center', justifyContent: 'center', padding: 2, height: ITEM_H - 4, gap: 1 },
  num: { color: colors.text, fontSize: fontSizes.md, fontWeight: '700' },
  stars: { flexDirection: 'row' },
  size: { color: colors.textMuted, fontSize: fontSizes.xs },
  play: { marginHorizontal: MARGIN, marginTop: 8 },
  search: { marginHorizontal: MARGIN, marginTop: 8, height: 40, borderRadius: 12, paddingHorizontal: 12, color: colors.text, backgroundColor: colors.surface, fontSize: fontSizes.md },
});
