import { formatNumber } from '../i18n';
import { StyleSheet, View, type StyleProp, type TextStyle } from 'react-native';

import { Text } from './Text';
import { colors } from './theme';

/** The gold coin used everywhere a price or a balance appears: a rim, a face, an embossed centre and a glint. */
export function CoinIcon({ size = 20 }: { size?: number }) {
  const rim = Math.max(2, size * 0.1);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.coinRim,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          width: size - rim * 2,
          height: size - rim * 2,
          borderRadius: size / 2,
          backgroundColor: colors.coin,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            width: size * 0.5,
            height: size * 0.5,
            borderRadius: size / 4,
            borderWidth: Math.max(1, size * 0.07),
            borderColor: colors.coinRim,
          }}
        />
      </View>
      <View style={[styles.glint, { top: size * 0.16, left: size * 0.2, width: size * 0.24, height: size * 0.12, borderRadius: size * 0.06 }]} />
    </View>
  );
}

/** An amount next to the coin: "50 🪙" written the same way everywhere. */
export function CoinAmount({ amount, size = 18, textStyle }: { amount: number | string; size?: number; textStyle?: StyleProp<TextStyle> }) {
  return (
    <View style={styles.row}>
      <Text style={[{ color: colors.text, fontSize: size, fontWeight: '700' }, textStyle]}>{typeof amount === 'number' ? formatNumber(amount) : amount}</Text>
      <CoinIcon size={size * 1.1} />
    </View>
  );
}

const styles = StyleSheet.create({
  glint: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.85)', transform: [{ rotate: '-25deg' }] },
  row: { flexDirection: 'row', alignItems: 'center', gap: 5 },
});
