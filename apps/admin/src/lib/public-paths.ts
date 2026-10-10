// Căile pe care middleware-ul le lasă să treacă fără verificarea JWT-ului de sesiune.
// Fiecare se apără singură (CRON_SECRET, VOICE_API_KEY, semnătura webhook-urilor
// Facebook/TikTok, initData la mini app-uri, CAMIOANE_API_KEY la API-ul extern).
// Modul fără importuri Next: e testat ca funcție pură (public-paths.test.ts).

/** Prefixe publice: se compară cu `startsWith`, deci cele cu `/` la sfârșit acoperă un întreg subarbore. */
export const PUBLIC_PREFIXES = [
  '/login',
  '/access-denied',
  '/api/auth/',
  '/api/cron/',
  '/api/voice-tools/',
  '/api/voice-webhook',
  // Custom LLM proxy pentru agentul vocal — se protejează singur prin Bearer (VOICE_LLM_SECRET).
  '/api/voice/custom-llm/',
  // Init-webhook ElevenLabs (salut după ora zilei) — se protejează singur prin VOICE_API_KEY.
  '/api/voice/webhooks/',
  '/api/tiktok/',
  '/api/schedule-image',
  // Mini App задачника: открывается в Telegram, защищается сам через initData (без cookie-сессии).
  '/mini-app/',
  '/api/zadachnik/',
  // Mini App atribuiri — se protejează singur prin initData, ca zadachnik.
  '/api/atribuiri/',
  // API-ul mini app-ului șoferului pentru biletele online (ION-239): /azi și /scan se apără singure prin
  // X-Telegram-Init-Data (HMAC + drivers.telegram_id) și plafon pe șofer; rutele de sub prefix sunt listate în test.
  '/api/bilete-sofer/',
  // API între proiecte (mini app-ul TLX cere banda camioanelor) — se protejează
  // singur prin CAMIOANE_API_KEY. Fără prefixul ăsta, cererea fără cookie era
  // redirectată la /login și celălalt serviciu primea HTML în loc de JSON.
  '/api/extern/',
  // Pagina de probă fizică a biletelor online (migr. 532): fără sesiune, se apără singură — cheia secretă din
  // BILETE_PROBA_CHEIE + termenul BILETE_PROBA_PANA_LA, verificate și în pagină, și în fiecare acțiune.
  '/proba-bilete/',
] as const;

/**
 * Căi publice EXACTE (nu prefixe): `/api/version` răspunde cu sha-ul commit-ului
 * desfășurat pentru conveierul de sarcini (task-pipeline, `tp verify`). Un prefix ar fi
 * deschis tacit și orice `/api/version-…` viitor.
 */
export const PUBLIC_EXACT = [
  '/api/version',
  // Asistentul de pe translux.md (ION-37): se apără singur — CORS doar spre site,
  // plafoane pe conversație și pe sursă (app/api/asistent-site/route.ts).
  '/api/asistent-site',
  // Actualizarea punctului autobuzului pe harta din chat (ION-39) — aceeași apărare.
  '/api/asistent-site/pozitie',
  // Butonul «Acum» de pe prima pagină (ION-43): autobuzele de pe drum ale direcției.
  '/api/asistent-site/acum',
  // Linia rutelor de pe harta «Acum» (ION-206): geometrie publică, immutable, în CDN.
  '/api/asistent-site/forme',
  // Callback-ul maib Checkout (ION-188): banca POST-ează fără cookie; se apără singur prin
  // semnătura HMAC din X-Signature (lib/maib/signature.ts). Exact, nu prefix.
  '/api/pay/maib/callback',
  // Webhook-ul Resend (ION-250): evenimentele e-mailului biletului; se apără prin semnătura Svix. Exact.
  '/api/resend/webhook',
  // Comanda de bilete online (ION-193): site-ul o cheamă server-la-server; se apără prin BILETE_API_KEY.
  '/api/bilete/comanda',
  // 544: promoțiile Bălți ⇄ Chișinău — cota de preț și verificarea carnetului, apărate de BILETE_API_KEY
  '/api/bilete/pret',
  '/api/bilete/student/verifica',
  // Returnarea din botul Telegram (ION-244): botul (Railway) le cheamă server-la-server; se apără prin
  // BILETE_BOT_API_KEY (lib/bilete/bot-auth.ts), separată de cheia site-ului. Exacte, nu prefix.
  '/api/bilete/retur/bilete',
  '/api/bilete/retur/oferta',
  '/api/bilete/retur/confirma',
  '/api/bilete/retur/stare',
  '/api/bilete/retur/escaladeaza',
  // Plângerea clientului din bot (ION-252 / ION-247): aceeași cheie a botului (BILETE_BOT_API_KEY). Exactă, nu prefix.
  '/api/bilete/plangere',
  // Biletele clientului în mini app-ul Telegram de pe translux.md (ION-249): serverul site-ului o cheamă cu
  // BILETE_API_KEY + X-Telegram-Init-Data (HMAC cu tokenul botului); fără initData valid nu întoarce nimic. Exactă.
  '/api/bilete/client/bilete',
] as const;

/**
 * Prefixul biletelor pentru pasager (ION-193): pagina biletului (codul din link e secretul) și
 * configurația vânzării. Rutele de sub el sunt listate EXHAUSTIV în public-paths.test.ts: orice rută
 * nouă aici trebuie să fie gândită ca publică.
 */
export const BILETE_PUBLIC_PREFIX = '/api/bilete/public/';

export function isPublicPath(pathname: string): boolean {
  if ((PUBLIC_EXACT as readonly string[]).includes(pathname)) return true;
  if (pathname.startsWith(BILETE_PUBLIC_PREFIX)) return true;
  return PUBLIC_PREFIXES.some(p => pathname.startsWith(p));
}
