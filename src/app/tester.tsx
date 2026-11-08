import { Redirect, useRouter } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { freeCameraOn, livesOn, moveLimitOn, openLevelsOn, setFeatureOverride, useFeatures } from '@/core/config/features';
import { MONETIZATION } from '@/core/config/monetization';
import { testerTools } from '@/core/config/tester';
import { earnCoins } from '@/core/economy';
import { shiftTime } from '@/core/testerClock';
import { t, useLanguage } from '@/core/i18n';
import { audioDiagnostic, restartAudio, testSound } from '@/core/services/audio';
import { resetPurchases } from '@/core/services/purchases';
import { devVip } from '@/core/services/subscription';
import { devEmpty, devRefill, devSkip30, devToggleInfinite } from '@/core/storage/lives';
import { updateProfile } from '@/core/storage/profile';
import { replayTutorial } from '@/core/storage/reset';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from '@/core/storage/settings';
import { replayTour } from '@/core/tour/replay';
import { Button3D } from '@/core/ui/Button3D';
import { Card3D } from '@/core/ui/Card3D';
import type { IconName } from '@/core/ui/Icon';
import { ScreenHeader, TopFade } from '@/core/ui/ScreenHeader';
import { Text } from '@/core/ui/Text';
import { MARGIN, colors, fontSizes } from '@/core/ui/theme';
import { useScreenReady } from '@/core/ui/useScreenReady';

const DAY_MS = 86_400_000;

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card3D innerStyle={styles.group}>
      <Text style={styles.groupTitle}>{title}</Text>
      {children}
    </Card3D>
  );
}

/** The state of the sound engine, refreshed twice a second: the session, the music, the volumes, the last sound, the players, the errors. */
function AudioDiagnostic() {
  const [d, setD] = useState(audioDiagnostic);
  useEffect(() => {
    const id = setInterval(() => setD(audioDiagnostic()), 500);
    return () => clearInterval(id);
  }, []);
  const ago = d.lastSoundAgoMs < 0 ? '' : ` (${(d.lastSoundAgoMs / 1000).toFixed(1)} s)`;
  const lines = [
    `session: ${d.session} (last revive: ${d.lastRevive})`,
    `music: ${d.musicPlaying ? 'playing' : 'stopped'} (should play: ${d.musicWanted ? 'yes' : 'no'}, level ${d.musicLevel})`,
    `music setting: ${d.musicSetting ? 'on' : 'off'} ${d.musicVolume}   effects setting: ${d.sfxSetting ? 'on' : 'off'} ${d.sfxVolume}`,
    `last sound: ${d.lastSound}${ago}`,
    `players: ${d.players} (rebuilt: ${d.rebuilt})`,
    d.errors.length === 0 ? 'errors: none' : `errors:\n${d.errors.join('\n')}`,
  ];
  return (
    <>
      <Text style={styles.mono}>{lines.join('\n')}</Text>
      <Tool icon="volume-high" label={t('tester.audioTest')} onPress={testSound} />
      <Tool icon="restart" label={t('tester.audioRestart')} onPress={restartAudio} />
    </>
  );
}

