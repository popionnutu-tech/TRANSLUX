// Prenumele șoferului pentru voce (Ion, 24.08: fără nume de familie).
// Formatul din drivers.full_name NU e uniform (review d92af07): «Nume Prenume»,
// «Nume Prenume Patronimic» (Docuciaev Dumitru Petru), inițiale («Zaiț S.», «Goncear R I»).
// Regula: al DOILEA cuvânt plin = prenumele; inițialele nu-s nume; fără cuvinte
// pline în plus — mai bine numele de familie decât o literă («водитель — С.»).
const INITIAL_RE = /^\p{Lu}\.?$/u;

export function driverFirstName(fullName: string | null | undefined): string | null {
  const tokens = String(fullName ?? '').trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;
  const fullWords = tokens.filter((t) => !INITIAL_RE.test(t));
  if (fullWords.length >= 2) return fullWords[1];
  return fullWords[0] ?? tokens[0];
}
