/**
 * Tema aplicației de peron: se folosește la soare, cu o mână, adesea cu mănuși.
 * Butoane înalte (≥ 56 px), text mare (≥ 18), contrast mare, fără gri deschis.
 */
export const colors = {
  bg: '#ffffff',
  card: '#f3f4f6',
  text: '#111111',
  muted: '#4b5563',
  border: '#d1d5db',
  primary: '#1d4ed8',
  primaryText: '#ffffff',
  success: '#15803d',
  successBg: '#dcfce7',
  warning: '#b45309',
  warningBg: '#fef3c7',
  danger: '#b91c1c',
  dangerBg: '#fee2e2',
  locked: '#e5e7eb',
} as const;

export const sizes = {
  text: 18,
  textSmall: 16,
  title: 24,
  big: 32,
  buttonHeight: 56,
  buttonHeightBig: 72,
  radius: 12,
  gap: 12,
  padding: 16,
} as const;
