/**
 * Tema aplicației de peron — tokenii sunt luați literal din mockup-ul aprobat
 * (`docs/design/peron-android/*.dc.html`). Nicio culoare nu se scrie în ecrane;
 * totul trece pe aici. Numele vechi (`success`, `warning`, `locked`, `sizes.text`)
 * rămân ca aliasuri până sunt rescrise ecranele S02.
 */
import type { TextStyle, ViewStyle } from 'react-native';

export const colors = {
  /** Fundalul ecranului. */
  bg: '#f4f0ed',
  /** Cardul alb și bordura lui. */
  card: '#ffffff',
  cardBorder: '#e6e2de',
  /** Text principal / de corp (#333 în mockup la rânduri secundare) / secundar / discret. */
  text: '#1f1a1b',
  textSoft: '#333333',
  muted: '#666666',
  faint: '#6b6560',
  /** Bordura neutră a opțiunilor și a butoanelor de contur. */
  border: '#ddd9d5',
  /** Bordo TRANSLUX și varianta închisă (text pe fundal roz). */
  primary: '#9B1B30',
  primaryDark: '#7a1526',
  primaryText: '#ffffff',
  pinkBg: '#fbe9ec',
  /** Verde «selectat» (opțiune aleasă, verdict pozitiv). */
  selectedBg: '#e8f3ea',
  selectedBorder: '#16a34a',
  selectedText: '#1f6b34',
  /** Verde «cursă făcută» / rândul GPS în zonă. */
  doneBg: '#e8f3ea',
  doneBorder: '#b7dcc1',
  doneText: '#1f6b34',
  /** Galben de avertisment (banner, cardul de reparare). */
  warningBg: '#fff7e6',
  warningBorder: '#f0c674',
  warningText: '#8a4500',
  warningIcon: '#d97706',
  /** Roșu (verdict negativ, «MURDAR», în afara zonei). */
  danger: '#b91c1c',
  dangerBg: '#fbe9ec',
  dangerBorder: '#e4a3ad',
  /** Previzualizarea camerei și textul de pe ea. */
  camera: '#2a2426',
  cameraText: '#cfc7c9',

  // ── aliasuri pentru ecranele încă nerescrise (S02) ──
  success: '#16a34a',
  successBg: '#e8f3ea',
  warning: '#8a4500',
  locked: '#e6e2de',
} as const;

export const radius = {
  card: 14,
  button: 12,
  option: 10,
  pill: 999,
  progress: 4,
} as const;

/** Familiile încărcate în `app/_layout.tsx`; placa auto e monospace de sistem, ca în mockup. */
export const font = {
  regular: 'OpenSans_400Regular',
  semibold: 'OpenSans_600SemiBold',
  bold: 'OpenSans_700Bold',
  extrabold: 'OpenSans_800ExtraBold',
  mono: 'monospace',
} as const;

export type FontWeight = 400 | 600 | 700 | 800;

/** `fontFamily` pentru greutatea cerută — pe Android fontul custom nu ascultă de `fontWeight`. */
export function weight(w: FontWeight): Pick<TextStyle, 'fontFamily'> {
  switch (w) {
    case 800:
      return { fontFamily: font.extrabold };
    case 700:
      return { fontFamily: font.bold };
    case 600:
      return { fontFamily: font.semibold };
    default:
      return { fontFamily: font.regular };
  }
}

/** Dimensiuni din mockup. */
export const sizes = {
  /** Padding-ul ecranului: 56 sus, 16 lateral, 20 jos; spațiul între blocuri 14. */
  screenTop: 56,
  screenSide: 16,
  screenBottom: 20,
  screenGap: 14,
  /** Cardul: padding 16, gap 12. */
  cardPadding: 16,
  cardGap: 12,
  /** Butonul principal: 60 (Conectează) / 64 (Trimite raportul, Fă poza). */
  buttonHeight: 60,
  buttonHeightBig: 64,
  /** Opțiune (segment) și celula din grilă. */
  optionHeight: 52,
  gridCell: 64,
  gridColumns: 4,
  gridGap: 8,
  /** Bara de progres. */
  progressHeight: 8,
  /** Zona de atingere a săgeții înapoi. */
  backHit: 44,
  /** Pin-ul din rândul GPS. */
  gpsPin: 22,

  // ── aliasuri pentru ecranele încă nerescrise (S02) ──
  text: 15,
  textSmall: 14,
  title: 24,
  big: 40,
  radius: 12,
  gap: 12,
  padding: 16,
} as const;

/** Umbra butonului principal `0 4px 12px rgba(155,27,48,0.35)`; pe Android = elevation. */
export const shadowPrimary: ViewStyle = {
  shadowColor: colors.primary,
  shadowOpacity: 0.35,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 4,
};

/** Umbra celulei «următoare» din grilă `0 4px 10px rgba(155,27,48,0.35)`. */
export const shadowNext: ViewStyle = {
  shadowColor: colors.primary,
  shadowOpacity: 0.35,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 4,
};

/** Umbra cardului activ de curățenie `0 4px 14px rgba(155,27,48,0.15)`. */
export const shadowCard: ViewStyle = {
  shadowColor: colors.primary,
  shadowOpacity: 0.15,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 4 },
  elevation: 3,
};
