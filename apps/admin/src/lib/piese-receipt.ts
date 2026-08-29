// SURSĂ UNICĂ pentru suma de control a facturii de recepție (migr. 288).
//
// Fișier FĂRĂ 'server-only' → importabil ȘI din formulare (prihod, modalul de modificare), ȘI din garda
// de server. Altfel ecranul ar putea arăta „✓ se potrivește" pentru o sumă pe care serverul o respinge,
// iar depozitarul n-ar avea din ce să înțeleagă refuzul.

/** Un ban. Acoperă rotunjirea de pe factura furnizorului, nu o greșeală de tastare. */
export const TOTAL_TOLERANCE = 0.01;
/** Aceeași toleranță, în bani întregi — forma în care se face de fapt comparația (vezi totalDiffBani). */
export const TOLERANCE_BANI = 1;

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Suma liniilor, rotunjită PE LINIE apoi adunată — exact cum vede depozitarul în coloana „Sumă".
 *
 * De ce nu adunăm produsele brute: `unit_cost` e REAL (float4) în bază, iar formularul derivă prețul
 * unitar din sumă (`sum/qty`, 4 zecimale). Ambele abateri s-ar acumula peste toleranță la o factură cu
 * multe rânduri și ar bloca o recepție corectă, fără ieșire în afară de golirea câmpului de control.
 */
export function receiptLinesSum(lines: { qty: number; unit_cost: number }[]): number {
  return r2(lines.reduce((s, l) => s + r2(Number(l.qty) * Number(l.unit_cost)), 0));
}

/** Liniile pe care serverul le ia în calcul: cu piesă aleasă și cantitate > 0. Aceeași regulă în ambele părți. */
export function countableLines<T extends { part_id: number | ''; qty: number | string }>(lines: T[]): T[] {
  return lines.filter((l) => l.part_id && Number(l.qty) > 0);
}

/**
 * Diferența dintre liniile primite și totalul declarat, ÎN BANI ÎNTREGI.
 *
 * În bani, nu în lei, fiindcă `Math.abs(20 - 20.01)` dă 0.010000000000001563 în virgulă mobilă — adică o
 * abatere de exact un ban, perfect legitimă la rotunjirea de pe factura furnizorului, ar fi fost RESPINSĂ.
 * Rotunjind ambele capete la bani și comparând întregi, granița devine exactă.
 */
export function totalDiffBani(declared: number, lines: { qty: number; unit_cost: number }[]): number {
  return Math.abs(Math.round(receiptLinesSum(lines) * 100) - Math.round(declared * 100));
}

/** Totalul declarat se potrivește cu liniile? `declared == null` (câmp gol) = fără verificare. */
export function totalMatches(declared: number | null, lines: { qty: number; unit_cost: number }[]): boolean {
  if (declared == null) return true;
  if (!Number.isFinite(declared)) return false; // fail-closed: o valoare nefinită nu „se potrivește"
  return totalDiffBani(declared, lines) <= TOLERANCE_BANI;
}
