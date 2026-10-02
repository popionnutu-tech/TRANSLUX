// ION-180 (Ion, 02.10.2026): «biletele după Bălți spre Chișinău să fie grupate în una și dacă apasă să se deschidă locațiile».
// Funcții pure: cheia perechii (ca tiki_stop_norm din SQL, migr. 452), lista stațiilor de după Bălți derivată din
// nomenclatorul interurban (interurban_v2_stops), și însumarea perechilor într-un rând de grup.

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

export const CHISINAU = 'chisinau';
export const BALTI = 'balti';
export const GRUP_DUPA_BALTI = 'Chișinău – după Bălți';

export interface StopKm { tariff_id: number; name_ro: string; km_from_start: number | string | null }

/**
 * Stațiile de după Bălți (dincolo de Bălți, văzut din Chișinău), din nomenclatorul interurban.
 * Pe fiecare tarif care are și Chișinău, și Bălți: stația e «la nord» dacă stă, pe km, de partea cealaltă a Bălțiului
 * față de Chișinău. Un tarif poate conține două trasee cu km diferiți (tariful 7: Otaci + Briceni), de aceea se ia
 * Bălțiul cel mai apropiat de capăt (km minim) și se scot stațiile care pe vreun tarif stau între Bălți și Chișinău.
 */
export function nordDeBalti(stops: StopKm[]): Set<string> {
  type T = { kbMin: number; kbMax: number; kc: number | null; rows: { n: string; km: number }[] };
  const byTariff = new Map<number, T>();
  for (const s of stops) {
    const km = Number(s.km_from_start);
    if (!isFinite(km)) continue;
    const n = stopNorm(s.name_ro);
    const t = byTariff.get(s.tariff_id) ?? { kbMin: Infinity, kbMax: -Infinity, kc: null, rows: [] };
    if (n === BALTI) { t.kbMin = Math.min(t.kbMin, km); t.kbMax = Math.max(t.kbMax, km); }
    else if (n === CHISINAU) t.kc = Math.max(t.kc ?? -Infinity, km);
    else t.rows.push({ n, km });
    byTariff.set(s.tariff_id, t);
  }
  const nord = new Set<string>();
  const sud = new Set<string>();
  for (const t of byTariff.values()) {
    if (t.kc == null || !isFinite(t.kbMin)) continue;
    const chisinauLaCapatMare = t.kc > t.kbMin;
    for (const r of t.rows) {
      const dincolo = chisinauLaCapatMare ? r.km < t.kbMin : r.km > t.kbMax;
      const intre = chisinauLaCapatMare ? r.km > t.kbMax && r.km < t.kc : r.km < t.kbMin && r.km > t.kc;
      if (dincolo) nord.add(r.n);
      if (intre) sud.add(r.n);
    }
  }
  for (const n of sud) nord.delete(n);
  return nord;
}

/** Perechea «Chisinau - X» cu X după Bălți? */
export function esteDupaBalti(pair: string, nord: Set<string>): boolean {
  const [a = '', b = ''] = pair.split(' - ').map(stopNorm);
  if (a !== CHISINAU && b !== CHISINAU) return false;
  const x = a === CHISINAU ? b : a;
  if (!x || x === CHISINAU || x === BALTI) return false;
  return nord.has(TIKI_ALIAS[x] ?? x);
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
