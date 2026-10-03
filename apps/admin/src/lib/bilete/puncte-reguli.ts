// Punctele de urcare pe localități (ION-198, migr. 490) — reguli pure, fără bază, testate în puncte-reguli.test.ts.
// Un punct aparține unei localități (crm_stop_fares.name_ro, exact) și se oferă doar pe perechile (rută, sens) pe care
// autobuzele chiar opresc acolo. going_north = true ⇔ retur (aceeași convenție ca bilete_comenzi).

export interface PunctRand {
  id: number;
  localitate: string;
  nume_ro: string;
  nume_ru: string;
  lat: number;
  lon: number;
  rang: number;
  /** [crm_route_id, going_north] */
  perechi: Array<[number, boolean]>;
}

/** Ce primește site-ul și ce se copiază în comandă — fără statistici despre flotă. */
export interface PunctPublic {
  id: number;
  nume_ro: string;
  nume_ru: string;
  lat: number;
  lon: number;
  rang: number;
  perechi: Array<[number, boolean]>;
}

export function catrePublic(p: PunctRand): PunctPublic {
  return { id: p.id, nume_ro: p.nume_ro, nume_ru: p.nume_ru, lat: p.lat, lon: p.lon, rang: p.rang, perechi: p.perechi };
}

/** Punctele active ale unei localități, după rang. Potrivire exactă pe name_ro canonic (fără metacaractere ilike). */
export function puncteLocalitate(active: PunctRand[], nameRo: string): PunctRand[] {
  const n = nameRo.trim();
  if (!n) return [];
  return active.filter((p) => p.localitate === n).sort((a, b) => a.rang - b.rang);
}

/** Punctele oferite pe o cursă: ale localității, cu pereche pe (rută, sens), după rang. */
export function punctePentru(active: PunctRand[], nameRo: string, routeId: number, goingNorth: boolean): PunctRand[] {
  return puncteLocalitate(active, nameRo).filter((p) => p.perechi.some(([r, n]) => r === routeId && n === goingNorth));
}

export type AlegerePunct =
  | { tip: 'niciunul' }
  | { tip: 'punct'; punct: PunctRand }
  | { tip: 'validare' };

/**
 * Punctul pe care îl primește comanda.
 * - cursa n-are puncte → niciunul (comanda fără punct, ca până acum);
 * - id-ul e în lista cursei → acela;
 * - id lipsă → primul din listă;
 * - id ∉ listă: dacă e al aceleiași localități (dezactivat între timp sau fără pereche pe sensul ăsta) → primul din listă;
 *   dacă e al altei localități sau nu există → validare.
 * `localitateaId` = localitatea punctului cerut, citită separat din bază (și dintre cele inactive); null = inexistent.
 */
export function alegePunct(lista: PunctRand[], nameRo: string, cerut: number | null | undefined, localitateaId: string | null): AlegerePunct {
  if (cerut != null && !(Number.isInteger(cerut) && cerut > 0)) return { tip: 'validare' };
  if (!lista.length) {
    if (cerut != null && localitateaId !== nameRo.trim()) return { tip: 'validare' };
    return { tip: 'niciunul' };
  }
  if (cerut == null) return { tip: 'punct', punct: lista[0] };
  const gasit = lista.find((p) => p.id === cerut);
  if (gasit) return { tip: 'punct', punct: gasit };
  if (localitateaId === nameRo.trim()) return { tip: 'punct', punct: lista[0] };
  return { tip: 'validare' };
}
