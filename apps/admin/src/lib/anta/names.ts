// Nume de localități în graficul ANTA (Concurența pe direcție, ION-12).
//
// Fișierul ANTA scrie punctele fără diacritice, cu prefix de tip: «or. Chisinau», «s. Volodeni»,
// «mun. Comrat», «com. Ciorescu»; câteva sunt fără prefix («Bender», «Orhei (Vile)»).
// Lista de localități (Wikidata) are diacritice. Comparăm prin `foldName`.

export type PlaceType = 'or' | 's' | 'mun' | 'com' | '';

const PREFIX_RE = /^(or|s|mun|com)\.\s*(.+)$/;

/** «or. Chisinau» → { ty: 'or', name: 'Chisinau' }; «Bender» → { ty: '', name: 'Bender' }. */
export function splitPrefix(point: string): { ty: PlaceType; name: string } {
  const m = point.trim().match(PREFIX_RE);
  return m ? { ty: m[1] as PlaceType, name: m[2].trim() } : { ty: '', name: point.trim() };
}

/**
 * Cheie de comparație: fără diacritice (ș/ş, ț/ţ, ă, â, î), litere mici, fără paranteze
 * («Orhei (Vile)» → «orhei»), doar litere/cifre despărțite de un spațiu.
 */
export function foldName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s*\(.*?\)\s*/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Numele firmei din CSV: «&#9;» (tab HTML) și spațiile în plus. */
export function cleanOperator(s: string): string {
  return s.replace(/&#9;/g, ' ').replace(/\s+/g, ' ').trim();
}

/** «0:00» în fișier înseamnă «fără oră». Orele rămân ca text «H:MM». */
export function cleanTime(s: string | null | undefined): string | null {
  const t = (s ?? '').trim();
  return t && t !== '0:00' ? t : null;
}

/** «06:55» → «6:55» (formatul ANTA, fără zero în față). */
export function antaTime(hhmm: string | null | undefined): string | null {
  const t = (hhmm ?? '').trim();
  if (!t) return null;
  return t.replace(/^0(\d):/, '$1:');
}

/** Firma noastră, așa cum apare în graficul ANTA. */
export const OUR_OPERATOR = 'S.R.L. PARCUL DE AUTOBUZE ŞI TAXIMETRE NR.9 DIN BRICENI';
