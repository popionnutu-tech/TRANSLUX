/**
 * Limita de căutări per sursă (anti-scraper).
 *
 * Ion, 09.09.2026: «blocarea la mai mult de 10 căutări în 10 minute». Un script
 * (ip_hash b18ebcb8ac3037e1) descărca zilnic la ~05:45 orarul de mâine: 178 de
 * căutări în 78 de secunde. Un om nu face 10 căutări în 10 minute decât foarte rar;
 * un scraper le face în primul minut.
 *
 * Sursa = ip_hash din search_log (migr. 282). Numărătoarea vine din RPC-ul
 * `cautari_recente` (migr. 334). Blocat = căutarea întoarce listă goală; căutarea
 * se loghează în continuare, ca scraperul să rămână vizibil în analytics.
 */
export const LIMITA_CAUTARI = 10;
export const FEREASTRA_MINUTE = 10;

/**
 * `anterioare` = câte căutări a făcut deja sursa în fereastră, ÎNAINTE de cea curentă.
 * A 11-a căutare e prima blocată: 10 anterioare ≥ limită.
 */
export function depasesteLimita(anterioare: number | null | undefined, limita = LIMITA_CAUTARI): boolean {
  if (anterioare == null || !Number.isFinite(anterioare)) return false; // fără date → nu blocăm
  return anterioare >= limita;
}
