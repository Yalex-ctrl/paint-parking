import { useIsVip } from '@/core/storage/useVip';
import { restoreSubscription } from '@/core/services/subscription';
import { ResetFlow } from '@/core/components/ResetFlow';
import { LANGUAGES, formatNumber, setLanguage, t, useLanguage } from '@/core/i18n';
import { useScreenReady } from '@/core/ui/useScreenReady';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { MONETIZATION } from '@/core/config/monetization';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { testerTools } from '@/core/config/tester';
import { useFeatures } from '@/core/config/features';
import { setAudioSettings } from '@/core/services/audio';
import { totalScore } from '@/core/points';
import { preloadDecor } from '@/core/render/decor/models';
import { setHapticsEnabled } from '@/core/services/haptics';
import { requestNotificationPermission, syncNotifications } from '@/core/services/notifications';
import { restorePurchases } from '@/core/services/purchases';
import { getProfile, updateProfile, useProfile } from '@/core/storage/profile';
import { replayTutorial, resetProgress } from '@/core/storage/reset';
import { resetHud } from '@/core/tour/hudStore';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from '@/core/storage/settings';
import { Button3D } from '@/core/ui/Button3D';
import { Card3D } from '@/core/ui/Card3D';
import { Slider } from '@/core/ui/Slider';
import { Icon, type IconName } from '@/core/ui/Icon';
import { ScreenHeader, TopFade } from '@/core/ui/ScreenHeader';
import { Text } from '@/core/ui/Text';
import { MARGIN, colors, fontSizes } from '@/core/ui/theme';
import { adsStarted, showPrivacyOptions } from '@/core/services/admob';
import { showToast } from '@/core/services/toast';

function Row({ icon, label, hint, value, onChange, slider }: { icon: IconName; label: string; hint: string; value: boolean; onChange: (v: boolean) => void; slider?: { value: number; onChange: (v: number) => void } }) {
  return (
    <Card3D innerStyle={slider ? [styles.row, styles.rowWithSlider] : styles.row}>
      <View style={styles.iconWrap}>
        <Icon name={icon} size={24} color={colors.text} />
      </View>
      <View style={styles.rowText}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.hint}>{hint}</Text>
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.gold, false: colors.bgDeep }} thumbColor={colors.text} />
      {slider && (
        <View style={styles.sliderRow}>
          <Slider value={slider.value} onChange={slider.onChange} disabled={!value} />
        </View>
      )}
    </Card3D>
  );
}

