/**
 * Regulile PURE ale împăcării (ION-196): ce categorie primește o comandă și când o sesiune maib e închisă.
 * Fără bază, fără rețea — testate exact.
 */

export type CategorieImpacare = 'fara_checkout' | 'cu_checkout' | 'refund' | 'nimic';

/** Cât așteptăm înainte să ne uităm la o comandă deschisă: sesiunea maib trăiește 25 min. */
export const VARSTA_MIN_MS = 30 * 60_000;
/** După atâtea încercări de creare comanda se închide și se alertează. */
export const INCERCARI_MAX = 3;
/** Un refund fără răspuns mai vechi de atât devine alertă pentru dispecer. */
export const REFUND_NECUNOSCUT_ALERTA_MS = 24 * 60 * 60_000;
/** Cursa fără șofer se alertează când plecarea e sub 3 ore. */
export const CURSA_FARA_SOFER_MS = 3 * 60 * 60_000;

export function clasificaComanda(
  c: { status: string; checkout_id: string | null; created_at: string; refund_finalizat_la: string | null },
  nowMs: number,
): CategorieImpacare {
  if (c.status === 'anulata') return c.refund_finalizat_la ? 'nimic' : 'refund';
  if (c.status !== 'noua' && c.status !== 'eroare_creare') return 'nimic';
  const varsta = nowMs - Date.parse(c.created_at);
  if (!(varsta >= VARSTA_MIN_MS)) return 'nimic';
  return c.checkout_id ? 'cu_checkout' : 'fara_checkout';
}

/** Stările maib după care sesiunea nu mai poate fi plătită (capitalizarea variază — comparăm fără ea). */
export function sesiuneInchisa(status: string | null | undefined): boolean {
  const s = (status ?? '').toLowerCase();
  return s === 'expired' || s === 'cancelled' || s === 'failed' || s === 'abandoned';
}

/** Cursa cu plecarea în mai puțin de 3 ore (și nu încă plecată) e candidată la alerta «fără șofer». */
export function inFereastraFaraSofer(departureAt: string, nowMs: number): boolean {
  const t = Date.parse(departureAt);
  return Number.isFinite(t) && t > nowMs && t - nowMs <= CURSA_FARA_SOFER_MS;
}

// ── 560: sesiunile maib și rezervarea (dezbaterea Claude ⇄ Codex 10.10.2026: C2 + C4; Ion: «dispecer nu va fi») ──────────

/** Rezervarea locului: created_at + 30 min (bilete_rezervare_durata din 501), neprelungită. */
export function rezervareExpirata(createdAt: string, nowMs: number): boolean {
  const t = Date.parse(createdAt);
  return !Number.isFinite(t) || nowMs >= t + VARSTA_MIN_MS;
}

/**
 * Sesiunea băncii trebuie închisă: comanda e deja «expirata», rezervarea a expirat (30 min), sau cursa a plecat. Vânzarea
 * se închide cel târziu la plecare; o sesiune deschisă mai devreme trăiește cel mult cât rezervarea, deci plecarea contează
 * doar pentru cumpărăturile din ultima jumătate de oră. O plată venită totuși după plecare e clasificată de
 * bilete_marcheaza_platita (bani înapoi automat, D2).
 */
export function sesiuneDeInchis(c: { status: string; created_at: string; departure_at: string }, nowMs: number): boolean {
  if (c.status === 'expirata') return true;
  if (rezervareExpirata(c.created_at, nowMs)) return true;
  const plecare = Date.parse(c.departure_at);
  return Number.isFinite(plecare) && nowMs >= plecare;
}

/**
 * Ce face împăcarea cu o sesiune după starea citită ACUM de la bancă (Codex Î1: verificare → cancel eligibil →
 * reverificare → expirare locală doar pe închidere confirmată fără plată):
 *   platita  — Completed: sincronizarea a chemat deja bilete_marcheaza_platita (bilet sau bani înapoi);
 *   expira   — banca confirmă închiderea fără plată: comanda devine «expirata» la noi;
 *   anuleaza — încă deschisă și trebuie închisă: cancelCheckout, apoi reverificare;
 *   asteapta — deschisă și încă în termen (sau cancel-ul n-a închis-o): se reverifică la rândul ei.
 */
