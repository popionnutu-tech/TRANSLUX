/**
 * Componentele de ecran, transpuse din mockup-ul `docs/design/peron-android/*.dc.html`
 * cu aceleași numere. Toate culorile vin din `theme.ts`.
 *
 * La coadă sunt aliasurile vechi (`Title`, `Body`, `Muted`, `BigButton`, `OptionGroup`,
 * `SectionTitle`, `YES_NO`), ca ecranele încă nerescrise (S02) să compileze.
 */
import { createContext, useContext, useState, type PropsWithChildren, type ReactNode } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackIcon, CameraIcon, PinIcon, PlayIcon } from './icons';
import { colors, radius, shadowNext, shadowPrimary, sizes, weight } from './theme';

// ── Ecranul ───────────────────────────────────────────────────────────────────

/**
 * Fundal `#f4f0ed`, padding 56 / 16 / 20, gap 14 (Main, ZiuaBalti, Cursa, Curățenie).
 * `padding` și `gap` se pot suprascrie (Login: 96 / 24 / 40, gap 40). Dacă bara de stare
 * e mai înaltă decât încap cei 56 px, se adaugă doar diferența.
 */
export function Screen({
  children,
  scroll = true,
  padding,
  gap = sizes.screenGap,
  refreshing = false,
  onRefresh,
}: PropsWithChildren<{
  scroll?: boolean;
  padding?: { top?: number; side?: number; bottom?: number };
  gap?: number;
  refreshing?: boolean;
  onRefresh?: () => void;
}>) {
  const insets = useSafeAreaInsets();
  const top = padding?.top ?? sizes.screenTop;
  const content: ViewStyle = {
    paddingTop: Math.max(top, insets.top + 8),
    paddingHorizontal: padding?.side ?? sizes.screenSide,
    paddingBottom: padding?.bottom ?? sizes.screenBottom,
    gap,
    flexGrow: 1,
  };
  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      {scroll ? (
        <ScrollView
          style={styles.screen}
          contentContainerStyle={content}
          keyboardShouldPersistTaps="handled"
          refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} tintColor={colors.primary} /> : undefined}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.screen, content]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

/** Spațiul elastic dintre conținut și butonul de jos (`flex-grow: 1` din mockup). */
export function Spacer() {
  return <View style={{ flexGrow: 1 }} />;
}

// ── Antete ────────────────────────────────────────────────────────────────────

/**
 * Antetul zilei (Main / ZiuaBalti): «TRANSLUX · CHIȘINĂU» 14 / 600 bordo `letterSpacing 2`
 * peste data 24 / 800, numele operatorului la dreapta 15 / 600 `#666`, aliniat jos.
 */
