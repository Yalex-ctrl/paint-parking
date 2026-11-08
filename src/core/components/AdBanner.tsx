import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { adUnitId, adsNonPersonalized, adsReady, adsStarted } from '@/core/services/admob';
import { useProfile } from '@/core/storage/profile';
import { adsBannerHeight } from '@/core/config/app';

/** The banner of the level, in the strip kept free at the very bottom (see config/app.ts). Nothing for VIP, "Sans pub", or in Expo Go. */
export function AdBanner({ bottom, minLevel = 10, levelId }: { bottom: number; minLevel?: number; levelId: number }) {
  const profile = useProfile();
  const [ready, setReady] = useState(adsReady());
  useEffect(() => {
    if (ready || !adsStarted()) return;
    // The consent and the SDK start a moment after the app: look again until they are there.
    const id = setInterval(() => adsReady() && setReady(true), 1500);
    return () => clearInterval(id);
  }, [ready]);
  if (!ready || !adsStarted() || levelId < minLevel || profile.adsRemoved || profile.vip.live) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { BannerAd, BannerAdSize } = require('react-native-google-mobile-ads') as typeof import('react-native-google-mobile-ads');
  return (
    <View style={[styles.slot, { bottom }]} pointerEvents="box-none">
      <BannerAd unitId={adUnitId('banner')} size={BannerAdSize.BANNER} requestOptions={{ requestNonPersonalizedAdsOnly: adsNonPersonalized() }} />
    </View>
  );
}

const styles = StyleSheet.create({
  slot: { position: 'absolute', left: 0, right: 0, height: adsBannerHeight, alignItems: 'center', justifyContent: 'center' },
});
