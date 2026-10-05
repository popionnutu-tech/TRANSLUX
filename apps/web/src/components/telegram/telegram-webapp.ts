// initData-ul Telegram pentru mini app-ul clientului (ION-249), FĂRĂ telegram-web-app.js (CSP-ul site-ului nu încarcă
// scripturi străine; ecranul complet îl face EcranCompletTelegram din bilet/BiletActiuni.tsx, ION-248). Telegram pune
// initData în fragmentul URL-ului (#tgWebAppData=…); se păstrează în sessionStorage la prima încărcare, fiindcă
// navigarea internă pierde fragmentul. Gol = pagina nu e deschisă din Telegram.

import { initDataDinFragment } from '@/lib/telegram-client';

const CHEIE_INIT_DATA = 'translux_tg_init_data';

export function citesteInitData(): string {
  if (typeof window === 'undefined') return '';
  const dinFragment = initDataDinFragment(window.location.hash);
  try {
    if (dinFragment) { sessionStorage.setItem(CHEIE_INIT_DATA, dinFragment); return dinFragment; }
    return sessionStorage.getItem(CHEIE_INIT_DATA) ?? '';
  } catch {
    return dinFragment; // sessionStorage blocat: rămâne doar fragmentul
  }
}
