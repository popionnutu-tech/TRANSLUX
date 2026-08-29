// SURSĂ UNICĂ pentru suma de control a facturii de recepție (migr. 288).
//
// Fișier FĂRĂ 'server-only' → importabil ȘI din formulare (prihod, modalul de modificare), ȘI din garda
// de server. Altfel ecranul ar putea arăta „✓ se potrivește" pentru o sumă pe care serverul o respinge,
// iar depozitarul n-ar avea din ce să înțeleagă refuzul.

/** Un ban. Acoperă rotunjirea, nu o greșeală de tastare. */
export const TOTAL_TOLERANCE = 0.01;

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

/** Totalul declarat se potrivește cu liniile? `declared == null` (câmp gol) = fără verificare. */
export function totalMatches(declared: number | null, lines: { qty: number; unit_cost: number }[]): boolean {
  if (declared == null || !Number.isFinite(declared)) return declared == null;
  return Math.abs(receiptLinesSum(lines) - declared) <= TOTAL_TOLERANCE;
}
