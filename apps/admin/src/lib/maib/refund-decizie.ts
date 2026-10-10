/**
 * Decizia pe comandă pentru o stare de refund maib (pură, testabilă, fără `server-only`).
 * Revizia 10.10 (H2): «Manual» nu mai e un refuz — banca procesează refund-ul de mână, banii pot încă pleca. Nu se
 * retrimite nimic automat; intenția devine «blocata» (vizibilă, o alertă) și se recitește rar.
 */
export function deciziaRefund(status: string): 'returnata' | 'respins' | 'manual' | 'in_curs' {
  const s = status.toLowerCase();
  if (s === 'accepted') return 'returnata';
  if (s === 'rejected') return 'respins';
  if (s === 'manual') return 'manual';
  return 'in_curs';
}
