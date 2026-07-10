import { createHmac, timingSafeEqual } from 'crypto';

const MAX_SKEW_MS = 30 * 60 * 1000;

/**
 * Проверка подписи post-call webhook ElevenLabs.
 * Заголовок: "t=<unix_ts>,v0=<hmac_sha256_hex>", подпись по "{t}.{rawBody}".
 */
export function verifyElevenLabsSignature(
  rawBody: string,
  header: string | null,
  secret: string,
  nowMs: number = Date.now(),
): boolean {
  if (!header || !secret) return false;
  const parts = new Map(
    header.split(',').map(p => {
      const i = p.indexOf('=');
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()] as const;
    }),
  );
  const t = parts.get('t');
  const v0 = parts.get('v0');
  if (!t || !v0) return false;
  const tsMs = Number(t) * 1000;
  if (!Number.isFinite(tsMs) || Math.abs(nowMs - tsMs) > MAX_SKEW_MS) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  const a = Buffer.from(v0);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
