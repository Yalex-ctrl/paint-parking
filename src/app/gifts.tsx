/* eslint-disable react-hooks/purity -- the handlers read the clock when they are called, not while the screen renders (the React Compiler is not enabled). */
import { itemLabel, itemName } from '@/i18n/names';
import { useScreenReady } from '@/ui/useScreenReady';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChestOpening } from '@/components/LevelResult';
import { FreeCoinsButton } from '@/components/FreeCoins';
import { RewardBurst } from '@/components/RewardBurst';
import { VipExpiredCard, useOpenVip } from '@/components/VipCards';
import { Wheel, type WheelFace, type WheelHandle } from '@/components/Wheel';
import { livesOn } from '@/config/features';
import { MONETIZATION } from '@/config/monetization';
import { claimDailyReward, dailyRewardStatus, rewardForDay } from '@/game/daily';
import { dayKeyOf } from '@/game/dates';
import { equipItem, owns } from '@/game/economy';
import { formatDuration, msUntilMidnight } from '@/game/duration';
import { createRng } from '@/game/rng';
import { secondsToNextChest ,
  adBonuses,
  applyWheelPrize,
  claimAdBonus,
  doubleChestCoins,
  drawWheel,
  openChest,
  playChests,
  registerUnlockAd,
  rewardedAdsLeft,
  rolloverRewards,
  unlockStatus,
  wheelSlots,
  wheelStatus,
} from '@/game/rewards';

import { itemById } from '@/game/shopItems';
import { canClaimVipDaily, isVip } from '@/game/vip';
import { t, useLanguage } from '@/i18n';
import { claimVipBonus } from '@/services/subscription';
import { ShopPreview } from '@/render/ShopPreview';
import { ads } from '@/services/ads';
import { track } from '@/services/analytics';
import { playSfx } from '@/services/audio';
import { Haptics, notify } from '@/services/haptics';
import { livePlaySeconds } from '@/services/playTime';
import { getProfile, updateProfile, useProfile } from '@/storage/profile';
import { Target } from '@/tour/targets';
import { Button3D } from '@/ui/Button3D';
import { Card3D } from '@/ui/Card3D';
import { CoinAmount, CoinIcon } from '@/ui/CoinIcon';
import { Icon } from '@/ui/Icon';
import { ScreenHeader, TopFade } from '@/ui/ScreenHeader';
import { Text } from '@/ui/Text';
import { MARGIN, colors, fontSizes } from '@/ui/theme';

/** A clock that ticks every second while the panel is open (the countdowns and the gauge of play time). */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

const SLICE_COLORS = ['#ef476f', '#ffd166', '#06d6a0', '#118ab2', '#9b5de5', '#f78c6b', '#4cc9f0', '#ff9f1c'];

/** The reason a rewarded button cannot be used now (or null when it can). */
const adCapReason = (left: number): string | null => (left <= 0 ? t('common.tomorrow') : null);

/** Where the coins come from and fly to the counter at the top. */
type Burst = { key: number; total: number; x: number; y: number };

