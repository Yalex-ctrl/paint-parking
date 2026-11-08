import { t } from '@/core/i18n';
import { BlurView } from 'expo-blur';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button3D } from '@/core/ui/Button3D';
import { Icon, type IconName } from '@/core/ui/Icon';
import { OutlineText } from '@/core/ui/OutlineText';
import { Text } from '@/core/ui/Text';
import { colors, fontSizes } from '@/core/ui/theme';

export type PauseAction = { key: string; label: string; icon: IconName; variant?: 'primary' | 'neutral'; hint?: string; onPress: () => void };
export type PauseToggle = { key: string; icon: IconName; offIcon: IconName; label: string; on: boolean; onToggle: () => void };

/** Delay (ms) between two buttons arriving. */
const STAGGER_MS = 55;
const CLOSE_SIZE = 46;

/**
 * The pause menu: full screen over the frozen game, a dark veil with a blur that lets the game show through. A gold cross in
 * the corner closes it (so does the back button of the phone and a tap outside the buttons). In the middle: the level, the
 * moves and the streak, then the buttons in a column, and the quick switches for music, sound effects and vibrations at the
 * bottom. The buttons arrive one after the other; it closes at once.
 */
export function PauseMenu({
  title,
  lines,
  actions,
  toggles,
  dev,
  onClose,
}: {
  title: string;
  lines: string[];
  actions: PauseAction[];
  toggles: PauseToggle[];
  dev?: PauseAction[];
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(90)} style={StyleSheet.absoluteFill}>
      <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]} />
      {/* A tap anywhere that is not a button closes the menu. */}
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={t('common.close')} />

      <Pressable
        onPress={onClose}
        hitSlop={8}
        accessibilityLabel={t('pause.closeMenu')}
        style={[styles.close, { top: insets.top + 10, right: 16 }]}
      >
        <Icon name="close" size={26} color={colors.gold} />
      </Pressable>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 64, paddingBottom: insets.bottom + 96 }]}
        showsVerticalScrollIndicator={false}
        pointerEvents="box-none"
      >
        <Animated.View entering={FadeInDown.duration(220)} style={styles.head} pointerEvents="none">
          <OutlineText style={styles.title} width={2.5}>
            {title}
          </OutlineText>
          {lines.map((l) => (
            <Text key={l} style={styles.line}>
              {l}
            </Text>
          ))}
        </Animated.View>

        <View style={styles.buttons}>
          {actions.map((a, i) => (
            <Animated.View key={a.key} entering={FadeInDown.delay(80 + i * STAGGER_MS).duration(220)}>
              <Button3D block size="lg" variant={a.variant ?? 'neutral'} icon={a.icon} label={a.label} onPress={a.onPress}>
                {a.hint ? <Text style={styles.hint}>{a.hint}</Text> : null}
              </Button3D>
            </Animated.View>
          ))}
          {dev?.map((a) => (
            <Button3D key={a.key} block size="sm" variant="neutral" icon={a.icon} label={a.label} onPress={a.onPress} />
          ))}
        </View>
      </ScrollView>

      <Animated.View entering={FadeInDown.delay(120 + actions.length * STAGGER_MS).duration(220)} style={[styles.toggles, { bottom: insets.bottom + 24 }]} pointerEvents="box-none">
        {toggles.map((t) => (
          <Pressable key={t.key} onPress={t.onToggle} hitSlop={6} accessibilityLabel={t.label} style={[styles.toggle, t.on && styles.toggleOn]}>
            <Icon name={t.on ? t.icon : t.offIcon} size={26} color={t.on ? colors.onGold : colors.textMuted} />
          </Pressable>
        ))}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  close: {
    position: 'absolute',
    width: CLOSE_SIZE,
    height: CLOSE_SIZE,
    borderRadius: CLOSE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    borderWidth: 2,
    borderColor: 'rgba(255, 201, 60, 0.55)',
  },
  content: { paddingHorizontal: 28, gap: 20, alignItems: 'stretch' },
  head: { alignItems: 'center', gap: 4 },
  title: { fontSize: fontSizes.xxl },
  line: { color: colors.textSoft, fontSize: fontSizes.md, textAlign: 'center' },
  buttons: { gap: 12 },
  hint: { color: colors.text, fontSize: fontSizes.xs, fontWeight: '800', backgroundColor: colors.redDeep, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, overflow: 'hidden' },
  toggles: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 16 },
  toggle: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255, 255, 255, 0.12)' },
  toggleOn: { backgroundColor: colors.gold },
});
