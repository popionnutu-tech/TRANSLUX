import crypto from 'crypto';

// Verificarea PURĂ a `initData` din Telegram Mini Apps (ION-239, pasul 7a din planul ION-190): HMAC-SHA256 cu cheia
// «WebAppData» peste tokenul botului, data-check-string = perechile fără `hash`, sortate, unite cu «\n». Extrasă din
// lib/zadachnik/auth.ts (care o importă de aici) ca mini app-ul șoferului să folosească aceeași verificare, dar fără
// ocolul `__dev__`. Fără bază, fără Next: se testează cu un token fals (init-data.test.ts).

export type InitDataVerificat =
  | { ok: true; telegramId: number; authDate: number; user: Record<string, unknown>; startParam: string | null }
  | { ok: false; motiv: 'lipsa' | 'semnatura' | 'expirat' | 'fara_user' };

/** Prospețimea implicită a initData: 24 h (ca în zadachnik). */
export const INIT_DATA_MAX_VARSTA_S = 86_400;

function hmacHex(secret: Buffer, dataCheck: string): string {
  return crypto.createHmac('sha256', secret).update(dataCheck).digest('hex');
}

/** Comparație în timp constant pe hex-uri de aceeași lungime (SEC-10). */
function egal(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

/**
 * `nowSec` se injectează pentru teste. Clienții Telegram diferă: `signature` (Ed25519) intră uneori în data-check-string,
 * alteori nu — semnătura e bună dacă se potrivește oricare variantă (comportamentul istoric din zadachnik).
 */
export function verifyInitData(initData: string | null | undefined, botToken: string, nowSec = Date.now() / 1000, maxVarstaS = INIT_DATA_MAX_VARSTA_S): InitDataVerificat {
  if (!initData || !botToken) return { ok: false, motiv: 'lipsa' };
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash || !/^[0-9a-f]{64}$/i.test(hash)) return { ok: false, motiv: 'semnatura' };

  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calc = (faraSemnatura: boolean): string => {
    const p = new URLSearchParams(initData);
    p.delete('hash');
    if (faraSemnatura) p.delete('signature');
    const dc = [...p.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
    return hmacHex(secret, dc);
  };
  const h = hash.toLowerCase();
  if (!egal(calc(true), h) && !egal(calc(false), h)) return { ok: false, motiv: 'semnatura' };

  const authDate = Number(params.get('auth_date') || 0);
  if (!Number.isFinite(authDate) || authDate <= 0 || nowSec - authDate > maxVarstaS) return { ok: false, motiv: 'expirat' };

  let user: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(params.get('user') || 'null');
    if (!parsed || typeof parsed !== 'object') return { ok: false, motiv: 'fara_user' };
    user = parsed as Record<string, unknown>;
  } catch {
    return { ok: false, motiv: 'fara_user' };
  }
  const id = Number(user.id);
  if (!Number.isFinite(id) || id <= 0) return { ok: false, motiv: 'fara_user' };
  return { ok: true, telegramId: id, authDate, user, startParam: params.get('start_param') };
}

/** Pentru teste și unelte: construiește un initData semnat corect cu tokenul dat. */
export function semneazaInitData(campuri: Record<string, string>, botToken: string): string {
  const p = new URLSearchParams(campuri);
  p.delete('hash');
  const dc = [...p.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  p.set('hash', hmacHex(secret, dc));
  return p.toString();
}
