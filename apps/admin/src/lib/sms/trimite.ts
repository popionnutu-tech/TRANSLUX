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

export type RezultatSms = { ok: true; id: string | null } | { ok: false; eroare: string };

/** `telefon` în forma bazei (373XXXXXXXX, fără +). */
function corpCerere(telefon: string, text: string): Record<string, unknown> {
  return { from: process.env.SMS_SENDER, to: `+${telefon}`, text };
}

export async function trimiteSms(telefon: string, text: string): Promise<RezultatSms> {
  if (!smsConfigurat()) return { ok: false, eroare: 'neconfigurat' };
  if (!/^\d{8,15}$/.test(telefon)) return { ok: false, eroare: 'telefon nevalid' };
  try {
    const r = await fetch(process.env.SMS_API_URL!, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.SMS_API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(corpCerere(telefon, text)),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const corp = await r.text().catch(() => '');
    if (!r.ok) return { ok: false, eroare: `HTTP ${r.status}: ${corp.slice(0, 200)}` };
    let id: string | null = null;
    try { const j = JSON.parse(corp) as Record<string, unknown>; id = String(j.id ?? j.message_id ?? j.messageId ?? '') || null; } catch { /* răspuns fără JSON */ }
    return { ok: true, id };
  } catch (e) {
    return { ok: false, eroare: e instanceof Error ? e.message : String(e) };
  }
}
