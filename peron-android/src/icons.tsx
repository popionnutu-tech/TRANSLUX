/**
 * Pictogramele din mockup, ca SVG inline (react-native-svg). Traseele sunt copiate
 * literal din `docs/design/peron-android/*.dc.html`; fără emoji în UI.
 */
import Svg, { Circle, Path } from 'react-native-svg';
import { colors } from './theme';

export interface IconProps {
  size?: number;
  color?: string;
  /** Grosimea liniei din mockup (2 / 2.2 / 2.4 / 2.6 / 1.8), diferă de la ecran la ecran. */
  strokeWidth?: number;
}

/** Pin de locație (rândul GPS, cardul de permisiuni). */
export function PinIcon({ size = 22, color = colors.selectedBorder, strokeWidth = 2.2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" />
      <Circle cx={12} cy={10} r={2.5} />
    </Svg>
  );
}

/** Cameră (banner-ul galben, «Poze curățenie», previzualizarea). */
export function CameraIcon({ size = 24, color = colors.primary, strokeWidth = 2.2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <Circle cx={12} cy={13} r={4} />
    </Svg>
  );
}

/** Bifă (verdict pozitiv, zonă curată). */
export function CheckIcon({ size = 20, color = colors.selectedBorder, strokeWidth = 2.6 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20 6L9 17l-5-5" />
    </Svg>
  );
}

/** X (verdict negativ, zonă murdară). */
export function XIcon({ size = 20, color = colors.danger, strokeWidth = 2.6 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M18 6L6 18M6 6l12 12" />
    </Svg>
  );
}

/** Triunghi «play» plin (cursa următoare din grilă). */
export function PlayIcon({ size = 16, color = colors.primaryText }: Pick<IconProps, 'size' | 'color'>) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color} stroke="none">
      <Path d="M6 4l14 8-14 8z" />
    </Svg>
  );
}

/** Săgeată înapoi (antetul ecranelor secundare). */
export function BackIcon({ size = 28, color = colors.primary, strokeWidth = 2.4 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M15 18l-6-6 6-6" />
    </Svg>
  );
}

/** Declanșator (butonul «Fă poza»): inel + disc plin. */
export function ShutterIcon({ size = 24, color = colors.primaryText, strokeWidth = 2.2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={12} cy={12} r={9} />
      <Circle cx={12} cy={12} r={4} fill={color} />
    </Svg>
  );
}

/** Siluetă (placeholder-ul pozei șoferului). */
export function PersonIcon({ size = 40, color = colors.primaryText, strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={12} cy={8} r={4} />
      <Path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
    </Svg>
  );
}