export function DayHeader({ kicker, title, right, onPressRight }: { kicker: string; title: string; right?: string | null; onPressRight?: () => void }) {
  return (
    <View style={styles.dayHeader}>
      <View style={{ gap: 2, flexShrink: 1 }}>
        <Text style={styles.kicker}>{kicker}</Text>
        <Text style={styles.dayTitle}>{title}</Text>
      </View>
      {right ? (
        <Pressable onPress={onPressRight} disabled={!onPressRight} hitSlop={8}>
          <Text style={styles.dayRight}>{right}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * Antetul ecranelor secundare (Cursa, Curățenie): săgeata înapoi în 44×44 cu
 * `marginLeft -8`, titlul 26 / 800 (24 la Curățenie), subtitlul 14 / 600 `#666`,
 * la dreapta o pastilă opțională (întârzierea).
 */
export function Header({
  title,
  subtitle,
  titleSize = 26,
  onBack,
  right,
}: {
  title: string;
  subtitle?: string | null;
  titleSize?: 24 | 26;
  onBack?: () => void;
  right?: ReactNode;
}) {
  return (
    <View style={styles.header}>
      {onBack ? (
        <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Înapoi" style={styles.backHit}>
          <BackIcon />
        </Pressable>
      ) : null}
      <View style={{ flexShrink: 1 }}>
        <Text style={[styles.headerTitle, { fontSize: titleSize }]}>{title}</Text>
        {subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}
      </View>
      {right ? (
        <>
          <View style={{ flexGrow: 1 }} />
          {right}
        </>
      ) : null}
    </View>
  );
}

/** Pastila galbenă din antet: 13 / 700 `#8a4500`, fundal `#fff7e6`, bordură 1 `#f0c674`, rază 999. */
export function Pill({ children }: PropsWithChildren) {
  return (
    <View style={styles.pill}>
      <Text style={styles.pillText}>{children}</Text>
    </View>
  );
}

// ── Card, etichete, texte ─────────────────────────────────────────────────────

export type CardTone = 'neutral' | 'warning' | 'danger' | 'success';

/**
 * Cardul alb: bordură 1 `#e6e2de`, rază 14, padding 16, gap 12. Tonurile colorate sunt
 * casetele din mockup: galben (bordură 2 `#f0c674`, rază 12, padding 12 / 14, gap 10),
 * roșu (`#fbe9ec` / `#e4a3ad`), verde («cursă făcută»: `#e8f3ea` / `#b7dcc1`).
 */
export function Card({ children, tone = 'neutral', style }: PropsWithChildren<{ tone?: CardTone; style?: StyleProp<ViewStyle> }>) {
  const toneStyle = tone === 'warning' ? styles.cardWarning : tone === 'danger' ? styles.cardDanger : tone === 'success' ? styles.cardSuccess : null;
  return <View style={[styles.card, toneStyle, style]}>{children}</View>;
}

/** Eticheta de secțiune: 13 / 700, majuscule, `letterSpacing 1.5`, `#666`. */
export function Label({ children }: PropsWithChildren) {
  return <Text style={styles.label}>{children}</Text>;
}

/** Întrebarea din card: 17 / 700 `#1f1a1b`. */
export function Question({ children }: PropsWithChildren) {
  return <Text style={styles.question}>{children}</Text>;
}

/** Textul discret de sub un card sau de la baza ecranului: 14 `#6b6560`, centrat, `lineHeight 1.4`. */
export function Footnote({ children, align = 'center' }: PropsWithChildren<{ align?: 'center' | 'left' }>) {
  return <Text style={[styles.footnote, { textAlign: align }]}>{children}</Text>;
}

/** Text de corp: 15 `#1f1a1b`, `lineHeight 1.4`. `bold` deschide rândul cu un fragment 700. */
export function Body({ children, bold, color = colors.text, style }: PropsWithChildren<{ bold?: string; color?: string; style?: StyleProp<TextStyle> }>) {
  return (
    <Text style={[styles.body, { color }, style]}>
      {bold ? <Text style={weight(700)}>{bold}</Text> : null}
      {bold ? ' ' : null}
      {children}
    </Text>
  );
}

// ── Butoane ───────────────────────────────────────────────────────────────────

/**
 * Butonul principal bordo, rază 12, text alb. `size="md"`: 60 înalt, 20 / 700 (Conectează);
 * `size="lg"`: 64 înalt, 21 / 800, umbra `0 4px 12px rgba(155,27,48,0.35)` (Trimite raportul).
 */
export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  size = 'lg',
  shadow = size === 'lg',
  icon,
  style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  size?: 'md' | 'lg';
  shadow?: boolean;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const lg = size === 'lg';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.primary,
        { height: lg ? sizes.buttonHeightBig : sizes.buttonHeight, opacity: disabled ? 0.45 : pressed ? 0.85 : 1 },
        shadow && !disabled ? shadowPrimary : null,
        style,
      ]}
    >
      {icon}
      <Text style={[styles.primaryText, lg ? weight(800) : weight(700), { fontSize: lg ? 21 : 20 }]}>{label}</Text>
    </Pressable>
  );
}

/**
 * Butonul de contur. `tone="primary"`: alb, bordură 2 bordo, 60 înalt, text 19 / 700 bordo
 * («Poze curățenie»). `tone="neutral"`: bordură 2 `#ddd9d5`, text `#333` («Refă poza» 44,
 * «Microbuzul a fost absent» 48 / 15 / 600 `#666`, «Absent» 56 / 16 / 700).
 */
export function OutlineButton({
  label,
  onPress,
  disabled = false,
  tone = 'primary',
  height = tone === 'primary' ? sizes.buttonHeight : 48,
  fontSize = tone === 'primary' ? 19 : 15,
  fontWeight = tone === 'primary' ? 700 : 600,
  color,
  icon,
  style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'primary' | 'neutral';
  height?: number;
  fontSize?: number;
  fontWeight?: 600 | 700;
  color?: string;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const primary = tone === 'primary';
  const textColor = color ?? (primary ? colors.primary : colors.textSoft);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.outline,
        {
          height,
          borderColor: primary ? colors.primary : colors.border,
          borderRadius: primary ? radius.button : radius.option,
          opacity: disabled ? 0.45 : pressed ? 0.7 : 1,
        },
        style,
      ]}
    >
      {icon}
      <Text style={[weight(fontWeight), { fontSize, color: textColor, textAlign: 'center' }]}>{label}</Text>
    </Pressable>
  );
}

