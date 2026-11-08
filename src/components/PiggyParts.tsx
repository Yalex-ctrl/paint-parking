import { formatNumber , t } from '@/i18n';

import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';

import { Overlay } from '@/components/Modals';
import { MONETIZATION } from '@/config/monetization';
import { dayKeyOf } from '@/game/dates';
import { fullPopupDue, markFullPopupShown } from '@/game/piggy';
import { getProfile, updateProfile } from '@/storage/profile';
import { Button3D } from '@/ui/Button3D';
import { PiggyBank } from '@/ui/PiggyBank';
import { Text } from '@/ui/Text';
import { colors, fontSizes } from '@/ui/theme';

/** "Ta tirelire est pleine !": at most once a day, only when it is full. Put on the home screen and the map, never in a level. */
export function PiggyFullGate() {
  const router = useRouter();
  // Decided once, when the screen appears: the day is marked as soon as the pop-up is on its way, so it never comes twice.
  const [shown, setShown] = useState(() => fullPopupDue(getProfile(), dayKeyOf(new Date())));
  useEffect(() => {
    if (shown) updateProfile((p) => markFullPopupShown(p, dayKeyOf(new Date())));
  }, [shown]);
  if (!shown) return null;
  return (
    <Overlay onDismiss={() => setShown(false)}>
      <PiggyBank ratio={1} size={150} />
      <Text style={styles.title}>{t('piggy.full')}</Text>
      <Text style={styles.body}>{t('piggy.waiting', { amount: formatNumber(MONETIZATION.piggy.capacity) })}</Text>
      <Button3D
        block
        variant="primary"
        label={t('piggy.breakIt')}
        onPress={() => {
          setShown(false);
          router.push("/piggy");
        }}
      />
      <Button3D block variant="neutral" label={t('common.later')} onPress={() => setShown(false)} />
    </Overlay>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontSize: fontSizes.xl, fontWeight: '700', textAlign: 'center' },
  body: { color: colors.textSoft, fontSize: fontSizes.md, textAlign: 'center' },
});
