import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Semnătura callback-ului maib Checkout (docs.maibmerchants.md/checkout → Callback Notifications):
 *   X-Signature:           sha256=<HMAC_SHA256(SignatureKey, `${rawBody}.${timestamp}`)>
 *   X-Signature-Timestamp: epoch în milisecunde
 *
 * rawBody = octeții EXACT cum au venit. Documentația spune «compact», dar exemplul publicat
 * se potrivește doar pe corpul cu spațiu după fiecare două puncte (verificat 02.10.2026,
 * vezi testul) — deci nu re-serializăm niciodată JSON-ul, semnăm ce am primit.
 * Codificarea: Base64 (exemplul) sau hex minuscule (permis de docs) — le acceptăm pe ambele.
 */

/** Cât poate diferi ceasul băncii de al nostru înainte să respingem callback-ul ca replay. */
export const MAIB_CALLBACK_MAX_SKEW_MS = 5 * 60 * 1000;

export type MaibSignatureCheck = { ok: true } | { ok: false; motiv: string };

export function maibCallbackSignature(rawBody: string, timestamp: string, key: string, enc: 'base64' | 'hex' = 'base64'): string {
  return createHmac('sha256', key).update(`${rawBody}.${timestamp}`, 'utf8').digest(enc);
}

export function verifyMaibCallback(
  rawBody: string,
  signatureHeader: string | null,
  timestampHeader: string | null,
  key: string,
  nowMs: number = Date.now(),
): MaibSignatureCheck {
  if (!key) return { ok: false, motiv: 'MAIB_SIGNATURE_KEY lipsește' };
  if (!signatureHeader) return { ok: false, motiv: 'fără X-Signature' };
  if (!timestampHeader) return { ok: false, motiv: 'fără X-Signature-Timestamp' };

  const m = /^sha256=(.+)$/i.exec(signatureHeader.trim());
  if (!m) return { ok: false, motiv: 'X-Signature nu e «sha256=…»' };
  const primit = m[1].trim();

  const ts = Number(timestampHeader);
  if (!Number.isFinite(ts) || !/^\d+$/.test(timestampHeader.trim())) return { ok: false, motiv: 'timestamp nenumeric' };
  if (Math.abs(nowMs - ts) > MAIB_CALLBACK_MAX_SKEW_MS) return { ok: false, motiv: `timestamp în afara ferestrei (${Math.round((nowMs - ts) / 1000)} s)` };

  // 64 de caractere hex = codificarea hex; altfel Base64 (44 de caractere). Hex-ul se compară fără majuscule.
  const esteHex = primit.length === 64 && /^[0-9a-f]+$/i.test(primit);
  const asteptat = maibCallbackSignature(rawBody, timestampHeader.trim(), key, esteHex ? 'hex' : 'base64');
  const a = Buffer.from(esteHex ? primit.toLowerCase() : primit);
  const b = Buffer.from(asteptat);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, motiv: 'semnătura nu se potrivește' };
  return { ok: true };
}
