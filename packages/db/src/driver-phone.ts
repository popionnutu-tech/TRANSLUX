/**
 * Telefonul șoferului — o singură regulă pentru toate intrările (admin + bot).
 *
 * De ce e obligatoriu (decizie Ion, 15.08.2026): site-ul public ascunde COMPLET
 * cursa dacă șoferul zilei n-are număr (apps/web/src/app/(public)/actions.ts:490),
 * deci pasagerul vede „0 curse" pe o cursă care circulă — cazul Otaci 16:25.
 */

export class PhoneError extends Error {}

/** Aduce numărul la forma canonică 373XXXXXXXX. Aruncă PhoneError dacă lipsește sau e invalid. */
export function normalizeDriverPhone(phone: string | null | undefined): string {
  const cleaned = (phone || '').replace(/\D/g, '');
  if (!cleaned) throw new PhoneError('Telefonul este obligatoriu');
  const intl = cleaned.startsWith('373') ? cleaned : '373' + cleaned.replace(/^0/, '');
  // 373 + 8 cifre; mobilul moldovenesc începe cu 6 sau 7
  if (!/^373[67]\d{7}$/.test(intl)) {
    throw new PhoneError('Telefon invalid — introduceți un număr mobil moldovenesc (ex: 069123456)');
  }
  return intl;
}
