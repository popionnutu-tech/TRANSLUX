/** Componente mici, mari la atingere: buton, card, titluri. */
import type { PropsWithChildren } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, sizes } from './theme';

export function Screen({ children, scroll = true }: PropsWithChildren<{ scroll?: boolean }>) {
  if (!scroll) return <View style={styles.screen}>{children}</View>;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

export function Title({ children }: PropsWithChildren) {
  return <Text style={styles.title}>{children}</Text>;
}

export function Body({ children }: PropsWithChildren) {
  return <Text style={styles.body}>{children}</Text>;
}

export function Muted({ children }: PropsWithChildren) {
  return <Text style={styles.muted}>{children}</Text>;
}

export type Tone = 'primary' | 'neutral' | 'danger' | 'success';

export function BigButton({
  label,
  onPress,
  tone = 'primary',
  disabled = false,
  big = false,
  style,
}: {
  label: string;
  onPress: () => void;
  tone?: Tone;
  disabled?: boolean;
  big?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const bg = tone === 'primary' ? colors.primary : tone === 'danger' ? colors.danger : tone === 'success' ? colors.success : colors.card;
  const fg = tone === 'neutral' ? colors.text : colors.primaryText;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, minHeight: big ? sizes.buttonHeightBig : sizes.buttonHeight, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 },
        tone === 'neutral' ? styles.buttonNeutral : null,
        style,
      ]}
    >
      <Text style={[styles.buttonText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

export function Card({ children, tone = 'neutral', style }: PropsWithChildren<{ tone?: 'neutral' | 'warning' | 'danger' | 'success'; style?: StyleProp<ViewStyle> }>) {
  const bg = tone === 'warning' ? colors.warningBg : tone === 'danger' ? colors.dangerBg : tone === 'success' ? colors.successBg : colors.card;
  return <View style={[styles.card, { backgroundColor: bg }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  screen: { padding: sizes.padding, gap: sizes.gap, backgroundColor: colors.bg, flexGrow: 1 },
  title: { fontSize: sizes.title, fontWeight: '700', color: colors.text },
  body: { fontSize: sizes.text, color: colors.text },
  muted: { fontSize: sizes.textSmall, color: colors.muted },
  button: {
    borderRadius: sizes.radius,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: sizes.padding,
    paddingVertical: 12,
  },
  buttonNeutral: { borderWidth: 2, borderColor: colors.border },
  buttonText: { fontSize: sizes.text + 2, fontWeight: '700', textAlign: 'center' },
  card: { borderRadius: sizes.radius, padding: sizes.padding, gap: 8 },
});