// ── Opțiuni (segment) ─────────────────────────────────────────────────────────

/** O opțiune din listă (alias vechi, folosit de `OptionGroup`). */
export interface Option<K extends string> {
  key: K;
  label: string;
  /** Culoarea când e selectată: verde («Da», «OK»), roșie («Nu» la verdicte). Implicit verde. */
  tone?: 'success' | 'danger' | 'primary';
}

/**
 * Segmentul din mockup: `flexGrow 1`, `minHeight 52`, alb, bordură 2 `#ddd9d5`, rază 10,
 * padding 6 / 8, text 15 / 600 `#333`; selectat: `#e8f3ea` / `#16a34a` / 15 / 700 `#1f6b34`
 * (`tone="danger"`: `#fbe9ec` / `#e4a3ad` / `#b91c1c`).
 */
export function Option({
  label,
  selected = false,
  onPress,
  disabled = false,
  tone = 'success',
  icon,
  style,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'success' | 'danger';
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const danger = tone === 'danger';
  const selectedStyle: ViewStyle = danger
    ? { backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder }
    : { backgroundColor: colors.selectedBg, borderColor: colors.selectedBorder };
  const textColor = !selected ? colors.textSoft : danger ? colors.danger : colors.selectedText;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [styles.option, selected ? selectedStyle : null, { opacity: disabled ? 0.5 : pressed ? 0.7 : 1 }, style]}
    >
      {icon}
      <Text style={[styles.optionText, selected ? weight(700) : weight(600), { color: textColor }]}>{label}</Text>
    </Pressable>
  );
}

/** Rândul de opțiuni: `flexDirection row`, gap 8. */
export function OptionRow({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[styles.optionRow, style]}>{children}</View>;
}

// ── Grila curselor ────────────────────────────────────────────────────────────

/** 4 coloane cu gap 8; lățimea celulei se calculează din lățimea măsurată a rândului. */
export function Grid({ children }: PropsWithChildren) {
  const [width, setWidth] = useState<number | null>(null);
  const cell = width === null ? null : (width - sizes.gridGap * (sizes.gridColumns - 1)) / sizes.gridColumns;
  return (
    <View
      style={styles.grid}
      onLayout={(e: LayoutChangeEvent) => {
        const w = e.nativeEvent.layout.width;
        if (w > 0 && w !== width) setWidth(w);
      }}
    >
      <GridWidth.Provider value={cell}>{children}</GridWidth.Provider>
    </View>
  );
}

const GridWidth = createContext<number | null>(null);

/**
 * Celula 64 înaltă, rază 10, bordură 2. `done`: `#e8f3ea` / `#b7dcc1`, 17 / 700 `#1f6b34`;
 * `locked`: alb / `#e6e2de`, 17 / 600 `#6b6560`; `next`: bordo, 18 / 800 alb, play 16, gap 6,
 * umbra `0 4px 10px rgba(155,27,48,0.35)`.
 */
export function GridCell({ label, state, onPress }: { label: string; state: 'done' | 'next' | 'locked'; onPress?: () => void }) {
  const cellWidth = useContext(GridWidth);
  const box = state === 'done' ? styles.cellDone : state === 'next' ? styles.cellNext : styles.cellLocked;
  const text = state === 'done' ? styles.cellDoneText : state === 'next' ? styles.cellNextText : styles.cellLockedText;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={`Cursa ${label}`}
      style={({ pressed }) => [
        styles.cell,
        box,
        state === 'next' ? shadowNext : null,
        cellWidth === null ? { flexBasis: '22%', flexGrow: 1 } : { width: cellWidth },
        { opacity: pressed ? 0.8 : 1 },
      ]}
    >
      {state === 'next' ? <PlayIcon /> : null}
      <Text style={text}>{label}</Text>
    </Pressable>
  );
}

// ── Progres, banner, GPS ──────────────────────────────────────────────────────

/**
 * «Completate 17 din 29» / «Urmează 15:15» (15 / 600, `#333` / bordo) peste bara 8 înaltă,
 * fundal `#e6e2de`, umplere bordo, rază 4.
 */
