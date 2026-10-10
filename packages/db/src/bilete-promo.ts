/**
 * Promoțiile online Bălți ⇄ Chișinău (Ion, 10.10.2026; planul aprobat docs/plans/2026-10-10-promotii-balti.md, migr. 546):
 * −20% la retur (turul dovedit cu codul de retur) și −20% pentru studentul verificat de AI; nu se cumulează. Reguli PURE,
 * folosite de panou (creeazaComanda, cota de preț) și testate în bilete-promo.test.ts. Aceleași condiții se reverifică în
 * bază, sub lacăt (bilete_creeaza_comanda / bilete_revalideaza_plata).
 */
import { normalizeazaLocalitate } from './bilete-localitati.js';

export const PROMO_LOCALITATE = 'Bălți';
export const PROMO_DESTINATIE = 'Chișinău';
/** Minimul plății online (maib); sub el reducerea nu se aplică (nu se «fixează» la 10). */
export const PROMO_PRET_MINIM = 10;

/** Perechea promoțiilor: exact Bălți → Chișinău sau Chișinău → Bălți (fără diacritice, fără majuscule). */
export function perechePromo(urcare: string, coborare: string): boolean {
  const a = normalizeazaLocalitate(urcare), b = normalizeazaLocalitate(coborare);
  const l = normalizeazaLocalitate(PROMO_LOCALITATE), d = normalizeazaLocalitate(PROMO_DESTINATIE);
  return (a === l && b === d) || (a === d && b === l);
}

/** Prețul redus, pe întregi (identic cu round(numeric) din CHECK-ul 546); null dacă ar coborî sub minimul plății. */
export function aplicaReducere(pret: number, pct: number): number | null {
  if (!(pct >= 1 && pct <= 50) || !(pret > 0)) return null;
  const redus = Math.round((pret * (100 - pct)) / 100);
  return redus >= PROMO_PRET_MINIM ? redus : null;
}

export interface CotaConfig {
  /** Locuri online pe cursă pe localitate (app_config.bilete_locuri_localitate, ex. Bălți: 4). */
  plafon: number;
  /** Ora locală de la care se aplică cota de seară (bilete_cota_dupa_ora, 12). */
  dupaOra: number;
  /** Cota de seară (bilete_cota_seara, 2). */
  seara: number;
}

/** Ora și ziua săptămânii (ISO: 1 luni … 7 duminică) în Europe/Chisinau. */
export function oraSiZiChisinau(iso: string): { ora: number; minut: number; isodow: number } {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Chisinau', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(new Date(iso));
  const zi = p.find((x) => x.type === 'weekday')?.value ?? '';
  const ora = Number(p.find((x) => x.type === 'hour')?.value ?? 0) % 24;
  const minut = Number(p.find((x) => x.type === 'minute')?.value ?? 0);
  const isodow = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(zi) + 1;
  return { ora, minut, isodow };
}

/**
 * Cota online a cursei (Ion, 10.10: «vineri până la orele 12 putem vinde câte dorim, fluxul e mic; după ora 12 lăsăm minim
 * 2 locuri»; duminică spre Chișinău la fel): vineri spre Bălți (going_north) și duminică spre Chișinău (spre sud), cu
 * plecarea la ora locală ≥ `dupaOra` → `seara`; altfel plafonul.
 */
export function cotaOnline(goingNorth: boolean, departureAt: string, cfg: CotaConfig): number {
  const { ora, isodow } = oraSiZiChisinau(departureAt);
  const ziAglomerata = (isodow === 5 && goingNorth) || (isodow === 7 && !goingNorth);
  return ziAglomerata && ora >= cfg.dupaOra ? Math.min(cfg.seara, cfg.plafon) : cfg.plafon;
}

/** Comanda-tur, așa cum o vede regula returului. */
export interface TurPentruRetur {
  id: string;
  status: string;
  test: boolean;
  proba_fizica: boolean;
  promo_pereche: boolean;
  comanda_tur_id: string | null;
  reducere_tip: string | null;
  phone: string;
  passenger_name: string;
  going_north: boolean;
  crm_route_id: number;
  trip_date: string;
  departure_at: string;
  seats: number;
}

export interface ReturCerut {
  phone: string;
  passengerName: string;
  goingNorth: boolean;
  crmRouteId: number;
  tripDate: string;
  departureAt: string;
  seats: number;
  test: boolean;
  /** Ambele capete ale returului (urcare/coborâre) — trebuie să fie perechea inversă a turului. */
  urcare: string;
  coborare: string;
  /** Turul: de unde/până unde (pentru perechea inversă). */
  turUrcare: string;
  turCoborare: string;
}

