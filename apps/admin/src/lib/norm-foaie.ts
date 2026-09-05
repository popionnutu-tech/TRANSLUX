/**
 * Normalizarea numărului de foaie de parcurs — perechea funcției `norm_foaie(text)` din
 * baza de date (migr. 071): '0142961' și '142961' sunt aceeași foaie.
 *
 * Două diferențe intenționate față de varianta SQL, ambele în siguranță:
 *  - `trim()`: SQL-ul nu face trim, dar numerele se scriu deja trim-uite (server action +
 *    UI), deci pe valorile din bază cele două funcții dau exact același rezultat. Aici
 *    trim-ul acoperă textul netrimis încă, tastat în celulă.
 *  - peste 18 cifre valoarea rămâne text: SQL-ul ar arunca «out of range» la `::bigint`,
 *    iar `parseInt` ar pierde precizie. Numerele de foaie au 6-7 cifre; limita e o plasă.
 */
export function normFoaie(s: string): string {
  const t = s.trim();
  return /^[0-9]{1,18}$/.test(t) ? String(BigInt(t)) : t;
}