export default function SettingsScreen() {
  useScreenReady('/settings');
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const profile = useProfile();
  const language = useLanguage();
  const vipOn = useIsVip();
  useFeatures();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  // Erasing everything takes two steps (see ResetFlow): first a summary of what is lost, then a button to hold down.
  const [resetOpen, setResetOpen] = useState(false);

  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);

  const update = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveSettings(next);
    if (next.decor) preloadDecor();
    setAudioSettings(next);
    setHapticsEnabled(next.vibrations);
  };

  const setNotifications = async (enabled: boolean) => {
    updateProfile((p) => ({ ...p, notifications: { ...p.notifications, enabled } }));
    if (enabled) {
      updateProfile((p) => ({ ...p, notifications: { ...p.notifications, asked: true } }));
      await requestNotificationPermission();
    }
    syncNotifications(getProfile());
  };

  const watchTutorial = async () => {
    await replayTutorial();
    router.dismissTo({ pathname: '/', params: { level: '1', daily: '', reset: String(Date.now()) } });
  };

  const eraseEverything = async () => {
    await resetProgress();
    resetHud();
    setAudioSettings(await loadSettings());
    syncNotifications(getProfile());
    setResetOpen(false);
    // As at the very first launch: straight into level 1, with the tutorial.
    router.dismissTo({ pathname: '/', params: { level: '', daily: '', reset: String(Date.now()) } });
  };

  const restore = async () => {
    const ids = await restorePurchases();
    const vip = await restoreSubscription();
    Alert.alert(t('common.restore'), ids.length > 0 || vip ? t('common.restored') : t('common.nothingToRestore'));
  };

  return (
    <View style={styles.root}>
      <ScreenHeader title={t('settings.title')} />
      <View style={styles.flex}>
        <ScrollView contentContainerStyle={{ gap: 12, paddingHorizontal: MARGIN, paddingTop: 12, paddingBottom: insets.bottom + 28 }} showsVerticalScrollIndicator={false}>
          <Row icon="volume-high" label={t('settings.sfx')} hint={t('settings.sfxHint')} value={settings.sound} onChange={(sound) => update({ sound })} slider={{ value: settings.sfxVolume, onChange: (sfxVolume) => update({ sfxVolume }) }} />
          <Row icon="music" label={t('settings.music')} hint={t('settings.musicHint')} value={settings.music} onChange={(music) => update({ music })} slider={{ value: settings.musicVolume, onChange: (musicVolume) => update({ musicVolume }) }} />
          <Row icon="vibrate" label={t('settings.vibrations')} hint={t('settings.vibrationsHint')} value={settings.vibrations} onChange={(vibrations) => update({ vibrations })} />
          <Row icon="bell" label={t('settings.notifications')} hint={t('settings.notificationsHint')} value={profile.notifications.enabled} onChange={setNotifications} />
          <Row icon="pine-tree" label={t('settings.decor')} hint={t('settings.decorHint')} value={settings.decor} onChange={(decor) => update({ decor })} />

          <Card3D innerStyle={styles.progress}>
            <Text style={styles.sectionTitle}>{t('settings.language').toUpperCase()}</Text>
            <View style={styles.langRow}>
              {LANGUAGES.map((l) => (
                <Button3D key={l.code} style={styles.flex} block size="sm" variant={language === l.code ? 'primary' : 'neutral'} label={l.label} onPress={async () => {
                    await setLanguage(l.code);
                    // The reminders are written in the language on screen: they are planned again.
                    syncNotifications(getProfile());
                  }} />
              ))}
            </View>
          </Card3D>

          <Button3D block variant={vipOn ? 'primary' : 'secondary'} icon="crown" label={vipOn ? t('vip.myPass') : t('vip.title')} onPress={() => router.push(vipOn ? '/vip-account' : { pathname: '/vip', params: { source: 'reglages' } })} />

          <Button3D block variant="neutral" icon="restore" label={t('common.restore')} onPress={restore} />
          {adsStarted() && <Button3D block variant="neutral" icon="shield-account" label={t('settings.adPrivacy')} onPress={() => void showPrivacyOptions().then((shown) => !shown && showToast(t('settings.adPrivacyNone')))} />}

          <Card3D innerStyle={styles.progress}>
            <Text style={styles.sectionTitle}>{t('settings.progress')}</Text>
            <Text style={styles.stat}>{t('settings.bestStreak', { count: profile.winStreak.best })}</Text>
            <Text style={styles.stat}>{t('settings.totalScore', { score: formatNumber(totalScore(profile.bestScores)) })}</Text>
            <Button3D block variant="neutral" icon="school" label={t('settings.replayTutorial')} onPress={watchTutorial} />
            <Button3D block variant="danger" icon="delete-forever" label={t('settings.reset')} onPress={() => setResetOpen(true)} />
          </Card3D>

          <Card3D innerStyle={styles.progress}>
            <Text style={styles.sectionTitle}>{t('settings.info')}</Text>
            <Button3D block size="sm" variant="neutral" icon="shield-lock" label={t('vip.privacy')} onPress={() => Linking.openURL(MONETIZATION.vip.links.privacy)} />
            <Button3D block size="sm" variant="neutral" icon="file-document-outline" label={t('vip.terms')} onPress={() => Linking.openURL(MONETIZATION.vip.links.terms)} />
            <Button3D block size="sm" variant="neutral" icon="lifebuoy" label={t('settings.supportLink')} onPress={() => Linking.openURL(MONETIZATION.vip.links.support)} />
          </Card3D>

          {/* The tester tools (tester builds and development builds only). */}
          {testerTools() && (
            <Card3D innerStyle={styles.dev} face={colors.bgDeep}>
              <Text style={styles.devTitle}>{t('dev.title')}</Text>
              <Button3D block size="sm" variant="neutral" icon="wrench" label={t('tester.title')} onPress={() => router.push('/tester')} />
            </Card3D>
          )}
        </ScrollView>
        <TopFade />
      </View>

      <ResetFlow open={resetOpen} onClose={() => setResetOpen(false)} onConfirmed={eraseEverything} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  rowWithSlider: { flexWrap: 'wrap' },
  sliderRow: { width: '100%' },
  iconWrap: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceHi },
  rowText: { flex: 1, gap: 2 },
  label: { color: colors.text, fontSize: fontSizes.md, fontWeight: '700' },
  hint: { color: colors.textSoft, fontSize: fontSizes.xs },
  progress: { gap: 10 },
  langRow: { flexDirection: 'row', gap: 10 },
  stat: { color: colors.textSoft, fontSize: fontSizes.sm },
  sectionTitle: { color: colors.gold, fontSize: fontSizes.xs, fontWeight: '700', letterSpacing: 1.5 },
  popTitle: { color: colors.text, fontSize: fontSizes.xl, fontWeight: '700', textAlign: 'center' },
  popBody: { color: colors.textSoft, fontSize: fontSizes.sm, textAlign: 'center' },
  list: { alignSelf: 'stretch', gap: 4 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  listText: { color: colors.text, fontSize: fontSizes.sm, flex: 1 },
  keepText: { color: colors.greenLight, fontSize: fontSizes.xs, flex: 1 },
  dev: { gap: 10 },
  devTitle: { color: colors.gold, fontSize: fontSizes.xs, fontWeight: '700', letterSpacing: 1.5 },
});
