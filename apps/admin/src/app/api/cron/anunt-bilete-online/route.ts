import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { verifyCronSecret } from '@/lib/cron-auth';
import { chisinauTodayIso } from '@/lib/chisinau-time';
import { graficGroupChatId } from '@/lib/grafic-group';
import { sendTelegramText } from '@/lib/telegram-notify';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// ION-189 (Ion, 02.10.2026): anunț zilnic în grupa Mejgorod, în rusă, despre lansarea vânzării de bilete online
// (după 12 octombrie): verificarea și confirmarea biletelor se fac prin Telegram, șoferul fără cont Telegram și
// telefon nu pleacă în cursă. Ion, 02.10 seara: «И телефона важно» → telefonul e punct separat, îngroșat. «După ce vom lansa plata online, mesajul să nu mai plece» → se oprește când
// app_config.bilete_online_lansat are o dată ≤ azi.
//
// Cron: VPS root@217.26.149.23, crontab 0 8 * * * (Vercel Hobby are doar 2 cron-uri, ambele ocupate).
//   curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://central-hub-md.vercel.app/api/cron/anunt-bilete-online
// ?dry=1 arată textul fără să trimită; ?force=1 retrimite azi; ?lansat=YYYY-MM-DD pune data lansării (oprește anunțul).

const ULTIMA = 'anunt_bilete_online_ultima';
const LANSAT = 'bilete_online_lansat';

const TEXT_ANUNT = [
  '📣 <b>Важное объявление</b>',
  '',
  'Уважаемые водители!',
  '',
  'В ближайшее время мы запускаем <b>продажу билетов онлайн</b>. Запуск планируется <b>после 12 октября</b>.',
  '',
  'Проверка проданных билетов и их подтверждение будут проходить <b>через Telegram</b>. Поэтому у каждого водителя обязательно должны быть:',
  '',
  '📱 <b>Телефон (смартфон) с интернетом</b> — через него водитель будет идентифицировать пассажиров и подтверждать их билеты. <b>Без телефона работать на рейсе будет невозможно.</b>',
  '',
  '✅ <b>Аккаунт в Telegram</b> на этом телефоне.',
  '',
  '⚠️ Водитель <b>без телефона</b> или <b>без аккаунта в Telegram</b> <b>не будет допущен к рейсу</b>.',
  '',
  'Просим подготовиться заранее: взять с собой рабочий телефон с интернетом, установить Telegram и войти в аккаунт. По всем вопросам обращайтесь к диспетчеру.',
  '',
  'Спасибо за понимание и за вашу работу!',
  '<i>Администрация TRANSLUX</i>',
].join('\n');

export async function GET(req: NextRequest) {
  const authError = verifyCronSecret(req);
  if (authError) return authError;
  const q = req.nextUrl.searchParams;
  const sb = getSupabase();
  const azi = chisinauTodayIso();
  const acum = new Date().toISOString();

  const lansatParam = q.get('lansat');
  if (lansatParam) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(lansatParam)) return NextResponse.json({ error: 'lansat=YYYY-MM-DD' }, { status: 400 });
    const { error } = await sb.from('app_config').upsert({ key: LANSAT, value: lansatParam, updated_at: acum }, { onConflict: 'key' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, lansat: lansatParam });
  }

  const { data: cfg } = await sb.from('app_config').select('key, value').in('key', [ULTIMA, LANSAT]);
  const val = (k: string) => (cfg ?? []).find(r => r.key === k)?.value?.trim() || null;
  const lansat = val(LANSAT);
  if (lansat && lansat <= azi) return NextResponse.json({ skipped: 'lansat', lansat });
  if (q.get('dry') === '1') return NextResponse.json({ dry: true, azi, lansat, text: TEXT_ANUNT });
  if (val(ULTIMA) === azi && q.get('force') !== '1') return NextResponse.json({ skipped: 'azi', azi });

  const chatId = await graficGroupChatId();
  if (!chatId) return NextResponse.json({ error: 'Grupa Mejgorod nu e legată (/lega_grafic).' }, { status: 500 });
  const messageId = await sendTelegramText(chatId, TEXT_ANUNT);
  if (!messageId) return NextResponse.json({ error: 'Telegram nu a primit mesajul' }, { status: 502 });
  await sb.from('app_config').upsert({ key: ULTIMA, value: azi, updated_at: acum }, { onConflict: 'key' });
  console.log('[anunt-bilete-online]', azi, 'message_id', messageId);
  return NextResponse.json({ ok: true, azi, message_id: messageId });
}