export type MotivRetur =
  | 'tur_neplatit' | 'tur_test' | 'tur_e_retur' | 'nu_e_pereche' | 'alta_persoana' | 'acelasi_sens' | 'aceeasi_ruta'
  | 'inainte_de_tur' | 'peste_termen' | 'prea_multe_locuri';

/** Normalizarea numelui pentru comparare: fără diacritice, litere mici, cuvintele în ordine alfabetică. */
export function cheieNume(nume: string): string {
  return String(nume ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-zЀ-ӿ\s-]/g, ' ').split(/[\s-]+/).filter(Boolean).sort().join(' ');
}

/**
 * Returul cu −20% (Ion, 10.10): turul plătit, nu de test, nu el însuși un retur redus (fără lanț), pe perechea promo;
 * aceeași persoană (telefon + nume); sensul opus și perechea inversă; NICIODATĂ pe aceeași rută (crm_route_id: aceeași
 * mașină și același șofer fac ambele sensuri — «ca să nu facă fraudă șoferul»); după plecarea turului; ≤ `zile` zile.
 */
export function returValid(tur: TurPentruRetur, r: ReturCerut, zile: number): { ok: true } | { ok: false; motiv: MotivRetur } {
  if (tur.status !== 'platita') return { ok: false, motiv: 'tur_neplatit' };
  if (tur.test !== r.test || tur.proba_fizica) return { ok: false, motiv: 'tur_test' };
  if (tur.comanda_tur_id || tur.reducere_tip === 'retur') return { ok: false, motiv: 'tur_e_retur' };
  if (!tur.promo_pereche || !perechePromo(r.urcare, r.coborare)) return { ok: false, motiv: 'nu_e_pereche' };
  if (normalizeazaLocalitate(r.urcare) !== normalizeazaLocalitate(r.turCoborare)
      || normalizeazaLocalitate(r.coborare) !== normalizeazaLocalitate(r.turUrcare)) return { ok: false, motiv: 'nu_e_pereche' };
  if (tur.phone !== r.phone || cheieNume(tur.passenger_name) !== cheieNume(r.passengerName)) return { ok: false, motiv: 'alta_persoana' };
  if (tur.going_north === r.goingNorth) return { ok: false, motiv: 'acelasi_sens' };
  if (tur.crm_route_id === r.crmRouteId) return { ok: false, motiv: 'aceeasi_ruta' };
  if (Date.parse(r.departureAt) <= Date.parse(tur.departure_at)) return { ok: false, motiv: 'inainte_de_tur' };
  const limita = new Date(Date.parse(`${tur.trip_date}T00:00:00Z`) + zile * 86_400_000).toISOString().slice(0, 10);
  if (r.tripDate > limita) return { ok: false, motiv: 'peste_termen' };
  if (r.seats > tur.seats) return { ok: false, motiv: 'prea_multe_locuri' };
  return { ok: true };
}

/** Telefonul cumpărătorului e al unui șofer → nicio promoție (Ion, 10.10: «ca să nu facă fraudă șoferul»). */
export function faraPromoPentruSofer(telefon: string, telefoaneSoferi: Iterable<string>): boolean {
  for (const t of telefoaneSoferi) if (t && t === telefon) return true;
  return false;
}

/** Reducerile nu se cumulează (Ion, 10.10): studentul are prioritate (are și verificarea), altfel returul. */
export function alegeReducerea(a: { student: boolean; retur: boolean }): 'student' | 'retur' | null {
  if (a.student) return 'student';
  if (a.retur) return 'retur';
  return null;
}

// ── Carnetul de student ────────────────────────────────────────────────────────────────────────────────────────────

/** Câmpurile pe care AI-ul le EXTRAGE din cele două poze; decizia o ia `decizieCarnet`, nu AI-ul. */
export interface ExtrasCarnet {
  e_carnet_student: boolean;
  tip_institutie: 'universitate' | 'colegiu' | 'altul' | null;
  institutie: string | null;
  nume_carnet: string | null;
  nume_act: string | null;
  tip_act: 'pasaport' | 'buletin' | 'altul' | null;
  /** Valabil până la (YYYY-MM-DD) sau anul de studii al vizei («2026-2027»). */
  valabil_pana: string | null;
  an_studii: string | null;
  numar_carnet: string | null;
  claritate: 'buna' | 'slaba';
  semne_ecran: boolean;
  semne_editare: boolean;
  fata_compatibila: boolean | null;
}

