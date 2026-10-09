import { createHash, timingSafeEqual } from 'node:crypto';

// Pagina de probă fizică a biletelor online (migr. 532, Ion 08.10.2026: «pagina fără login», «biletul 10 lei»).
// Reguli pure, testate în proba-reguli.test.ts. Planul: docs/plans/2026-10-08-proba-fizica-bilete.md.

/** Lungimea minimă a cheii secrete din BILETE_PROBA_CHEIE (32 de octeți aleatori în base64url ≈ 43 de caractere). */
export const CHEIE_PROBA_MIN = 40;

/**
 * Cheia din URL e bună? Fail-closed: fără cheie configurată, cheie prea scurtă, termen lipsă/nevalid sau trecut → nu.
 * Compararea în timp constant pe sha-256 (lungimi egale indiferent de ce trimite clientul).
 */
export function cheieProbaValida(primita: unknown, cfg: { cheie?: string | null; panaLa?: string | null }, aziIso: string): boolean {
  const cheie = String(cfg.cheie ?? '').trim();
  const pana = String(cfg.panaLa ?? '').trim();
  if (cheie.length < CHEIE_PROBA_MIN || !/^\d{4}-\d{2}-\d{2}$/.test(pana) || aziIso > pana) return false;
  if (typeof primita !== 'string' || !primita) return false;
  const a = createHash('sha256').update(primita).digest();
  const b = createHash('sha256').update(cheie).digest();
  return timingSafeEqual(a, b);
}

/** Pe pagina de probă se cumpără pentru azi, mâine sau poimâine (Chișinău); poimâine = > 24 h, returnare integrală după grilă (09.10). */
export function dataProbaPermisa(tripDate: unknown, aziIso: string, maineIso: string, poimaineIso?: string): tripDate is string {
  return tripDate === aziIso || tripDate === maineIso || (poimaineIso != null && tripDate === poimaineIso);
}

/** «37369123456» → «+373 69 ••• 456»: lista probelor nu arată telefonul întreg (revizia de securitate M2). */
export function telefonMascat(phone: string | null | undefined): string {
  const d = String(phone ?? '').replace(/\D/g, '');
  if (d.length < 6) return '•••';
  const local = d.startsWith('373') ? d.slice(3) : d;
  return `+373 ${local.slice(0, 2)} ••• ${local.slice(-3)}`;
}

export type PasProba = 'creata' | 'platita' | 'email' | 'telegram' | 'scanat' | 'returnat';

export interface StareProbaRand {
  status: string; email: string | null; email_livrat_la: string | null; telegram_id: number | string | null;
  bilete: Array<{ status: string }> | null;
}

/** Bifele unei comenzi de probă, în ordinea veriga: creată → plătită → e-mail → Telegram → scanat → returnat. */
export function pasiProba(c: StareProbaRand): Record<PasProba, boolean | null> {
  const platita = ['platita', 'platita_fara_bilet', 'anulata', 'returnata'].includes(c.status);
  const bilete = c.bilete ?? [];
  return {
    creata: true,
    platita,
    // fără e-mail lăsat → pasul nu se aplică (null), nu e «picat»
    email: c.email ? Boolean(c.email_livrat_la) : null,
    telegram: c.telegram_id != null,
    scanat: bilete.some((b) => b.status === 'urcat'),
    returnat: c.status === 'returnata' || c.status === 'anulata',
  };
}