export function ProgressBar({ done, total, next }: { done: number; total: number; next?: string | null }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <View style={{ gap: 6 }}>
      <View style={styles.progressRow}>
        <Text style={styles.progressText}>
          Completate {done} din {total}
        </Text>
        {next ? <Text style={[styles.progressText, { color: colors.primary }]}>Urmează {next}</Text> : null}
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${pct}%` }]} />
      </View>
    </View>
  );
}

/**
 * Banner-ul galben cu cameră: `#fff7e6`, bordură 2 `#f0c674`, rază 12, padding 12 / 14,
 * gap 12, cameră 26 `#d97706`; text 15 `#1f1a1b`, `lineHeight 1.4`, cu începutul 700.
 */
export function Banner({ bold, children }: PropsWithChildren<{ bold?: string }>) {
  return (
    <View style={styles.banner}>
      <CameraIcon size={26} color={colors.warningIcon} />
      <Body bold={bold} style={{ flexShrink: 1 }}>
        {children}
      </Body>
    </View>
  );
}

export type GpsState = 'in' | 'out' | 'off';

/**
 * Rândul GPS: alb, bordură 2 `#b7dcc1`, rază 12, padding 10 / 14, gap 10, pin 22 `#16a34a`;
 * titlul 15 / 700 `#1f6b34`, textul mic 13 `#6b6560`. `out`: roșu; `off`: gri.
 * `boxed={false}` = varianta din Cursa (fără casetă, padding 4 / 6, text 15 / 600).
 */
export function GpsRow({ state, title, detail, boxed = true }: { state: GpsState; title: string; detail?: string | null; boxed?: boolean }) {
  const accent = state === 'in' ? colors.selectedBorder : state === 'out' ? colors.danger : colors.faint;
  const titleColor = state === 'in' ? colors.doneText : state === 'out' ? colors.danger : colors.faint;
  const border = state === 'in' ? colors.doneBorder : state === 'out' ? colors.dangerBorder : colors.border;
  if (!boxed) {
    return (
      <View style={styles.gpsPlain}>
        <PinIcon color={accent} />
        <Text style={[styles.gpsPlainText, { color: titleColor }]}>{title}</Text>
      </View>
    );
  }
  return (
    <View style={[styles.gps, { borderColor: border }]}>
      <PinIcon color={accent} />
      <View style={{ gap: 1, flexShrink: 1 }}>
        <Text style={[styles.gpsTitle, { color: titleColor }]}>{title}</Text>
        {detail ? <Text style={styles.gpsDetail}>{detail}</Text> : null}
      </View>
    </View>
  );
}

// ── Aliasuri pentru ecranele nerescrise (S02) ─────────────────────────────────

/** Titlu de ecran 24 / 800 (alias; ecranele noi folosesc `DayHeader` / `Header`). */
export function Title({ children }: PropsWithChildren) {
  return <Text style={styles.dayTitle}>{children}</Text>;
}

/** Text discret 14 `#6b6560` (alias pentru `Footnote` aliniat la stânga). */
export function Muted({ children }: PropsWithChildren) {
  return <Text style={[styles.footnote, { textAlign: 'left' }]}>{children}</Text>;
}

/** Alias pentru `Question`. */
export function SectionTitle({ children }: PropsWithChildren) {
  return <Question>{children}</Question>;
}

export type Tone = 'primary' | 'neutral' | 'danger' | 'success';

/** Alias vechi: `primary` / `success` → butonul bordo, `neutral` → contur neutru, `danger` → roșu. */
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
  if (tone === 'neutral') {
    return <OutlineButton label={label} onPress={onPress} disabled={disabled} tone="neutral" height={big ? sizes.buttonHeightBig : sizes.buttonHeight} fontSize={16} fontWeight={700} style={style} />;
  }
  return (
    <PrimaryButton
      label={label}
      onPress={onPress}
      disabled={disabled}
      size={big ? 'lg' : 'md'}
      style={[tone === 'danger' ? { backgroundColor: colors.danger } : null, style]}
    />
  );
}

/** Alias vechi: eticheta (`Question`) + rândul de opțiuni; opțiunile selectate verzi, `danger` roșii. */
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
    <View style={{ gap: 8 }}>
      {label ? <Question>{label}</Question> : null}
      <OptionRow style={{ flexWrap: 'wrap' }}>
        {options.map((o) => (
          <Option key={o.key} label={o.label} selected={o.key === value} onPress={() => onChange(o.key)} disabled={disabled} tone={o.tone === 'danger' ? 'danger' : 'success'} style={{ minWidth: 96 }} />
        ))}
      </OptionRow>
    </View>
  );
}

