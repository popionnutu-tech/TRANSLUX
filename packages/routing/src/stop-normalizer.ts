/**
 * Normalize stop name: lowercase, remove diacritics, trim aliases.
 *
 * Должен совпадать с нормализацией в scripts/import-km-prices.mjs —
 * иначе lookup в route_km_pairs не сработает.
 */

const STOP_ALIASES: Record<string, string> = {
  coteala: 'cotelea',
  hlinaia: 'hlina',
  'criva vama': 'criva',
  'gordinestii noi': 'gordinesti',
  'intersectia tabani': 'tabani',
  'intersectia trestieni': 'halahora de sus',
  'intersectia riscani': 'riscani',
  'petrom riscani': 'riscani',
  beleavinti: 'larga',
  'beleavinti/larga': 'larga',
  'berlinti/cotiujeni': 'cotiujeni',
  'caracusenii noi/-': 'caracusenii noi',
};

const DIACRITICS_REGEX = /[̀-ͯ]/g;

export function normalizeStop(name: string): string {
  let n = name
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(DIACRITICS_REGEX, '')
    .replace(/\s+/g, ' ');

  n = n.replace(/\s*translux$/i, '');
  n = n.replace(/\s+ga$/i, '');
  n = n.replace(/\(sat\)$/i, '');
  n = n.replace(/^ret\s+/i, '');
  n = n.replace(/^sl\.\s*/i, 'slobozia ');
  n = n.replace(/^-\//, '');
  n = n.replace(/\/-$/, '');

  n = n.trim();
  return STOP_ALIASES[n] || n;
}
