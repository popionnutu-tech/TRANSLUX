import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/cron-auth';
import { chisinauTimeOf, chisinauTodayIso } from '@/lib/chisinau-time';
import { getSupabase } from '@/lib/supabase';
import { graficGroupChatId } from '@/lib/grafic-group';
import { alertAdmins, deleteTelegramMessage, sendTelegramText } from '@/lib/telegram-notify';
import { textMesaj, ziuaRu } from '@/lib/mejgorod/neconformitati';
import { citesteNume, citesteZiua } from '@/lib/mejgorod/ziua-db';

// Mesajul zilnic cu neconformitățile de ieri în grupa Mejgorod (ION-246): plecat din Briceni/Edineț/
// Bălți înainte de grafic pe tur, nu a trecut prin Sîngerei pe tur sau retur. N-are cron Vercel (Hobby
// are doar 2): îl cheamă crontab-ul VPS la 08:00, după run-nightly.sh (03:00) care scrie route_stop_passes.
//   0 8 * * * . /root/lde-worker/cron-secret.env && curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://central-hub-md.vercel.app/api/cron/mejgorod-neconformitati
// Verificare fără trimitere: ?dry=1 · altă zi: ?date=YYYY-MM-DD · retrimitere: ?force=1 (șterge mesajul vechi al zilei)
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const LAST_KEY = 'mejgorod_neconformitati_last';
/** {zi, chat, id} al ultimului mesaj: la retrimiterea aceleiași zile (?force=1) mesajul vechi se șterge din grupă. */
const MSG_KEY = 'mejgorod_neconformitati_msg';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function ieri(): string {
  const d = new Date(`${chisinauTodayIso()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const authError = verifyCronSecret(req);
  if (authError) return authError;
  const q = new URL(req.url).searchParams;
  const ceruta = q.get('date');
  const date = ceruta && DATE_RE.test(ceruta) ? ceruta : ieri();
  const dry = q.get('dry') === '1';
  const force = q.get('force') === '1';
  const sb = getSupabase();
  try {
    const { data: last } = await sb.from('app_config').select('value').eq('key', LAST_KEY).maybeSingle();
    if (!dry && !force && last?.value === date) return NextResponse.json({ date, trimis: false, motiv: 'deja trimis pentru ziua asta' });

    const [{ treceri, curse, rezultat }, nume] = await Promise.all([citesteZiua(date), citesteNume()]);
    if (!treceri.length) {
      if (!dry) await alertAdmins(`⚠️ Neconformități Mejgorod ${date}: route_stop_passes e gol — stop-times.mjs n-a rulat pe VPS? Mesajul nu s-a trimis.`);
      return NextResponse.json({ date, trimis: false, motiv: 'fără treceri GPS pentru ziua asta' });
    }
    const { sofer, masina } = nume;
    const text = textMesaj(ziuaRu(date), rezultat, {
      sofer: (id) => (id ? sofer.get(id) ?? null : null),
      masina: (id) => (id ? masina.get(id) ?? null : null),
      ora: chisinauTimeOf,
    });
    const rezumat = { date, curse: curse.length, neconformitati: rezultat.lista.length, faraGps: rezultat.faraGps.length };
    if (dry) return NextResponse.json({ ...rezumat, trimis: false, motiv: 'dry', text });

    const chat = await graficGroupChatId();
    if (!chat) return NextResponse.json({ ...rezumat, trimis: false, motiv: 'grupa Mejgorod nu e legată (/lega_grafic)' }, { status: 409 });
    const { data: vechi } = await sb.from('app_config').select('value').eq('key', MSG_KEY).maybeSingle();
    const msgId = await sendTelegramText(chat, text);
    if (!msgId) throw new Error('Telegram a refuzat mesajul');
    let sters: number | null = null;
    try {
      const v = JSON.parse(vechi?.value ?? '{}') as { zi?: string; chat?: string; id?: number };
      if (v.zi === date && v.id && String(v.chat ?? chat) === String(chat) && (await deleteTelegramMessage(chat, v.id))) sters = v.id;
    } catch { /* fără mesaj vechi */ }
    await sb.from('app_config').upsert([
      { key: LAST_KEY, value: date },
      { key: MSG_KEY, value: JSON.stringify({ zi: date, chat, id: msgId }) },
    ], { onConflict: 'key' });
    return NextResponse.json({ ...rezumat, trimis: true, message_id: msgId, sters });
  } catch (e) {
    console.error('[mejgorod-neconformitati]', e);
    return NextResponse.json({ error: 'Neconformitățile Mejgorod au eșuat' }, { status: 500 });
  }
}
