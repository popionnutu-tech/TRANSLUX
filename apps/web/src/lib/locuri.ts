/**
 * Locurile în autobuz la cumpărarea online (ION-242): pasagerul care pleacă din Chișinău spre nord (going_north)
 * își alege locul pe harta autobuzului. Aici e doar logica PURĂ — schema autobuzului, starea fiecărui loc, alegerea,
 * reconcilierea după «loc_ocupat» și validarea câmpului din formular. Fără rețea, fără React — testată în locuri.test.ts.
 * Harta (ocupatele) o dă panoul: GET /api/bilete/public/locuri → { capacitate: 20, ocupate: [2, 3, 8], expira_la }.
 */

export const CAPACITATE_AUTOBUZ = 20;

/** O celulă din schema autobuzului: numărul locului, locul șoferului, culoarul sau un gol (fără loc). */
export type CelulaHarta = number | 'sofer' | 'culoar' | 'gol';

/**
 * Schema autobuzului de 20 de locuri (macheta mini app-ului șoferului, ION-240): în față șoferul și locul 1 lângă el,
 * cinci rânduri a câte trei (două în stânga, culoar, unul în dreapta; 2–16), rândul din spate cu patru (17–20).
 */
export const RANDURI_AUTOBUZ: ReadonlyArray<ReadonlyArray<CelulaHarta>> = [
  ['sofer', 'culoar', 'gol', 1],
  [2, 3, 'culoar', 4],
  [5, 6, 'culoar', 7],
  [8, 9, 'culoar', 10],
  [11, 12, 'culoar', 13],
  [14, 15, 'culoar', 16],
  [17, 18, 19, 20],
];

export interface LocuriCursa {
  capacitate: number;
  /** Locurile deja luate (plătite sau ținute), sortate, fără dubluri. */
  ocupate: number[];
}

function numereDeLoc(a: unknown, capacitate: number): number[] {
  if (!Array.isArray(a)) return [];
  const s = new Set<number>();
  for (const x of a) {
    const n = Number(x);
    if (Number.isInteger(n) && n >= 1 && n <= capacitate) s.add(n);
  }
  return [...s].sort((x, y) => x - y);
}

/** Răspunsul panoului → harta cursei; orice formă neașteptată → null (formularul merge fără alegere). */
export function parseazaLocuri(j: unknown): LocuriCursa | null {
  if (!j || typeof j !== 'object') return null;
  const o = j as Record<string, unknown>;
  if (o.ok === false) return null;
  const capacitate = Number(o.capacitate);
  if (!Number.isInteger(capacitate) || capacitate < 1 || capacitate > 99) return null;
  if (!Array.isArray(o.ocupate)) return null;
  return { capacitate, ocupate: numereDeLoc(o.ocupate, capacitate) };
}

export type StareLoc = 'liber' | 'ocupat' | 'ales';

/** Starea unui loc pe hartă: ocupat (gri, nealegibil) bate ales. */
export function stareLoc(nr: number, ocupate: readonly number[], alese: readonly number[]): StareLoc {
  if (ocupate.includes(nr)) return 'ocupat';
  if (alese.includes(nr)) return 'ales';
  return 'liber';
}

/**
 * O atingere pe loc: ales → se scoate; ocupat → nimic; liber → se adaugă dacă mai e loc în alegere. Cu un singur bilet,
 * atingerea altui loc mută alegerea (nu trebuie să dezalegi întâi); cu mai multe, la alegerea plină nu se mai adaugă.
 */
export function comutaLoc(alese: readonly number[], nr: number, seats: number, ocupate: readonly number[]): number[] {
  if (ocupate.includes(nr)) return [...alese];
  if (alese.includes(nr)) return alese.filter((x) => x !== nr);
  if (seats <= 1) return [nr];
  if (alese.length >= seats) return [...alese];
  return [...alese, nr];
}

/**
 * Reconcilierea alegerii cu harta nouă (după reîncărcare sau după «loc_ocupat»): locurile luate între timp cad,
 * iar dacă pasagerul a scăzut numărul de bilete rămân primele `seats`. Întoarce și ce s-a pierdut, pentru mesaj.
 */
export function potrivesteAlese(alese: readonly number[], seats: number, ocupate: readonly number[]): { alese: number[]; pierdute: number[] } {
  const pierdute = alese.filter((x) => ocupate.includes(x));
  const ramase = alese.filter((x) => !ocupate.includes(x)).slice(0, Math.max(0, seats));
  return { alese: ramase, pierdute };
}

export type LocuriAleseValidate =
  | { ok: true; locuri: number[] | null }
  | { ok: false; motiv: 'format' | 'numar' };

/**
 * Câmpul ascuns `locuriAlese` din formular (JSON array) → locurile pentru comandă. Pe tur (spre Chișinău) sau fără
 * câmp (harta n-a răspuns) → null = fără alegere, panoul dă locul la emitere. Cu câmp: exact `seats` locuri distincte,
 * întregi între 1 și capacitate; altfel 'numar' (nu-s toate) sau 'format' (ceva stricat).
 */
export function parseazaLocuriAlese(raw: unknown, seats: number, goingNorth: boolean, capacitate = CAPACITATE_AUTOBUZ): LocuriAleseValidate {
  if (!goingNorth) return { ok: true, locuri: null };
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (!s) return { ok: true, locuri: null };
  if (s.length > 200) return { ok: false, motiv: 'format' };
  let a: unknown;
  try { a = JSON.parse(s); } catch { return { ok: false, motiv: 'format' }; }
  if (!Array.isArray(a) || a.some((x) => !Number.isInteger(x) || x < 1 || x > capacitate)) return { ok: false, motiv: 'format' };
  const locuri = [...new Set(a as number[])].sort((x, y) => x - y);
  if (locuri.length !== a.length) return { ok: false, motiv: 'format' };
  if (locuri.length !== seats) return { ok: false, motiv: 'numar' };
  return { ok: true, locuri };
}

/** «3, 8» — numerele sortate, pentru mesaje. */
export function listaLocuri(nrs: readonly number[]): string {
  return [...new Set(nrs)].sort((x, y) => x - y).join(', ');
}

/** Mesajul după 409 loc_ocupat: care locuri s-au luat între timp, pe limbă, singular/plural. */
export function mesajLocOcupat(ocupate: readonly number[], locale: 'ro' | 'ru'): string {
  const n = new Set(ocupate).size;
  const lista = listaLocuri(ocupate);
  if (locale === 'ru') {
    return n === 1 ? `Место ${lista} только что заняли, выберите другое.` : `Места ${lista} только что заняли, выберите другие.`;
  }
  return n === 1 ? `Locul ${lista} tocmai a fost luat, alege altul.` : `Locurile ${lista} tocmai au fost luate, alege altele.`;
}
