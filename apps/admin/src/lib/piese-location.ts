// SURSĂ UNICĂ pentru adresa unei piese pe raft.
//
// Fișier FĂRĂ 'server-only' → importabil ȘI din client (formulare, hartă), ȘI din server (validare, layout),
// ca eticheta cerută în interfață și cea acceptată de gardă să nu poată diverge.
//
// Patru niveluri (cerut de Eduard, ca în programul precedent): STELAJ-RÂND-POLIȚĂ-CELULĂ, ex. A-12-3-5.
// De ce patru: cu trei niveluri, ultimul rămânea un simplu număr de ordine pe poliță, care nu spune
// depozitarului unde să pună mâna. Al patrulea transformă adresa în ceva regăsibil fizic.
//
// ATENȚIE ISTORICĂ: până la această schimbare, `parseLocation` tăia eticheta pe „-" și lua DOAR primele
// trei bucăți. O etichetă cu patru niveluri era acceptată la salvare, se scria întreagă în bază, dar harta
// afișa piesa fără ultimul nivel — pierdere tăcută. De aceea validarea de mai jos respinge explicit tot
// ce depășește patru niveluri, în loc să ignore surplusul.

export const LOCATION_LEVELS = ['Stelaj', 'Rând', 'Poliță', 'Celulă'] as const;
export const LOCATION_FORMAT = 'STELAJ-RÂND-POLIȚĂ-CELULĂ';
export const LOCATION_EXAMPLE = 'A-12-3-5';
export const LOCATION_MAX_LEVELS = LOCATION_LEVELS.length;

export interface ParsedLocation {
  section: string; // stelaj  (nivelul 1)
  rack: string;    // rând    (nivelul 2)
  shelf: string;   // poliță  (nivelul 3)
  cell: string;    // celulă  (nivelul 4)
}

/**
 * Desface eticheta în cele patru niveluri. Tolerant la etichete mai scurte (2 sau 3 niveluri), fiindcă
 * datele introduse înainte de patru niveluri rămân valide — nivelurile lipsă ies ca șir gol.
 * Nivelurile 1 și 2 cad pe „—" când lipsesc, ca harta să aibă mereu ce afișa.
 */
export function parseLocation(label: string | null | undefined): ParsedLocation {
  const m = (label || '').trim().toUpperCase().split('-').map((x) => x.trim());
  return { section: m[0] || '—', rack: m[1] || '—', shelf: m[2] || '', cell: m[3] || '' };
}

/** Adresa lizibilă pentru om: „stelaj A, rând 12, poliță 3, celula 5” — fără nivelurile lipsă. */
export function formatLocation(label: string | null | undefined): string {
  const p = parseLocation(label);
  const parts: string[] = [];
  if (p.section && p.section !== '—') parts.push(`stelaj ${p.section}`);
  if (p.rack && p.rack !== '—') parts.push(`rând ${p.rack}`);
  if (p.shelf) parts.push(`poliță ${p.shelf}`);
  if (p.cell) parts.push(`celula ${p.cell}`);
  return parts.length ? parts.join(', ') : '—';
}

export const LOCATION_MAX_LENGTH = 40;   // o adresă de raft nu are nevoie de mai mult
const LEVEL_RE = /^[A-Z0-9]+$/;          // litere și cifre; formatul cerut nu are nevoie de altceva

/**
 * Verifică formatul UNEI etichete. Întoarce motivul respingerii sau `null` dacă e bună.
 * Eticheta goală e permisă (piesă fără locație atribuită încă) — o cere apelantul dacă vrea obligativitate.
 *
 * Verifică pe forma NORMALIZATĂ, nu pe cea tastată: „a-12 - 3" e valid, fiindcă exact asta se va și salva.
 * Altfel am respinge literele mici pe care `normalizeLocation` oricum le face majuscule.
 */
export function locationError(label: string | null | undefined): string | null {
  const raw = normalizeLocation(label);
  if (!raw) return null; // fără locație = permis
  if (raw.length > LOCATION_MAX_LENGTH) return `prea lungă (maxim ${LOCATION_MAX_LENGTH} caractere)`;
  const parts = raw.split('-');
  // Nivelul gol se verifică ÎNAINTEA numărului de niveluri: „A-12-3-5-" are 5 bucăți, dar cauza reală
  // e cratima în plus la final, nu un al cincilea nivel — mesajul trebuie să spună asta.
  if (parts.some((p) => !p)) return 'un nivel e gol (nu lăsa „-” alături)';
  if (parts.length < 2) return 'lipsește rândul (minim STELAJ-RÂND)';
  if (parts.length > LOCATION_MAX_LEVELS) return `prea multe niveluri (maxim ${LOCATION_MAX_LEVELS}: ${LOCATION_FORMAT})`;
  // Doar litere și cifre per nivel. Ține eticheta desenabilă pe hartă și o scoate din calea oricărei
  // interogări viitoare care ar filtra după locație — azi ajunge doar în `.eq()`, dar nu vrem o mină.
  const bad = parts.find((p) => !LEVEL_RE.test(p));
  if (bad) return `nivelul „${bad}" are caractere nepermise (doar litere și cifre)`;
  return null;
}

/** Normalizează pentru stocare: majuscule, fără spații în jurul cratimelor. Etichetă goală → șir gol. */
export function normalizeLocation(label: string | null | undefined): string {
  const raw = (label || '').trim();
  if (!raw) return '';
  return raw.toUpperCase().split('-').map((x) => x.trim()).join('-');
}
