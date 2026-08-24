// Prenumele șoferului pentru voce (Ion, 24.08: fără nume de familie).
// Formatul din drivers.full_name NU e uniform (review d92af07): «Nume Prenume»,
// «Nume Prenume Patronimic» (Docuciaev Dumitru Petru), inițiale («Zaiț S.», «Goncear R I»).
// Regula: al DOILEA cuvânt plin = prenumele; inițialele nu-s nume. Ion (24.08):
// «unde nu este nume la șofer, nu se spune» — fără prenume real întoarcem null,
// iar fraza pentru voce dă doar numărul, fără nume.
const INITIAL_RE = /^\p{Lu}\.?$/u;

export function driverFirstName(fullName: string | null | undefined): string | null {
  const tokens = String(fullName ?? '').trim().split(/\s+/).filter(Boolean);
  const fullWords = tokens.filter((t) => !INITIAL_RE.test(t));
  return fullWords.length >= 2 ? fullWords[1] : null;
}
