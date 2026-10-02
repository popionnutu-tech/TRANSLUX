// ION-180 (Ion, 02.10.2026): «biletele după Bălți spre Chișinău să fie grupate în una și dacă apasă să se deschidă locațiile»,
// apoi «nu îmi ajunge Chișinău până la Bălți», apoi «asta să fie între Edineț și Bălți, inclusiv Edineț și fără Bălți, și
// încă o grupare de la Edineț în jos fără Edineț», apoi «divizează asta în 2 raioane Briceni și Ocnița», apoi «împarte separat
// raionul Edineț și împreună Drochia/Rîșcani» → dincolo de Bălți totul e pe raion. Funcții pure: cheia perechii (ca tiki_stop_norm din SQL, migr. 452),
// zonele față de Bălți și raioanele derivate din nomenclatorul interurban (interurban_v2_stops) și însumarea într-un rând de grup.

import type { TikiPairRow } from './types';

/** Numele stației fără diacritice, minuscule, fără «GA»/«gara»/«autogara». */
export function stopNorm(x: string): string {
  return x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/\b(ga|gara|autogara)\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Cheia perechii «A - B», fără sens. */
export function pairNorm(pair: string): string {
  const [a = '', b = ''] = pair.split(' - ');
  return [stopNorm(a), stopNorm(b)].sort().join('|');
}

/** Cum scrie TIKI unele stații față de nomenclator (verificat pe toate perechile din tiki_tickets, 02.10.2026). */
const TIKI_ALIAS: Record<string, string> = {
  'beleavineti': 'beleavinti',
  'cotelea': 'coteala',
  'gordinesti': 'gordinestii noi',
  'sl sirauti': 'slobozia sirauti',
};
/** Stații vândute în TIKI care lipsesc din nomenclatorul interurban (02.10.2026): unde stau. */
const LIPSA_DIN_NOMENCLATOR: Record<string, Zona> = {
  'alexandreni': 'intre', // Sîngerei, între Bălți și Sîngerei
};

export const CHISINAU = 'chisinau';
export const BALTI = 'balti';
/**
 * intre = între Chișinău și Bălți; dincolo de Bălți, pe coloana district din nomenclator: edinet / riscani (Drochia +
 * Rîșcani, satele pe unde trecem) / briceni / ocnita; nord = dincolo de Bălți fără raion cunoscut (în practică gol).
 */
export type Zona = 'intre' | 'edinet' | 'riscani' | 'briceni' | 'ocnita' | 'nord';
export const GRUP: Record<Zona, string> = {
  intre: 'Chișinău – până la Bălți',
  edinet: 'Chișinău – raionul Edineț',
  riscani: 'Chișinău – raioanele Drochia / Rîșcani',
  briceni: 'Chișinău – raionul Briceni',
  ocnita: 'Chișinău – raionul Ocnița',
  nord: 'Chișinău – după Bălți, alt raion',
};
export const ZONE: Zona[] = ['intre', 'edinet', 'riscani', 'briceni', 'ocnita', 'nord'];
const RAIOANE: Partial<Record<string, Zona>> = { edinet: 'edinet', riscani: 'riscani', drochia: 'riscani', briceni: 'briceni', ocnita: 'ocnita' };

export interface StopKm { tariff_id: number; name_ro: string; km_from_start: number | string | null; district?: string | null }
export type ZoneBalti = Record<Zona, Set<string>>;

/**
 * Zonele stațiilor, văzut din Chișinău, din nomenclatorul interurban. Pe fiecare tarif care are și Chișinău, și Bălți
 * se judecă pe km: «intre» = între Chișinău și Bălți; dincolo de Bălți stația se așază pe raionul ei (district).
 * Un tarif poate conține două trasee cu km diferiți (tariful 7: Otaci + Briceni), de aceea Bălți se ia la km minim/maxim,
 * iar o stație care pe vreun tarif stă între Bălți și Chișinău e «intre» (precedență: cea mai apropiată de Chișinău).
 */
export function zoneBalti(stops: StopKm[]): ZoneBalti {
  type T = { kbMin: number; kbMax: number; kc: number | null; rows: { n: string; km: number }[] };
  const byTariff = new Map<number, T>();
  const raion = new Map<string, Zona>();
  for (const s of stops) {
    const km = Number(s.km_from_start);
    if (!isFinite(km)) continue;
    const n = stopNorm(s.name_ro);
    const rz = s.district ? RAIOANE[stopNorm(s.district)] : undefined;
    if (rz) raion.set(n, rz);
    const t = byTariff.get(s.tariff_id) ?? { kbMin: Infinity, kbMax: -Infinity, kc: null, rows: [] };
    if (n === BALTI) { t.kbMin = Math.min(t.kbMin, km); t.kbMax = Math.max(t.kbMax, km); }
    else if (n === CHISINAU) t.kc = Math.max(t.kc ?? -Infinity, km);
    else t.rows.push({ n, km });
    byTariff.set(s.tariff_id, t);
  }
  const z: ZoneBalti = { intre: new Set(), edinet: new Set(), riscani: new Set(), briceni: new Set(), ocnita: new Set(), nord: new Set() };
  const dincolo = new Set<string>();
  for (const t of byTariff.values()) {
    if (t.kc == null || !isFinite(t.kbMin)) continue;
    // toate tarifele din nomenclator au Chișinău la capătul cu km mare; dacă nu, oglindim km-ii
    const flip = t.kc < t.kbMin;
    const f = (km: number) => (flip ? -km : km);
    const kbMin = flip ? -t.kbMax : t.kbMin, kbMax = flip ? -t.kbMin : t.kbMax;
    const kc = f(t.kc);
    for (const r of t.rows) {
      const km = f(r.km);
      if (km > kbMax && km < kc) z.intre.add(r.n);
      else if (km < kbMin) dincolo.add(r.n);
    }
  }
  for (const n of dincolo) {
    if (z.intre.has(n)) continue;
    z[raion.get(n) ?? 'nord'].add(n);
  }
  return z;
}

/** Grupul perechii «Chisinau - X», sau null (Bălți însuși, perechi fără Chișinău, necunoscute). */
export function zonaPerechii(pair: string, z: ZoneBalti): Zona | null {
  const [a = '', b = ''] = pair.split(' - ').map(stopNorm);
  if (a !== CHISINAU && b !== CHISINAU) return null;
  const x = a === CHISINAU ? b : a;
  if (!x || x === CHISINAU || x === BALTI) return null;
  const k = TIKI_ALIAS[x] ?? x;
  for (const zona of ZONE) if (z[zona].has(k)) return zona;
  return LIPSA_DIN_NOMENCLATOR[k] ?? null;
}

/** Însumarea perechilor într-un singur rând. */
export function sumPairs(rows: TikiPairRow[], pair: string): TikiPairRow {
  const z: TikiPairRow = { pair, tickets: 0, lei: 0, tur: 0, retur: 0, fara_sens: 0, statii: 0, dedus: 0 };
  for (const r of rows) {
    z.tickets += r.tickets; z.lei += r.lei; z.tur += r.tur; z.retur += r.retur;
    z.fara_sens += r.fara_sens; z.statii += r.statii; z.dedus += r.dedus;
  }
  return z;
}
