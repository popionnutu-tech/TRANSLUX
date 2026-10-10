import 'server-only';

// Trimiterea unui SMS (552). Ion, 10.10.2026: «mesajele putem trimite prin PBX Moldcell» — PBX-ul în cloud a răspuns
// «501 Method Not Implemented» la SIP MESSAGE, deci SMS-ul pleacă printr-un API SMS (datele le cere Ion la Moldcell).
// Până vin datele (SMS_API_URL + SMS_API_TOKEN + SMS_SENDER) nu pleacă nimic: `smsConfigurat()` e fals și apelanții nu
// revendică nimic. ADAPTORUL de mai jos e generic (JSON: from/to/text, Bearer); când vine documentația Moldcell, doar
// `corpCerere` și citirea răspunsului se potrivesc formatului lor.

const TIMEOUT_MS = 8_000;

export function smsConfigurat(): boolean {
  return Boolean(process.env.SMS_API_URL && process.env.SMS_API_TOKEN && process.env.SMS_SENDER);
}

/**
 * N5 (10.10): refuzul CONFIRMAT (nimic n-a plecat: date lipsă, 4xx, conexiune refuzată) e separat de rezultatul
 * NECUNOSCUT (timeout, conexiune ruptă în timpul cererii, 5xx de la o poartă): la necunoscut furnizorul poate să fi trimis
 * SMS-ul, deci apelantul nu-l retrimite orbește.
 */
export type RezultatSms = { ok: true; id: string | null } | { ok: false; eroare: string; necunoscut: boolean };

/** Erorile de rețea care dovedesc că cererea n-a ajuns la furnizor (conexiunea nu s-a deschis). */
const NU_A_PLECAT = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ERR_INVALID_URL', 'UND_ERR_INVALID_ARG']);

/** Clasificarea unui răspuns HTTP primit: 2xx acceptat, sub 500 refuz confirmat, 5xx necunoscut. Pur. */
export function clasificaHttp(status: number, corp: string): RezultatSms {
  if (status >= 200 && status < 300) {
    let id: string | null = null;
    try { const j = JSON.parse(corp) as Record<string, unknown>; id = String(j.id ?? j.message_id ?? j.messageId ?? '') || null; } catch { /* răspuns fără JSON */ }
    return { ok: true, id };
  }
  return { ok: false, eroare: `HTTP ${status}: ${corp.slice(0, 200)}`, necunoscut: status >= 500 };
}

/** Clasificarea unei excepții din fetch: doar erorile de deschidere a conexiunii sunt refuz sigur. Pur. */
export function clasificaExceptie(e: unknown): RezultatSms {
  const cod = (e as { cause?: { code?: string } } | null)?.cause?.code ?? (e as { code?: string } | null)?.code ?? '';
  return { ok: false, eroare: e instanceof Error ? e.message : String(e), necunoscut: !NU_A_PLECAT.has(cod) };
}

/** `telefon` în forma bazei (373XXXXXXXX, fără +). */
function corpCerere(telefon: string, text: string): Record<string, unknown> {
  return { from: process.env.SMS_SENDER, to: `+${telefon}`, text };
}

export async function trimiteSms(telefon: string, text: string): Promise<RezultatSms> {
  if (!smsConfigurat()) return { ok: false, eroare: 'neconfigurat', necunoscut: false };
  if (!/^\d{8,15}$/.test(telefon)) return { ok: false, eroare: 'telefon nevalid', necunoscut: false };
  try {
    const r = await fetch(process.env.SMS_API_URL!, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.SMS_API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(corpCerere(telefon, text)),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const corp = await r.text().catch(() => '');
    return clasificaHttp(r.status, corp);
  } catch (e) {
    return clasificaExceptie(e);
  }
}
