import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/cron-auth';
import { getSupabase } from '@/lib/supabase';
import { alertAdmins, escapeHtml, sendTelegram } from '@/lib/telegram-notify';

// Alertele automatului de stări (lde_truck_auto_alerte, scrise de trip-live-worker
// pe VPS) pleacă pe Telegram la DISPECERUL de camioane, în privat (Ion, 10.09, D7:
// «Dispecerul camioane» — nu Ion, nu grupa). Chat-ul lui stă în
// CAMIOANE_DISPECER_TELEGRAM_ID; până e pus, alertele merg la admini, ca să nu
// se piardă. Worker-ul cheamă ruta după fiecare rulare în care a scris alerte:
//   curl -H "Authorization: Bearer $CRON_SECRET" https://central-hub-md.vercel.app/api/cron/lde-camioane-alerte
// Fiecare alertă pleacă o singură dată (sent_at); ?dry=1 arată fără să trimită.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const MAX_PE_RULARE = 20;
const ETICHETA: Record<string, string> = {
  descarcare_fara_bon: 'La descărcare fără bon TLX',
  gps_mut: 'GPS mut cu marfa în camion',
  directie_gresita: 'Plin, plecat în altă direcție',
  bon_fara_gps: 'Bon TLX fără urmă GPS',
};

export async function GET(req: NextRequest) {
  const authError = verifyCronSecret(req);
  if (authError) return authError;
  const dry = new URL(req.url).searchParams.get('dry') === '1';

  const sb = getSupabase();
  const { data, error } = await sb
    .from('lde_truck_auto_alerte')
    .select('id, fel, mesaj, created_at, vehicles:vehicle_id ( plate_number )')
    .is('sent_at', null).is('resolved_at', null)
    .order('created_at').limit(MAX_PE_RULARE);
  if (error) {
    console.error('[camioane-alerte]', error.message);
    return NextResponse.json({ status: 'error', error: 'citire eșuată' }, { status: 500 });
  }
  const alerte = data ?? [];
  if (alerte.length === 0) return NextResponse.json({ status: 'ok', trimise: 0 });

  const text = [
    '<b>Camioane — automatul n-a putut decide</b>',
    ...alerte.map((a) => `• <b>${escapeHtml(ETICHETA[a.fel] ?? a.fel)}</b>: ${escapeHtml(a.mesaj)}`),
    '',
    'Corectează în admin → Camioane → Banda flotei; automatul nu suprascrie ce ai pus tu.',
  ].join('\n');
  if (dry) return NextResponse.json({ status: 'ok', dry: true, alerte: alerte.length, text });

  const dispecer = (process.env.CAMIOANE_DISPECER_TELEGRAM_ID ?? '').trim();
  const ok = dispecer ? await sendTelegram(dispecer, text) : await alertAdmins(text);
  if (!ok) {
    console.error('[camioane-alerte] Telegram a refuzat sau nu e nimeni de anunțat');
    return NextResponse.json({ status: 'error', error: 'netrimis', alerte: alerte.length }, { status: 502 });
  }
  const acum = new Date().toISOString();
  const { error: e2 } = await sb.from('lde_truck_auto_alerte').update({ sent_at: acum }).in('id', alerte.map((a) => a.id));
  if (e2) console.error('[camioane-alerte] sent_at:', e2.message);
  return NextResponse.json({ status: 'ok', trimise: alerte.length, catre: dispecer ? 'dispecer' : 'admini' });
}
