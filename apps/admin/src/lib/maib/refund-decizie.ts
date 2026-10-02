/** Decizia pe comandă pentru o stare de refund maib (pură, testabilă, fără `server-only`). */
export function deciziaRefund(status: string): 'returnata' | 'respins' | 'in_curs' {
  const s = status.toLowerCase();
  if (s === 'accepted') return 'returnata';
  if (s === 'rejected' || s === 'manual') return 'respins';
  return 'in_curs';
}
