import { itemLabel, itemName } from '@/core/i18n/names';
import { formatDate , t, useLanguage } from '@/core/i18n';

import { useScreenReady } from '@/core/ui/useScreenReady';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MONETIZATION } from '@/core/config/monetization';
import { dailyCoins, monthCalendar, saveStreak, streakStatus } from '@/core/daily';
import { peekEarning } from '@/core/economy';
import { dayKeyOf, parseDay } from '@/core/dates';
import { dailyLoadout, loadoutText } from '@/core/dailyLoadout';
import { dailyLevelForDay } from '@/game/dailyLevels';
import { useThumbnail } from '@/core/render/useThumbnail';
import { ads } from '@/core/services/ads';
import { updateProfile, useProfile } from '@/core/storage/profile';
import { Button3D } from '@/core/ui/Button3D';
import { Card3D } from '@/core/ui/Card3D';
import { CoinAmount } from '@/core/ui/CoinIcon';
import { Icon } from '@/core/ui/Icon';
import { msUntilMidnight } from '@/core/duration';
import { Countdown } from '@/core/ui/Countdown';
import { Target } from '@/core/tour/targets';
import { ScreenHeader, TopFade } from '@/core/ui/ScreenHeader';
import { Text } from '@/core/ui/Text';
import { MARGIN, colors, fontSizes } from '@/core/ui/theme';

/** The initials of the week, Monday first (a Monday is 2024-01-01), in the language on screen. */
const weekdayInitials = (): string[] => Array.from({ length: 7 }, (_, i) => formatDate(new Date(2024, 0, 1 + i), { weekday: 'narrow' }).toUpperCase());