export type VerdictCarnet = { verdict: 'accept' } | { verdict: 'poza_neclara' | 'respins'; motiv: string };

/** Sfârșitul anului de studii «2026-2027» → 2027-07-31 (vara se încheie anul universitar). */
function sfarsitAnStudii(an: string | null): string | null {
  const m = /^(\d{4})\s*[-/–]\s*(\d{4})$/.exec(String(an ?? '').trim());
  if (!m || Number(m[2]) !== Number(m[1]) + 1) return null;
  return `${m[2]}-07-31`;
}

/**
 * Decizia pe carnet, DIN COD (security M2): carnet de student al unui colegiu sau al unei universități (din lista fixă),
 * valabil azi, numele de pe carnet = numele de pe act = pasagerul, fără semne de ecran/editare, fața compatibilă.
 */
export function decizieCarnet(x: ExtrasCarnet, pasager: string, aziIso: string, institutii: readonly string[]): VerdictCarnet {
  if (x.claritate !== 'buna') return { verdict: 'poza_neclara', motiv: 'poza_neclara' };
  if (x.semne_ecran) return { verdict: 'respins', motiv: 'poza_ecranului' };
  if (x.semne_editare) return { verdict: 'respins', motiv: 'editata' };
  if (!x.e_carnet_student || (x.tip_institutie !== 'universitate' && x.tip_institutie !== 'colegiu')) return { verdict: 'respins', motiv: 'nu_e_carnet' };
  if (x.tip_act !== 'pasaport' && x.tip_act !== 'buletin') return { verdict: 'respins', motiv: 'lipsa_act' };
  if (!instituteRecunoscuta(x.institutie ?? '', institutii)) return { verdict: 'respins', motiv: 'institutie_necunoscuta' };
  const p = cheieNume(pasager), c = cheieNume(x.nume_carnet ?? ''), a = cheieNume(x.nume_act ?? '');
  if (!c || !a) return { verdict: 'poza_neclara', motiv: 'nume_ilizibil' };
  if (c !== a) return { verdict: 'respins', motiv: 'nume_carnet_act' };
  if (c !== p) return { verdict: 'respins', motiv: 'nume_pasager' };
  // Fața trebuie confirmată pe ambele acte (security L4): «nu se vede» nu trece.
  if (x.fata_compatibila === false) return { verdict: 'respins', motiv: 'fata' };
  if (x.fata_compatibila !== true) return { verdict: 'poza_neclara', motiv: 'fata_neclara' };
  const pana = /^\d{4}-\d{2}-\d{2}$/.test(x.valabil_pana ?? '') ? x.valabil_pana : sfarsitAnStudii(x.an_studii);
  if (!pana) return { verdict: 'poza_neclara', motiv: 'valabilitate_ilizibila' };
  if (pana < aziIso) return { verdict: 'respins', motiv: 'expirat' };
  if (!x.numar_carnet || x.numar_carnet.trim().length < 3) return { verdict: 'poza_neclara', motiv: 'numar_ilizibil' };
  return { verdict: 'accept' };
}

/**
 * Colegiile și universitățile din Moldova (fragmente de nume, comparate fără diacritice, în română și rusă). Lista e
 * deliberat largă la cuvintele-cheie de instituție; numele propriu-zis l-a extras AI-ul de pe carnet.
 */
/** Cuvintele-cheie ale unui colegiu sau ale unei universități, potrivite pe cuvinte întregi (fără diacritice, RO/RU/EN). */
export const INSTITUTII_MD: readonly string[] = [
  'universitatea', 'universitate', 'university', 'университет', 'academia', 'academy', 'академия', 'institutul',
  'institut', 'институт', 'colegiul', 'colegiu', 'college', 'колледж', 'centrul de excelenta', 'центр передового опыта',
  'usm', 'utm', 'usmf', 'ase', 'asem', 'usarb', 'upsc', 'ulim', 'uasm', 'usem', 'ustarch', 'usefs', 'amtap', 'ustf', 'usch', 'usc',
];

/** Instituția extrasă conține unul dintre cuvintele-cheie ca CUVÂNT (nu ca fragment: «ase» nu prinde «baselor»). */
export function instituteRecunoscuta(institutie: string, cuvinte: readonly string[] = INSTITUTII_MD): boolean {
  const t = ` ${normalizeazaLocalitate(institutie).replace(/[^\p{L}\p{N}]+/gu, ' ')} `;
  return cuvinte.some((k) => t.includes(` ${normalizeazaLocalitate(k)} `));
}