export default function GiftsScreen() {
  useScreenReady('/gifts');
  useLanguage();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const profile = useProfile();
  const now = useNow();
  const today = dayKeyOf(new Date(now));
  const openVip = useOpenVip();
  const [burst, setBurst] = useState<Burst | null>(null);
  const [chest, setChest] = useState<{ index: number; coins: number; doubled: boolean } | null>(null);

  // The panel always shows today's counters (midnight has come and gone: yesterday's are lost).
  useEffect(() => {
    updateProfile((p) => rolloverRewards(p, today));
  }, [today]);

  const fly = (total: number, y = height * 0.45) => setBurst({ key: Date.now(), total, x: width / 2, y });
  const adsLeft = rewardedAdsLeft(profile.rewards);
  const capped = adCapReason(adsLeft);

  /* ---------------------------------------------------------------- the daily reward */
  const daily = dailyRewardStatus(profile, today);
  const claimDaily = (doubled: boolean) => {
    const result = claimDailyReward(profile, today, doubled);
    if (!result) return;
    updateProfile(() => result.profile);
    playSfx('purchase');
    fly(result.reward.coins);
  };
  const claimDailyDoubled = () => ads.showRewarded('daily_reward_double').then((ok) => ok && claimDaily(true));

  /* ---------------------------------------------------------------- the wheel */
  const wheel = useRef<WheelHandle>(null);
  const [spinning, setSpinning] = useState(false);
  const [wheelResult, setWheelResult] = useState<string | null>(null);
  const pendingPrize = useRef<number | null>(null);
  const vip = isVip(profile.vip, now);
  const wheelNow = wheelStatus(profile.rewards, vip);
  const slots = useMemo(() => wheelSlots(livesOn()), []);
  const faces: WheelFace[] = slots.map((s, i) => ({ label: s.kind === 'coins' ? String(s.amount) : s.kind === 'hint' ? '?' : '∞', color: SLICE_COLORS[i % SLICE_COLORS.length] }));
  const finishSpin = (slot: number) => {
    pendingPrize.current = null;
    const applied = applyWheelPrize(profile, slot, livesOn(), Date.now());
    // The lives slot touches the profile's lives; it is all in the one profile returned.
    updateProfile((p) => applyWheelPrize(p, slot, livesOn(), Date.now()).profile);
    notify(Haptics.NotificationFeedbackType.Success);
    playSfx('win');
    const prize = applied.prize;
    setWheelResult(prize.kind === 'coins' ? t('gifts.prize.coins', { count: prize.amount }) : prize.kind === 'hint' ? t('gifts.prize.hint') : prize.amount > 10 ? t('gifts.prize.infinite', { count: prize.amount }) : t('gifts.prize.lives', { count: prize.amount }));
    if (prize.kind === 'coins') fly(prize.amount, height * 0.4);
    setSpinning(false);
  };
  useEffect(
    () => () => {
      // Left in the middle of a spin: the prize drawn is still given.
      if (pendingPrize.current !== null) {
        const slot = pendingPrize.current;
        pendingPrize.current = null;
        updateProfile((p) => applyWheelPrize(p, slot, livesOn(), Date.now()).profile);
      }
    },
    [],
  );
  const spin = async () => {
    if (spinning || wheelNow.next === 'none') return;
    if (wheelNow.next === 'ad') {
      const ok = await ads.showRewarded('wheel_spin');
      if (!ok) return;
    }
    // The result is drawn BEFORE the wheel turns; the animation ends on it.
    const slot = drawWheel(createRng((Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0), livesOn());
    pendingPrize.current = slot;
    setSpinning(true);
    setWheelResult(null);
    wheel.current?.spin(slot, () => finishSpin(slot));
  };

  /* ---------------------------------------------------------------- the chests of play time */
  const playSeconds = Math.max(profile.rewards.playSeconds, livePlaySeconds());
  const chests = playChests({ ...profile.rewards, playSeconds });
  const lastTier = MONETIZATION.rewards.playChests.tiers[MONETIZATION.rewards.playChests.tiers.length - 1].minutes * 60;
  const openPlayChest = (index: number) => {
    const opened = openChest(profile, index);
    if (!opened) return;
    updateProfile(() => opened.profile);
    setChest({ index, coins: opened.coins, doubled: false });
  };
  const doubleChest = async () => {
    if (!chest || chest.doubled) return;
    const ok = await ads.showRewarded('playtime_chest_x2');
    if (!ok) return;
    updateProfile((p) => doubleChestCoins(p, chest.coins));
    fly(chest.coins);
    setChest({ ...chest, doubled: true });
  };

  /* ---------------------------------------------------------------- the bonus of the ads of the day */
  const bonuses = adBonuses(profile.rewards);
  const takeBonus = (index: number) => {
    const r = claimAdBonus(profile, index);
    if (!r) return;
    updateProfile(() => r.profile);
    track('ad_milestone_claimed', { ads: bonuses[index].ads });
    playSfx('purchase');
    fly(r.coins, height * 0.5);
  };

  /* ---------------------------------------------------------------- the exclusive item won with ads */
  const unlock = unlockStatus(profile.rewards, now);
  const [unlocked, setUnlocked] = useState<string | null>(null);
  const watchForUnlock = async () => {
    if (!unlock.available || capped) return;
    const ok = await ads.showRewarded('ad_unlock');
    if (!ok) return;
    const r = registerUnlockAd(getFreshProfile(), Date.now());
    if (!r) return;
    updateProfile(() => r.profile);
    if (r.unlocked) {
      setUnlocked(r.unlocked);
      notify(Haptics.NotificationFeedbackType.Success);
      playSfx('world');
    } else playSfx('purchase');
  };
  const wornItem = unlocked ? itemById(unlocked) : undefined;

  const bonusFraction = Math.min(1, profile.rewards.adsToday / bonuses[bonuses.length - 1].ads);

  return (
    <View style={styles.root}>
      <ScreenHeader title={t('hud.gifts')} />
      <View style={styles.flex}>
        <ScrollView contentContainerStyle={{ gap: 14, paddingHorizontal: MARGIN, paddingTop: 12, paddingBottom: insets.bottom + 28 }} showsVerticalScrollIndicator={false}>
          {/* 1. The daily reward */}
          <Target id="gifts-panel">
          <Card3D innerStyle={styles.card}>
            <Text style={styles.kicker}>{t('daily.reward.kicker')}</Text>
            <View style={styles.days}>
              {[1, 2, 3, 4, 5, 6, 7].map((d) => {
                const payout = rewardForDay(profile, d);
                const done = d < daily.day || (!daily.available && d === daily.day);
                const active = d === daily.day && daily.available;
                return (
                  <View key={d} style={[styles.day, active && styles.dayActive, done && styles.dayDone]}>
                    <Text style={[styles.dayLabel, active && { color: colors.ink }]}>J{d}</Text>
                    {done ? <Icon name="check-bold" size={16} color={colors.text} /> : payout.skin ? <Icon name="gift" size={16} color={active ? colors.ink : colors.gold} /> : <Text style={[styles.dayValue, active && { color: colors.ink }]}>{payout.coins}</Text>}
                  </View>
                );
              })}
            </View>
            {daily.available ? (
              <View style={styles.row}>
                <Button3D style={styles.flex} block variant="primary" label={t('common.claim')} onPress={() => claimDaily(false)} />
                {!rewardForDay(profile, daily.day).skin && <Button3D style={styles.flex} block variant="success" icon="movie-open" label={capped ?? t('common.doubleWithAd')} disabled={!!capped} onPress={claimDailyDoubled} />}
              </View>
            ) : (
              <Text style={styles.muted}>{t('gifts.nextRewardIn', { time: formatDuration(msUntilMidnight(now)) })}</Text>
            )}
          </Card3D>
          </Target>

          <VipExpiredCard />

          {/* 1b. The VIP bonus of the day (or the locked row that opens the paywall) */}
          {vip ? (
            <Card3D innerStyle={styles.card}>
              <View style={styles.vipHead}>
                <Icon name="crown" size={24} color={colors.gold} />
                <Text style={styles.kicker}>{t('vip.daily.title').toUpperCase()}</Text>
              </View>
              <Button3D
                block
                variant={canClaimVipDaily(profile, today, now) ? 'primary' : 'neutral'}
                disabled={!canClaimVipDaily(profile, today, now)}
                label={canClaimVipDaily(profile, today, now) ? t('vip.daily.take', { count: MONETIZATION.vip.dailyCoins }) : t('vip.daily.taken')}
                onPress={() => {
                  const coins = claimVipBonus();
                  if (coins) {
                    playSfx('purchase');
                    fly(coins);
                  }
                }}
              />
            </Card3D>
          ) : (
            <Card3D innerStyle={styles.card}>
              <View style={styles.vipHead}>
                <Icon name="crown" size={24} color={colors.textMuted} />
                <Text style={[styles.kicker, { color: colors.textSoft }]}>{t('vip.daily.locked', { count: MONETIZATION.vip.dailyCoins })}</Text>
              </View>
              <Button3D block variant="secondary" icon="lock" label={t('vip.daily.unlock')} onPress={() => openVip('cadeaux')} />
            </Card3D>
          )}

          {/* 2. The wheel of fortune */}
          <Card3D innerStyle={[styles.card, { alignItems: 'center' }]}>
            <Text style={styles.kicker}>{t('gifts.wheel')}</Text>
            <Wheel ref={wheel} faces={faces} />
            {wheelResult && (
              <Animated.View entering={FadeIn.duration(200)}>
                <Text style={styles.result}>{wheelResult}</Text>
              </Animated.View>
            )}
            <Button3D
              block
              variant={wheelNow.next === 'none' ? 'neutral' : 'primary'}
              icon={wheelNow.next === 'ad' ? 'movie-open' : 'rotate-right'}
              label={spinning ? t('gifts.spinning') : wheelNow.next === 'free' ? t('gifts.spinFree') : wheelNow.next === 'ad' ? (capped ?? t('gifts.spinAd')) : t('gifts.freeSpinIn', { time: formatDuration(msUntilMidnight(now)) })}
              disabled={spinning || wheelNow.next === 'none' || (wheelNow.next === 'ad' && !!capped)}
              onPress={spin}
            />
            <Text style={styles.muted}>{vip ? t('gifts.spinsVip') : t('gifts.spinsRule')}</Text>
          </Card3D>

          {/* 3. The chests of play time */}
          <Card3D innerStyle={styles.card}>
            <Text style={styles.kicker}>{t('gifts.chests')}</Text>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${Math.min(100, (playSeconds / lastTier) * 100)}%` }]} />
            </View>
            <Text style={styles.muted}>
              {t('gifts.playedToday', { played: Math.min(Math.floor(playSeconds / 60), MONETIZATION.rewards.playChests.tiers[2].minutes), total: MONETIZATION.rewards.playChests.tiers[2].minutes })}
            </Text>
            <View style={styles.row}>
              {chests.map((c) => (
                <View key={c.index} style={styles.chestCell}>
                  <Button3D
                    round
                    size="sm"
                    variant={c.ready ? 'primary' : 'neutral'}
                    icon={c.opened ? 'treasure-chest-outline' : 'treasure-chest'}
                    disabled={!c.ready}
                    onPress={() => openPlayChest(c.index)}
                  />
                  <Text style={styles.chestLabel}>{t('time.minutes', { m: c.minutes })}</Text>
                  <View style={styles.inline}>
                    <Text style={styles.chestLabel}>{c.coins}</Text>
                    <CoinIcon size={12} />
                  </View>
                  {c.opened && <Text style={styles.done}>{t('gifts.opened')}</Text>}
                </View>
              ))}
            </View>
            {secondsToNextChest({ ...profile.rewards, playSeconds }) !== null && <Text style={styles.next}>{t('gifts.moreMinutes', { count: Math.max(1, Math.ceil(secondsToNextChest({ ...profile.rewards, playSeconds })! / 60)) })}</Text>}
            {chests.some((c) => c.ready && !c.opened) && <Text style={styles.warn}>{t('gifts.endsIn', { time: formatDuration(msUntilMidnight(now)) })}</Text>}
            <Text style={styles.muted}>{t('gifts.chestsRule')}</Text>
            {new Date(now).getHours() >= MONETIZATION.rewards.reminderHour && chests.some((c) => c.ready) && <Text style={styles.warn}>{t('gifts.chestsReminder')}</Text>}
          </Card3D>

          {/* 4. The bonus of the ads of the day */}
          <Card3D innerStyle={styles.card}>
            <Text style={styles.kicker}>{t('gifts.adBonus')}</Text>
            <View style={styles.bonusBar}>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${bonusFraction * 100}%` }]} />
              </View>
              <View style={styles.bonusChests} pointerEvents="box-none">
                {bonuses.map((b) => (
                  <View key={b.index} style={[styles.bonusChest, { left: `${(b.ads / bonuses[bonuses.length - 1].ads) * 100}%` }]}>
                    <Button3D round size="xs" variant={b.reached && !b.taken ? 'primary' : 'neutral'} icon={b.taken ? 'treasure-chest-outline' : 'treasure-chest'} disabled={!b.reached || b.taken} onPress={() => takeBonus(b.index)} />
                    <Text style={styles.chestLabel}>{b.coins}</Text>
                  </View>
                ))}
              </View>
            </View>
            <Text style={styles.muted}>
              {t('gifts.adsToday', { done: profile.rewards.adsToday, total: bonuses[bonuses.length - 1].ads })}
            </Text>
            <Text style={styles.muted}>{t('gifts.endsIn', { time: formatDuration(msUntilMidnight(now)) })}</Text>
          </Card3D>

          {/* 5. Free coins */}
          <Card3D innerStyle={styles.card}>
            <Text style={styles.kicker}>{t('freeCoins.title').toUpperCase()}</Text>
            <FreeCoinsButton onClaimed={(coins) => fly(coins)} />
          </Card3D>

          {/* 6. The exclusive item to win with ads */}
          {unlock.active && unlock.itemId && (
            <Card3D innerStyle={styles.card}>
              <Text style={styles.kicker}>{t('gifts.unlockKicker')}</Text>
              <View style={styles.preview}>
                <ShopPreview ball={itemById(unlock.itemId)?.kind === 'ball' ? unlock.itemId : profile.equipped.ball} paint={itemById(unlock.itemId)?.kind === 'paint' ? unlock.itemId : profile.equipped.paint} />
              </View>
              <Text style={styles.itemName}>
                {itemLabel(unlock.itemId)}
              </Text>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${(unlock.ads / unlock.needed) * 100}%` }]} />
              </View>
              <Text style={styles.muted}>
                {t('gifts.unlockProgress', { done: unlock.ads, total: unlock.needed })}
              </Text>
              <Button3D
                block
                variant={unlock.available && !capped ? 'primary' : 'neutral'}
                icon="movie-open"
                label={capped ?? (unlock.waitMs > 0 ? t('gifts.nextAdIn', { time: formatDuration(unlock.waitMs) }) : t('common.watchAd'))}
                disabled={!unlock.available || !!capped}
                onPress={watchForUnlock}
              />
              <Text style={styles.muted}>{t('gifts.unlockRule', { count: MONETIZATION.rewards.adUnlock.minIntervalMin })}</Text>
            </Card3D>
          )}
          {profile.rewards.unlock.won.length > 0 && (
            <Text style={styles.muted}>
              {t('gifts.wonWithAds', { names: profile.rewards.unlock.won.map((id) => itemName(id)).join(', ') })}
            </Text>
          )}
        </ScrollView>
        <TopFade />
      </View>

      {/* The unlock of an item: it appears, with "Équiper". */}
      {wornItem && (
        <Animated.View entering={FadeIn.duration(250)} style={styles.overlay}>
          <Card3D innerStyle={[styles.card, { alignItems: 'center', width: 300 }]}>
            <Text style={styles.kicker}>{t('gifts.unlocked')}</Text>
            <View style={styles.preview}>
              <ShopPreview ball={wornItem.kind === 'ball' ? wornItem.id : profile.equipped.ball} paint={wornItem.kind === 'paint' ? wornItem.id : profile.equipped.paint} />
            </View>
            <Text style={styles.itemName}>{itemLabel(wornItem.id)}</Text>
            {owns(profile, wornItem.id) && (
              <Button3D
                block
                variant="primary"
                label={t('shop.equip')}
                onPress={() => {
                  const next = equipItem(getFreshProfile(), wornItem.id);
                  if (next) updateProfile(() => next);
                  setUnlocked(null);
                }}
              />
            )}
            <Button3D block variant="neutral" label={t('common.later')} onPress={() => setUnlocked(null)} />
          </Card3D>
        </Animated.View>
      )}

      {/* A chest of play time opening, then the "x2" for an ad. */}
      {chest && (
        <ChestSheet
          chest={chest}
          capped={capped}
          onClose={() => {
            fly(chest.coins, height * 0.45);
            setChest(null);
          }}
          onDouble={doubleChest}
        />
      )}

      {burst && <RewardBurst key={burst.key} total={burst.total} count={Math.min(9, Math.max(3, burst.total))} showLabel={false} from={{ x: burst.x, y: burst.y }} to={{ x: 70, y: insets.top + 36 }} />}
    </View>
  );
}

// The latest profile (after an ad has been watched): the one in the store, not the one of the render.
const getFreshProfile = getProfile;

/** The chest opening (it falls, shakes, opens), then what it holds and the "x2" button. */
function ChestSheet({ chest, capped, onClose, onDouble }: { chest: { index: number; coins: number; doubled: boolean }; capped: string | null; onClose: () => void; onDouble: () => void }) {
  const [stage, setStage] = useState<'chest' | 'card'>('chest');
  const pop = useSharedValue(0);
  useEffect(() => {
    if (stage === 'card') pop.set(withRepeat(withSequence(withTiming(1, { duration: 500 }), withTiming(0, { duration: 500 })), -1));
  }, [stage, pop]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: 1 + pop.get() * 0.06 }] }));
  if (stage === 'chest') return <ChestOpening onDone={() => setStage('card')} />;
  return (
    <Animated.View entering={FadeIn.duration(200)} style={styles.overlay}>
      <Card3D innerStyle={[styles.card, { alignItems: 'center', width: 300 }]}>
        <Text style={styles.kicker}>{t('gifts.chest')}</Text>
        <Animated.View style={style}>
          <CoinAmount amount={`+${chest.doubled ? chest.coins * 2 : chest.coins}`} size={40} textStyle={{ color: colors.coin }} />
        </Animated.View>
        {!chest.doubled && <Button3D block variant="success" icon="movie-open" label={capped ?? t('common.doubleWithAd')} disabled={!!capped} onPress={onDouble} />}
        <Button3D block variant="primary" label={t('common.great')} onPress={onClose} />
      </Card3D>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  next: { color: colors.gold, fontSize: fontSizes.sm, fontWeight: '800', textAlign: 'center' },
  vipHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  card: { gap: 10, padding: 14 },
  kicker: { color: colors.gold, fontSize: fontSizes.xs, fontWeight: '800', letterSpacing: 2 },
  muted: { color: colors.textSoft, fontSize: fontSizes.xs, textAlign: 'center' },
  warn: { color: colors.flameLight, fontSize: fontSizes.sm, fontWeight: '800', textAlign: 'center' },
  result: { color: colors.coin, fontSize: fontSizes.xl, textAlign: 'center' },
  row: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', justifyContent: 'space-around' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  days: { flexDirection: 'row', gap: 6 },
  day: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 56, paddingVertical: 8, borderRadius: 12, backgroundColor: colors.surfaceHi },
  dayActive: { backgroundColor: colors.gold },
  dayDone: { backgroundColor: colors.greenDeep },
  dayLabel: { color: colors.textSoft, fontSize: fontSizes.xs, fontWeight: '700' },
  dayValue: { color: colors.text, fontSize: fontSizes.sm, fontWeight: '700' },
  track: { height: 12, borderRadius: 6, backgroundColor: 'rgba(0, 0, 0, 0.3)', overflow: 'hidden', alignSelf: 'stretch' },
  fill: { height: 12, borderRadius: 6, backgroundColor: colors.coin },
  chestCell: { alignItems: 'center', gap: 3, minWidth: 70 },
  chestLabel: { color: colors.text, fontSize: fontSizes.xs, fontWeight: '800' },
  done: { color: colors.green, fontSize: fontSizes.xs, fontWeight: '800' },
  bonusBar: { height: 70, justifyContent: 'center', paddingHorizontal: 18 },
  bonusChests: { position: 'absolute', left: 18, right: 18, top: 0, bottom: 0 },
  bonusChest: { position: 'absolute', top: 12, marginLeft: -17, alignItems: 'center', gap: 2 },
  btnText: { color: colors.onGold, fontSize: fontSizes.md, fontWeight: '800' },
  preview: { height: 130, alignSelf: 'stretch', borderRadius: 14, overflow: 'hidden' },
  itemName: { color: colors.text, fontSize: fontSizes.lg, fontWeight: '700', textAlign: 'center' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.overlay },
});

