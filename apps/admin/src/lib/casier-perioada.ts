/**
 * De la ce zi încolo se corectează documentul de casier.
 *
 * Ion, 05.10.2026: «corectări facem începând din octombrie». Septembrie și mai înainte sunt
 * predate în contabilitate: o corecție acolo ar schimba retroactiv un total deja raportat,
 * fără ca nimeni să afle. Lunile acelea rămân vizibile și căutabile, doar nu se mai editează —
 * inclusiv cele două neconcordanțe găsite pe septembrie (6 570 lei pe 04.09, 1 700 lei pe
 * 02.09), care se rezolvă separat, nu din acest ecran.
 *
 * Stă în `lib/`, nu lângă server actions: `incasareActions.ts` e un modul 'use server', iar
 * acolo nu se pot exporta decât funcții async — un `export const` rupe build-ul.
 */
export const CORECTII_DE_LA = '2026-10-01';

/** Ziua închisă se scrie în mesaje ca 01.10.2026, nu ca 2026-10-01. */
export function corectiiDeLaRo(): string {
  return CORECTII_DE_LA.split('-').reverse().join('.');
}