export const YES_NO: readonly Option<'yes' | 'no'>[] = [
  { key: 'yes', label: 'Da', tone: 'success' },
  { key: 'no', label: 'Nu', tone: 'danger' },
];

// ── Stiluri ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },

  dayHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
  kicker: { fontSize: 14, ...weight(600), color: colors.primary, letterSpacing: 2 },
  dayTitle: { fontSize: 24, ...weight(800), color: colors.text },
  dayRight: { fontSize: 15, ...weight(600), color: colors.muted },

  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backHit: { width: sizes.backHit, height: sizes.backHit, marginLeft: -8, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  headerTitle: { ...weight(800), color: colors.text },
  headerSubtitle: { fontSize: 14, ...weight(600), color: colors.muted },

  pill: { backgroundColor: colors.warningBg, borderWidth: 1, borderColor: colors.warningBorder, borderRadius: radius.pill, paddingVertical: 4, paddingHorizontal: 10 },
  pillText: { fontSize: 13, ...weight(700), color: colors.warningText },

  card: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radius.card, padding: sizes.cardPadding, gap: sizes.cardGap },
  cardWarning: { backgroundColor: colors.warningBg, borderWidth: 2, borderColor: colors.warningBorder, borderRadius: radius.button, paddingVertical: 12, paddingHorizontal: 14, gap: 10 },
  cardDanger: { backgroundColor: colors.dangerBg, borderWidth: 2, borderColor: colors.dangerBorder, borderRadius: radius.button, paddingVertical: 12, paddingHorizontal: 14, gap: 10 },
  cardSuccess: { backgroundColor: colors.doneBg, borderWidth: 2, borderColor: colors.doneBorder, borderRadius: radius.button, paddingVertical: 12, paddingHorizontal: 14, gap: 10 },

  label: { fontSize: 13, ...weight(700), letterSpacing: 1.5, textTransform: 'uppercase', color: colors.muted },
  question: { fontSize: 17, ...weight(700), color: colors.text },
  footnote: { fontSize: 14, ...weight(400), color: colors.faint, lineHeight: 20 },
  body: { fontSize: 15, ...weight(400), color: colors.text, lineHeight: 21 },

  primary: { backgroundColor: colors.primary, borderRadius: radius.button, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 16 },
  primaryText: { color: colors.primaryText, textAlign: 'center' },
  outline: { backgroundColor: colors.card, borderWidth: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 14 },

  option: {
    flexGrow: 1,
    flexBasis: 0,
    minHeight: sizes.optionHeight,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.option,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  optionText: { fontSize: 15, textAlign: 'center', lineHeight: 18 },
  optionRow: { flexDirection: 'row', gap: 8 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: sizes.gridGap },
  cell: { height: sizes.gridCell, borderRadius: radius.option, borderWidth: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  cellDone: { backgroundColor: colors.doneBg, borderColor: colors.doneBorder, gap: 4 },
  cellLocked: { backgroundColor: colors.card, borderColor: colors.cardBorder, gap: 4 },
  cellNext: { backgroundColor: colors.primary, borderColor: colors.primary, gap: 6 },
  cellDoneText: { fontSize: 17, ...weight(700), color: colors.doneText },
  cellLockedText: { fontSize: 17, ...weight(600), color: colors.faint },
  cellNextText: { fontSize: 18, ...weight(800), color: colors.primaryText },

  progressRow: { flexDirection: 'row', justifyContent: 'space-between' },
  progressText: { fontSize: 15, ...weight(600), color: colors.textSoft },
  progressTrack: { height: sizes.progressHeight, backgroundColor: colors.cardBorder, borderRadius: radius.progress, overflow: 'hidden' },
  progressFill: { height: sizes.progressHeight, backgroundColor: colors.primary, borderRadius: radius.progress },

  banner: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.warningBg, borderWidth: 2, borderColor: colors.warningBorder, borderRadius: radius.button, paddingVertical: 12, paddingHorizontal: 14 },

  gps: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, borderWidth: 2, borderRadius: radius.button, paddingVertical: 10, paddingHorizontal: 14 },
  gpsTitle: { fontSize: 15, ...weight(700) },
  gpsDetail: { fontSize: 13, ...weight(400), color: colors.faint },
  gpsPlain: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4, paddingHorizontal: 6 },
  gpsPlainText: { fontSize: 15, ...weight(600), flexShrink: 1 },
});
