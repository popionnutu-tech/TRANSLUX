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

// ── Butoane de opțiune (S07) ──────────────────────────────────────────────────

export interface Option<K extends string> {
  key: K;
  label: string;
  /** Culoarea când e selectată: verde («OK»), roșie («Nu»), albastră (implicit). */
  tone?: 'success' | 'danger' | 'primary';
}

/** Rând de opțiuni mari, una singură selectată; atingere = schimbă. Pentru «Da/Nu», «Lucrează/Stricat/Nu are» etc. */
export function OptionGroup<K extends string>({
  label,
  options,
  value,
  onChange,
  disabled = false,
}: {
  label?: string;
  options: readonly Option<K>[];
  value: K | null;
  onChange: (key: K) => void;
  disabled?: boolean;
}) {
  return (
    <View style={optionStyles.wrap}>
      {label ? <Text style={optionStyles.label}>{label}</Text> : null}
      <View style={optionStyles.row}>
        {options.map((o) => {
          const selected = o.key === value;
          const bg = !selected ? colors.card : o.tone === 'success' ? colors.success : o.tone === 'danger' ? colors.danger : colors.primary;
          return (
            <Pressable
              key={o.key}
              onPress={() => onChange(o.key)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={({ pressed }) => [
                optionStyles.option,
                { backgroundColor: bg, borderColor: selected ? bg : colors.border, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 },
              ]}
            >
              <Text style={[optionStyles.optionText, { color: selected ? colors.primaryText : colors.text }]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export const YES_NO: readonly Option<'yes' | 'no'>[] = [
  { key: 'yes', label: 'Da', tone: 'success' },
  { key: 'no', label: 'Nu', tone: 'danger' },
];

export function SectionTitle({ children }: PropsWithChildren) {
  return <Text style={optionStyles.section}>{children}</Text>;
}

const optionStyles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { fontSize: sizes.text, fontWeight: '600', color: colors.text },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: {
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 96,
    minHeight: sizes.buttonHeight,
    borderRadius: sizes.radius,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  optionText: { fontSize: sizes.text, fontWeight: '700', textAlign: 'center' },
  section: { fontSize: sizes.text + 2, fontWeight: '700', color: colors.text },
});
