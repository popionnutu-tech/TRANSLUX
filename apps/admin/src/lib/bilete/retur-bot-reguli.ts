// Returnarea din botul Telegram (ION-244) — reguli pure, fără bază, testate în retur-bot-reguli.test.ts.
// Planul: docs/plans/2026-10-05-retur-bot-ai.md (corecturile 1, 4, 15′, 16′, 16″, 17′).

import { noimiRestituire, sumaRestituire } from './refund-reguli';

/** Oferta e valabilă 15 minute (Ion, 05.10), dar niciodată după pragul de 4 h înainte de plecare (plasa executorului). */
export const OFERTA_VALABILA_MS = 15 * 60_000;
export const PRAG_RETUR_MIN = 240;
/** Contractul maib (Anexa 1E): «Suma minimă a unei Operațiuni — 10 MDL»; sub ea returnarea merge la dispecer. */
export const SUMA_MINIMA_REFUND_MDL = 10;
export const CIFRE_INCERCARI_MAX = 5;

export type CalculOferta =
  | { tip: 'oferta'; noimi: number; suma: number; expiraMs: number }
  | { tip: 'fara_bani'; motiv: 'sub_4h' | 'plecat' }
  | { tip: 'dispecer'; motiv: 'sub_10' };

/** Ce primește clientul ACUM pentru comanda lui: oferta (sumă + expirare), nimic, sau dispecerul. */
export function calculeazaOferta(departureAt: string, total: number, nowMs: number): CalculOferta {
  const t = Date.parse(departureAt);
  if (!Number.isFinite(t) || nowMs >= t) return { tip: 'fara_bani', motiv: 'plecat' };
  const prag = t - PRAG_RETUR_MIN * 60_000;
  if (nowMs > prag) return { tip: 'fara_bani', motiv: 'sub_4h' };
  const noimi = noimiRestituire(departureAt, nowMs);
  if (noimi <= 0) return { tip: 'fara_bani', motiv: 'sub_4h' };
  const suma = sumaRestituire(total, noimi);
  if (suma < SUMA_MINIMA_REFUND_MDL) return { tip: 'dispecer', motiv: 'sub_10' };
  return { tip: 'oferta', noimi, suma, expiraMs: Math.min(nowMs + OFERTA_VALABILA_MS, prag) };
}

/** Ultimele 4 cifre ale telefonului din comandă (373XXXXXXXX) == ce a scris clientul (spații/cratime ignorate). */
export function cifreCorecte(phone: string, cifre: string): boolean {
  const p = String(phone ?? '').replace(/\D/g, '');
  const c = String(cifre ?? '').replace(/\D/g, '');
  return p.length >= 4 && c.length === 4 && p.slice(-4) === c;
}

export type StareRetur = 'neatinsa' | 'refuz' | 'finalizat' | 'refuz_banca' | 'creat' | 'necunoscut' | 'in_curs' | 'nedeterminat';

export interface DateStare {
  oferta: { folosita_la: string | null; rezultat: string | null };
  comanda: { status: string };
  checkout: { refund_id: string | null; refund_status: string | null } | null;
}

/** Tabelul stărilor din plan (16′ + 16″), în ordinea de evaluare. */
/** Cât timp o ofertă consumată, încă fără rezultat, e «în curs» (confirmarea rulează); după — «nedeterminat» (împăcarea C2 alertează). */
export const CONFIRMARE_IN_CURS_MS = 2 * 60_000;

export function stareRetur(d: DateStare, nowMs: number = Date.now()): { stare: StareRetur; motiv?: string } {
  if (!d.oferta.folosita_la) return { stare: 'neatinsa' };
  if (d.oferta.rezultat?.startsWith('refuz:')) return { stare: 'refuz', motiv: d.oferta.rezultat.slice(6) };
  if (d.comanda.status === 'returnata') return { stare: 'finalizat' };
  const st = (d.checkout?.refund_status ?? '').toLowerCase();
  if (d.comanda.status === 'anulata') {
    if (st === 'rejected' || st === 'manual') return { stare: 'refuz_banca' };
    if (st === 'necunoscut') return { stare: 'necunoscut' };
    if (d.checkout?.refund_id) return { stare: 'creat' };
    return { stare: 'in_curs' };
  }
  // a doua apăsare cât prima încă rulează (dublu clic): nu «nedeterminat», ci «în curs»
  if (!d.oferta.rezultat && nowMs - Date.parse(d.oferta.folosita_la) < CONFIRMARE_IN_CURS_MS) return { stare: 'in_curs' };
  return { stare: 'nedeterminat' };
}