/** "Défi du jour": the date, the theme of the day and the ball and the paint it is played with. */
function DailyIntro({ day }: { day: string }) {
  const kit = dailyLoadout(day);
  const ball = useThumbnail('ball', kit.ball.id);
  const paint = useThumbnail('paint', kit.paint.id);
  const { year, month, day: dom } = parseDay(day);
  const shape = dailyLevelForDay(day).shape;
  return (
    <Card3D innerStyle={styles.intro}>
      <Text style={styles.introKicker}>{t('daily.kicker')}</Text>
      <Text style={styles.introDate}>
        {formatDate(new Date(year, month - 1, dom), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
      </Text>
      <Text style={styles.introTheme}>{t('daily.theme', { name: t(`daily.shapes.${shape}`) })}</Text>
      <View style={styles.introKit}>
        <View style={styles.introItem}>
          {ball ? <Image source={{ uri: ball }} style={styles.introImage} /> : <View style={styles.introImage} />}
          <Text style={styles.introName}>{itemLabel(kit.ball.id)}</Text>
        </View>
        <Text style={styles.introPlus}>+</Text>
        <View style={styles.introItem}>
          {paint ? <Image source={{ uri: paint }} style={styles.introImage} /> : <View style={styles.introImage} />}
          <Text style={styles.introName}>{itemLabel(kit.paint.id)}</Text>
        </View>
      </View>
      <Text style={styles.introText}>{loadoutText(kit)}</Text>
    </Card3D>
  );
}

export default function DailyScreen() {
  useScreenReady('/daily');
  useLanguage();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const profile = useProfile();
  const [saving, setSaving] = useState(false);

  const today = dayKeyOf(new Date());
  // The next challenge comes at midnight: a saved time, so the countdown is right after the app was in the background.
  const [nextDayAt] = useState(() => Date.now() + msUntilMidnight(Date.now()));
  const { year, month } = parseDay(today);
  const status = streakStatus(profile, today);
  const weeks = monthCalendar(profile.daily.completed, today, year, month);

  const nextStreak = status.doneToday ? status.streak : status.streak + 1;
  const milestones = Object.entries(MONETIZATION.daily.skinMilestones)
    .map(([days, id]) => ({ days: Number(days), id }))
    .filter((m) => m.days >= nextStreak || !profile.owned.includes(m.id));

  const save = async () => {
    if (saving) return;
    setSaving(true);
    const ok = await ads.showRewarded(MONETIZATION.daily.saveStreakAdPlacement);
    if (ok) updateProfile((p) => saveStreak(p, today) ?? p);
    setSaving(false);
  };

  return (
    <View style={styles.root}>
      <ScreenHeader title={t('hud.dailyTitle')} />
      <View style={styles.flex}>
        <ScrollView
          contentContainerStyle={{ gap: 14, paddingHorizontal: MARGIN, paddingTop: 12, paddingBottom: insets.bottom + 28 }}
          showsVerticalScrollIndicator={false}
        >
          <DailyIntro day={today} />
          <Target id="daily-card">
          <Card3D innerStyle={styles.streakCard}>
            <View style={[styles.flameWrap, status.doneToday && { backgroundColor: colors.greenDeep }]}>
              <Icon name={status.doneToday ? 'check-bold' : 'fire'} size={36} color={colors.text} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.streakTitle}>
                {t('daily.streak', { count: status.streak })}
              </Text>
              {status.doneToday ? (
                <>
                  <Text style={styles.streakSub}>{t('daily.doneToday')}</Text>
                  <Countdown until={nextDayAt} prefix={`${t('daily.newIn')} `} style={styles.streakSub} />
                </>
              ) : status.atRisk ? (
                <Text style={styles.streakSub}>{t('daily.atRisk')}</Text>
              ) : (
                <View style={styles.reward}>
                  <Text style={styles.streakSub}>{t('daily.rewardLabel')}</Text>
                  <CoinAmount amount={peekEarning(profile, dailyCoins(nextStreak))} size={15} />
                </View>
              )}
              <Text style={styles.streakSub}>
                {t('daily.best', { count: profile.daily.best })}
              </Text>
            </View>
          </Card3D>
          </Target>

          {status.canSave && (
            <Card3D innerStyle={styles.saveCard} face={colors.surfaceHi}>
              <Text style={styles.saveText}>{t('daily.canSave', { count: status.lostStreak })}</Text>
              <Button3D block variant="success" icon="play-circle-outline" label={t('daily.saveStreak')} onPress={save} />
            </Card3D>
          )}

          {!status.doneToday && (
            <Button3D
              block
              size="lg"
              variant="primary"
              icon="flag-checkered"
              label={t('daily.play')}
              onPress={() => router.dismissTo({ pathname: '/', params: { daily: '1' } })}
            />
          )}

          <Target id="daily-calendar">
          <Card3D innerStyle={styles.calendar}>
            <Text style={styles.month}>
              {formatDate(new Date(year, month - 1, 1), { month: 'long', year: 'numeric' })}
            </Text>
            <View style={styles.week}>
              {weekdayInitials().map((d, i) => (
                <Text key={i} style={styles.weekday}>
                  {d}
                </Text>
              ))}
            </View>
            {weeks.map((week, w) => (
              <View key={w} style={styles.week}>
                {week.map((cell, i) =>
                  cell ? (
                    <View key={i} style={[styles.day, cell.done && styles.dayDone, cell.today && styles.dayToday]}>
                      {cell.done ? <Icon name="check-bold" size={16} color={colors.text} /> : <Text style={[styles.dayText, cell.future && { opacity: 0.4 }]}>{cell.day}</Text>}
                    </View>
                  ) : (
                    <View key={i} style={styles.day} />
                  ),
                )}
              </View>
            ))}
          </Card3D>
          </Target>

          {milestones.length > 0 && (
            <Card3D innerStyle={styles.rewards}>
              <Text style={styles.rewardsTitle}>{t('daily.exclusiveBalls')}</Text>
              {milestones.map((m) => {
                const have = profile.owned.includes(m.id);
                return (
                  <View key={m.id} style={styles.rewardLine}>
                    <Icon name={have ? 'check-circle' : 'lock'} size={20} color={have ? colors.green : colors.textMuted} />
                    <Text style={styles.rewardText}>
                      {t('daily.milestone', { name: itemName(m.id), count: m.days })}
                    </Text>
                  </View>
                );
              })}
            </Card3D>
          )}
        </ScrollView>
        <TopFade />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  intro: { alignItems: 'center', gap: 6, padding: 14 },
  introKicker: { color: colors.gold, fontSize: fontSizes.xs, fontWeight: '800', letterSpacing: 2 },
  introDate: { color: colors.text, fontSize: fontSizes.lg, fontWeight: '700', textTransform: 'capitalize' },
  introStars: { flexDirection: 'row', gap: 10, justifyContent: 'center' },
  introStar: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.bgDeep, alignItems: 'center', justifyContent: 'center' },
  introToday: { color: colors.text, fontSize: fontSizes.lg, fontWeight: '900', textAlign: 'center' },
  introTheme: { color: colors.textSoft, fontSize: fontSizes.sm, fontWeight: '800' },
  introKit: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 4 },
  introItem: { alignItems: 'center', gap: 4, maxWidth: 130 },
  introImage: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.surfaceHi },
  introName: { color: colors.text, fontSize: fontSizes.xs, fontWeight: '800', textAlign: 'center' },
  introPlus: { color: colors.gold, fontSize: fontSizes.xl, fontWeight: '800' },
  introText: { color: colors.textMuted, fontSize: fontSizes.xs, textAlign: 'center' },
  streakCard: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14 },
  flameWrap: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.flame },
  reward: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  streakTitle: { color: colors.text, fontSize: fontSizes.lg, fontWeight: '700' },
  streakSub: { color: colors.textSoft, fontSize: fontSizes.sm, marginTop: 2 },
  saveCard: { gap: 10, padding: 14 },
  saveText: { color: colors.text, fontSize: fontSizes.sm, textAlign: 'center' },
  calendar: { gap: 6, padding: 14 },
  month: { color: colors.text, fontSize: fontSizes.lg, fontWeight: '700', textTransform: 'capitalize', marginBottom: 4 },
  week: { flexDirection: 'row', gap: 6 },
  weekday: { flex: 1, textAlign: 'center', color: colors.textMuted, fontSize: fontSizes.xs, fontWeight: '700' },
  day: { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  dayDone: { backgroundColor: colors.greenDeep },
  dayToday: { borderWidth: 2, borderColor: colors.gold },
  dayText: { color: colors.text, fontSize: fontSizes.sm, fontWeight: '600' },
  rewards: { gap: 8, padding: 14 },
  rewardsTitle: { color: colors.gold, fontSize: fontSizes.xs, fontWeight: '700', letterSpacing: 1.5 },
  rewardLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rewardText: { color: colors.text, fontSize: fontSizes.sm },
});
