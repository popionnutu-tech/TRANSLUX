// ION-241 (Ion, 05.10.2026): fila «Portocalii» din /bilete — scanările care cer ochiul dispecerului.
// Portocalie = scanarea cu rezultat diferit de «ok» SAU venită din coada offline a mini app-ului (momentul de pe
// telefon e cu peste 2 minute înaintea momentului serverului: șoferul a scanat fără internet, biletul s-a confirmat
// târziu). Reguli pure, fără bază, testate; actions.ts le aplică pe rândurile din `bilete_scanari`.

export type RezultatScanare = 'ok' | 'neconfirmat' | 'deja_urcat' | 'anulat' | 'alta_cursa' | 'necunoscut';
export type ClasaScanare = 'ok' | 'neconfirmata' | 'invalida';

/** Pragul peste care o scanare se consideră venită din coada offline (client cu 2 min înaintea serverului). */
export const PRAG_OFFLINE_MS = 2 * 60_000;

export function esteDinCoadaOffline(momentClient: string | null, momentServer: string, pragMs = PRAG_OFFLINE_MS): boolean {
  if (!momentClient) return false;
  const c = Date.parse(momentClient);
  const s = Date.parse(momentServer);
  if (Number.isNaN(c) || Number.isNaN(s)) return false;
  return s - c > pragMs;
}

/** «ok» → ok; «neconfirmat» → neconfirmată; restul (deja_urcat, anulat, alta_cursa, necunoscut) → invalidă. */
export function clasaScanare(rezultat: string): ClasaScanare {
  if (rezultat === 'ok') return 'ok';
  if (rezultat === 'neconfirmat') return 'neconfirmata';
  return 'invalida';
}

export function estePortocalie(s: { rezultat: string; moment_client: string | null; moment_server: string }): boolean {
  return clasaScanare(s.rezultat) !== 'ok' || esteDinCoadaOffline(s.moment_client, s.moment_server);
}

/** Grupare pe zi (cheia dată de apelant, de regulă ziua Chișinău a momentului serverului), zilele noi primele. */
export function grupeazaPeZi<T>(randuri: T[], ziua: (r: T) => string): { zi: string; randuri: T[] }[] {
  const m = new Map<string, T[]>();
  for (const r of randuri) {
    const z = ziua(r);
    if (!m.has(z)) m.set(z, []);
    m.get(z)!.push(r);
  }
  return [...m.entries()].sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0)).map(([zi, randuri]) => ({ zi, randuri }));
}
