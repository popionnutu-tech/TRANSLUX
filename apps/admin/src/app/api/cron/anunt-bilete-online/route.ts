import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { verifyCronSecret } from '@/lib/cron-auth';
import { chisinauTodayIso } from '@/lib/chisinau-time';
import { graficGroupChatId } from '@/lib/grafic-group';
import { sendTelegram, sendTelegramText } from '@/lib/telegram-notify';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// ION-189 (Ion, 02.10.2026): anunț zilnic în grupa Mejgorod, în rusă, despre lansarea vânzării de bilete online
// (după 12 octombrie): verificarea și confirmarea biletelor se fac prin Telegram, șoferul fără cont Telegram și
// telefon nu pleacă în cursă. Ion, 02.10 seara: «И телефона важно» → telefonul e punct separat, îngroșat; apoi formularea lui: «Без аккаунта и современного телефона». «După ce vom lansa plata online, mesajul să nu mai plece» → se oprește când
// app_config.bilete_online_lansat are o dată ≤ azi.
//
// Cron: VPS root@217.26.149.23, crontab 0 8 * * * (Vercel Hobby are doar 2 cron-uri, ambele ocupate).
//   curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://central-hub-md.vercel.app/api/cron/anunt-bilete-online
// ?dry=1 arată textul fără să trimită; ?force=1 retrimite azi; ?lansat=YYYY-MM-DD pune data lansării (oprește anunțul).

const ULTIMA = 'anunt_bilete_online_ultima';
const LANSAT = 'bilete_online_lansat';
// ION-234 (Ion, 05.10): «trimite mesaj în rusă în grupă zilnic până pe 12 că șoferul trebuie să se lege în bot».
const LEGARE_ULTIMA = 'anunt_legare_sofer_ultima';
const LEGARE_PANA_LA = '2026-10-12';
const BOT = process.env.NEXT_PUBLIC_BOT_USERNAME || 'TransluxMoldova_bot';
const LINK_LEGARE = `https://t.me/${BOT}?start=sofer`;
const TEXT_LEGARE = [
  '🔗 <b>Привяжите свой Telegram — один раз</b>',
  '',
  'Чтобы онлайн-билеты работали, система должна знать, какой водитель за каким телефоном. Нажмите кнопку ниже, затем в боте — «Отправить мой номер». Это занимает 10 секунд.',
  '',
  'Сканирование билетов пассажиров будет здесь, в этом боте.',
  '',
  'Если бот ответил, что номер не найден — скажите диспетчеру.',
].join('\n');
const BUTON_LEGARE = { inline_keyboard: [[{ text: '🔗 Привязать мой Telegram', url: LINK_LEGARE }]] };

const TEXT_ANUNT = [
  '📣 <b>Важное объявление</b>',
  '',
  'Уважаемые водители!',
  '',
  'В ближайшее время мы запускаем <b>продажу билетов онлайн</b>. Запуск планируется <b>после 12 октября</b>.',
  '',
  'Проверка проданных билетов и их подтверждение будут проходить <b>через Telegram</b>. Поэтому у каждого водителя обязательно должны быть:',
  '',
  '📱 <b>Современный телефон (смартфон) с интернетом</b> — через него водитель будет идентифицировать пассажиров и подтверждать их билеты.',
  '',
  '✅ <b>Аккаунт в Telegram</b> на этом телефоне.',
  '',
  '⚠️ <b>Без аккаунта в Telegram и современного телефона водитель не будет допущен к рейсу.</b>',
  '',
  'Просим подготовиться заранее: взять с собой современный телефон с интернетом, установить Telegram и войти в аккаунт. По всем вопросам обращайтесь к диспетчеру.',
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
  if (q.get('dry') === '1') return NextResponse.json({ dry: true, azi, lansat, text: TEXT_ANUNT, legare: { text: TEXT_LEGARE, link: LINK_LEGARE, pana_la: LEGARE_PANA_LA } });
  const force = q.get('force') === '1';
  const chatId = await graficGroupChatId();
  if (!chatId) return NextResponse.json({ error: 'Grupa Mejgorod nu e legată (/lega_grafic).' }, { status: 500 });

  const out: Record<string, unknown> = { azi };
  if (val(ULTIMA) === azi && !force) out.anunt = 'azi';
  else {
    const messageId = await sendTelegramText(chatId, TEXT_ANUNT);
    if (!messageId) return NextResponse.json({ error: 'Telegram nu a primit anunțul' }, { status: 502 });
    await sb.from('app_config').upsert({ key: ULTIMA, value: azi, updated_at: acum }, { onConflict: 'key' });
    console.log('[anunt-bilete-online]', azi, 'message_id', messageId);
    out.anunt = messageId;
  }

  // Al doilea mesaj: legarea șoferului, până pe 12.10 inclusiv (ION-234)
  if (azi > LEGARE_PANA_LA) out.legare = 'expirat';
  else if (val(LEGARE_ULTIMA) === azi && !force) out.legare = 'azi';
  else {
    const ok = await sendTelegram(chatId, TEXT_LEGARE, BUTON_LEGARE);
    if (!ok) return NextResponse.json({ ...out, error: 'Telegram nu a primit mesajul de legare' }, { status: 502 });
    await sb.from('app_config').upsert({ key: LEGARE_ULTIMA, value: azi, updated_at: acum }, { onConflict: 'key' });
    out.legare = 'trimis';
  }
  // câți șoferi interurbani activi sunt legați (doar în răspuns, nu în grupă)
  const { data: dr } = await sb.from('drivers').select('telegram_id').eq('active', true).eq('is_lde', false);
  out.soferi = { legati: (dr ?? []).filter(r => r.telegram_id != null).length, activi: (dr ?? []).length };
  return NextResponse.json({ ok: true, ...out });
}
