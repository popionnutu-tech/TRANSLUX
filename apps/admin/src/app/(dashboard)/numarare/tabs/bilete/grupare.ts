// ION-180 (Ion, 02.10.2026): «biletele după Bălți spre Chișinău să fie grupate în una și dacă apasă să se deschidă locațiile»,
// apoi «nu îmi ajunge Chișinău până la Bălți». Funcții pure: cheia perechii (ca tiki_stop_norm din SQL, migr. 452),
// zonele față de Bălți derivate din nomenclatorul interurban (interurban_v2_stops) și însumarea perechilor într-un rând de grup.

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
/** Stații vândute în TIKI care lipsesc din nomenclatorul interurban (02.10.2026): unde stau față de Bălți. */
const LIPSA_DIN_NOMENCLATOR: Record<string, Zona> = {
  'alexandreni': 'intre', // Sîngerei, între Bălți și Sîngerei
};

export const CHISINAU = 'chisinau';
export const BALTI = 'balti';
export type Zona = 'nord' | 'intre';
export const GRUP: Record<Zona, string> = {
  nord: 'Chișinău – după Bălți',
  intre: 'Chișinău – până la Bălți',
};
export const ZONE: Zona[] = ['nord', 'intre'];

export interface StopKm { tariff_id: number; name_ro: string; km_from_start: number | string | null }
export interface ZoneBalti { nord: Set<string>; intre: Set<string> }

/**
 * Stațiile față de Bălți, văzut din Chișinău, din nomenclatorul interurban: «nord» = dincolo de Bălți, «intre» = între
 * Chișinău și Bălți. Pe fiecare tarif care are și Chișinău, și Bălți se judecă pe km. Un tarif poate conține două trasee
 * cu km diferiți (tariful 7: Otaci + Briceni), de aceea Bălți se ia la km minim/maxim și o stație care pe vreun tarif
 * stă între Bălți și Chișinău nu poate fi «nord».
 */
export function zoneBalti(stops: StopKm[]): ZoneBalti {
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
  const intre = new Set<string>();
  for (const t of byTariff.values()) {
    if (t.kc == null || !isFinite(t.kbMin)) continue;
    const chisinauLaCapatMare = t.kc > t.kbMin;
    for (const r of t.rows) {
      const dincolo = chisinauLaCapatMare ? r.km < t.kbMin : r.km > t.kbMax;
      const laMijloc = chisinauLaCapatMare ? r.km > t.kbMax && r.km < t.kc : r.km < t.kbMin && r.km > t.kc;
      if (dincolo) nord.add(r.n);
      if (laMijloc) intre.add(r.n);
    }
  }
  for (const n of intre) nord.delete(n);
  return { nord, intre };
}

/** Grupul perechii «Chisinau - X»: după Bălți, până la Bălți, sau niciunul (Bălți însuși, perechi fără Chișinău, necunoscute). */
export function zonaPerechii(pair: string, z: ZoneBalti): Zona | null {
  const [a = '', b = ''] = pair.split(' - ').map(stopNorm);
  if (a !== CHISINAU && b !== CHISINAU) return null;
  const x = a === CHISINAU ? b : a;
  if (!x || x === CHISINAU || x === BALTI) return null;
  const k = TIKI_ALIAS[x] ?? x;
  if (z.nord.has(k)) return 'nord';
  if (z.intre.has(k)) return 'intre';
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
