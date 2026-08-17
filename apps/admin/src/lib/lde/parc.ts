/**
 * Logica pură din spatele paginii «Parc uzine» (/lde/parc), unde rolul UZINE
 * adaugă mașini și șoferi noi și îi leagă între ei.
 */

/** Numărul de înmatriculare așa cum îl ține baza: majuscule, doar litere și cifre.
 *  Alexei scrie «029 bras» sau «c-mv-123»; în vehicles stau «029BRAS», «239DQO». */
export function normalizeazaPlaca(input: string): string | null {
  const curat = (input ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return curat.length ? curat : null;
}

/** Traduce conflictul de unicitate (23505) pe legături în limbajul dispecerului.
 *  Indecșii parțiali din bază: un șofer = o legătură activă; o mașină = o legătură
 *  activă per schimb. */
export function mesajLegaturaDuplicata(mesajEroare: string): string {
  if (mesajEroare.includes('one_per_driver')) {
    return 'Șoferul are deja o mașină activă. Cere unui admin să încheie legătura veche întâi.';
  }
  if (mesajEroare.includes('one_per_vehicle_shift')) {
    return 'Mașina are deja un șofer pe schimbul ăsta. Alege alt schimb sau cere unui admin să încheie legătura veche.';
  }
  return 'Legătura există deja — verifică lista de mai jos.';
}
