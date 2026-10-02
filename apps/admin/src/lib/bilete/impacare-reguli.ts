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
