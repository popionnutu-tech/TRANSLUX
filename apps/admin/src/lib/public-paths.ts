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
  '/api/fb-bot/',
  '/api/facebook/',
  '/api/tiktok/',
  '/api/schedule-image',
  // Mini App задачника: открывается в Telegram, защищается сам через initData (без cookie-сессии).
  '/mini-app/',
  '/api/zadachnik/',
  // Mini App atribuiri — se protejează singur prin initData, ca zadachnik.
  '/api/atribuiri/',
  // API între proiecte (mini app-ul TLX cere banda camioanelor) — se protejează
  // singur prin CAMIOANE_API_KEY. Fără prefixul ăsta, cererea fără cookie era
  // redirectată la /login și celălalt serviciu primea HTML în loc de JSON.
  '/api/extern/',
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
] as const;

export function isPublicPath(pathname: string): boolean {
  if ((PUBLIC_EXACT as readonly string[]).includes(pathname)) return true;
  return PUBLIC_PREFIXES.some(p => pathname.startsWith(p));
}
