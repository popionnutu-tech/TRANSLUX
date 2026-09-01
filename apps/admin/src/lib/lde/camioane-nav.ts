// Filele modulului /lde/camioane. Funcție pură — o folosesc și navigația client,
// și gardienii server (fiecare pagină verifică singură dacă rolul are fila ei).
// Ion, 31.08: «unicul moment sa fie lde/camioane apoi in camioane sa apara toate
// tabelurile» — de aici o singură rută-rădăcină cu file, nu pagini împrăștiate.
export type CamioaneTab = { href: string; label: string };

// Ion, 01.09: «у этих трёх должна остаться только одна банда» — dispeceratul pe
// stări și grila de planificare s-au contopit în bandă. Vechile căi redirectează
// spre rădăcină, ca semnele salvate să nu ducă în gol.
const TOATE: CamioaneTab[] = [
  { href: '/lde/camioane', label: 'Bandă' },
  { href: '/lde/camioane/flota', label: 'Flotă' },
  { href: '/lde/camioane/puncte', label: 'Puncte' },
  { href: '/lde/camioane/analitica', label: 'Analitică' },
];

export function camioaneTabsForRole(role: string): CamioaneTab[] {
  if (role === 'ADMIN') return TOATE;
  // Analitica e a administratorului (decizia Ion): dispecerul planifică, nu se
  // evaluează singur.
  if (role === 'DISPECER') return TOATE.filter((t) => t.href !== '/lde/camioane/analitica');
  // OBSERVATOR (Ion, 01.09): «видят только календарь и карту». Banda le arată
  // amândouă într-un ecran; nomenclatoarele și analitica nu-i privesc.
  if (role === 'OBSERVATOR') return TOATE.filter((t) => t.href === '/lde/camioane');
  return [];
}

/**
 * Rolul are voie să SCRIE în modul? Verificare separată de cea pe cale, pentru că
 * a intra pe un ecran și a-l modifica sunt două drepturi diferite.
 *
 * Nu se deduce din `poateAccesa`: acțiunile de server folosesc o cale care nu mai
 * e filă ('/lde/camioane/planificare'), iar potrivirea pe prefix o rezolvă la
 * rădăcină — un observator ar fi trecut de ea. Lista e albă, nu neagră: un rol nou
 * nu capătă drept de scriere din neatenție.
 */
const ROLURI_CU_SCRIERE = ['ADMIN', 'DISPECER'];

export function poateScrie(role: string): boolean {
  return ROLURI_CU_SCRIERE.includes(role);
}

/** Rolul are voie pe această cale din modul? Folosit de layout și de acțiuni. */
export function poateAccesa(role: string, pathname: string): boolean {
  const permise = camioaneTabsForRole(role);
  if (permise.length === 0) return false;
  // Fila se caută în lista COMPLETĂ, nu în cea permisă: /lde/camioane prefixează
  // toate celelalte file, deci o căutare doar printre cele permise ar lăsa
  // dispecerul pe /analitica prin potrivirea cu rădăcina.
  const fila = TOATE
    .filter((t) => pathname === t.href || pathname.startsWith(t.href + '/'))
    .sort((a, b) => b.href.length - a.href.length)[0];
  if (!fila) return false;
  return permise.some((t) => t.href === fila.href);
}
