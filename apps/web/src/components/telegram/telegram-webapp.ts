// Legătura cu Telegram.WebApp pentru mini app-ul clientului (ION-249). Scriptul telegram-web-app.js se încarcă din
// pagină (next/script); aici se așteaptă, apoi: ready(), expand(), requestFullscreen() când clientul are Bot API 8+
// (altfel doar expand), culorile antetului și butonul «înapoi» al Telegram. Totul e opțional: în browser obișnuit,
// fără Telegram, funcțiile nu fac nimic.

import { initDataDinFragment } from '@/lib/telegram-client';

/** Doar ce folosim din Telegram.WebApp (https://core.telegram.org/bots/webapps). */
export interface TelegramWebApp {
  initData: string;
  version?: string;
  ready(): void;
  expand(): void;
  isVersionAtLeast?(versiune: string): boolean;
  requestFullscreen?(): void;
  setHeaderColor?(culoare: string): void;
  setBackgroundColor?(culoare: string): void;
  disableVerticalSwipes?(): void;
  BackButton?: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
}

/** Prima versiune a Bot API cu ecran complet pentru mini app-uri. */
const VERSIUNE_ECRAN_COMPLET = '8.0';
const ASTEAPTA_PAS_MS = 50;
const ASTEAPTA_PASI_MAX = 60; // ~3 s
const CHEIE_INIT_DATA = 'translux_tg_init_data';

function webApp(): TelegramWebApp | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp ?? null;
}

/** Așteaptă scriptul Telegram (~3 s); null = nu suntem în Telegram sau scriptul nu s-a încărcat. */
export function asteaptaWebApp(): Promise<TelegramWebApp | null> {
  return new Promise((resolve) => {
    let pasi = 0;
    const t = setInterval(() => {
      const w = webApp();
      if (w || pasi++ >= ASTEAPTA_PASI_MAX) {
        clearInterval(t);
        resolve(w);
      }
    }, ASTEAPTA_PAS_MS);
  });
}

/** Ecran complet (Ion, 05.10: «trebuie să se deschidă pe full ecran»), cu antetul în culoarea paginii. */
export function pornesteEcranComplet(w: TelegramWebApp, culoareFundal: string): void {
  // Fiecare apel e separat: un client vechi care nu știe una dintre metode nu le strică pe celelalte.
  const incearca = (f: () => void) => { try { f(); } catch { /* clientul nu știe metoda */ } };
  incearca(() => w.ready());
  incearca(() => w.expand());
  incearca(() => w.setHeaderColor?.(culoareFundal));
  incearca(() => w.setBackgroundColor?.(culoareFundal));
  // Harta se trage cu degetul: fără asta, glisarea în jos închide mini app-ul.
  incearca(() => w.disableVerticalSwipes?.());
  if (w.requestFullscreen && w.isVersionAtLeast?.(VERSIUNE_ECRAN_COMPLET)) incearca(() => w.requestFullscreen?.());
}

/**
 * initData pentru server: din Telegram.WebApp, altfel din fragmentul URL-ului (#tgWebAppData), păstrat în sesiune
 * ca să supraviețuiască unei reîncărcări. Gol = pagina nu e deschisă din Telegram.
 */
export function citesteInitData(w: TelegramWebApp | null): string {
  if (w?.initData) return w.initData;
  if (typeof window === 'undefined') return '';
  const dinFragment = initDataDinFragment(window.location.hash);
  try {
    if (dinFragment) { sessionStorage.setItem(CHEIE_INIT_DATA, dinFragment); return dinFragment; }
    return sessionStorage.getItem(CHEIE_INIT_DATA) ?? '';
  } catch {
    return dinFragment; // sessionStorage blocat: rămâne doar fragmentul
  }
}

/** Butonul «înapoi» al Telegram cât e deschisă o fereastră (rezultatele căutării); întoarce funcția de curățare. */
export function legaButonInapoi(w: TelegramWebApp | null, laApasare: () => void): () => void {
  const b = w?.BackButton;
  if (!b) return () => {};
  b.onClick(laApasare);
  b.show();
  return () => { b.offClick(laApasare); b.hide(); };
}
