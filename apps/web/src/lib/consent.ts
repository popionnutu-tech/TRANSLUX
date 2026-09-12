/**
 * Notificarea cookie / GDPR a site-ului public translux.md.
 *
 * Legea nr. 195/2024 privind protecția datelor cu caracter personal (în vigoare
 * din 23.08.2026, transpune GDPR). Site-ul public NU folosește cookie-uri de
 * urmărire sau publicitate — singurele cookie-uri sunt strict necesare
 * (`translux-verificare`, autentificarea portalului partenerilor, și acesta,
 * care reține că vizitatorul a văzut notificarea). Statistica vizitelor
 * (`/api/analytics/track`) nu pune nimic pe dispozitivul vizitatorului și nu
 * folosește identificatori, deci nu cere consimțământ — de aceea bannerul e o
 * notificare cu un singur buton, nu un dialog «acceptă / refuză».
 *
 * Câmpul `analytics` există ca loc rezervat: dacă vreodată se adaugă un pixel
 * (Meta, TikTok) sau un identificator persistent, el devine categoria cu
 * consimțământ și bannerul primește al doilea buton. Până atunci rămâne `null`.
 */

export const CONSENT_COOKIE = 'translux_consent';
export const CONSENT_VERSION = 1;
/** 12 luni — după care notificarea se arată din nou. */
export const CONSENT_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;
/** Eveniment pe `window` prin care linkul «Setări cookie» redeschide bannerul. */
export const CONSENT_OPEN_EVENT = 'translux:consent-open';

export interface Consent {
  v: number;
  /** ISO 8601 — când a fost dat/confirmat. */
  ts: string;
  /** Statistică cu identificator persistent — azi nu există, rămâne null. */
  analytics: boolean | null;
}

export function parseConsent(raw: string | null | undefined): Consent | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(decodeURIComponent(raw)) as Partial<Consent>;
    if (!obj || typeof obj !== 'object') return null;
    if (obj.v !== CONSENT_VERSION) return null;
    if (typeof obj.ts !== 'string' || Number.isNaN(Date.parse(obj.ts))) return null;
    const analytics = typeof obj.analytics === 'boolean' ? obj.analytics : null;
    return { v: CONSENT_VERSION, ts: obj.ts, analytics };
  } catch {
    return null;
  }
}

export function serializeConsent(c: Consent): string {
  return encodeURIComponent(JSON.stringify({ v: c.v, ts: c.ts, analytics: c.analytics }));
}

function readCookieValue(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const prefix = `${name}=`;
  for (const part of document.cookie.split(';')) {
    const p = part.trim();
    if (p.startsWith(prefix)) return p.slice(prefix.length);
  }
  return null;
}

/** Consimțământul din browser sau null dacă notificarea n-a fost încă confirmată. */
export function readConsent(): Consent | null {
  return parseConsent(readCookieValue(CONSENT_COOKIE));
}

export function writeConsent(analytics: boolean | null = null): Consent {
  const c: Consent = { v: CONSENT_VERSION, ts: new Date().toISOString(), analytics };
  if (typeof document !== 'undefined') {
    const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? ';secure' : '';
    document.cookie = `${CONSENT_COOKIE}=${serializeConsent(c)};path=/;max-age=${CONSENT_MAX_AGE_SECONDS};samesite=lax${secure}`;
  }
  return c;
}

export function openConsentSettings(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CONSENT_OPEN_EVENT));
}
