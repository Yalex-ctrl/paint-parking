import { StyleSheet, Text as RNText, type TextProps } from 'react-native';

import { fontSizes, fonts, lineHeights } from './theme';

/**
 * The only Text of the app. The font follows what the text is: from the "lg" size up (titles, big numbers) it is Lilita One;
 * smaller and bold (labels) it is Nunito 800; the rest is Nunito 600. A style may still name its own face. Descriptions get a
 * comfortable line height, titles a tight one, and numbers are drawn with digits of the same width (they do not dance when
 * they change).
 */
export function Text({ style, children, ...props }: TextProps) {
  const flat = StyleSheet.flatten(style) ?? {};
  const size = typeof flat.fontSize === 'number' ? flat.fontSize : fontSizes.md;
  const w = String(flat.fontWeight ?? '500');
  const bold = w === 'bold' || Number(w) >= 700;
  const family = size >= fontSizes.lg ? fonts.display : bold ? fonts.label : fonts.text;
  const hasDigit = typeof children === 'number' || (typeof children === 'string' && /\d/.test(children)) || (Array.isArray(children) && children.some((c) => typeof c === 'number' || (typeof c === 'string' && /\d/.test(c))));
  return (
    <RNText
      {...props}
      style={[
        { lineHeight: Math.round(size * (size >= fontSizes.lg ? lineHeights.title : lineHeights.text)) },
        flat,
        { fontFamily: flat.fontFamily ?? family, fontWeight: undefined },
        hasDigit && { fontVariant: ['tabular-nums'] },
      ]}
    >
      {children}
    </RNText>
  );
}
