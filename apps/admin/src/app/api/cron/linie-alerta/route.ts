import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/cron-auth';
import { alertAdmins } from '@/lib/telegram-notify';

export const dynamic = 'force-dynamic';

// Paznicul liniilor telefonice (08.10.2026). Pe 06.10 PBX-ul Moldcell n-a răspuns câteva minute, Asterisk a renunțat la
// înregistrare după 10 încercări și 060401010 a tăcut două zile fără ca cineva să afle. Detecția stă pe VPS
// (/root/pbx-paznic/paznic.sh, lângă Asterisk); aici doar textul și trimiterea la ADMIN, ca la bot-watchdog.
// Textele sunt fixe: VPS-ul trimite doar tipul, linia și ora, ca endpoint-ul să nu poată fi folosit pentru alt mesaj.
const LINII: Record<string, string> = { TRANSLUX: '060401010 (TRANSLUX)', TLX: 'TLX' };
const ORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function POST(req: NextRequest) {
  const authError = verifyCronSecret(req);
  if (authError) return authError;

  const body = (await req.json().catch(() => null)) as { tip?: string; linie?: string; de?: string } | null;
  const linie = body?.linie ? LINII[body.linie] : undefined;
  const de = body?.de && ORA.test(body.de) ? body.de : null;
  if (!linie || !de) return NextResponse.json({ error: 'linie/de invalide' }, { status: 400 });

  let text: string;
  switch (body?.tip) {
    case 'deconectat':
      text = `⚠️ <b>Linia ${linie} nu e conectată la Moldcell</b> din ${de}.\nApelurile nu ajung la asistent. Serverul reîncearcă singur; dacă nu revine, verifică centrala Moldcell.`;
      break;
    case 'revenit':
      text = `✅ <b>Linia ${linie} e din nou conectată</b> (căzută din ${de}).`;
      break;
    case 'fara-apeluri':
      text = `⚠️ <b>Niciun apel pe ${linie} de la ${de}</b>.\nLinia pare conectată, dar apelurile nu ajung la asistent. Sună o dată la număr ca să verifici.`;
      break;
    default:
      return NextResponse.json({ error: 'tip invalid' }, { status: 400 });
  }

  const trimis = await alertAdmins(text);
  return NextResponse.json({ ok: trimis });
}
