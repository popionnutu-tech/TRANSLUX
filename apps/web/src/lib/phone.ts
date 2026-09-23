// Numerele de telefon pe translux.md: MEREU în forma internațională.
// Ion, 23.09: «numărul de la telefon să fie întotdeauna +373 și mai departe numărul
// fără 0, ca dacă sună peste hotare să poată automat suna». Forma «069…» merge doar
// dintr-o rețea moldovenească; «+373 69…» merge de oriunde, iar linkul `tel:` la fel.

/** Cifrele naționale (fără 0 și fără 373) sau null dacă nu e un număr moldovenesc. */
function national(raw: string | null | undefined): string | null {
  const d = String(raw ?? '').replace(/\D/g, '');
  if (/^373\d{8}$/.test(d)) return d.slice(3);
  if (/^0\d{8}$/.test(d)) return d.slice(1);
  if (/^\d{8}$/.test(d)) return d;
  return null;
}

/** «069123456» / «37369123456» → «+373 69 123 456». Altceva rămâne cum e. */
export function phoneText(raw: string): string {
  const n = national(raw);
  return n ? `+373 ${n.slice(0, 2)} ${n.slice(2, 5)} ${n.slice(5)}` : raw;
}

/** Linkul de apel: «tel:+37369123456» — cu «+», ca să sune și din roaming. */
export function phoneTel(raw: string): string {
  const n = national(raw);
  return n ? `tel:+373${n}` : `tel:${String(raw).replace(/[^\d+]/g, '')}`;
}

/** Linia companiei, în aceeași formă. */
export const LINE_TEXT = '+373 60 401 010';
export const LINE_TEL = 'tel:+37360401010';
