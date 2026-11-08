import { formatNumber, t, useLanguage } from '@/i18n';
import { GiftCaption , GiftButton } from '@/components/GiftButton';
import { useRouter } from 'expo-router';
import { memo, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';


import { HudPop } from '@/components/HudPop';
import { StepBar } from '@/components/StepBar';
import { useFeatures } from '@/config/features';
import { dayKeyOf } from '@/game/dates';
import { streakStatus } from '@/game/daily';
import { fillRatio } from '@/game/piggy';
import { useProfile } from '@/storage/profile';
import { Button3D } from '@/ui/Button3D';
import { CoinIcon } from '@/ui/CoinIcon';
import { LivesPill } from '@/ui/LivesPill';
import { OutlineText } from '@/ui/OutlineText';
import { StreakFlame } from '@/ui/StreakFlame';
import { Target, useTourTarget } from '@/tour/targets';
import { Text } from '@/ui/Text';
import type { IconName } from '@/ui/Icon';
import { colors, fontSizes, fonts, MARGIN } from '@/ui/theme';

/** Height (px) of the rows of the header, and the gap between them: the board is framed below them (see render/prepareCache). */
export const HUD_ROW = 45;
export const HUD_GAP = 8;
/** Width (px) of each of the two side columns of the title row (the same on both sides), normal and on a small phone. */
const SIDE = 120;
const SIDE_TIGHT = 92;

/**
 * Everything above the board, in three rows, all Button3D and pills of the same height, 16 px from the edges, nothing on top of
 * anything:
 *  1. [settings] [daily challenge] ............ [shop] [gallery] [piggy bank] [no ads]
 *  2. left column: lives, its countdown (only while a life is missing), the streak below | Niveau X (moves), centred | right column: coins.
 *     Both columns have the same fixed width, so the title (and the bar under it) stay on the middle axis whatever they hold.
 *  3. the bar of the step: five dots and the chest.
 */
function LevelHudImpl({
  top,
  levelId,
  daily,
  moves,
  shownCoins,
  stars,
  onMenu,
  minimal,
  flameBoost,
}: {
  top: number;
  levelId: number;
  daily: boolean;
  /** What is written under "Niveau X": the number of moves, with its limit (or none). */
  moves: ReactNode;
  shownCoins: number;
  stars: Record<number, number>;
  onMenu: () => void;
  /** The first five levels: only the title and the bar of the steps are there (the tour brings the rest in, see tour/hudStore). */
  minimal: boolean;
  /** Bumped when the streak has just multiplied the gain of a level: the flame does a little animation. */
  flameBoost: number;
}) {
  useLanguage();
  const router = useRouter();
  const profile = useProfile();
  const features = useFeatures();
  // On a small phone (an iPhone SE is 320 wide) everything of the title row is a little tighter, so the title keeps its room.
  const width = useWindowDimensions().width;
  const tight = width < 380;
  // On the smallest phones (320 wide) the step bar is a little smaller, so the stacked pills on the left stay clear of it.
  const narrow = width < 340;
  const dailyTodo = !streakStatus(profile, dayKeyOf(new Date())).doneToday;
  const coinsRef = useTourTarget('coins');
  return (
    <View style={[styles.wrap, { top }]} pointerEvents="box-none">
      <View style={styles.row} pointerEvents="box-none">
        <View style={styles.cluster}>
          <HudButton hud="menu" index={0} minimal={minimal} icon="menu" onPress={onMenu} />
          <HudButton hud="daily" index={1} minimal={minimal} id="daily" icon="calendar-star" label={t('hud.daily')} dot={dailyTodo} onPress={() => router.push('/daily')} />
        </View>
        <View style={styles.cluster}>
          <HudButton hud="shop" index={2} minimal={minimal} id="shop" icon="shopping" label={t('hud.shop')} onPress={() => router.push('/shop')} />
          <HudButton hud="gallery" index={3} minimal={minimal} id="gallery" icon="image-multiple" label={t('hud.gallery')} onPress={() => router.push('/gallery')} />
          <HudPop id="gifts" index={3} minimal={minimal} style={[styles.item, styles.itemLabelled]}>
            <GiftButton onPress={() => router.push('/gifts')} />
            <GiftCaption style={styles.caption} />
          </HudPop>
          <HudButton hud="piggy" index={4} minimal={minimal} id="piggy" icon="piggy-bank" label={t('hud.piggy')} gauge={fillRatio(profile)} onPress={() => router.push('/piggy')} />
        </View>
      </View>

      <View style={styles.titleRow} pointerEvents="box-none">
        <View style={[styles.side, styles.left, tight ? styles.leftTight : null]} pointerEvents="box-none">
          {features.lives && (
            <HudPop id="lives" index={6} minimal={minimal}>
              <Target id="lives">
                <LivesPill compact tight={tight} />
              </Target>
            </HudPop>
          )}
          {!daily && (
            <HudPop id="streak" index={7} minimal={minimal}>
              <Target id="streak">
                <StreakFlame streak={profile.winStreak.current} compact tight={tight} height={tight ? 28 : 32} boost={flameBoost} />
              </Target>
            </HudPop>
          )}
        </View>
        <View style={styles.center} pointerEvents="none">
          <OutlineText style={styles.title} width={2} fit>
            {daily ? t('hud.dailyTitle') : t('hud.level', { id: levelId })}
          </OutlineText>
          {moves}
        </View>
        <View style={[styles.side, styles.right, tight ? styles.rightTight : null]} pointerEvents="box-none">
          <HudPop id="coins" index={8} minimal={minimal}>
            <Pressable ref={coinsRef} collapsable={false} onPress={() => router.push({ pathname: '/shop', params: { tab: 'offers' } })} hitSlop={8} style={[styles.coins, tight ? styles.coinsTight : null]}>
              <CoinIcon size={tight ? 18 : 22} />
              <OutlineText style={styles.coinValue} width={1.5} fit>
                {formatNumber(shownCoins)}
              </OutlineText>
            </Pressable>
          </HudPop>
        </View>
      </View>

      {!daily && (
        <Target id="stepbar" style={[styles.stepTarget, narrow ? styles.stepNarrow : null]}>
          <StepBar levelId={levelId} stars={stars} />
        </Target>
      )}
    </View>
  );
}

/**
 * An icon button of the header with its caption under it (Nunito 800, 10 px, white with a shadow). The row keeps its height: the
 * button is a little smaller and the caption takes the rest.
 */
/**
 * The header is memoized: the screen re-renders for many reasons (a popup, the help, the result of a level...) and the header only
 * needs to change when its own props do, so a level that ends does not rebuild all of it.
 */
export const LevelHud = memo(LevelHudImpl);

function HudButton({
  hud,
  index,
  minimal,
  id,
  icon,
  label,
  dot,
  gauge,
  onPress,
}: {
  /** Its name in the tour's reveal (tour/hudStore), and its place in the cascade. */
  hud: string;
  index: number;
  minimal: boolean;
  id?: string;
  icon: IconName;
  label?: string;
  dot?: boolean;
  gauge?: number;
  onPress: () => void;
}) {
  return (
    <HudPop id={hud} index={index} minimal={minimal} style={[styles.item, label !== undefined && styles.itemLabelled]}>
      <View>
        <Button3D round size="xs" variant="neutral" icon={icon} tourId={id} onPress={onPress} />
        {dot && <View style={styles.dot} pointerEvents="none" />}
        {gauge !== undefined && (
          <View style={styles.gauge} pointerEvents="none">
            <View style={[styles.gaugeFill, { width: `${Math.round(gauge * 100)}%` }]} />
          </View>
        )}
      </View>
      {label !== undefined && (
        <Text style={styles.caption} numberOfLines={1}>
          {label}
        </Text>
      )}
    </HudPop>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: MARGIN, right: MARGIN, gap: HUD_GAP },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', height: HUD_ROW },
  cluster: { flexDirection: 'row', alignItems: 'flex-start', gap: 2 },
  item: { alignItems: 'center' },
  itemLabelled: { width: 46 },
  // (the gift button has a ring a little bigger than a button: it is given its room)
  caption: { color: '#ffffff', fontSize: 10, lineHeight: 11, fontFamily: fonts.label, textShadowColor: 'rgba(0, 0, 0, 0.7)', textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 } },
  stepTarget: { alignSelf: 'center' },
  dot: { position: 'absolute', top: -2, right: -2, width: 14, height: 14, borderRadius: 7, backgroundColor: colors.red, borderWidth: 2, borderColor: colors.bg },
  gauge: { position: 'absolute', left: 7, right: 7, bottom: 8, height: 3, borderRadius: 2, backgroundColor: 'rgba(255, 255, 255, 0.4)', overflow: 'hidden' },
  gaugeFill: { height: 3, backgroundColor: '#ff5fa0' },
  titleRow: { flexDirection: 'row', alignItems: 'center', height: 44, gap: 8 },
  // Three blocks: the two sides have the same fixed width, so the title is exactly in the middle of the screen; it takes what is left
  // between them and shrinks (to 70 %) before it would touch either. The left column is taller than the row (lives, countdown,
  // streak, stacked): it hangs below it, on the left of the step bar.
  side: { height: 44 },
  left: { width: SIDE, alignItems: 'flex-start', gap: 1, paddingTop: 4 },
  leftTight: { width: SIDE_TIGHT, paddingTop: 7 },
  right: { width: SIDE, alignItems: 'flex-end', justifyContent: 'center' },
  rightTight: { width: SIDE_TIGHT },
  stepNarrow: { transform: [{ scale: 0.75 }] },
  center: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: fontSizes.xl, lineHeight: 30 },
  coins: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 10, borderRadius: 18, backgroundColor: 'rgba(18, 12, 34, 0.62)', maxWidth: '100%' },
  coinsTight: { gap: 3, paddingHorizontal: 6, height: 30, borderRadius: 15 },
  coinValue: { fontSize: fontSizes.md },
});
