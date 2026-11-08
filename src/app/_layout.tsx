import { LilitaOne_400Regular } from '@expo-google-fonts/lilita-one';
import { Nunito_600SemiBold, Nunito_800ExtraBold } from '@expo-google-fonts/nunito';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AdHost } from '@/core/components/AdHost';
import { GuidedTourHost } from '@/core/components/GuidedTour';
import { SCENE_BG } from '@/render/sceneBg';
import { initAudio, setAudioSettings, wantMusic } from '@/core/services/audio';
import { ads } from '@/core/services/ads';
import { setHapticsEnabled } from '@/core/services/haptics';
import { syncNotifications } from '@/core/services/notifications';
import { initPurchases } from '@/core/services/purchases';
import { startAdMob } from '@/core/services/admob';
import { startRevenueCat } from '@/core/services/revenuecat';
import { startSubscriptionWatch } from '@/core/services/subscription';
import { loadLanguage } from '@/core/i18n';
import { startPlayClock } from '@/core/services/playClock';
import { startPlayTime } from '@/core/services/playTime';
import { ToastHost } from '@/core/components/ToastHost';
import { preloadDecor } from '@/core/render/decor/models';
import { startApp } from '@/core/storage/launch';
import { LoadingScreen } from '@/core/ui/LoadingScreen';
import { setLaunchProgress, setLaunchReady } from '@/core/ui/loadingStore';
import { flushProfile, getProfile, subscribeProfile } from '@/core/storage/profile';
import { loadSettings } from '@/core/storage/settings';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ LilitaOne_400Regular, Nunito_600SemiBold, Nunito_800ExtraBold });
  // The music belongs to the app, not to one screen: it plays all the time (the tour, the shop, the menus...), and only stops when
  // the player turns it off or the app goes to the background.
  useEffect(() => {
    wantMusic(true, 'app');
    return () => wantMusic(false, 'app');
  }, []);
  useEffect(() => {
    // Profile first (coins, shop, streak), then count this launch; the home screen reads the result to
    // decide whether this is the very first launch (straight into level 1).
    startApp();
    loadSettings().then((s) => {
      setAudioSettings(s);
      setHapticsEnabled(s.vibrations);
      initAudio();
    });
    // The real ads (AdMob) when the build has the native module; the simulated ones otherwise.
    startAdMob();
    ads.init().catch(() => {});
    startPlayClock().catch(() => {});
    startPlayTime();
    // The real store (RevenueCat) when the build has it and a key; the simulated one otherwise.
    startRevenueCat();
    initPurchases().catch(() => {});
    loadLanguage().catch(() => {});
    // The VIP pass is checked once the profile is loaded, then each time the app comes back to the front.
    let stopWatch = () => {};
    startApp().then(() => {
      stopWatch = startSubscriptionWatch();
    });

    // The scheduled notification depends on the streak: plan it again whenever the profile changes (debounced).
    let timer: ReturnType<typeof setTimeout> | null = null;
    const off = subscribeProfile(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => syncNotifications(getProfile()), 1500);
    });
    const app = AppState.addEventListener('change', (s) => {
      if (s !== 'active') flushProfile();
    });
    return () => {
      off();
      stopWatch();
      app.remove();
      if (timer) clearTimeout(timer);
    };
  }, []);

  // The splash screen stays until the fonts, the 3D scenery models and the sounds are loaded (at most 4 seconds: a slow phone
  // must not be stuck on it), so the home screen and the first level do not wait for them.
  // Everything that is reusable is loaded behind the loading screen at launch (the 3D scenery models, the sounds); the screen
  // shows how far it is, and leaves once the home screen has drawn its first frame.
  useEffect(() => {
    const cap = setTimeout(setLaunchReady, 8000);
    let parts = 0;
    const done = () => {
      parts++;
      setLaunchProgress(0.1 + (parts / 2) * 0.9);
      if (parts === 2) {
        clearTimeout(cap);
        setLaunchReady();
      }
    };
    preloadDecor().catch(() => null).then(done);
    initAudio().catch(() => null).then(done);
    return () => clearTimeout(cap);
  }, []);
  // The native splash screen only has to cover the fonts; the loading screen takes over from there.
  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded]);

  // The rounded game font is loaded before anything is drawn: no frame ever shows a system font.
  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: SCENE_BG }}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: SCENE_BG }, animation: 'slide_from_bottom', freezeOnBlur: true }}>
        {/* The level is the home screen: it stays mounted (and paused) under every panel, which slides up over it. */}
        <Stack.Screen name="index" options={{ gestureEnabled: false }} />
      </Stack>
      <GuidedTourHost />
      <ToastHost />
      <LoadingScreen />
      <AdHost />
    </GestureHandlerRootView>
  );
}
