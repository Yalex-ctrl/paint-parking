import { StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { Text } from '@/ui/Text';

const OUTLINE = '#1a1130';
/** The eight directions of the outline. */
const STEPS: [number, number][] = [
  [-1, 0], [1, 0], [0, -1], [0, 1], [-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7],
];

/**
 * White text with a dark outline (2 px) and a small drop shadow: readable over any 3D background. The outline is made of
 * the same text drawn eight times around it, so use it for a few words (titles, numbers), not for paragraphs.
 *
 * The copies sit in a box that is exactly the size of the visible text (`hug`), and each one fills that box, shifted by a
 * pixel or two: same position, same size, same alignment, whatever the container does with its children.
 */
export function OutlineText({
  children,
  style,
  width = 2,
  color = '#ffffff',
  containerStyle,
  fit = false,
}: {
  children: string | number;
  style?: StyleProp<TextStyle>;
  width?: number;
  color?: string;
  containerStyle?: StyleProp<ViewStyle>;
  /** One line, shrunk (to 70 %) rather than cut or pushed over what is next to it. */
  fit?: boolean;
}) {
  const fitProps = fit ? ({ numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: 0.7 } as const) : {};
  return (
    <View style={containerStyle}>
      <View style={styles.hug}>
        {STEPS.map(([dx, dy], i) => (
          <Text
            key={i}
            style={[style, styles.layer, { color: OUTLINE, left: dx * width, right: -dx * width, top: dy * width, bottom: -dy * width }]}
            accessible={false}
            importantForAccessibility="no"
            {...fitProps}
          >
            {children}
          </Text>
        ))}
        <Text style={[style, { color }, styles.shadow]} {...fitProps}>
          {children}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Only as wide as the text, centred in its container.
  hug: { alignSelf: 'center', maxWidth: '100%', flexShrink: 1 },
  layer: { position: 'absolute' },
  shadow: { textShadowColor: 'rgba(0, 0, 0, 0.45)', textShadowRadius: 3, textShadowOffset: { width: 0, height: 2 } },
});
