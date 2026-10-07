import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/cron-auth';
import { chisinauTimeOf, chisinauTodayIso } from '@/lib/chisinau-time';
import { getSupabase } from '@/lib/supabase';
import { graficGroupChatId } from '@/lib/grafic-group';
import { alertAdmins, sendTelegramText } from '@/lib/telegram-notify';
import { curseleZilei, gasesteNeconformitati, textMesaj, ziuaRu, type Atribuire, type Trecere } from '@/lib/mejgorod/neconformitati';

// Mesajul zilnic cu neconformitățile de ieri în grupa Mejgorod (ION-246): plecat din Briceni/Edineț/
// Bălți înainte de grafic pe tur, nu a trecut prin Sîngerei pe tur sau retur. N-are cron Vercel (Hobby
// are doar 2): îl cheamă crontab-ul VPS la 08:00, după run-nightly.sh (03:00) care scrie route_stop_passes.
//   0 8 * * * . /root/lde-worker/cron-secret.env && curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://central-hub-md.vercel.app/api/cron/mejgorod-neconformitati
// Verificare fără trimitere: ?dry=1 · altă zi: ?date=YYYY-MM-DD · retrimitere: ?force=1
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const LAST_KEY = 'mejgorod_neconformitati_last';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function ieri(): string {
  const d = new Date(`${chisinauTodayIso()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// O zi are ~25 de treceri × ~60 de curse, peste plafonul PostgREST de 1000 de rânduri: pe pagini.
// vranesti_s (migr. 527): dacă coloana încă lipsește (42703), se citește fără ea — excepția Vrănești
// nu se aplică, restul merge.
const COLOANE = 'crm_route_id, going_north, stop_name, scheduled, passed_at, offset_min, distance_m, centru_m, vehicle_id';
async function trecerileZilei(date: string, cuVranesti = true): Promise<Trecere[]> {
  const out: Trecere[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await getSupabase()
      .from('route_stop_passes')
      .select(cuVranesti ? `${COLOANE}, vranesti_s` : COLOANE)
      .eq('date', date)
      .order('crm_route_id').order('going_north').order('stop_order')
      .range(from, from + 999);
    if (error) {
      if (cuVranesti && error.code === '42703') return trecerileZilei(date, false);
      throw new Error(error.message);
    }
    out.push(...((data ?? []) as unknown as Trecere[]));
    if (!data || data.length < 1000) return out;
  }
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

    const [routesRes, asgRes, passesRes, cancelRes, driversRes, vehiclesRes] = await Promise.all([
      sb.from('crm_routes').select('id, tur_ascuns, retur_ascuns').eq('route_type', 'interurban').eq('active', true),
      sb.from('daily_assignments').select('crm_route_id, retur_route_id, driver_id, driver_id_retur, vehicle_id, vehicle_id_retur').eq('assignment_date', date),
      trecerileZilei(date),
      sb.from('route_cancellations').select('crm_route_id').eq('ziua', date),
      sb.from('drivers').select('id, full_name'),
      sb.from('vehicles').select('id, plate_number'),
    ]);
    const err = routesRes.error || asgRes.error || cancelRes.error || driversRes.error || vehiclesRes.error;
    if (err) throw new Error(err.message);

    const treceri = passesRes;
    if (!treceri.length) {
      if (!dry) await alertAdmins(`⚠️ Neconformități Mejgorod ${date}: route_stop_passes e gol — stop-times.mjs n-a rulat pe VPS? Mesajul nu s-a trimis.`);
      return NextResponse.json({ date, trimis: false, motiv: 'fără treceri GPS pentru ziua asta' });
    }

    const rute = new Map((routesRes.data ?? []).map((r) => [r.id as number, r]));
    const anulate = new Set((cancelRes.data ?? []).map((c) => c.crm_route_id as number));
    const curse = curseleZilei((asgRes.data ?? []) as Atribuire[]).filter((c) => {
      const r = rute.get(c.ruta);
      return r && !anulate.has(c.ruta) && !(c.retur ? r.retur_ascuns : r.tur_ascuns);
    });

    const rezultat = gasesteNeconformitati(treceri, curse);
    const sofer = new Map((driversRes.data ?? []).map((d) => [d.id as string, d.full_name as string]));
    const masina = new Map((vehiclesRes.data ?? []).map((v) => [v.id as string, v.plate_number as string]));
    const text = textMesaj(ziuaRu(date), rezultat, {
      sofer: (id) => (id ? sofer.get(id) ?? null : null),
      masina: (id) => (id ? masina.get(id) ?? null : null),
      ora: chisinauTimeOf,
    });
    const rezumat = { date, curse: curse.length, neconformitati: rezultat.lista.length, faraGps: rezultat.faraGps.length };
    if (dry) return NextResponse.json({ ...rezumat, trimis: false, motiv: 'dry', text });

    const chat = await graficGroupChatId();
    if (!chat) return NextResponse.json({ ...rezumat, trimis: false, motiv: 'grupa Mejgorod nu e legată (/lega_grafic)' }, { status: 409 });
    const msgId = await sendTelegramText(chat, text);
    if (!msgId) throw new Error('Telegram a refuzat mesajul');
    await sb.from('app_config').upsert({ key: LAST_KEY, value: date }, { onConflict: 'key' });
    return NextResponse.json({ ...rezumat, trimis: true, message_id: msgId });
  } catch (e) {
    console.error('[mejgorod-neconformitati]', e);
    return NextResponse.json({ error: 'Neconformitățile Mejgorod au eșuat' }, { status: 500 });
  }
}
