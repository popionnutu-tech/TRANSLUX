import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Verificarea webhook-urilor Resend (ION-250), PURĂ. Resend semnează prin Svix: conținutul semnat e
 * `${svix-id}.${svix-timestamp}.${corp brut}`, HMAC-SHA256 cu secretul `whsec_<base64>`, semnătura în antetul
 * `svix-signature` ca listă `v1,<base64> v1,<base64>` (mai multe la rotirea secretului). Timestamp-ul în secunde,
 * acceptat ±5 min (anti-reluare).
 */
export function verificaWebhookResend(args: {
  corp: string;
  id: string | null;
  timestamp: string | null;
  semnatura: string | null;
  secret: string;
  nowMs: number;
}): boolean {
  const { corp, id, timestamp, semnatura, secret, nowMs } = args;
  if (!id || !timestamp || !semnatura || !secret) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowMs / 1000 - ts) > 300) return false;
  const cheie = Buffer.from(secret.startsWith('whsec_') ? secret.slice(6) : secret, 'base64');
  if (cheie.length === 0) return false;
  const asteptat = createHmac('sha256', cheie).update(`${id}.${timestamp}.${corp}`).digest();
  for (const parte of semnatura.split(' ')) {
    const [versiune, valoare] = parte.split(',');
    if (versiune !== 'v1' || !valoare) continue;
    const primit = Buffer.from(valoare, 'base64');
    if (primit.length === asteptat.length && timingSafeEqual(primit, asteptat)) return true;
  }
  return false;
}

export type EfectEveniment = { fel: 'esec'; motiv: string } | { fel: 'livrat' } | { fel: 'ignorat' };

/** Ce înseamnă un eveniment Resend pentru biletul trimis pe e-mail. */
export function efectEveniment(tip: string, data: { bounce?: { message?: string; type?: string } | null } | null | undefined): EfectEveniment {
  switch (tip) {
    case 'email.bounced': {
      const b = data?.bounce;
      return { fel: 'esec', motiv: `respins (bounce${b?.type ? ` ${b.type}` : ''})${b?.message ? `: ${b.message}` : ''}` };
    }
    case 'email.complained': return { fel: 'esec', motiv: 'marcat ca spam de destinatar' };
    case 'email.failed': return { fel: 'esec', motiv: 'trimiterea a eșuat la Resend' };
    case 'email.delivered': return { fel: 'livrat' };
    default: return { fel: 'ignorat' };
  }
}
