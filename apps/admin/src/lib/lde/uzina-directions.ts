/**
 * Atribuirea unui șofer la o uzină trăiește în DOUĂ locuri:
 *   - `lde_driver_extras.uzina_id` — salariile și lista din /lde/soferi;
 *   - `drivers.directions` (text[]) — pickerul din grafic (`inDirection`).
 *
 * Multă vreme /lde/soferi scria doar primul, așa că cele două s-au despărțit:
 * la 17.08.2026, din 110 șoferi LDE activi, 93 aveau extras, 84 aveau directions
 * și doar 83 coincideau. Un șofer «pe jumătate atribuit» ori lipsește din grafic,
 * ori din statul de salarii.
 *
 * Aici stă regula unică de sincronizare, folosită de ambele pagini.
 */

/**
 * Înlocuiește uzina din `directions`, păstrând tot ce nu e uzină («camioane»,
 * «interurban», «suburban»). `uzinaNoua = null` = scoatem uzina, restul rămâne.
 *
 * NUMAI PENTRU ȘOFERI. Un șofer aparține unei singure uzine — așa a fost populat
 * în migr. 217 (`array[e.uzina_id]`) și așa arată modelul: `lde_driver_extras.uzina_id`
 * e o singură coloană, iar motorul de salarii ia o singură uzină per om.
 *
 * La MAȘINI modelul e invers: aceeași migrație le-a populat cu
 * `array_agg(distinct fr.uzina_id)`, adică o mașină deservește legitim mai multe
 * uzine. Aplicată pe o mașină, funcția asta i-ar ȘTERGE tăcut celelalte uzine.
 */
export function setUzinaInDirections(
  existente: string[] | null | undefined,
  uzinaNoua: string | null,
  toateUzinele: string[],
): string[] {
  const uzine = new Set(toateUzinele);
  const pastrate = (existente ?? []).filter((d) => !uzine.has(d));
  return uzinaNoua ? [...pastrate, uzinaNoua] : pastrate;
}

/** Compară două liste de direcții ignorând ordinea — ca să nu scriem degeaba în DB. */
export function acelasiSet(a: string[] | null | undefined, b: string[] | null | undefined): boolean {
  const sa = new Set(a ?? []);
  const sb = new Set(b ?? []);
  if (sa.size !== sb.size) return false;
  for (const v of sa) if (!sb.has(v)) return false;
  return true;
}