export function deciziaSesiune(stareBanca: string | null | undefined, deInchis: boolean, dupaCancel = false): 'platita' | 'expira' | 'anuleaza' | 'asteapta' {
  const s = (stareBanca ?? '').toLowerCase();
  if (s === 'completed') return 'platita';
  if (sesiuneInchisa(s)) return 'expira';
  if (deInchis && !dupaCancel) return 'anuleaza';
  return 'asteapta';
}

/**
 * Rotația pasului B (Codex C2: «rotirea după updated_at nu rezolvă înfometarea când verificările eșuează»): cea mai
 * demult verificată întâi (niciodată = prima), apoi cea mai veche. Ora verificării se scrie și la eroare.
 */
export function ordineRotatie<T extends { impacare_verificata_la: string | null; created_at: string }>(xs: T[]): T[] {
  const t = (s: string | null) => (s == null ? -Infinity : Date.parse(s));
  return [...xs].sort((a, b) => t(a.impacare_verificata_la) - t(b.impacare_verificata_la) || Date.parse(a.created_at) - Date.parse(b.created_at));
}

/**
 * Portul TS al clasificării din bilete_marcheaza_platita (560) — aceeași ordine ca în SQL, verificată static în
 * teoretic-1000.test.ts. `necunoscuta` = ora execuției lipsește: nimic nu se schimbă până o citește împăcarea.
 */
export function clasificaPlata(p: {
  status: string; executatLa: string | null; departureAt: string; createdAt: string;
  locuriLibere: number; seats: number; revalidare: string | null;
}): 'necunoscuta' | 'emite' | 'plata_dupa_plecare' | 'loc_vandut' | string {
  if (p.executatLa == null || !Number.isFinite(Date.parse(p.executatLa))) return 'necunoscuta';
  const exec = Date.parse(p.executatLa);
  if (exec >= Date.parse(p.departureAt)) return 'plata_dupa_plecare';
  if ((p.status === 'expirata' || exec > Date.parse(p.createdAt) + VARSTA_MIN_MS) && p.locuriLibere < p.seats) return 'loc_vandut';
  return p.revalidare ?? 'emite';
}

// ── Revizia 10.10: M3 (ora execuției lipsă), M4 (sesiunea care nu se închide) ────────────────────────────────────────

/** M3: după atâtea citiri ale plății fără ora execuției, se folosește ora finalizării de la bancă (completedAt). */
export const ORA_LIPSA_PRAG = 3;
/** M4: după atâtea cancelCheckout fără efect pe o comandă, o alertă (împăcarea continuă să încerce). */
export const INCHIDERE_PRAG = 3;

const valida = (t: string | null | undefined): t is string => typeof t === 'string' && Number.isFinite(Date.parse(t));

/**
 * M3: ora după care se judecă plata (bilete_marcheaza_platita). `executedAt` de la bancă câștigă mereu. Lipsă: se numără
 * citirile; la ORA_LIPSA_PRAG se ia ora finalizării plății de la bancă (getCheckout.completedAt) și pleacă o alertă.
 * NICIODATĂ ora curentă: fără completedAt nu se clasifică nimic (blocat și vizibil, cu alertă).
 */
export function oraExecutarii(a: { executedAt: string | null | undefined; completedAt: string | null | undefined; lipsaInainte: number }):
  { ora: string | null; sursa: 'executedAt' | 'completedAt' | null; lipsa: number; alerta: boolean } {
  if (valida(a.executedAt)) return { ora: new Date(Date.parse(a.executedAt)).toISOString(), sursa: 'executedAt', lipsa: a.lipsaInainte, alerta: false };
  const lipsa = a.lipsaInainte + 1;
  if (lipsa < ORA_LIPSA_PRAG) return { ora: null, sursa: null, lipsa, alerta: false };
  if (valida(a.completedAt)) return { ora: new Date(Date.parse(a.completedAt)).toISOString(), sursa: 'completedAt', lipsa, alerta: true };
  return { ora: null, sursa: null, lipsa, alerta: true };
}

/** M4: alerta «sesiunea nu se închide» — o dată, când încercările fără efect ajung la prag. */
export function alertaSesiuneNeinchisa(incercariFaraEfect: number): boolean {
  return incercariFaraEfect >= INCHIDERE_PRAG;
}
