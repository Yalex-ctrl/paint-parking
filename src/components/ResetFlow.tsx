import { t } from '@/i18n';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Overlay } from '@/components/Modals';
import { Button3D } from '@/ui/Button3D';
import { HoldButton } from '@/ui/HoldButton';
import { Icon } from '@/ui/Icon';
import { Text } from '@/ui/Text';
import { colors, fontSizes } from '@/ui/theme';

const LOST = ['levels', 'coins', 'items', 'daily', 'rewards', 'tutorials'] as const;

/**
 * "Remettre à zéro", in two steps: first what is lost, then a button to hold down for two seconds. Shared by the settings menu and
 * the settings screen. `onConfirmed` does the erasing (and moves the game back to level 1).
 */
export function ResetFlow({ open, onClose, onConfirmed }: { open: boolean; onClose: () => void; onConfirmed: () => void }) {
  const [step, setStep] = useState<'summary' | 'hold'>('summary');
  if (!open) return null;
  const close = () => {
    setStep('summary');
    onClose();
  };
  if (step === 'summary') {
    return (
      <Overlay onDismiss={close}>
        <Icon name="alert-circle" size={44} color={colors.red} />
        <Text style={styles.title}>{t('reset.title')}</Text>
        <Text style={styles.body}>{t('reset.youLose')}</Text>
        <View style={styles.list}>
          {LOST.map((line) => (
            <View key={line} style={styles.row}>
              <Icon name="close" size={16} color={colors.red} />
              <Text style={styles.listText}>{t(`reset.lost.${line}`)}</Text>
            </View>
          ))}
        </View>
        <View style={styles.row}>
          <Icon name="shield-check" size={18} color={colors.green} />
          <Text style={styles.keep}>{t('reset.keep')}</Text>
        </View>
        <Button3D block variant="danger" label={t('common.continue')} onPress={() => setStep('hold')} />
        <Button3D block variant="neutral" label={t('common.cancel')} onPress={close} />
      </Overlay>
    );
  }
  return (
    <Overlay onDismiss={close}>
      <Text style={styles.title}>{t('reset.last')}</Text>
      <Text style={styles.body}>{t('reset.hold')}</Text>
      <HoldButton
        label={t('reset.confirm')}
        onDone={() => {
          setStep('summary');
          onConfirmed();
        }}
      />
      <Button3D block variant="neutral" label={t('common.cancel')} onPress={close} />
    </Overlay>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontSize: fontSizes.xl, textAlign: 'center' },
  body: { color: colors.textSoft, fontSize: fontSizes.sm, textAlign: 'center' },
  list: { alignSelf: 'stretch', gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  listText: { color: colors.text, fontSize: fontSizes.sm, flex: 1 },
  keep: { color: colors.greenLight, fontSize: fontSizes.xs, flex: 1 },
});
