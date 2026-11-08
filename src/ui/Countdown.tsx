import { useIsFocused } from 'expo-router';
import { useEffect, useState } from 'react';
import { AppState, type StyleProp, type TextStyle } from 'react-native';

import { formatDuration } from '@/game/duration';
import { Text } from '@/ui/Text';

/**
 * A time left, written the same way everywhere (see game/duration.ts). It is computed from a saved timestamp (`until`, in ms), never
 * from a timer that counts down by itself, so it is right after the app came back from the background. It ticks every second only
 * while the screen it is on is in front and the app is active.
 */
export function useNowWhileVisible(active = true): number {
  const focused = useIsFocused();
  const [now, setNow] = useState(() => Date.now());
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      setAppActive(s === 'active');
      if (s === 'active') setNow(Date.now());
    });
    return () => sub.remove();
  }, []);
  const running = active && focused && appActive;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);
  return now;
}

export function Countdown({ until, prefix = '', suffix = '', style }: { until: number; prefix?: string; suffix?: string; style?: StyleProp<TextStyle> }) {
  const now = useNowWhileVisible();
  return (
    <Text style={[{ fontVariant: ['tabular-nums'] }, style]}>
      {prefix}
      {formatDuration(until - now)}
      {suffix}
    </Text>
  );
}
