import { t } from '@/core/i18n';
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/core/ui/Text';
import { colors, fontSizes } from '@/core/ui/theme';

import { registerMockAdHost, type MockAdRequest } from '@/core/services/ads';
import { setAdPlaying } from '@/core/services/audio';

/**
 * Draws the simulated ads of services/ads.ts: a full-screen "PUB (simulation)" with a countdown.
 * Rewarded ads are only a success once the countdown is over (closing early gives no reward).
 * Mounted once at the root; with a real ads SDK it is simply not used.
 */
export function AdHost() {
  const [request, setRequest] = useState<MockAdRequest | null>(null);
  const [left, setLeft] = useState(0);
  const current = useRef<MockAdRequest | null>(null);

  useEffect(
    () =>
      registerMockAdHost((r) => {
        // Never two at once: the newer request replaces (and refuses) the older one.
        current.current?.resolve(false);
        current.current = r;
        setLeft(r.seconds);
        setRequest(r);
      }),
    [],
  );

  // The music goes down while an ad is shown.
  useEffect(() => {
    setAdPlaying(request !== null);
  }, [request]);

  useEffect(() => {
    if (!request) return;
    const t = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [request]);

  const close = (ok: boolean) => {
    const r = current.current;
    current.current = null;
    setRequest(null);
    r?.resolve(ok);
  };

  const done = left <= 0;
  return (
    <Modal visible={request !== null} animationType="fade" statusBarTranslucent onRequestClose={() => close(false)}>
      <View style={styles.root}>
        <Text style={styles.tag}>{t('ad.tag')}</Text>
        <Text style={styles.title}>{request?.kind === 'rewarded' ? t('ad.rewarded') : t('ad.ad')}</Text>
        <Text style={styles.sub}>{t('ad.placeholder')}</Text>
        <Pressable onPress={() => close(done)} disabled={!done && request?.kind !== 'rewarded'} style={[styles.close, !done && styles.closeWaiting]}>
          <Text style={styles.closeText}>{done ? t('ad.close') : t('ad.rewardIn', { count: left })}</Text>
        </Pressable>
        {!done && request?.kind === 'rewarded' && (
          <Pressable onPress={() => close(false)} hitSlop={12}>
            <Text style={styles.skip}>{t('ad.skip')}</Text>
          </Pressable>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.adBg, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 32 },
  tag: { color: colors.gold, fontSize: fontSizes.sm, fontWeight: '800', letterSpacing: 2 },
  title: { color: colors.text, fontSize: fontSizes.xl, fontWeight: '900' },
  sub: { color: colors.textSoft, fontSize: fontSizes.sm, textAlign: 'center' },
  close: { marginTop: 24, paddingVertical: 14, paddingHorizontal: 36, borderRadius: 28, backgroundColor: colors.gold },
  closeWaiting: { backgroundColor: colors.surfaceHi },
  closeText: { color: colors.ink, fontSize: fontSizes.md, fontWeight: '800' },
  skip: { color: colors.textMuted, fontSize: fontSizes.sm, marginTop: 8 },
});
