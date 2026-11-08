import { pictureName } from '@/core/i18n/names';
import { t, useLanguage } from '@/core/i18n';
import { useScreenReady } from '@/core/ui/useScreenReady';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Confetti } from '@/core/components/Confetti';
import { PIECES, gallery, pictureForLevel, pictureUri } from '@/core/gallery';
import { loadProgress, type Progress } from '@/core/storage/progress';
import { Icon } from '@/core/ui/Icon';
import { Card3D } from '@/core/ui/Card3D';
import { Target } from '@/core/tour/targets';
import { ScreenHeader, TopFade } from '@/core/ui/ScreenHeader';
import { Text } from '@/core/ui/Text';
import { MARGIN, colors, radius, fontSizes } from '@/core/ui/theme';

type Open = { index: number; pieces: number; name: string; complete: boolean };

export default function GalleryScreen() {
  useLanguage();
  useScreenReady('/gallery');
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [progress, setProgress] = useState<Progress | null>(null);
  const [open, setOpen] = useState<Open | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadProgress().then(setProgress);
    }, []),
  );

  // Started or finished pictures, then two locked ones to look forward to.
  const all = progress ? gallery(progress.stars, pictureForLevel(progress.current).picture + 3) : [];
  const started = all.filter((g) => g.pieces > 0);
  const upcoming = all.filter((g) => g.pieces === 0).slice(0, 2);
  const done = started.filter((g) => g.complete).length;

  return (
    <View style={styles.root}>
      <ScreenHeader title={t('hud.gallery')} />
      <View style={styles.summary}>
        <View style={styles.badge}>
          <Icon name="image-multiple" size={18} color={colors.ink} />
          <Text style={styles.badgeText}>
            {t('gallery.done', { count: done })}
          </Text>
        </View>
      </View>

      <View style={styles.flex}>
        <ScrollView
          contentContainerStyle={[styles.grid, { paddingBottom: insets.bottom + 28 }]}
          showsVerticalScrollIndicator={false}
        >
          {started.map(({ picture, pieces, complete }, idx) => (
            <Card3D
              key={picture.index}
              style={styles.cell}
              innerStyle={styles.cellInner}
              onPress={() => setOpen({ index: picture.index, pieces, name: pictureName(picture.index, picture.name), complete })}
            >
              {idx === 0 ? (
                <Target id="gallery-picture" style={styles.targetFill}>
                  <Image source={{ uri: pictureUri(picture.index, pieces, 8) }} style={styles.image} />
                </Target>
              ) : (
                <Image source={{ uri: pictureUri(picture.index, pieces, 8) }} style={styles.image} />
              )}
              <Text style={styles.name} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.75}>
                {pictureName(picture.index, picture.name)}
              </Text>
              {complete ? (
                <View style={styles.doneRow}>
                  <Icon name="check-circle" size={16} color={colors.green} />
                  <Text style={styles.doneText}>{t('gallery.complete')}</Text>
                </View>
              ) : (
                <View style={styles.progressWrap}>
                  <View style={styles.track}>
                    <View style={[styles.fill, { width: `${(pieces / PIECES) * 100}%` }]} />
                  </View>
                  <Text style={styles.count}>
                    {pieces}/{PIECES}
                  </Text>
                </View>
              )}
            </Card3D>
          ))}
          {upcoming.map(({ picture }) => (
            <Card3D key={picture.index} style={styles.cell} innerStyle={styles.cellInner} face={colors.surfaceEdge}>
              <View style={[styles.image, styles.locked]}>
                <Icon name="lock" size={30} color={colors.textMuted} />
                <Text style={styles.question}>?</Text>
              </View>
              <Text style={[styles.name, { color: colors.textMuted }]}>{t('gallery.soon')}</Text>
              <Text style={styles.count}>{t('gallery.keepPlaying')}</Text>
            </Card3D>
          ))}
        </ScrollView>
        <TopFade />
      </View>

      <Modal visible={open !== null} transparent animationType="fade" onRequestClose={() => setOpen(null)}>
        <Pressable style={styles.modalBack} onPress={() => setOpen(null)}>
          {open && (
            <Animated.View entering={FadeIn.duration(200)} style={styles.modalCard}>
              <Image source={{ uri: pictureUri(open.index, open.pieces, 16) }} style={styles.big} />
              <Text style={styles.bigName}>{open.name}</Text>
              {!open.complete && (
                <Text style={styles.count}>
                  {t('gallery.revealed', { pieces: open.pieces, total: PIECES })}
                </Text>
              )}
            </Animated.View>
          )}
          {open?.complete && <Confetti width={width} height={height} />}
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  summary: { alignItems: 'center', paddingHorizontal: MARGIN, paddingBottom: 8 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.gold },
  badgeText: { color: colors.ink, fontSize: fontSizes.sm, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, paddingHorizontal: MARGIN, paddingTop: 12 },
  cell: { width: '47%', flexGrow: 1 },
  targetFill: { alignSelf: 'stretch' },
  cellInner: { alignItems: 'center', gap: 6, padding: 10 },
  image: { width: '100%', aspectRatio: 1, borderRadius: radius.sm },
  locked: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgDeep, flexDirection: 'row', gap: 6 },
  question: { color: colors.textMuted, fontSize: fontSizes.xl, fontWeight: '700' },
  name: { color: colors.text, fontSize: fontSizes.sm, fontWeight: '700' },
  doneRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  doneText: { color: colors.green, fontSize: fontSizes.xs, fontWeight: '700' },
  progressWrap: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: 8 },
  track: { flex: 1, height: 7, borderRadius: 4, backgroundColor: colors.bgDeep, overflow: 'hidden' },
  fill: { height: 7, borderRadius: 4, backgroundColor: colors.gold },
  count: { color: colors.textSoft, fontSize: fontSizes.xs, fontWeight: '600' },
  modalBack: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(8, 5, 18, 0.88)', padding: 24 },
  modalCard: { width: '100%', alignItems: 'center', gap: 12 },
  big: { width: '100%', aspectRatio: 1, borderRadius: radius.lg },
  bigName: { color: colors.text, fontSize: fontSizes.xl, fontWeight: '700' },
});