function Tool({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return <Button3D block size="sm" variant="neutral" icon={icon} label={label} onPress={onPress} />;
}

/**
 * "Outils de test": everything a tester needs in one place (the levels, the daily challenges, the showcase, the free camera, the bench
 * of the bridge, the economy, the subscription, the clock). Only in the builds that have the tester tools (config/tester.ts): in a
 * production build the route leads nowhere, and nothing in the menus points to it.
 */
export default function TesterScreen() {
  useScreenReady('/tester');
  useLanguage();
  useFeatures();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);
  if (!testerTools()) return <Redirect href="/" />;

  const togglePerf = () => {
    const next = { ...settings, showPerf: !settings.showPerf };
    setSettings(next);
    saveSettings(next);
  };
  const bench = (label: string) => router.dismissTo({ pathname: '/', params: { level: '12', bench: label } });

  return (
    <View style={styles.root}>
      <ScreenHeader title={t('tester.title')} />
      <View style={styles.flex}>
        <ScrollView contentContainerStyle={{ padding: MARGIN, paddingBottom: insets.bottom + 28, gap: 12 }} showsVerticalScrollIndicator={false}>
          <Group title={t('tester.levels')}>
            <Tool icon="flask-outline" label={t('tester.pickLevel')} onPress={() => router.push('/levels')} />
            <Tool icon="calendar-search" label={t('tester.pickDaily')} onPress={() => router.push('/daily-pick')} />
            <Tool icon="lock-open-variant" label={openLevelsOn() ? t('dev.openOn') : t('dev.openOff')} onPress={() => setFeatureOverride({ openLevels: !openLevelsOn() })} />
          </Group>

          <Group title={t('tester.scene')}>
            <Tool icon="cube-outline" label={t('dev.showcase')} onPress={() => router.push('/showcase')} />
            <Tool icon="rotate-3d-variant" label={freeCameraOn() ? t('dev.freeCamOn') : t('dev.freeCamOff')} onPress={() => setFeatureOverride({ freeCamera: !freeCameraOn() })} />
            <Tool icon="timer-sand" label={t('dev.benchBefore')} onPress={() => bench('before')} />
            <Tool icon="timer-sand-complete" label={t('dev.benchAfter')} onPress={() => bench('after')} />
            <Tool icon="speedometer" label={settings.showPerf ? t('dev.hidePerf') : t('dev.showPerf')} onPress={togglePerf} />
          </Group>

          <Group title={t('tester.audio')}>
            <AudioDiagnostic />
          </Group>

          <Group title={t('tester.economy')}>
            <Tool icon="plus" label={t('dev.plus1000')} onPress={() => updateProfile((p) => earnCoins(p, 1000))} />
            <Tool icon="cash-remove" label={t('tester.emptyCoins')} onPress={() => updateProfile((p) => ({ ...p, coins: 0 }))} />
            <Tool icon="piggy-bank" label={t('tester.fillPiggy')} onPress={() => updateProfile((p) => ({ ...p, piggy: { ...p.piggy, coins: MONETIZATION.piggy.capacity } }))} />
            <Tool icon="heart-plus" label={t('dev.refill')} onPress={devRefill} />
            <Tool icon="heart-broken" label={t('dev.empty')} onPress={devEmpty} />
            <Tool icon="infinity" label={t('dev.infinite')} onPress={devToggleInfinite} />
            <Tool icon="heart" label={livesOn() ? t('dev.livesOn') : t('dev.livesOff')} onPress={() => setFeatureOverride({ lives: !livesOn() })} />
            <Tool icon="counter" label={moveLimitOn() ? t('dev.limitOn') : t('dev.limitOff')} onPress={() => setFeatureOverride({ moveLimit: !moveLimitOn() })} />
          </Group>

          <Group title={t('tester.purchases')}>
            <Tool icon="crown" label={t('vip.dev.monthly')} onPress={() => devVip.activate('monthly')} />
            <Tool icon="crown" label={t('vip.dev.yearly')} onPress={() => devVip.activate('yearly')} />
            <Tool icon="timer-off" label={t('vip.dev.expire')} onPress={devVip.expire} />
            <Tool icon="autorenew" label={t('vip.dev.renew')} onPress={devVip.renew} />
            <Tool icon="credit-card-clock" label={t('vip.dev.grace')} onPress={devVip.grace} />
            <Tool icon="restore" label={t('vip.dev.reset')} onPress={devVip.reset} />
            <Tool icon="cart-remove" label={t('tester.resetPurchases')} onPress={() => void resetPurchases()} />
          </Group>

          <Group title={t('tester.guide')}>
            <Tool icon="school" label={t('settings.replayTutorial')} onPress={() => void replayTutorial()} />
            <Tool icon="hand-wave" label={t('dev.replayTour')} onPress={() => replayTour(router)} />
          </Group>

          <Group title={t('tester.clock')}>
            <Tool icon="timer-sand" label={t('dev.skip30')} onPress={devSkip30} />
            <Tool icon="calendar-arrow-right" label={t('tester.plusDay')} onPress={() => updateProfile((p) => shiftTime(p, DAY_MS))} />
          </Group>
        </ScrollView>
        <TopFade />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  group: { gap: 10, padding: 14 },
  mono: { color: colors.textSoft, fontSize: fontSizes.xs, fontFamily: 'monospace' },
  groupTitle: { color: colors.gold, fontSize: fontSizes.xs, fontWeight: '700', letterSpacing: 1.5 },
});
